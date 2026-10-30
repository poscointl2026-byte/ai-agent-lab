// LLM 브리지: 메인 페이지와 Python 워커 양쪽에서 로드됩니다.
// 요청·응답은 Anthropic Messages API 형식으로 통일하고, OpenAI는 내부에서 변환합니다.
(function (global) {
  "use strict";

  const ANTHROPIC_VERSION = "2026-10-21";
  const FALLBACK_MODELS = ["claude-opus-5-5", "claude-sonnet-5-5"];

  const DEFAULT_SETTINGS = {
    provider: "mock",
    anthropicKey: "",
    anthropicModel: "claude-opus-5-5",
    openaiKey: "",
    openaiModel: "gpt-5-mini",
  };

  function loadSettings() {
    // 워커에서는 메인 페이지가 넘겨준 설정을 사용합니다.
    if (global.AGENTLAB_SETTINGS) return Object.assign({}, DEFAULT_SETTINGS, global.AGENTLAB_SETTINGS);
    try {
      const saved = JSON.parse(global.localStorage.getItem("agentlab.settings") || "{}");
      return Object.assign({}, DEFAULT_SETTINGS, saved);
    } catch (e) {
      return Object.assign({}, DEFAULT_SETTINGS);
    }
  }

  function saveSettings(settings) {
    global.localStorage.setItem("agentlab.settings", JSON.stringify(settings));
  }

  // ---------- 공통 유틸 ----------
  function blocksOf(content) {
    if (typeof content === "string") return [{ type: "text", text: content }];
    return Array.isArray(content) ? content : [];
  }

  function textOf(content) {
    return blocksOf(content)
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  }

  // ---------- Mock LLM ----------
  const CITIES = ["서울", "부산", "대구", "인천", "광주", "대전", "제주", "포항", "도쿄", "뉴욕", "파리", "런던",
    "Seoul", "Busan", "Tokyo", "Paris", "London", "New York"];

  function buildMockInput(schema, text) {
    const props = (schema && schema.properties) || {};
    const input = {};
    for (const [name, def] of Object.entries(props)) {
      const key = (name + " " + (def.description || "")).toLowerCase();
      if (Array.isArray(def.enum) && def.enum.length) {
        // 열거형: 본문에 값이 들어 있으면 그 값을, 없으면 첫 번째 값을 고릅니다.
        input[name] = def.enum.find((v) => text.toLowerCase().includes(String(v).toLowerCase())) ?? def.enum[0];
      } else if (def.type === "array") {
        input[name] = [];
      } else if (/expr|formula|math|수식|계산/.test(key)) {
        const m = text.match(/[\d.]+(?:\s*[-+*/%]\s*\(?\s*[\d.]+\s*\)?)+/g);
        input[name] = m ? m.sort((a, b) => b.length - a.length)[0].trim() : text;
      } else if (/city|location|place|도시|지역/.test(key)) {
        input[name] = CITIES.find((c) => text.includes(c)) || text.split(/\s+/)[0];
      } else if (def.type === "number" || def.type === "integer") {
        const n = text.match(/-?\d+(\.\d+)?/);
        input[name] = n ? Number(n[0]) : 0;
      } else if (def.type === "boolean") {
        input[name] = true;
      } else {
        input[name] = text;
      }
    }
    return input;
  }

  function pickMockTool(tools, text) {
    if (tools.length === 0) return null;
    // 사용자 질문의 단어가 도구 이름·설명에 들어 있는지 셉니다. 한국어 조사를 고려해 끝 글자를 뗀 형태도 확인합니다.
    const userWords = text.toLowerCase().split(/[^a-z0-9가-힣]+/).filter((w) => w.length >= 2);
    let best = null;
    let bestScore = 0;
    for (const tool of tools) {
      const toolText = (tool.name.replace(/_/g, " ") + " " + (tool.description || "")).toLowerCase();
      const stems = (w) => (w.length >= 3 ? [w, w.slice(0, -1), w.slice(0, 2)] : [w]);
      let score = userWords.filter((w) => stems(w).some((s) => toolText.includes(s))).length;
      if (/calc|math|계산/.test(tool.name + tool.description) && /\d\s*[-+*/]\s*\d/.test(text)) score += 3;
      if (score > bestScore) {
        best = tool;
        bestScore = score;
      }
    }
    return best || (tools.length === 1 ? tools[0] : null);
  }

  let mockCounter = 0;
  function mockChat(payload) {
    const messages = payload.messages || [];
    const last = messages[messages.length - 1] || { content: "" };
    const lastBlocks = blocksOf(last.content);
    const results = lastBlocks.filter((b) => b.type === "tool_result");
    const usage = { input_tokens: JSON.stringify(payload).length >> 2, output_tokens: 30 };

    if (results.length > 0) {
      const summary = results.map((r) => (typeof r.content === "string" ? r.content : JSON.stringify(r.content))).join(", ");
      return {
        role: "assistant",
        content: [{ type: "text", text: `[Mock] 도구 결과(${summary})를 바탕으로 답변합니다.` }],
        stop_reason: "end_turn",
        usage,
      };
    }

    const userText = textOf(last.content);
    const tools = payload.tools || [];
    const choice = payload.tool_choice || {};
    let tool = choice.type === "tool" ? tools.find((t) => t.name === choice.name) : pickMockTool(tools, userText);
    if (!tool && choice.type === "any" && tools.length) tool = tools[0];
    if (tool) {
      mockCounter += 1;
      return {
        role: "assistant",
        content: [
          { type: "text", text: `[Mock] '${tool.name}' 도구를 사용하겠습니다.` },
          { type: "tool_use", id: `toolu_mock_${mockCounter}`, name: tool.name, input: buildMockInput(tool.input_schema, userText) },
        ],
        stop_reason: "tool_use",
        usage,
      };
    }
    const preview = userText.length > 60 ? userText.slice(0, 60) + "…" : userText;
    return {
      role: "assistant",
      content: [{ type: "text", text: `[Mock LLM] "${preview}"에 대한 모의 응답입니다. 실제 LLM을 쓰려면 설정에서 API 키를 입력하세요.` }],
      stop_reason: "end_turn",
      usage,
    };
  }

  // ---------- Anthropic (Claude) ----------
  async function anthropicChat(payload, settings) {
    if (!settings.anthropicKey) throw new Error("설정에서 Anthropic API 키를 입력하세요.");
    const model = payload.model || settings.anthropicModel;
    const body = {
      model,
      max_tokens: payload.max_tokens,
      messages: payload.messages,
    };
    if (payload.system) body.system = payload.system;
    if (payload.tools) body.tools = payload.tools;
    if (payload.tool_choice) body.tool_choice = payload.tool_choice;

    const headers = {
      "content-type": "application/json",
      "x-api-key": settings.anthropicKey,
      "anthropic-version": ANTHROPIC_VERSION,
      // 브라우저에서 직접 호출할 때 필요한 헤더 (키가 브라우저에 노출되므로 학습·로컬 용도로만 사용)
      "anthropic-dangerous-direct-browser-access": "true",
    };
    // 안전 분류기가 요청을 거절(refusal)하면 서버가 다른 모델로 재시도하도록 합니다.
    if (FALLBACK_MODELS.includes(model)) {
      headers["anthropic-beta"] = "server-side-fallback-2026-07-01";
      body.fallbacks = "default";
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      throw new Error(`Anthropic API ${res.status}: ${msg}`);
    }
    return {
      role: "assistant",
      content: data.content,
      stop_reason: data.stop_reason,
      usage: data.usage,
      model: data.model,
    };
  }

  // ---------- OpenAI (Anthropic 형식 ↔ Chat Completions 변환) ----------
  function toOpenAIMessages(payload) {
    const out = [];
    if (payload.system) out.push({ role: "system", content: payload.system });
    for (const m of payload.messages) {
      const blocks = blocksOf(m.content);
      if (m.role === "user") {
        for (const b of blocks.filter((x) => x.type === "tool_result")) {
          out.push({
            role: "tool",
            tool_call_id: b.tool_use_id,
            content: typeof b.content === "string" ? b.content : JSON.stringify(b.content),
          });
        }
        const text = textOf(blocks);
        if (text) out.push({ role: "user", content: text });
      } else if (m.role === "assistant") {
        const msg = { role: "assistant", content: textOf(blocks) || null };
        const calls = blocks.filter((x) => x.type === "tool_use");
        if (calls.length) {
          msg.tool_calls = calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: JSON.stringify(c.input) },
          }));
        }
        out.push(msg);
      }
    }
    return out;
  }

  async function openaiChat(payload, settings) {
    if (!settings.openaiKey) throw new Error("설정에서 OpenAI API 키를 입력하세요.");
    const body = {
      model: payload.model || settings.openaiModel,
      messages: toOpenAIMessages(payload),
      max_completion_tokens: payload.max_tokens,
    };
    if (payload.tools) {
      body.tools = payload.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
    }
    const tc = payload.tool_choice;
    if (tc && tc.type === "tool") body.tool_choice = { type: "function", function: { name: tc.name } };
    else if (tc && tc.type === "any") body.tool_choice = "required";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${settings.openaiKey}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = (data.error && data.error.message) || res.statusText;
      throw new Error(`OpenAI API ${res.status}: ${msg}`);
    }
    const choice = data.choices[0];
    const content = [];
    if (choice.message.content) content.push({ type: "text", text: choice.message.content });
    for (const c of choice.message.tool_calls || []) {
      let input = {};
      try {
        input = JSON.parse(c.function.arguments || "{}");
      } catch (e) {
        input = { _raw: c.function.arguments };
      }
      content.push({ type: "tool_use", id: c.id, name: c.function.name, input });
    }
    const stopMap = { tool_calls: "tool_use", length: "max_tokens", stop: "end_turn" };
    return {
      role: "assistant",
      content,
      stop_reason: stopMap[choice.finish_reason] || choice.finish_reason,
      usage: data.usage && { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens },
      model: data.model,
    };
  }

  // ---------- 진입점 ----------
  async function chatObject(payload) {
    const settings = loadSettings();
    if (settings.provider === "anthropic") return anthropicChat(payload, settings);
    if (settings.provider === "openai") return openaiChat(payload, settings);
    return mockChat(payload);
  }

  // Python(Pyodide)에서 호출: JSON 문자열을 받고 JSON 문자열을 돌려줍니다.
  async function chat(payloadJson) {
    try {
      return JSON.stringify(await chatObject(JSON.parse(payloadJson)));
    } catch (e) {
      return JSON.stringify({ error: String(e.message || e) });
    }
  }

  global.AgentLabLLM = { chat, chatObject, loadSettings, saveSettings, DEFAULT_SETTINGS, ANTHROPIC_VERSION };
})(typeof self !== "undefined" ? self : window);

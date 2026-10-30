(function () {
  "use strict";

  const { LEVELS, MODULES, PROJECTS, PLAYGROUND_CODE, API_REFERENCE, RESOURCES } = window.AgentLabPages;
  const DOCS = [...MODULES.map((m) => ({ ...m, kind: "module" })), ...PROJECTS.map((p) => ({ ...p, kind: "project" }))];
  const main = document.getElementById("main");
  let onProgressChange = null; // 현재 페이지가 진행 상황 변화에 반응해야 할 때 (프로젝트 단계 잠금 해제)

  // ---------- 유틸 ----------
  function h(html) {
    const t = document.createElement("template");
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function md(text) {
    return window.marked ? window.marked.parse(text) : `<pre>${esc(text)}</pre>`;
  }

  // ---------- 진행 상황 (localStorage) ----------
  const Progress = {
    key: "agentlab.progress",
    data: { ex: {}, quiz: {}, code: {} },
    load() {
      try {
        this.data = Object.assign({ ex: {}, quiz: {}, code: {} }, JSON.parse(localStorage.getItem(this.key) || "{}"));
      } catch (e) { /* 손상된 데이터는 무시 */ }
    },
    save() {
      try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) { /* 저장 불가 환경 */ }
    },
    done(kind, id) { return !!this.data[kind][id]; },
    mark(kind, id) {
      this.data[kind][id] = true;
      this.save();
      renderNav();
      if (onProgressChange) onProgressChange();
    },
    code(id) { return this.data.code[id]; },
    setCode(id, code) { this.data.code[id] = code; this.save(); },
    clearCode(id) { delete this.data.code[id]; this.save(); },
    reset() { this.data = { ex: {}, quiz: {}, code: {} }; this.save(); renderNav(); },
  };
  Progress.load();

  // ---------- 모듈 마크다운 파싱 ----------
  // ```python run|starter|test|solution|prelude id=..., ```quiz id=..., ```hint id=... 블록을 위젯으로 바꿉니다.
  const BLOCK_RE = /^```(\w+)([^\n]*)\n([\s\S]*?)^```[ \t\r]*$/gm;
  const moduleCache = {};

  function parseModule(source, kind = "module") {
    const widgets = [];
    const extra = { test: {}, solution: {}, hint: {}, prelude: {} };
    const body = source.replace(BLOCK_RE, (whole, lang, info, code) => {
      const tokens = info.trim().split(/\s+/).filter(Boolean);
      const idTok = tokens.find((t) => t.startsWith("id="));
      if (!idTok) return whole;
      const id = idTok.slice(3);
      const kind = lang === "python" ? tokens[0] : lang;
      const placeholder = () => {
        widgets.push(null);
        return `\n<div class="widget-slot" data-slot="${widgets.length - 1}"></div>\n`;
      };
      if (kind === "quiz") {
        const html = placeholder();
        widgets[widgets.length - 1] = { type: "quiz", id, data: JSON.parse(code) };
        return html;
      }
      if (kind === "run" || kind === "starter") {
        const html = placeholder();
        widgets[widgets.length - 1] = { type: kind === "run" ? "run" : "exercise", id, code: code.replace(/\n$/, "") };
        return html;
      }
      if (kind in extra) {
        extra[kind][id] = code.replace(/\n$/, "");
        return "";
      }
      return whole;
    });
    // 프로젝트에서는 앞선 실습들의 정답 코드를 prelude로 이어 붙여, 이전 단계 결과(함수·변수)를 그대로 쓸 수 있게 합니다.
    const solved = [];
    widgets.forEach((w) => {
      if (w.type === "quiz") return;
      const parts = kind === "project" ? solved.slice() : [];
      if (extra.prelude[w.id]) parts.push(extra.prelude[w.id]);
      w.prelude = parts.length ? parts.join("\n\n") : null;
      if (w.type === "exercise") {
        w.test = extra.test[w.id];
        w.solution = extra.solution[w.id];
        w.hint = extra.hint[w.id];
        if (kind === "project" && w.solution) solved.push(`# ---- 이전 단계 정답: ${w.id} ----\n${w.solution}`);
      }
    });
    return {
      body,
      widgets,
      exercises: widgets.filter((w) => w.type === "exercise").map((w) => w.id),
      quizzes: widgets.filter((w) => w.type === "quiz").map((w) => w.id),
    };
  }

  async function loadModule(mod) {
    if (!moduleCache[mod.id]) {
      const res = await fetch(mod.file, { cache: "no-cache" });
      if (!res.ok) throw new Error(`${mod.file}을 불러오지 못했습니다 (${res.status})`);
      moduleCache[mod.id] = parseModule((await res.text()).replace(/\r\n/g, "\n"), mod.kind);
    }
    return moduleCache[mod.id];
  }

  function moduleProgress(mod) {
    const parsed = moduleCache[mod.id];
    if (!parsed) return null;
    const total = parsed.exercises.length + parsed.quizzes.length;
    const done = parsed.exercises.filter((id) => Progress.done("ex", id)).length +
      parsed.quizzes.filter((id) => Progress.done("quiz", id)).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  }

  // ---------- 에디터 ----------
  function createEditor(container, value, { onChange, onRun, tall } = {}) {
    container.classList.add("editor-wrap");
    if (tall) container.classList.add("tall");
    if (window.CodeMirror) {
      const cm = window.CodeMirror(container, {
        value,
        mode: "python",
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        viewportMargin: Infinity,
        extraKeys: {
          Tab: (c) => (c.somethingSelected() ? c.indentSelection("add") : c.replaceSelection("    ")),
          "Shift-Tab": (c) => c.indentSelection("subtract"),
          "Ctrl-Enter": () => onRun && onRun(),
          "Cmd-Enter": () => onRun && onRun(),
        },
      });
      if (onChange) cm.on("change", () => onChange(cm.getValue()));
      setTimeout(() => cm.refresh(), 0);
      return { getValue: () => cm.getValue(), setValue: (v) => cm.setValue(v) };
    }
    const ta = document.createElement("textarea");
    ta.className = "editor-fallback";
    ta.spellcheck = false;
    ta.value = value;
    ta.addEventListener("keydown", (e) => {
      if (e.key === "Tab") {
        e.preventDefault();
        ta.setRangeText("    ", ta.selectionStart, ta.selectionEnd, "end");
      } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        onRun && onRun();
      }
    });
    if (onChange) ta.addEventListener("input", () => onChange(ta.value));
    container.appendChild(ta);
    return { getValue: () => ta.value, setValue: (v) => { ta.value = v; } };
  }

  // 실행 결과 출력창
  function makeOutput(pre) {
    return {
      clear() { pre.innerHTML = ""; pre.hidden = false; },
      image(b64) {
        const img = document.createElement("img");
        img.className = "o-img";
        img.alt = "plot";
        img.src = "data:image/png;base64," + b64;
        pre.appendChild(img);
      },
      write(text, cls) {
        const span = document.createElement("span");
        if (cls) span.className = cls;
        span.textContent = text;
        pre.appendChild(span);
        pre.scrollTop = pre.scrollHeight;
      },
    };
  }

  async function runCode(code, out, test, prelude) {
    out.clear();
    if (!window.Worker) {
      out.write("이 브라우저는 Web Worker를 지원하지 않습니다.\n", "o-err");
      return { ok: false };
    }
    const provider = window.AgentLabLLM.loadSettings().provider;
    out.write(`▶ 실행 중… (LLM: ${providerLabel(provider)})${prelude ? " · 이전 단계 코드 포함" : ""}\n`, "o-info");
    let result;
    try {
      result = await window.PyRunner.run(code, {
        test,
        prelude,
        onOutput: (text, stream) => {
          if (stream === "image") out.image(text);
          else out.write(text, stream === "stderr" ? "o-err" : stream === "info" ? "o-info" : "");
        },
      });
    } catch (e) {
      out.write(`Python 환경을 시작하지 못했습니다: ${e.message}\n인터넷 연결(cdn.jsdelivr.net 접근)을 확인하세요.\n`, "o-err");
      return { ok: false };
    }
    if (!result.ok) {
      if (result.phase === "prelude") out.write("\n[이전 단계 코드 실행 중 오류]\n", "o-err");
      out.write("\n" + result.error + "\n", "o-err");
    }
    return result;
  }

  // 프로젝트 위젯: 자동으로 먼저 실행되는 이전 단계 코드를 펼쳐 볼 수 있게 합니다.
  function preludePanel(prelude) {
    if (!prelude) return "";
    return `<details class="prelude"><summary>📎 이전 단계 코드가 자동으로 먼저 실행됩니다 (펼쳐 보기)</summary>
      <pre><code class="language-python">${esc(prelude)}</code></pre></details>`;
  }

  // 위젯 바로 앞의 제목(h3/h2)을 실습 이름으로 씁니다.
  function headingBefore(slot) {
    for (let el = slot.previousElementSibling; el; el = el.previousElementSibling) {
      if (/^H[23]$/.test(el.tagName)) return el.textContent.trim();
    }
    return "";
  }

  // ---------- 위젯: 실행 예제 ----------
  function mountRun(slot, w) {
    const saved = Progress.code(w.id);
    const box = h(`
      <div class="widget-box">
        <div class="widget-head"><span><span class="tag tag-run">예제</span> 직접 실행해 보세요</span></div>
        ${preludePanel(w.prelude)}
        <div class="ed"></div>
        <div class="toolbar">
          <button class="btn btn-primary" data-act="run">▶ 실행</button>
          <button class="btn" data-act="stop">■ 중지</button>
          <button class="btn" data-act="reset">↺ 원래 코드</button>
          <span class="spacer"></span><span class="kbd-hint">Ctrl+Enter 실행</span>
        </div>
        <pre class="output" hidden></pre>
      </div>`);
    slot.replaceWith(box);
    const out = makeOutput(box.querySelector(".output"));
    const run = () => runCode(editor.getValue(), out, null, w.prelude);
    const editor = createEditor(box.querySelector(".ed"), saved ?? w.code, {
      onChange: (v) => Progress.setCode(w.id, v),
      onRun: run,
    });
    highlightIn(box);
    box.querySelector('[data-act="run"]').onclick = run;
    box.querySelector('[data-act="stop"]').onclick = () => window.PyRunner.stop();
    box.querySelector('[data-act="reset"]').onclick = () => {
      editor.setValue(w.code);
      Progress.clearCode(w.id);
    };
  }

  // ---------- 위젯: 실습 (채점) ----------
  function mountExercise(slot, w) {
    const saved = Progress.code(w.id);
    const title = headingBefore(slot) || w.id;
    const box = h(`
      <div class="widget-box" data-ex="${esc(w.id)}">
        <div class="widget-head">
          <span><span class="tag tag-ex">실습</span> ${esc(title)}</span>
          <span class="ex-status"></span>
        </div>
        ${preludePanel(w.prelude)}
        <div class="ed"></div>
        <div class="toolbar">
          <button class="btn btn-primary" data-act="run">▶ 실행</button>
          <button class="btn btn-ok" data-act="grade">✔ 채점</button>
          <button class="btn" data-act="hint">💡 힌트</button>
          <button class="btn" data-act="solution">정답 보기</button>
          <button class="btn" data-act="stop">■ 중지</button>
          <button class="btn btn-danger" data-act="reset">↺ 초기화</button>
        </div>
        <div class="panel panel-hint" hidden></div>
        <div class="panel panel-solution" hidden>
          <div>정답 예시입니다. 먼저 스스로 풀어 본 뒤 비교해 보세요.</div>
          <pre><code class="language-python"></code></pre>
          <button class="btn" data-act="apply">에디터에 적용</button>
        </div>
        <div class="result-banner" hidden></div>
        <pre class="output" hidden></pre>
      </div>`);
    slot.replaceWith(box);

    const status = box.querySelector(".ex-status");
    const banner = box.querySelector(".result-banner");
    const out = makeOutput(box.querySelector(".output"));
    const refreshStatus = () => {
      const done = Progress.done("ex", w.id);
      status.className = "ex-status " + (done ? "status-done" : "status-todo");
      status.textContent = done ? "✅ 완료" : "미완료";
    };
    refreshStatus();

    const run = () => { banner.hidden = true; return runCode(editor.getValue(), out, null, w.prelude); };
    const editor = createEditor(box.querySelector(".ed"), saved ?? w.code, {
      onChange: (v) => Progress.setCode(w.id, v),
      onRun: run,
    });
    highlightIn(box);

    box.querySelector('[data-act="run"]').onclick = run;
    box.querySelector('[data-act="grade"]').onclick = async () => {
      banner.hidden = true;
      const result = await runCode(editor.getValue(), out, w.test, w.prelude);
      if (result.stopped) return;
      banner.hidden = false;
      if (result.ok) {
        banner.className = "result-banner ok";
        banner.textContent = "🎉 정답입니다! 실습을 완료했습니다.";
        Progress.mark("ex", w.id);
        refreshStatus();
      } else {
        banner.className = "result-banner fail";
        banner.textContent = result.phase === "test"
          ? "❌ 아직 통과하지 못했습니다. 아래 메시지를 참고해 고쳐 보세요."
          : "❌ 코드 실행 중 오류가 발생했습니다. 아래 메시지를 확인하세요.";
      }
    };
    const hintPanel = box.querySelector(".panel-hint");
    hintPanel.textContent = w.hint || "이 실습에는 힌트가 없습니다.";
    box.querySelector('[data-act="hint"]').onclick = () => { hintPanel.hidden = !hintPanel.hidden; };
    const solPanel = box.querySelector(".panel-solution");
    const solCode = solPanel.querySelector("code");
    solCode.textContent = w.solution || "";
    if (window.hljs) window.hljs.highlightElement(solCode);
    box.querySelector('[data-act="solution"]').onclick = () => { solPanel.hidden = !solPanel.hidden; };
    solPanel.querySelector('[data-act="apply"]').onclick = () => editor.setValue(w.solution || "");
    box.querySelector('[data-act="stop"]').onclick = () => window.PyRunner.stop();

    const resetBtn = box.querySelector('[data-act="reset"]');
    let armed = false;
    resetBtn.onclick = () => {
      if (!armed) {
        armed = true;
        resetBtn.textContent = "정말 초기화? (다시 클릭)";
        setTimeout(() => { armed = false; resetBtn.textContent = "↺ 초기화"; }, 3000);
        return;
      }
      armed = false;
      resetBtn.textContent = "↺ 초기화";
      editor.setValue(w.code);
      Progress.clearCode(w.id);
    };
  }

  // ---------- 위젯: 퀴즈 ----------
  function mountQuiz(slot, w) {
    const q = w.data;
    const box = h(`
      <div class="widget-box">
        <div class="widget-head"><span><span class="tag tag-quiz">퀴즈</span></span><span class="q-status"></span></div>
        <div class="quiz-body">
          <p class="quiz-q">${esc(q.q)}</p>
          <div class="quiz-opts"></div>
          <div class="quiz-explain" hidden></div>
        </div>
      </div>`);
    slot.replaceWith(box);
    const opts = box.querySelector(".quiz-opts");
    const explain = box.querySelector(".quiz-explain");
    const qStatus = box.querySelector(".q-status");
    const buttons = q.options.map((text, i) => {
      const b = h(`<button class="quiz-opt">${String.fromCharCode(9312 + i)} ${esc(text)}</button>`);
      opts.appendChild(b);
      return b;
    });
    const reveal = (picked) => {
      buttons.forEach((b, i) => {
        b.disabled = true;
        if (i === q.answer) b.classList.add("correct");
        else if (i === picked) b.classList.add("wrong");
      });
      const ok = picked === q.answer;
      explain.hidden = false;
      explain.innerHTML = `${ok ? "✅ 정답!" : "❌ 오답입니다."} ${esc(q.explain || "")}`;
      if (!ok) {
        const retry = h(`<button class="btn" style="margin-left:8px">다시 풀기</button>`);
        retry.onclick = () => {
          buttons.forEach((b) => { b.disabled = false; b.classList.remove("correct", "wrong"); });
          explain.hidden = true;
        };
        explain.appendChild(retry);
      }
    };
    const refresh = () => {
      const done = Progress.done("quiz", w.id);
      qStatus.className = "q-status " + (done ? "status-done" : "status-todo");
      qStatus.textContent = done ? "✅ 맞힘" : "";
    };
    buttons.forEach((b, i) => {
      b.onclick = () => {
        reveal(i);
        if (i === q.answer) { Progress.mark("quiz", w.id); refresh(); }
      };
    });
    if (Progress.done("quiz", w.id)) reveal(q.answer);
    refresh();
  }

  function highlightIn(root) {
    if (window.hljs) root.querySelectorAll(".prelude code").forEach((c) => window.hljs.highlightElement(c));
  }

  function decorateProse(root) {
    root.querySelectorAll("table").forEach((t) => {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      t.replaceWith(wrap);
      wrap.appendChild(t);
    });
    root.querySelectorAll("a[href^='http']").forEach((a) => { a.target = "_blank"; a.rel = "noopener"; });
    if (window.hljs) root.querySelectorAll("pre code").forEach((c) => window.hljs.highlightElement(c));
  }

  // ---------- 페이지 ----------
  function docHref(doc) {
    return doc.kind === "project" ? `#/p/${doc.id}` : `#/m/${doc.id}`;
  }

  function mountWidgets(page, parsed) {
    page.querySelectorAll(".widget-slot").forEach((slot) => {
      const w = parsed.widgets[Number(slot.dataset.slot)];
      if (w.type === "run") mountRun(slot, w);
      else if (w.type === "exercise") mountExercise(slot, w);
      else if (w.type === "quiz") mountQuiz(slot, w);
    });
  }

  async function renderModule(id) {
    const idx = MODULES.findIndex((m) => m.id === id);
    const mod = DOCS.find((d) => d.kind === "module" && d.id === id);
    if (!mod) return renderNotFound();
    const parsed = await loadModule(mod);
    const page = h(`<article class="page prose"></article>`);
    page.innerHTML = md(parsed.body);
    decorateProse(page);
    main.replaceChildren(page);
    const level = LEVELS.find((l) => l.id === mod.level);
    if (level) page.prepend(h(`<div class="crumb">스터디 · ${esc(level.title)} · 모듈 ${esc(mod.id)}</div>`));
    mountWidgets(page, parsed);
    const prev = MODULES[idx - 1];
    const next = MODULES[idx + 1];
    page.appendChild(h(`
      <div class="module-nav">
        ${prev ? `<a href="#/m/${prev.id}">← ${esc(prev.title)}</a>` : "<span></span>"}
        ${next ? `<a class="next" href="#/m/${next.id}">${esc(next.title)} →</a>` : `<a class="next" href="#/p/${PROJECTS[0].id}">실전 프로젝트 시작하기 →</a>`}
      </div>`));
    window.PyRunner.preload().catch(() => {});
  }

  // ---------- 실전 프로젝트: "## Step N." 제목 단위로 단계를 나누고, 앞 단계를 끝내야 다음 단계가 열립니다 ----------
  async function renderProject(id) {
    const idx = PROJECTS.findIndex((p) => p.id === id);
    const proj = DOCS.find((d) => d.kind === "project" && d.id === id);
    if (!proj) return renderNotFound();
    const parsed = await loadModule(proj);
    const page = h(`<article class="page prose project"></article>`);
    page.innerHTML = md(parsed.body);
    decorateProse(page);

    // 본문을 단계별 section으로 묶습니다.
    const intro = document.createElement("section");
    intro.className = "step-sec intro";
    const steps = [];
    let cur = intro;
    [...page.childNodes].forEach((node) => {
      if (node.nodeType === 1 && node.tagName === "H2" && /^\s*Step\s*\d+/i.test(node.textContent)) {
        cur = document.createElement("section");
        cur.className = "step-sec";
        steps.push({ sec: cur, title: node.textContent.trim() });
      }
      cur.appendChild(node);
    });
    page.replaceChildren(intro, ...steps.map((s) => s.sec));
    main.replaceChildren(page);
    page.prepend(h(`<div class="crumb">실전 프로젝트 ${idx + 1} · 난이도 ${esc(proj.difficulty)} · 선수 학습: ${esc(proj.prereq)}</div>`));
    mountWidgets(page, parsed);

    steps.forEach((s) => {
      s.exercises = [...s.sec.querySelectorAll("[data-ex]")].map((el) => el.dataset.ex);
      s.sec.querySelector("h2").insertAdjacentElement("afterend", h(`
        <div class="lock-note">🔒 이전 단계를 완료하면 열립니다.
          <button class="btn" data-act="peek">미리 보기</button></div>`));
      s.sec.querySelector('[data-act="peek"]').onclick = () => { s.peek = true; refresh(); };
    });

    const stepper = h(`<nav class="stepper"><div class="stepper-head"><b>진행 단계</b><span class="stepper-pct"></span></div><ol></ol></nav>`);
    const firstH1 = page.querySelector("h1");
    (firstH1 ? firstH1.nextElementSibling || firstH1 : page.firstChild).after(stepper);
    const list = stepper.querySelector("ol");

    function refresh() {
      let open = true;
      let doneCount = 0;
      list.replaceChildren();
      steps.forEach((s, i) => {
        const done = s.exercises.length > 0 && s.exercises.every((e) => Progress.done("ex", e));
        const locked = !open && !s.peek;
        s.sec.classList.toggle("locked", locked);
        if (done) doneCount++;
        const li = h(`<li class="${done ? "done" : !open ? "todo-locked" : "current"}">
          <span class="st-icon">${done ? "✅" : !open ? "🔒" : "▶"}</span><span>${esc(s.title)}</span></li>`);
        li.onclick = () => s.sec.scrollIntoView({ behavior: "smooth", block: "start" });
        list.appendChild(li);
        if (!done) open = false;
      });
      stepper.querySelector(".stepper-pct").textContent = `${doneCount} / ${steps.length} 단계 완료`;
    }
    refresh();
    onProgressChange = refresh;

    const prev = PROJECTS[idx - 1];
    const next = PROJECTS[idx + 1];
    page.appendChild(h(`
      <div class="module-nav">
        ${prev ? `<a href="#/p/${prev.id}">← ${esc(prev.title)}</a>` : `<a href="#/m/${MODULES[MODULES.length - 1].id}">← 스터디로 돌아가기</a>`}
        ${next ? `<a class="next" href="#/p/${next.id}">${esc(next.title)} →</a>` : `<a class="next" href="#/playground">플레이그라운드에서 실험하기 →</a>`}
      </div>`));
    window.PyRunner.preload().catch(() => {});
  }

  function moduleCard(m) {
    const p = moduleProgress(m) || { done: 0, total: 0, pct: 0 };
    return h(`
      <a class="card" href="#/m/${m.id}">
        <span class="num">MODULE ${m.id}</span>
        <h3>${m.icon} ${esc(m.title)}</h3>
        <p>${esc(m.summary)}</p>
        <div class="progress"><div style="width:${p.pct}%"></div></div>
        <div class="meta"><span>퀴즈·실습 ${p.done}/${p.total}</span><span>${p.pct}%</span></div>
      </a>`);
  }

  function projectCard(p, i) {
    const pr = moduleProgress(p) || { done: 0, total: 0, pct: 0 };
    return h(`
      <a class="card card-project" href="#/p/${p.id}">
        <span class="num">PROJECT ${i + 1} · ${esc(p.difficulty)}</span>
        <h3>${p.icon} ${esc(p.title)}</h3>
        <p>${esc(p.summary)}</p>
        <div class="tags">${p.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join("")}</div>
        <div class="progress"><div style="width:${pr.pct}%"></div></div>
        <div class="meta"><span>선수: ${esc(p.prereq)}</span><span>${pr.pct}%</span></div>
      </a>`);
  }

  function renderHome() {
    const stats = DOCS.map(moduleProgress).filter(Boolean);
    const total = stats.reduce((a, s) => a + s.total, 0);
    const done = stats.reduce((a, s) => a + s.done, 0);
    const pct = total ? Math.round((done / total) * 100) : 0;
    const page = h(`
      <div class="page">
        <section class="hero">
          <h1>AI Agent Lab</h1>
          <p>기초부터 고급까지 이론을 읽고 바로 코드를 실행하는 <b>스터디</b>와, 실제 데이터로 분석·예측·자동화 에이전트를 단계별로 완성하는 <b>실전 프로젝트</b>로 구성됩니다.</p>
          <div class="overall"><div class="progress"><div style="width:${pct}%"></div></div><b>${done} / ${total} 완료 (${pct}%)</b></div>
        </section>
        <div class="steps">
          <div class="step"><b>① LLM 연결</b><a href="#/settings">설정</a>에서 Claude 또는 OpenAI API 키를 입력합니다. 키가 없어도 Mock LLM으로 모든 실습과 채점이 가능합니다.</div>
          <div class="step"><b>② 스터디</b>기초 → 중급 → 고급 순서로, 모듈마다 이론 → 예제 실행 → 퀴즈 → 채점 실습을 진행합니다.</div>
          <div class="step"><b>③ 실전 프로젝트</b>단계(Step)를 하나씩 통과하며 실제 데이터로 동작하는 에이전트를 완성합니다. 이전 단계 코드는 자동으로 이어집니다.</div>
          <div class="step"><b>④ 확장</b><a href="#/playground">플레이그라운드</a>와 <a href="#/resources">참고 자료</a>로 나만의 에이전트를 만듭니다.</div>
        </div>
        <div class="levels"></div>
        <h2 class="sec-title">🛠 실전 프로젝트</h2>
        <p class="sec-desc">pandas·scikit-learn이 브라우저에서 실행됩니다. 처음 실행할 때 패키지를 내려받느라 10~30초 걸릴 수 있습니다.</p>
        <div class="cards projects"></div>
      </div>`);
    const levels = page.querySelector(".levels");
    LEVELS.forEach((lv) => {
      const sec = h(`<section><h2 class="sec-title">📘 스터디 · ${esc(lv.title)}</h2><p class="sec-desc">${esc(lv.desc)}</p><div class="cards"></div></section>`);
      MODULES.filter((m) => m.level === lv.id).forEach((m) => sec.querySelector(".cards").appendChild(moduleCard(m)));
      levels.appendChild(sec);
    });
    const pc = page.querySelector(".projects");
    PROJECTS.forEach((p, i) => pc.appendChild(projectCard(p, i)));
    main.replaceChildren(page);
  }

  function renderPlayground() {
    const page = h(`
      <div class="page prose">
        <h1>🧪 플레이그라운드</h1>
        <p>배운 내용을 자유롭게 조합해 보세요. 작성한 코드는 이 브라우저에 자동 저장됩니다. 무한 루프가 생기면 <b>■ 중지</b>를 누르세요.</p>
        <div class="widget-box">
          <div class="widget-head"><span><span class="tag tag-run">Python</span> playground.py</span></div>
          <div class="ed"></div>
          <div class="toolbar">
            <button class="btn btn-primary" data-act="run">▶ 실행</button>
            <button class="btn" data-act="stop">■ 중지</button>
            <button class="btn" data-act="reset">↺ 예제 코드로</button>
            <span class="spacer"></span><span class="kbd-hint">Ctrl+Enter 실행</span>
          </div>
          <pre class="output" hidden></pre>
        </div>
        <div class="api-ref"></div>
      </div>`);
    main.replaceChildren(page);
    page.querySelector(".api-ref").innerHTML = API_REFERENCE;
    decorateProse(page.querySelector(".api-ref"));
    const out = makeOutput(page.querySelector(".output"));
    const run = () => runCode(editor.getValue(), out);
    const editor = createEditor(page.querySelector(".ed"), Progress.code("playground") ?? PLAYGROUND_CODE, {
      onChange: (v) => Progress.setCode("playground", v),
      onRun: run,
      tall: true,
    });
    page.querySelector('[data-act="run"]').onclick = run;
    page.querySelector('[data-act="stop"]').onclick = () => window.PyRunner.stop();
    page.querySelector('[data-act="reset"]').onclick = () => {
      editor.setValue(PLAYGROUND_CODE);
      Progress.clearCode("playground");
    };
    window.PyRunner.preload().catch(() => {});
  }

  function renderResources() {
    const sections = RESOURCES.map((s) => `
      <h2>${esc(s.title)}</h2>
      <ul>${s.items.map(([t, url, d]) => `<li><a href="${esc(url)}">${esc(t)}</a>${d ? ` · ${esc(d)}` : ""}</li>`).join("")}</ul>`).join("");
    const page = h(`<div class="page prose"><h1>📚 참고 자료</h1>
      <p>이 사이트에서 핵심을 익힌 뒤, 아래 자료로 넓고 깊게 확장하세요. 링크는 새 탭에서 열립니다.</p>${sections}</div>`);
    decorateProse(page);
    main.replaceChildren(page);
  }

  function providerLabel(p) {
    return { mock: "Mock", anthropic: "Claude", openai: "OpenAI" }[p] || p;
  }

  function renderSettings() {
    const s = window.AgentLabLLM.loadSettings();
    const page = h(`
      <div class="page prose">
        <h1>⚙️ 설정</h1>
        <div class="form-row">
          <label>실습에서 사용할 LLM</label>
          <div class="radio-group">
            <label class="radio-card"><input type="radio" name="provider" value="mock"><span><b>Mock LLM</b> (무료, 키 불필요)<small>규칙 기반 가짜 응답입니다. 흐름을 익히기에 충분하며, 채점은 항상 Mock 응답으로 진행됩니다.</small></span></label>
            <label class="radio-card"><input type="radio" name="provider" value="anthropic"><span><b>Claude</b> (Anthropic API)<small>console.anthropic.com에서 발급한 API 키가 필요합니다.</small></span></label>
            <label class="radio-card"><input type="radio" name="provider" value="openai"><span><b>OpenAI</b><small>platform.openai.com에서 발급한 API 키가 필요합니다.</small></span></label>
          </div>
        </div>

        <div class="provider-fields" data-for="anthropic">
          <div class="form-row">
            <label for="anthropicKey">Anthropic API 키</label>
            <input class="input" id="anthropicKey" type="password" autocomplete="off" placeholder="sk-ant-...">
          </div>
          <div class="form-row">
            <label for="anthropicModel">모델</label>
            <select class="input" id="anthropicModel">
              <option value="claude-opus-5-5">Claude Opus 5.5 (claude-opus-5-5) · 가장 강력함</option>
              <option value="claude-sonnet-5-5">Claude Sonnet 5.5 (claude-sonnet-5-5) · 균형</option>
              <option value="claude-haiku-5-5">Claude Haiku 5.5 (claude-haiku-5-5) · 빠르고 저렴함</option>
            </select>
            <div class="help">실습 반복 호출이 많다면 Sonnet이나 Haiku로 비용을 줄일 수 있습니다.</div>
          </div>
        </div>

        <div class="provider-fields" data-for="openai">
          <div class="form-row">
            <label for="openaiKey">OpenAI API 키</label>
            <input class="input" id="openaiKey" type="password" autocomplete="off" placeholder="sk-...">
          </div>
          <div class="form-row">
            <label for="openaiModel">모델 이름</label>
            <input class="input" id="openaiModel" type="text">
            <div class="help">사용 가능한 모델 이름을 직접 입력하세요.</div>
          </div>
        </div>

        <div class="callout">
          🔐 API 키는 <b>이 브라우저의 localStorage에만</b> 저장되며, LLM 제공사 API로 직접 전송됩니다. 공용 PC에서는 사용 후 키를 지우세요.
          회사 네트워크에서 외부 API 접속이 막혀 있으면 Mock LLM을 사용하세요.
        </div>

        <div class="toolbar" style="padding-left:0;border:0">
          <button class="btn btn-primary" id="save">저장</button>
          <button class="btn" id="test">연결 테스트</button>
          <span id="save-msg" class="kbd-hint"></span>
        </div>
        <pre class="output" id="test-out" hidden></pre>

        <h2>학습 기록</h2>
        <p>퀴즈 정답, 실습 완료, 작성한 코드가 이 브라우저에 저장되어 있습니다.</p>
        <button class="btn btn-danger" id="reset-progress">학습 기록 초기화</button>
      </div>`);
    main.replaceChildren(page);

    const $ = (sel) => page.querySelector(sel);
    page.querySelector(`input[name="provider"][value="${s.provider}"]`).checked = true;
    $("#anthropicKey").value = s.anthropicKey;
    $("#anthropicModel").value = s.anthropicModel;
    $("#openaiKey").value = s.openaiKey;
    $("#openaiModel").value = s.openaiModel;

    const current = () => page.querySelector('input[name="provider"]:checked').value;
    const syncFields = () => page.querySelectorAll(".provider-fields").forEach((el) => { el.hidden = el.dataset.for !== current(); });
    page.querySelectorAll('input[name="provider"]').forEach((r) => r.addEventListener("change", syncFields));
    syncFields();

    const collect = () => ({
      provider: current(),
      anthropicKey: $("#anthropicKey").value.trim(),
      anthropicModel: $("#anthropicModel").value,
      openaiKey: $("#openaiKey").value.trim(),
      openaiModel: $("#openaiModel").value.trim() || window.AgentLabLLM.DEFAULT_SETTINGS.openaiModel,
    });
    $("#save").onclick = () => {
      window.AgentLabLLM.saveSettings(collect());
      $("#save-msg").textContent = "✅ 저장했습니다.";
      updateLLMStatus();
    };
    $("#test").onclick = async () => {
      window.AgentLabLLM.saveSettings(collect());
      updateLLMStatus();
      const out = makeOutput($("#test-out"));
      out.clear();
      out.write(`${providerLabel(current())}에 테스트 요청을 보내는 중…\n`, "o-info");
      try {
        const resp = await window.AgentLabLLM.chatObject({
          messages: [{ role: "user", content: "연결 테스트입니다. '연결 성공'이라고만 답해 주세요." }],
          max_tokens: 1000,
        });
        const text = resp.content.filter((b) => b.type === "text").map((b) => b.text).join("");
        out.write(`응답: ${text}\n`, "o-ok");
        out.write(`stop_reason=${resp.stop_reason}${resp.model ? `, model=${resp.model}` : ""}\n`, "o-info");
      } catch (e) {
        out.write(`실패: ${e.message}\n`, "o-err");
      }
    };
    const resetBtn = $("#reset-progress");
    let armed = false;
    resetBtn.onclick = () => {
      if (!armed) {
        armed = true;
        resetBtn.textContent = "정말 모든 기록을 지울까요? (다시 클릭)";
        setTimeout(() => { armed = false; resetBtn.textContent = "학습 기록 초기화"; }, 3000);
        return;
      }
      Progress.reset();
      resetBtn.textContent = "✅ 초기화했습니다";
    };
  }

  function renderNotFound() {
    main.replaceChildren(h(`<div class="page"><h1>페이지를 찾을 수 없습니다</h1><p><a href="#/">홈으로</a></p></div>`));
  }

  // ---------- 사이드바 ----------
  function renderNav() {
    const nav = document.getElementById("module-nav");
    const link = (d, label) => {
      const p = moduleProgress(d);
      const pct = p ? `<span class="nav-pct ${p.pct === 100 ? "done" : ""}">${p.pct === 100 ? "✅" : p.pct + "%"}</span>` : "";
      const route = docHref(d).slice(2);
      return h(`<a href="${docHref(d)}" data-route="${route}" class="nav-link"><span>${label}</span>${pct}</a>`);
    };
    const items = [];
    LEVELS.forEach((lv) => {
      items.push(h(`<div class="nav-sub">스터디 · ${esc(lv.title)}</div>`));
      DOCS.filter((d) => d.kind === "module" && d.level === lv.id)
        .forEach((m) => items.push(link(m, `${m.icon} ${m.id}. ${esc(m.title)}`)));
    });
    items.push(h(`<div class="nav-sub">실전 프로젝트</div>`));
    DOCS.filter((d) => d.kind === "project").forEach((p, i) => items.push(link(p, `${p.icon} P${i + 1}. ${esc(p.title)}`)));
    nav.replaceChildren(...items);
    highlightNav();
  }

  function highlightNav() {
    const route = location.hash.replace(/^#\/?/, "") || "home";
    document.querySelectorAll(".nav-link").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  }

  function updateLLMStatus() {
    const s = window.AgentLabLLM.loadSettings();
    const label = s.provider === "anthropic" ? `Claude (${s.anthropicModel})` : s.provider === "openai" ? `OpenAI (${s.openaiModel})` : "Mock";
    document.getElementById("llm-status").textContent = label;
  }

  window.PyRunner.onStatus((status) => {
    const map = { loading: ["busy", "로딩 중…"], ready: ["on", "준비됨"], running: ["busy", "실행 중"], error: ["bad", "오류"] };
    const [cls, text] = map[status] || ["", status];
    document.getElementById("py-dot").className = "dot " + cls;
    document.getElementById("py-status").textContent = text;
  });

  // ---------- 라우터 ----------
  async function route() {
    const path = location.hash.replace(/^#\/?/, "");
    document.getElementById("sidebar").classList.remove("open");
    highlightNav();
    onProgressChange = null;
    try {
      if (!path) renderHome();
      else if (path.startsWith("m/")) await renderModule(path.slice(2));
      else if (path.startsWith("p/")) await renderProject(path.slice(2));
      else if (path === "playground") renderPlayground();
      else if (path === "resources") renderResources();
      else if (path === "settings") renderSettings();
      else renderNotFound();
    } catch (e) {
      main.replaceChildren(h(`<div class="page"><h1>불러오기 실패</h1><p>${esc(e.message)}</p></div>`));
    }
    window.scrollTo(0, 0);
  }

  document.getElementById("menu-toggle").onclick = () => document.getElementById("sidebar").classList.toggle("open");
  window.addEventListener("hashchange", route);

  if (location.protocol === "file:") {
    document.getElementById("file-warning").hidden = false;
  }

  updateLLMStatus();
  renderNav();
  // 검증 스크립트용: 파싱 결과(정답·테스트·prelude)를 앱과 똑같이 얻을 수 있게 노출합니다.
  window.AgentLabDebug = { DOCS, loadDoc: loadModule };

  // 진행률 계산을 위해 모든 모듈과 프로젝트를 미리 읽습니다.
  Promise.allSettled(DOCS.map(loadModule)).then(() => {
    renderNav();
    route();
  });
})();

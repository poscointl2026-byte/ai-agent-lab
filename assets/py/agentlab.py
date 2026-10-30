"""AgentLab 실습용 헬퍼 모듈.

브라우저(Pyodide) 안에서 실행되며, 설정 페이지에서 고른 LLM(Mock / Claude / OpenAI)을
Anthropic Messages API 형식으로 호출합니다.

    from agentlab import chat, text_of, tool_calls, tool_result

    resp = await chat([{"role": "user", "content": "안녕?"}])
    print(text_of(resp))
"""
import copy
import json

DEFAULT_MAX_TOKENS = 8000

# 테스트(채점)용: scripted()로 넣은 가짜 응답 대기열
_script = []
# chat()에 전달된 요청 기록 (채점 코드가 검사합니다)
calls = []
_tool_counter = [0]


class LLMError(RuntimeError):
    """LLM 호출이 실패했을 때 발생합니다."""


def _reset():
    _script.clear()
    calls.clear()
    _tool_counter[0] = 0


def scripted(responses):
    """다음 chat() 호출들이 실제 LLM 대신 이 응답들을 순서대로 돌려주게 합니다.

    각 항목은 다음 중 하나입니다.
      - "문자열"                         → 텍스트 응답 (stop_reason="end_turn")
      - {"tool": 이름, "input": {...}}  → 도구 호출 응답 (stop_reason="tool_use")
      - [{"tool": ...}, {"tool": ...}]  → 병렬 도구 호출
      - {"content": [...], ...}         → 원본 응답 그대로
    """
    _script.clear()
    _script.extend(responses)


def _tool_use_block(spec):
    _tool_counter[0] += 1
    return {
        "type": "tool_use",
        "id": spec.get("id", f"toolu_{_tool_counter[0]:04d}"),
        "name": spec["tool"],
        "input": spec.get("input", {}),
    }


def _make_response(item):
    usage = {"input_tokens": 0, "output_tokens": 0}
    if isinstance(item, str):
        return {"role": "assistant", "content": [{"type": "text", "text": item}],
                "stop_reason": "end_turn", "usage": usage}
    if isinstance(item, list):
        return {"role": "assistant", "content": [_tool_use_block(s) for s in item],
                "stop_reason": "tool_use", "usage": usage}
    if isinstance(item, dict) and "tool" in item:
        content = []
        if item.get("text"):
            content.append({"type": "text", "text": item["text"]})
        content.append(_tool_use_block(item))
        return {"role": "assistant", "content": content,
                "stop_reason": "tool_use", "usage": usage}
    if isinstance(item, dict) and "content" in item:
        resp = {"role": "assistant", "stop_reason": "end_turn", "usage": usage}
        resp.update(item)
        return resp
    raise ValueError(f"scripted 응답 형식을 알 수 없습니다: {item!r}")


async def chat(messages, system=None, tools=None, max_tokens=DEFAULT_MAX_TOKENS, model=None, tool_choice=None):
    """LLM을 한 번 호출하고 응답 dict를 돌려줍니다.

    tool_choice: None(모델이 결정) | {"type": "any"}(도구 하나는 반드시 호출)
                 | {"type": "tool", "name": "도구명"}(그 도구를 반드시 호출 → 구조화 출력에 활용)
    반환값: {"role": "assistant", "content": [블록...], "stop_reason": ..., "usage": {...}}
    """
    payload = {"messages": messages, "max_tokens": max_tokens}
    if system:
        payload["system"] = system
    if tools:
        payload["tools"] = tools
    if tool_choice:
        payload["tool_choice"] = tool_choice
    if model:
        payload["model"] = model
    calls.append(copy.deepcopy(payload))

    if _script:
        return _make_response(_script.pop(0))

    from js import AgentLabLLM  # 브라우저 쪽 LLM 브리지 (assets/js/llm.js)

    raw = await AgentLabLLM.chat(json.dumps(payload, ensure_ascii=False))
    data = json.loads(raw)
    if "error" in data:
        raise LLMError(data["error"])
    return data


def text_of(resp):
    """응답에서 text 블록만 이어 붙여 돌려줍니다."""
    return "".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text")


def tool_calls(resp):
    """응답에 들어 있는 tool_use 블록 목록을 돌려줍니다."""
    return [b for b in resp.get("content", []) if b.get("type") == "tool_use"]


def tool_input(resp, name=None):
    """첫 번째 tool_use 블록(name을 주면 그 이름)의 input dict를 돌려줍니다. 없으면 None.

    tool_choice로 도구 호출을 강제해 '구조화 출력'을 받을 때 유용합니다.
    """
    for b in tool_calls(resp):
        if name is None or b["name"] == name:
            return b["input"]
    return None


def tool_result(tool_use_id, content, is_error=False):
    """tool_use에 대한 결과 블록을 만듭니다."""
    block = {"type": "tool_result", "tool_use_id": tool_use_id, "content": str(content)}
    if is_error:
        block["is_error"] = True
    return block


def show_plot(fig=None):
    """matplotlib 그림을 실행 결과 창에 이미지로 표시합니다. (한글 글꼴이 없으므로 라벨은 영어 권장)

        import matplotlib.pyplot as plt
        plt.plot([1, 2, 3]); show_plot()
    """
    import base64
    import io

    import matplotlib.pyplot as plt

    fig = fig or plt.gcf()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", dpi=100, bbox_inches="tight")
    plt.close(fig)
    try:
        from js import _agentlab_image
    except ImportError:  # 브라우저 밖(로컬 검증)에서는 크기만 출력
        print(f"[image {len(buf.getvalue())} bytes]")
        return
    _agentlab_image(base64.b64encode(buf.getvalue()).decode())


def show(resp):
    """응답을 사람이 읽기 좋게 출력합니다."""
    print(f"[stop_reason] {resp.get('stop_reason')}")
    for b in resp.get("content", []):
        t = b.get("type")
        if t == "text":
            print(f"[text] {b['text']}")
        elif t == "tool_use":
            print(f"[tool_use] {b['name']}({json.dumps(b['input'], ensure_ascii=False)})  id={b['id']}")
        elif t == "thinking":
            if b.get("thinking"):
                print(f"[thinking] {b['thinking']}")
        else:
            print(f"[{t}]")
    usage = resp.get("usage") or {}
    if usage:
        print(f"[usage] 입력 {usage.get('input_tokens', 0)} / 출력 {usage.get('output_tokens', 0)} 토큰")

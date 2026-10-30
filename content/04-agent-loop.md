# 모듈 4. 에이전트 루프 (ReAct)

> **학습 목표**: "LLM + 도구 + 반복"으로 이루어진 에이전트의 핵심 루프를 이해하고, 종료 조건과 안전장치를 갖춘 루프를 직접 구현합니다.

## 1. 에이전트란 무엇인가

Anthropic은 [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)에서 두 가지를 구분합니다.

| 구분 | 흐름을 정하는 주체 | 예시 |
|---|---|---|
| **워크플로(Workflow)** | 미리 짜인 **코드 경로** | 번역 → 검수 → 요약 파이프라인 |
| **에이전트(Agent)** | **LLM이 스스로** 다음 행동과 도구 사용을 결정 | "이 버그를 고쳐줘" → 파일 탐색, 수정, 테스트를 반복 |

에이전트의 본질은 단순합니다. **환경의 피드백(도구 결과)을 보고 다음 행동을 정하는 루프**입니다.

### 1-1. 에이전트의 구성 요소

~~~text
            ┌───────────── 에이전트 ─────────────┐
 사용자 ──▶ │  모델(두뇌)   : 다음에 무엇을 할지 결정       │
   목표     │  도구(손발)   : 검색·계산·조회·실행           │ ──▶ 외부 세계
            │  기억(메모)   : messages, 장기 기억(모듈 5)   │ ◀── (DB, 웹, 파일)
            │  루프(심장)   : 결정 → 실행 → 관찰 반복       │
            │  가드레일     : 최대 단계, 예산, 승인(모듈 10) │
            └────────────────────────────────────┘
~~~

이 중 **루프와 가드레일은 모델이 아니라 우리 코드**입니다. 에이전트를 "만든다"는 것은 대부분 이 코드를 잘 짜는 일입니다.

## 2. ReAct: Reason + Act

[ReAct 논문(2022)](https://arxiv.org/abs/2210.03629)은 LLM이 **생각(Thought) → 행동(Action) → 관찰(Observation)**을 반복할 때 더 정확하고 해석 가능한 결과를 낸다는 점을 보였습니다. 현대의 Tool Use API는 이 패턴을 구조화한 것입니다.

~~~text
     ┌──────────────────────────────────────────┐
     │                                          │
     ▼                                          │
 [LLM 호출] ──stop_reason=="tool_use"──▶ [도구 실행] ──▶ [결과를 messages에 추가]
     │
     └──stop_reason=="end_turn"──▶ 최종 답변 반환
~~~

## 3. 루프 설계의 핵심

1. **종료 조건**: `stop_reason`이 `"tool_use"`가 아니면 종료합니다(`end_turn`, `max_tokens`, `refusal` 등).
2. **최대 단계 제한**: 모델이 같은 도구를 무한히 호출하지 않도록 `max_steps`를 둡니다. 비용과 안전을 지키는 기본 장치입니다.
3. **기록 누적**: assistant 응답(content 전체)과 tool_result를 순서대로 `messages`에 쌓습니다.
4. **오류를 결과로 돌려주기**: 도구 오류로 루프를 죽이지 말고 `is_error`로 알려 모델이 다른 방법을 시도하게 합니다.
5. **사람 승인(Human-in-the-loop)**: 결제, 삭제, 메일 발송처럼 되돌리기 어려운 도구는 실행 전에 확인을 받습니다.

> **언제 에이전트를 쓰지 말아야 할까?** 단계가 고정되어 있고 예측 가능한 작업이라면 워크플로가 더 싸고, 빠르고, 안정적입니다. 에이전트는 "몇 단계가 필요할지 미리 알 수 없는" 열린 문제에 씁니다.

### 3-1. 한 바퀴씩 따라가 보기

"사과 3개와 배 2개는 총 얼마?"라는 질문을 실제 Claude가 처리하는 흐름입니다. 각 단계에서 `messages` 길이가 어떻게 늘어나는지 보세요.

~~~text
 step 0  messages=[user]                                   (1개)
         → 모델: "가격을 조회할게요" + tool_use get_price(사과), get_price(배)   ← 병렬 호출
         → 코드: 두 도구 실행 → tool_result 2개를 user 메시지 하나로 추가
 step 1  messages=[user, assistant, user(결과 2개)]           (3개)
         → 모델: tool_use calculator("1200*3 + 2500*2")
         → 코드: 계산 실행 → tool_result 추가
 step 2  messages=[user, assistant, user, assistant, user]  (5개)
         → 모델: "총 8,600원입니다."  stop_reason=end_turn   ← 루프 종료
~~~

모델은 매 단계에서 **지금까지의 기록 전체**를 다시 읽고 다음 행동을 고릅니다. 그래서 도구 결과가 명확해야 다음 판단도 정확해집니다.

## 4. 직접 실행해 보기: 도구 2개를 가진 미니 에이전트

```python run id=m3d1
from agentlab import chat, tool_calls, tool_result, text_of

TOOLS = [
    {"name": "calculator", "description": "사칙연산 수식을 계산합니다.",
     "input_schema": {"type": "object", "properties": {"expression": {"type": "string", "description": "수식"}}, "required": ["expression"]}},
    {"name": "get_price", "description": "상품명으로 가격(원)을 조회합니다. 상품 하나씩 조회하세요.",
     "input_schema": {"type": "object", "properties": {"item": {"type": "string", "description": "상품명 (예: 사과)"}}, "required": ["item"]}},
]
PRICES = {"사과": 1200, "배": 2500}

def execute(name, args):
    try:
        if name == "calculator":
            return str(eval(args["expression"], {"__builtins__": {}}))
        if name == "get_price":
            return str(PRICES.get(args["item"], "없음"))
        return f"Error: unknown tool {name}"
    except Exception as e:
        return f"Error: {e}"

messages = [{"role": "user", "content": "사과 3개와 배 2개를 사면 총 얼마야? 도구로 가격을 조회하고 계산해줘."}]
for step in range(6):
    resp = await chat(messages, tools=TOOLS)
    messages.append({"role": "assistant", "content": resp["content"]})
    calls = tool_calls(resp)
    for c in calls:
        print(f"[step {step}] 🔧 {c['name']}({c['input']})")
    if resp["stop_reason"] != "tool_use":
        print("\n🤖", text_of(resp))
        break
    messages.append({"role": "user", "content": [tool_result(c["id"], execute(c["name"], c["input"])) for c in calls]})
```

> Mock LLM은 단순 규칙으로 도구를 하나만 고릅니다. 실제 Claude를 연결하면 가격 조회를 여러 번 하고 계산까지 이어가는 진짜 에이전트 동작을 볼 수 있습니다.

## 5. 심화: 더 똑똑하고 안전한 루프

### 5-1. 계획(Planning)

복잡한 작업은 바로 행동하기보다 **먼저 계획을 세우게** 하면 성공률이 올라갑니다. system 프롬프트에 "도구를 쓰기 전에 단계별 계획을 짧게 적고, 진행하면서 계획을 갱신하라"고 지시하는 것만으로도 효과가 있습니다. 더 나아가 계획 수립용 호출과 실행용 루프를 분리하는 **Plan-and-Execute** 구조도 있습니다(모듈 7의 오케스트레이터와 연결).

### 5-2. 반성(Reflection)

도구 결과가 예상과 다르거나 오류가 났을 때, 모델이 **왜 실패했는지 생각하고 방법을 바꾸게** 하는 것입니다. [Reflexion](https://arxiv.org/abs/2303.11366) 논문이 대표적입니다. 실무에서는 오류 메시지를 구체적으로 돌려주는 것(모듈 3)과, 최종 답 전에 "요구사항을 모두 충족했는지 확인하라"는 자기 점검 지시가 가장 쉬운 시작점입니다.

### 5-3. 멈춤 조건은 여러 겹으로

| 멈춤 조건 | 막아 주는 문제 |
|---|---|
| `stop_reason != "tool_use"` | 정상 종료 |
| `max_steps` | 끝없는 탐색 |
| 토큰·비용 예산 (모듈 10) | 단계는 적어도 거대한 도구 결과로 인한 비용 폭증 |
| 시간 제한 | 느린 도구로 인한 무한 대기 |
| **반복 호출 감지** | 같은 도구를 같은 인자로 계속 호출하는 "제자리 걸음" |
| 사람 중단 | 사용자가 취소 버튼을 누른 경우 |

### 5-4. 반복 호출(루프) 감지

모델이 같은 검색을 같은 검색어로 계속 반복하는 일은 생각보다 흔합니다. 결과가 없는데 다른 방법을 떠올리지 못할 때 주로 생깁니다. 최근 호출 몇 개가 **이름과 인자까지 똑같으면** 멈추거나, "같은 호출을 반복하고 있습니다. 다른 방법을 시도하세요"라는 안내를 tool_result로 돌려주는 방식으로 대응합니다 (실습 4-2).

### 5-5. 궤적(Trajectory) 기록

에이전트가 **어떤 순서로 무엇을 했는지**(단계, 도구, 인자, 결과)를 기록한 것을 궤적이라고 합니다. 궤적은 디버깅, 평가(모듈 9), 감사(누가 무엇을 실행했나)에 모두 쓰입니다. 최종 답만 보면 "왜 틀렸는지" 알 수 없지만, 궤적을 보면 "3번째 단계에서 엉뚱한 상품을 조회했다"처럼 원인이 보입니다.

## 6. 자주 하는 실수

- **tool_use 응답의 text만 기록하고 tool_use 블록을 버리기**: 다음 호출에서 tool_result의 짝이 없어 오류가 납니다.
- **도구 결과를 매 단계 messages에 덮어쓰기**: 이전 관찰을 잃어버려 같은 조회를 반복합니다. 기록은 **누적**입니다.
- **`max_steps` 초과 시 아무것도 반환하지 않기**: 사용자는 왜 답이 없는지 모릅니다. "단계 초과"와 지금까지의 부분 결과를 알려 주세요.
- **모든 문제에 에이전트 쓰기**: 단계가 고정된 일은 워크플로가 더 싸고 안정적입니다.

## 7. 실무 팁

- 처음엔 `max_steps`를 작게(5~10) 잡고 궤적을 보면서 늘리세요.
- 루프 코드를 직접 짜 보면 프레임워크(LangGraph, Agent SDK 등)가 무엇을 대신해 주는지 정확히 이해하게 됩니다. 프레임워크를 쓰더라도 이 구조는 그대로입니다.
- 사용자에게 진행 상황(지금 어떤 도구를 쓰는 중인지)을 보여주면 긴 작업도 기다릴 수 있습니다.

## 8. 확인 퀴즈

```quiz id=m3q1
{"q": "에이전트 루프를 종료해야 하는 시점으로 가장 적절한 것은?", "options": ["응답에 text 블록이 하나라도 있을 때", "stop_reason이 'tool_use'가 아닐 때, 또는 최대 단계에 도달했을 때", "도구를 한 번이라도 호출했을 때", "응답 토큰 수가 100을 넘을 때"], "answer": 1, "explain": "tool_use 응답에도 text 블록이 함께 올 수 있습니다. 종료는 stop_reason과 최대 단계 제한으로 판단합니다."}
```

```quiz id=m3q2
{"q": "다음 중 에이전트보다 고정된 워크플로가 더 적합한 작업은?", "options": ["처음 보는 코드베이스에서 버그 원인 찾기", "매일 정해진 형식의 보고서를 '수집 → 요약 → 번역' 순서로 만들기", "사용자의 모호한 리서치 질문에 답하기", "여러 웹사이트를 탐색하며 정보 비교하기"], "answer": 1, "explain": "단계가 정해져 있고 예측 가능한 작업은 워크플로가 더 싸고 안정적입니다."}
```

```quiz id=m3q3
{"q": "ReAct 패턴의 세 요소를 올바른 순서로 나열한 것은?", "options": ["Action → Thought → Observation", "Thought → Action → Observation", "Observation → Action → Thought", "Plan → Execute → Report"], "answer": 1, "explain": "추론(Thought)으로 다음 행동을 정하고, 행동(Action)을 실행하고, 결과를 관찰(Observation)하는 과정을 반복합니다."}
```

```quiz id=m3q4
{"q": "에이전트가 search_docs(query='환불 규정')을 똑같이 5번 연속 호출하고 있습니다. 가장 적절한 대응은?", "options": ["max_tokens를 늘린다", "같은 호출의 반복을 감지해 중단하거나, 다른 방법을 시도하라는 안내를 결과로 돌려준다", "도구 결과를 messages에서 지운다", "아무것도 하지 않는다. max_steps가 알아서 막는다"], "answer": 1, "explain": "max_steps는 마지막 안전장치일 뿐입니다. 반복을 일찍 감지하면 비용을 아끼고, 모델이 다른 전략을 찾도록 유도할 수 있습니다."}
```

## 9. 실습

### 실습 4-1. run_agent 루프 구현하기

`run_agent(question, tools, execute, max_steps=5)`를 완성하세요.

- `messages`를 `[{"role": "user", "content": question}]`로 시작합니다.
- 최대 `max_steps`번 `chat(messages, tools=tools)`를 호출합니다.
  - 응답 content 전체를 assistant 메시지로 추가합니다.
  - `stop_reason`이 `"tool_use"`가 아니면 `text_of(resp)`를 반환합니다.
  - 그렇지 않으면 모든 도구를 `execute(name, input)`으로 실행하고, tool_result들을 **하나의 user 메시지**로 추가합니다.
- `max_steps`번 안에 끝나지 않으면 `"최대 단계 초과"`를 반환합니다.

```hint id=m3e1
for step in range(max_steps): 안에서 chat을 호출하세요. 모듈 3의 handle_tool_calls 로직을 그대로 쓸 수 있습니다. 루프가 정상 종료되지 않고 끝나면 for 문 다음 줄에서 "최대 단계 초과"를 반환합니다.
```

```python starter id=m3e1
from agentlab import chat, text_of, tool_calls, tool_result

async def run_agent(question, tools, execute, max_steps=5):
    messages = [{"role": "user", "content": question}]
    # TODO: 에이전트 루프를 구현하세요
    pass
```

```python test id=m3e1
import agentlab

TOOLS = [{"name": "calculator", "description": "계산", "input_schema": {"type": "object", "properties": {"expression": {"type": "string"}}, "required": ["expression"]}}]
executed = []
def fake_execute(name, args):
    executed.append(args["expression"])
    return str(eval(args["expression"]))

# 시나리오 1: 도구 2번 호출 후 최종 답변
agentlab.scripted([
    {"tool": "calculator", "input": {"expression": "3*1200"}, "id": "a1"},
    [{"tool": "calculator", "input": {"expression": "2*2500"}, "id": "b1"},
     {"tool": "calculator", "input": {"expression": "3600+5000"}, "id": "b2"}],
    "총 8600원입니다.",
])
answer = await run_agent("총 얼마?", TOOLS, fake_execute)
assert answer == "총 8600원입니다.", f"최종 텍스트를 반환해야 합니다 (받은 값: {answer!r})"
assert executed == ["3*1200", "2*2500", "3600+5000"], f"도구 실행 기록이 다릅니다: {executed}"
assert len(agentlab.calls) == 3, f"chat은 3번 호출되어야 합니다 (현재 {len(agentlab.calls)}번)"
assert agentlab.calls[0].get("tools") == TOOLS, "chat 호출 시 tools를 전달하세요"
last_msgs = agentlab.calls[2]["messages"]
assert [m["role"] for m in last_msgs] == ["user", "assistant", "user", "assistant", "user"], "messages에 assistant/tool_result가 순서대로 쌓여야 합니다"
parallel = last_msgs[4]["content"]
assert len(parallel) == 2 and {b["tool_use_id"] for b in parallel} == {"b1", "b2"}, "병렬 호출 결과 2개를 하나의 user 메시지에 담으세요"
assert parallel[0]["content"] == "5000", "tool_result content에 실행 결과를 넣으세요"

# 시나리오 2: 끝나지 않는 루프
agentlab._reset()
agentlab.scripted([{"tool": "calculator", "input": {"expression": "1+1"}}] * 10)
answer = await run_agent("무한", TOOLS, fake_execute, max_steps=3)
assert len(agentlab.calls) == 3, f"max_steps=3이면 chat은 3번만 호출되어야 합니다 (현재 {len(agentlab.calls)}번)"
assert answer == "최대 단계 초과", f"단계 초과 시 '최대 단계 초과'를 반환하세요 (받은 값: {answer!r})"
print("✅ 모든 테스트 통과!")
```

```python solution id=m3e1
from agentlab import chat, text_of, tool_calls, tool_result

async def run_agent(question, tools, execute, max_steps=5):
    messages = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        resp = await chat(messages, tools=tools)
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":
            return text_of(resp)
        results = [tool_result(c["id"], execute(c["name"], c["input"])) for c in tool_calls(resp)]
        messages.append({"role": "user", "content": results})
    return "최대 단계 초과"
```

### 실습 4-2. 궤적 기록과 반복 호출 감지

`run_agent_guarded(question, tools, execute, max_steps=8, repeat=3)`를 완성하세요. 반환값은 `{"answer": ..., "stopped": ..., "trajectory": [...]}`입니다.

- 실습 4-1과 같은 루프입니다. `stop_reason`이 `"tool_use"`가 아니면 `{"answer": text_of(resp), "stopped": "end_turn", "trajectory": traj}`를 반환합니다.
- 도구 호출마다 서명 `(이름, json.dumps(input, sort_keys=True))`를 `signatures` 리스트에 추가합니다.
  - 추가한 뒤 **마지막 `repeat`개의 서명이 모두 같으면** 그 호출은 실행하지 않고 `{"answer": None, "stopped": "loop", "trajectory": traj}`를 반환합니다.
- 실행한 호출은 `traj`에 `{"step": 단계번호(0부터), "tool": 이름, "input": 입력, "result": 결과}`로 기록합니다.
- 단계를 다 쓰면 `{"answer": None, "stopped": "max_steps", "trajectory": traj}`를 반환합니다.

```hint id=m3e2
signatures[-repeat:]가 repeat개이고 len(set(signatures[-repeat:])) == 1 이면 반복입니다. 한 응답의 도구 결과들은 모두 모아서 루프 마지막에 하나의 user 메시지로 추가하세요.
```

```python starter id=m3e2
import json
from agentlab import chat, text_of, tool_calls, tool_result

async def run_agent_guarded(question, tools, execute, max_steps=8, repeat=3):
    messages = [{"role": "user", "content": question}]
    signatures = []
    traj = []
    # TODO
    pass
```

```python test id=m3e2
import agentlab

TOOLS = [{"name": "search", "description": "검색", "input_schema": {"type": "object", "properties": {"q": {"type": "string"}}, "required": ["q"]}}]
ran = []
def ex(name, args):
    ran.append(args["q"])
    return f"{args['q']} 결과 없음"

# 1) 같은 호출 반복 → 3번째에서 중단
agentlab.scripted([{"tool": "search", "input": {"q": "환불"}}] * 6)
r = await run_agent_guarded("환불 규정?", TOOLS, ex)
assert r["stopped"] == "loop", f"같은 호출이 3번 반복되면 stopped='loop'여야 합니다 (받은 값: {r['stopped']!r})"
assert ran == ["환불", "환불"], f"반복으로 판단된 3번째 호출은 실행하지 마세요 (실행 기록: {ran})"
assert len(agentlab.calls) == 3, f"chat은 3번 호출되어야 합니다 (현재 {len(agentlab.calls)}번)"
assert r["trajectory"] == [
    {"step": 0, "tool": "search", "input": {"q": "환불"}, "result": "환불 결과 없음"},
    {"step": 1, "tool": "search", "input": {"q": "환불"}, "result": "환불 결과 없음"},
], f"궤적 기록이 다릅니다: {r['trajectory']}"

# 2) 인자가 바뀌면 정상 진행
agentlab._reset(); ran.clear()
agentlab.scripted([{"tool": "search", "input": {"q": "환불"}}, {"tool": "search", "input": {"q": "환불"}},
                   {"tool": "search", "input": {"q": "환불 정책"}}, "환불은 7일 이내 가능합니다."])
r = await run_agent_guarded("환불 규정?", TOOLS, ex)
assert r["stopped"] == "end_turn" and r["answer"] == "환불은 7일 이내 가능합니다.", f"정상 종료 결과가 다릅니다: {r}"
assert [t["step"] for t in r["trajectory"]] == [0, 1, 2], "step 번호는 chat 호출 순서(0부터)입니다"

# 3) max_steps
agentlab._reset(); ran.clear()
agentlab.scripted([{"tool": "search", "input": {"q": str(i)}} for i in range(5)])
r = await run_agent_guarded("?", TOOLS, ex, max_steps=2)
assert r["stopped"] == "max_steps" and len(r["trajectory"]) == 2, f"max_steps 처리 결과가 다릅니다: {r}"
print("✅ 모든 테스트 통과!")
```

```python solution id=m3e2
import json
from agentlab import chat, text_of, tool_calls, tool_result

async def run_agent_guarded(question, tools, execute, max_steps=8, repeat=3):
    messages = [{"role": "user", "content": question}]
    signatures = []
    traj = []
    for step in range(max_steps):
        resp = await chat(messages, tools=tools)
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":
            return {"answer": text_of(resp), "stopped": "end_turn", "trajectory": traj}
        results = []
        for c in tool_calls(resp):
            signatures.append((c["name"], json.dumps(c["input"], sort_keys=True)))
            recent = signatures[-repeat:]
            if len(recent) == repeat and len(set(recent)) == 1:
                return {"answer": None, "stopped": "loop", "trajectory": traj}
            out = execute(c["name"], c["input"])
            traj.append({"step": step, "tool": c["name"], "input": c["input"], "result": out})
            results.append(tool_result(c["id"], out))
        messages.append({"role": "user", "content": results})
    return {"answer": None, "stopped": "max_steps", "trajectory": traj}
```

## 10. 더 읽어보기

- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [ReAct 논문](https://arxiv.org/abs/2210.03629)
- [LLM Powered Autonomous Agents (Lilian Weng)](https://lilianweng.github.io/posts/2023-06-23-agent/)

# 모듈 7. 워크플로 패턴

> **학습 목표**: 실무에서 가장 많이 쓰는 다섯 가지 LLM 워크플로 패턴을 이해하고, 라우팅과 평가자-최적화 패턴을 직접 구현합니다.

## 1. 단순한 것부터 시작하기

Anthropic의 핵심 조언은 **"가장 단순한 해법부터 시작하고, 필요할 때만 복잡도를 올려라"**입니다.

~~~text
단일 LLM 호출  →  워크플로 (코드가 흐름 제어)  →  에이전트 (LLM이 흐름 제어)
   싸고 빠름                                         유연하지만 비싸고 예측이 어려움
~~~

### 왜 "워크플로"가 먼저일까?

모듈 4의 에이전트는 LLM이 다음 행동을 스스로 고릅니다. 강력하지만 대가가 있습니다.

| 관점 | 워크플로 (코드가 흐름 결정) | 에이전트 (LLM이 흐름 결정) |
|---|---|---|
| 예측 가능성 | 높음: 같은 입력이면 같은 경로 | 낮음: 실행마다 경로가 달라질 수 있음 |
| 비용·지연 | 호출 횟수가 정해져 있어 예산을 미리 계산 가능 | 몇 번 호출할지 미리 알 수 없음 |
| 디버깅 | 어느 단계가 틀렸는지 바로 보임 | 긴 기록을 따라가며 원인을 찾아야 함 |
| 유연성 | 설계자가 예상한 경로만 처리 | 처음 보는 문제도 탐색하며 풀 수 있음 |
| 적합한 일 | 단계가 정해진 반복 업무 | 단계 수를 미리 알 수 없는 열린 문제 |

실무 시스템의 상당수는 **워크플로로 충분**하고, 일부 단계에만 에이전트를 넣는 **혼합형**이 가장 흔합니다. 이 모듈의 패턴은 모두 "LLM 호출을 코드로 어떻게 엮을까"에 대한 검증된 설계도입니다.

## 2. 다섯 가지 패턴

### ① Prompt Chaining (프롬프트 체이닝)
작업을 여러 단계로 나눠 **앞 단계 출력이 다음 단계 입력**이 됩니다. 단계 사이에 코드로 검증(gate)을 넣을 수 있습니다.
- 예: 마케팅 문구 작성 → 규정 위반 검사 → 번역

### ② Routing (라우팅)
입력을 **분류**한 뒤 알맞은 전용 처리 경로로 보냅니다.
- 예: 고객 문의를 결제, 기술, 일반으로 분류하고 각각 다른 프롬프트와 도구로 처리합니다. 쉬운 질문은 작은 모델로, 어려운 질문은 큰 모델로 보낼 수도 있습니다.

### ③ Parallelization (병렬화)
- **Sectioning**: 독립적인 하위 작업을 동시에 처리합니다 (예: 문서의 장별 요약).
- **Voting**: 같은 작업을 여러 번 돌려 다수결로 정합니다 (예: 보안 취약점 검토).

### ④ Orchestrator-Workers (오케스트레이터-워커)
중앙 LLM이 작업을 **동적으로 쪼개** 워커에게 맡기고 결과를 종합합니다. 하위 작업이 미리 정해지지 않은 경우에 씁니다 (모듈 8과 연결).

### ⑤ Evaluator-Optimizer (평가자-최적화)
한 LLM이 결과를 만들고, 다른 LLM(또는 같은 모델의 다른 프롬프트)이 **평가와 피드백**을 주는 과정을 반복합니다. 평가 기준이 명확하고 반복하면 나아지는 작업에 적합합니다 (예: 번역 품질 개선, 코드 리뷰 반영).

### 다섯 패턴을 그림으로 보기

~~~text
① Chaining        입력 → [LLM 1] → (gate: 코드 검사) → [LLM 2] → [LLM 3] → 출력
                                         └─ 실패 시 중단/재시도

② Routing         입력 → [분류 LLM] ─┬─▶ [결제 전용 처리]
                                    ├─▶ [기술 전용 처리]
                                    └─▶ [일반 처리]

③ Parallelization 입력 ─┬─▶ [LLM A] ─┐
   (Sectioning/         ├─▶ [LLM B] ─┼─▶ [코드로 합치기 / 다수결]
    Voting)             └─▶ [LLM C] ─┘

④ Orchestrator    입력 → [오케스트레이터 LLM] ─ 하위 작업을 "실행 중에" 결정
   -Workers                   ├─▶ [워커 1] ─┐
                              └─▶ [워커 2] ─┴─▶ [오케스트레이터가 종합] → 출력

⑤ Evaluator       [생성 LLM] ──초안──▶ [평가 LLM] ──PASS──▶ 출력
   -Optimizer          ▲                  │
                       └────피드백────────┘ FAIL (최대 N회)
~~~

### 단계별로 보기: 체이닝의 "게이트"

체이닝의 진짜 힘은 단계 **사이에 코드 검사(gate)**를 넣을 수 있다는 점입니다. LLM이 실수해도 다음 단계로 넘어가기 전에 잡아냅니다.

1. **개요 생성**: "주제에 대한 글 개요를 `-` 목록 3개 이상으로 써줘"
2. **게이트(코드)**: `-`로 시작하는 줄이 3개 이상인지 셉니다. 부족하면 여기서 멈추거나 재시도합니다. 비싼 다음 단계를 낭비하지 않습니다.
3. **본문 작성**: 통과한 개요를 넣어 본문을 씁니다.

```python run id=m5d2
from agentlab import chat, text_of

topic = "사내 AI 에이전트 도입"
outline = text_of(await chat([{"role": "user", "content": f"'{topic}' 글의 개요를 '-' 목록 3개 이상으로 써줘."}]))
bullets = [line for line in outline.splitlines() if line.strip().startswith("-")]
print("① 개요:", outline)
print(f"② 게이트: '-' 항목 {len(bullets)}개 →", "통과" if len(bullets) >= 3 else "실패 (본문 작성 생략)")
if len(bullets) >= 3:
    body = text_of(await chat([{"role": "user", "content": f"다음 개요로 본문을 써줘:\n{outline}"}]))
    print("③ 본문:", body)
```

> Mock LLM은 개요 형식을 지키지 않으므로 게이트에서 멈추는 것이 정상입니다. 실제 Claude를 연결하면 통과 후 본문까지 이어지는 흐름을 볼 수 있습니다. **LLM 출력이 형식을 어기는 경우는 실제로도 생기며**, 게이트가 바로 그 상황을 위한 장치입니다.

## 3. 패턴 고르기

### 결정 표

| 질문 | 예 → 추천 패턴 |
|---|---|
| 작업을 고정된 순서의 단계로 나눌 수 있는가? | **Chaining** (단계 사이에 게이트) |
| 입력 유형마다 처리 방식이 크게 다른가? | **Routing** |
| 서로 독립인 하위 작업이 여러 개인가? | **Parallelization – Sectioning** |
| 한 번의 판단이 불안정해 여러 의견이 필요한가? | **Parallelization – Voting** |
| 하위 작업의 종류와 개수를 입력을 봐야 알 수 있는가? | **Orchestrator-Workers** |
| 명확한 평가 기준이 있고 고치면 나아지는가? | **Evaluator-Optimizer** |
| 단계 수조차 예측할 수 없고 환경 피드백이 필요한가? | 워크플로가 아니라 **에이전트** (모듈 4) |

### 비용과 지연 시간

| 패턴 | LLM 호출 수 | 지연 시간 | 메모 |
|---|---|---|---|
| Chaining | 단계 수 N | N회 **순차** 합계 | 게이트로 조기 중단하면 비용 절감 |
| Routing | 1 + 처리 경로 | 분류 1회만큼 증가 | 분류는 작은 모델(Haiku)로 충분한 경우가 많음 |
| Sectioning | 하위 작업 수 | 가장 느린 1개 수준 (**병렬**) | 호출 수는 그대로, 시간만 단축 |
| Voting | 투표 수 K | 병렬이면 1회 수준 | 비용 K배. 정확도가 중요한 판단에만 |
| Orchestrator | 1 + 워커 수 + 종합 | 가변 | 워커 수 상한을 두어야 예산 관리 가능 |
| Evaluator-Optimizer | 1 + 2×라운드 | 라운드만큼 순차 | `max_rounds`가 곧 비용 상한 |

## 4. 병렬화 예제 실행해 보기

`asyncio.gather`를 쓰면 여러 LLM 호출을 동시에 보낼 수 있습니다.

```python run id=m5d1
import asyncio
from agentlab import chat, text_of

topics = ["Tool Use", "Memory", "Routing"]

async def explain(topic):
    resp = await chat([{"role": "user", "content": f"AI 에이전트의 '{topic}'를 한 문장으로 설명해줘."}])
    return topic, text_of(resp)

results = await asyncio.gather(*(explain(t) for t in topics))
for topic, text in results:
    print(f"■ {topic}: {text}\n")
```

> 세 호출이 **동시에** 나가므로 전체 시간은 가장 느린 호출 하나와 비슷합니다. 단, 제공사의 **분당 요청 한도(rate limit)**에 걸릴 수 있으니 실무에서는 `asyncio.Semaphore`로 동시 실행 수를 제한합니다(모듈 10).

## 5. 확인 퀴즈

```quiz id=m5q1
{"q": "고객 문의를 '환불', '배송', '기타'로 분류해 각각 다른 처리 로직으로 보내는 패턴은?", "options": ["Prompt Chaining", "Routing", "Voting", "Evaluator-Optimizer"], "answer": 1, "explain": "입력을 분류해 전문화된 경로로 보내는 것이 Routing입니다."}
```

```quiz id=m5q2
{"q": "Evaluator-Optimizer 패턴이 특히 효과적인 조건은?", "options": ["평가 기준이 명확하고, 피드백을 반영하면 결과가 실제로 개선되는 작업", "한 번의 호출로 항상 완벽한 답이 나오는 작업", "실시간 응답 속도가 가장 중요한 작업", "입력을 여러 카테고리로 분류해야 하는 작업"], "answer": 0, "explain": "평가와 개선을 반복하므로 명확한 기준과 개선 여지가 있어야 비용만큼의 효과가 있습니다."}
```

```quiz id=m5q3
{"q": "Orchestrator-Workers와 Parallelization(Sectioning)의 가장 큰 차이는?", "options": ["Orchestrator-Workers는 LLM을 쓰지 않는다", "Orchestrator-Workers는 하위 작업을 LLM이 실행 중에 동적으로 결정한다", "Sectioning은 순차 실행만 가능하다", "차이가 없다"], "answer": 1, "explain": "Sectioning은 하위 작업이 미리 정해져 있고, Orchestrator-Workers는 오케스트레이터가 입력을 보고 하위 작업을 동적으로 만듭니다."}
```

```quiz id=m5q4
{"q": "4단계 프롬프트 체인에서 1단계 출력이 형식을 어기는 일이 가끔 생깁니다. 가장 비용 효율적인 대응은?", "options": ["모든 단계를 에이전트로 바꾼다", "1단계 직후에 코드 게이트를 두고, 실패하면 1단계만 재시도하거나 중단한다", "4단계까지 모두 실행한 뒤 최종 결과만 검사한다", "단계를 하나로 합쳐 긴 프롬프트 한 번으로 처리한다"], "answer": 1, "explain": "게이트를 앞단에 두면 잘못된 출력이 비싼 후속 단계로 전파되기 전에 걸러집니다. 재시도도 실패한 단계만 하면 됩니다."}
```

## 6. 실습

### 실습 7-1. 라우터 만들기

`route(question)`을 완성하세요.

- `chat()`을 **한 번** 호출해 질문을 분류합니다. system 프롬프트에 카테고리 `billing`, `technical`, `general` 중 **하나만 출력하라**고 지시하세요.
- 응답 텍스트의 앞뒤 공백을 지우고 소문자로 바꾼 값이 `CATEGORIES`에 있으면 그 값을, 아니면 `"general"`을 반환합니다. LLM이 형식을 어길 수 있으므로 기본값 처리가 중요합니다.

```hint id=m5e1
label = text_of(resp).strip().lower() 후 return label if label in CATEGORIES else "general". system 프롬프트에 'billing', 'technical', 'general'이라는 단어가 모두 들어가도록 쓰세요(채점 항목).
```

```python starter id=m5e1
from agentlab import chat, text_of

CATEGORIES = ["billing", "technical", "general"]

async def route(question):
    # TODO
    pass

# 직접 실행해 보기:
# print(await route("카드 결제가 두 번 됐어요"))
```

```python test id=m5e1
import agentlab
agentlab.scripted([" Billing\n", "technical", "잘 모르겠어요"])
r1 = await route("결제가 두 번 됐어요")
r2 = await route("앱이 실행되지 않아요")
r3 = await route("안녕하세요")
assert r1 == "billing", f"공백, 대소문자를 정리해야 합니다 (받은 값: {r1!r})"
assert r2 == "technical", f"받은 값: {r2!r}"
assert r3 == "general", f"알 수 없는 응답은 'general'로 처리하세요 (받은 값: {r3!r})"
assert len(agentlab.calls) == 3, "route() 한 번에 chat()을 한 번만 호출하세요"
sys_prompt = agentlab.calls[0].get("system") or ""
assert all(c in sys_prompt for c in ["billing", "technical", "general"]), "system 프롬프트에 세 카테고리를 모두 명시하세요"
assert "결제가 두 번" in str(agentlab.calls[0]["messages"]), "사용자 질문을 messages에 포함하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=m5e1
from agentlab import chat, text_of

CATEGORIES = ["billing", "technical", "general"]

async def route(question):
    system = (
        "고객 문의를 분류하세요. 반드시 billing, technical, general 중 "
        "하나의 단어만 출력하고 다른 말은 하지 마세요."
    )
    resp = await chat([{"role": "user", "content": question}], system=system, max_tokens=1000)
    label = text_of(resp).strip().lower()
    return label if label in CATEGORIES else "general"
```

### 실습 7-2. 평가자-최적화 루프

`refine(task, max_rounds=3)`를 완성하세요.

1. `chat`으로 `task`에 대한 **초안**을 만듭니다.
2. 최대 `max_rounds`번 반복합니다.
   - 평가 요청: 초안을 평가하게 합니다. 평가 응답 텍스트가 `"PASS"`로 시작하면 **현재 초안을 반환**합니다.
   - 그렇지 않으면 개선 요청: 초안과 피드백을 주고 개선된 글을 받아 초안을 교체합니다.
3. 반복이 끝나면 마지막 초안을 반환합니다.

각 요청은 `[{"role": "user", "content": ...}]` 하나짜리 새 대화로 보내면 됩니다. 평가 요청에는 초안 내용이, 개선 요청에는 피드백 내용이 포함되어야 합니다.

```hint id=m5e2
draft = text_of(await chat([...task...])) → for _ in range(max_rounds): feedback = text_of(await chat([...평가 프롬프트 + draft...])); if feedback.strip().startswith("PASS"): return draft; draft = text_of(await chat([...개선 프롬프트 + draft + feedback...])) → 루프 후 return draft
```

```python starter id=m5e2
from agentlab import chat, text_of

async def refine(task, max_rounds=3):
    # TODO
    pass
```

```python test id=m5e2
import agentlab
agentlab.scripted(["초안v1", "FAIL: 너무 짧음", "초안v2", "PASS 좋습니다"])
r = await refine("에이전트 소개글 작성")
assert r == "초안v2", f"PASS를 받은 초안을 반환해야 합니다 (받은 값: {r!r})"
assert len(agentlab.calls) == 4, f"초안1 + 평가 + 개선 + 평가 = 4번 호출이어야 합니다 (현재 {len(agentlab.calls)})"
assert "에이전트 소개글 작성" in str(agentlab.calls[0]["messages"]), "첫 호출에 task를 포함하세요"
assert "초안v1" in str(agentlab.calls[1]["messages"]), "평가 요청에 초안 내용을 포함하세요"
assert "너무 짧음" in str(agentlab.calls[2]["messages"]), "개선 요청에 피드백을 포함하세요"

agentlab._reset()
agentlab.scripted(["d0", "FAIL", "d1", "FAIL", "d2"])
r = await refine("과제", max_rounds=2)
assert r == "d2", f"max_rounds 후에는 마지막 초안을 반환하세요 (받은 값: {r!r})"
assert len(agentlab.calls) == 5, f"max_rounds=2면 5번 호출되어야 합니다 (현재 {len(agentlab.calls)})"
print("✅ 모든 테스트 통과!")
```

```python solution id=m5e2
from agentlab import chat, text_of

async def refine(task, max_rounds=3):
    draft = text_of(await chat([{"role": "user", "content": task}]))
    for _ in range(max_rounds):
        review = await chat([{"role": "user", "content":
            f"다음 글을 평가하세요. 충분히 좋으면 'PASS'로 시작하고, 아니면 'FAIL: 개선점'을 쓰세요.\n\n<draft>{draft}</draft>"}])
        feedback = text_of(review).strip()
        if feedback.startswith("PASS"):
            return draft
        improved = await chat([{"role": "user", "content":
            f"과제: {task}\n\n<draft>{draft}</draft>\n\n<feedback>{feedback}</feedback>\n\n피드백을 반영해 개선된 글만 출력하세요."}])
        draft = text_of(improved)
    return draft
```

### 실습 7-3. 게이트가 있는 프롬프트 체인

`write_article(topic)`을 완성하세요. 위 "체이닝의 게이트" 흐름을 그대로 구현합니다.

1. **개요 단계**: `chat`으로 개요를 요청합니다. 요청 메시지에 `topic`이 포함되어야 합니다.
2. **게이트**: 개요 텍스트에서 앞뒤 공백을 뗀 줄이 `-`로 시작하는 줄을 셉니다. **3개 미만이면** 더 호출하지 말고 `{"ok": False, "reason": "개요 부족", "outline": 개요}`를 반환합니다.
3. **본문 단계**: 통과하면 개요를 포함해 본문을 요청하고 `{"ok": True, "outline": 개요, "article": 본문}`을 반환합니다.

```hint id=m5e3
bullets = [l for l in outline.splitlines() if l.strip().startswith("-")]처럼 세세요. 게이트에서 실패하면 chat은 정확히 1번만 호출되어야 합니다.
```

```python starter id=m5e3
from agentlab import chat, text_of

async def write_article(topic):
    # TODO: 개요 → 게이트 → 본문
    pass
```

```python test id=m5e3
import agentlab

agentlab.scripted(["- 배경\n- 도입 효과\n  - 비용 절감\n- 주의점", "에이전트 도입 본문입니다."])
r = await write_article("AI 에이전트 도입")
assert isinstance(r, dict) and r.get("ok") is True, f"게이트를 통과하면 ok=True여야 합니다: {r}"
assert r["article"] == "에이전트 도입 본문입니다.", "본문 단계의 응답 텍스트를 article에 넣으세요"
assert len(agentlab.calls) == 2, f"통과 시 chat은 2번 호출되어야 합니다 (현재 {len(agentlab.calls)})"
assert "AI 에이전트 도입" in str(agentlab.calls[0]["messages"]), "개요 요청에 topic을 포함하세요"
assert "도입 효과" in str(agentlab.calls[1]["messages"]), "본문 요청에 개요를 포함하세요"

agentlab._reset()
agentlab.scripted(["개요를 쓰겠습니다. 1. 배경 2. 효과", "호출되면 안 됨"])
r = await write_article("주제")
assert r == {"ok": False, "reason": "개요 부족", "outline": "개요를 쓰겠습니다. 1. 배경 2. 효과"}, f"게이트 실패 결과가 다릅니다: {r}"
assert len(agentlab.calls) == 1, "게이트에서 실패하면 본문 단계를 호출하지 마세요"

agentlab._reset()
agentlab.scripted(["- 하나\n- 둘", "x"])
r = await write_article("주제")
assert r["ok"] is False, "'-' 항목이 2개면 게이트에서 막아야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=m5e3
from agentlab import chat, text_of

async def write_article(topic):
    outline = text_of(await chat([{"role": "user", "content": f"'{topic}' 글의 개요를 '-' 목록 3개 이상으로 써줘."}]))
    bullets = [line for line in outline.splitlines() if line.strip().startswith("-")]
    if len(bullets) < 3:
        return {"ok": False, "reason": "개요 부족", "outline": outline}
    article = text_of(await chat([{"role": "user", "content": f"다음 개요로 본문을 써줘:\n{outline}"}]))
    return {"ok": True, "outline": outline, "article": article}
```

## 7. 자주 하는 실수

| 실수 | 왜 문제인가 | 해결 |
|---|---|---|
| 처음부터 에이전트로 만들기 | 비용·지연이 크고 디버깅이 어려움 | 단일 호출 → 워크플로 → 에이전트 순으로 필요할 때만 올리기 |
| 분류 결과를 검증하지 않기 | LLM이 "Billing입니다."처럼 형식을 어기면 라우팅이 깨짐 | 정규화 + 허용 목록 + 기본값 (실습 7-1), 또는 구조화 출력(모듈 2) |
| 평가자-최적화에 반복 상한이 없음 | 평가자가 계속 FAIL을 주면 비용이 무한히 증가 | `max_rounds` 필수 |
| 생성자와 평가자가 같은 관점 | 자기 글을 관대하게 평가 | 평가 프롬프트에 구체적 체크리스트를 주고 역할을 분리 |
| 병렬 호출 수 제한 없음 | rate limit 오류, 일부 실패 시 전체 실패 | Semaphore로 동시 실행 수 제한, `return_exceptions=True`로 부분 실패 처리 |

## 8. 실무 팁

- **단계마다 모델을 다르게.** 분류·게이트 판단은 작은 모델(예: `claude-haiku-5-5`), 최종 작성은 큰 모델로 나누면 품질을 유지하면서 비용을 줄일 수 있습니다. `chat(..., model=...)`로 지정합니다.
- **중간 결과를 로그로 남기세요.** 워크플로의 장점은 단계별로 입력과 출력을 볼 수 있다는 점입니다. 문제가 생기면 어느 단계가 틀렸는지 바로 찾을 수 있습니다(모듈 9).
- **게이트는 코드로, 판단은 LLM으로.** 길이, 형식, 금지어, 숫자 범위처럼 코드로 검사할 수 있는 것은 LLM에게 맡기지 마세요. 더 싸고 정확합니다.
- **평가자의 기준은 글로 고정하세요.** "좋으면 PASS"보다 "① 300자 이내 ② 존댓말 ③ 수치 포함 — 모두 만족하면 PASS"가 훨씬 일관됩니다.

## 9. 심화

**① 패턴 조합하기.** 실제 시스템은 패턴을 겹쳐 씁니다.

~~~text
고객 문의 → [Routing] ─┬─ 결제 ─▶ [Chaining: 정보 추출 → 정책 조회 → 답변 초안] ─▶ [Evaluator: 정책 위반 검사]
                      ├─ 기술 ─▶ [에이전트: 로그 검색 도구로 원인 탐색]
                      └─ 기타 ─▶ [단일 호출: FAQ 답변]
~~~

실전 프로젝트 P3(고객 문의 자동 처리)가 정확히 이런 구조입니다.

**② 워크플로 안의 가드레일.** 게이트는 품질만이 아니라 **안전장치** 역할도 합니다.

- **입력 가드레일**: 첫 단계 전에 개인정보·금지 주제·프롬프트 인젝션 의심 문구를 검사합니다.
- **출력 가드레일**: 최종 출력 전에 정책 위반, 근거 없는 수치, 금지 표현을 검사합니다.
- **병렬 가드레일**: 본 작업과 **동시에** 안전 검사 LLM을 돌리고, 위반이면 결과를 버립니다. 지연 시간이 늘지 않습니다.

**③ 워크플로 → 에이전트로 올릴 시점.** 다음 신호가 보이면 해당 단계를 에이전트로 바꾸는 것을 고려합니다.

- 라우팅 분기가 계속 늘어나 "기타" 경로가 대부분을 차지한다.
- 한 단계가 "필요하면 추가로 조회"처럼 **조건부 반복**을 요구한다.
- 입력마다 필요한 단계 수가 크게 다르다.

반대로 에이전트가 늘 같은 순서로 같은 도구를 부른다면, 그 경로를 **워크플로로 굳히는 것**이 더 싸고 안정적입니다.

**④ 평가로 패턴을 검증하세요.** 패턴을 바꿀 때마다 같은 평가셋으로 정확도·비용·지연을 비교해야 "복잡도를 올린 값"을 하는지 알 수 있습니다(모듈 9).

## 10. 더 읽어보기

- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents): 다섯 패턴의 원문
- [LangGraph Workflows & Agents 가이드](https://langchain-ai.github.io/langgraph/tutorials/workflows/)

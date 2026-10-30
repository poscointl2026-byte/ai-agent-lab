# 프로젝트 3. 고객 문의 자동 처리 워크플로

> **프로젝트 목표**: 하루에도 수십~수백 건씩 들어오는 고객 문의를 LLM으로 **분류 → 우선순위 지정 → 담당 큐 배정 → FAQ 근거 답변 초안 작성 → 자동 검수 → 사람 승인 대기열**까지 처리하는 파이프라인을 만들고, 정답 라벨로 **정확도를 측정**해 개선할 수 있는 상태로 완성합니다.

## 0. 프로젝트 소개

### 비즈니스 문제

고객지원팀은 이메일·채팅·전화로 들어오는 문의를 사람이 하나씩 읽고 분류합니다. 그런데 문의의 상당수는 FAQ로 답할 수 있는 반복 질문이고, 정말 급한 건(이중 결제, 계정 해킹, 서비스 장애)은 오히려 대기열 속에 묻히기 쉽습니다. 이 프로젝트에서는 다음을 자동화합니다.

1. 문의를 **카테고리**(결제, 기술, 배송, 계정, 기타)와 **우선순위**(high, normal, low)로 분류합니다.
2. 회사 정책에 따라 **담당 큐**를 정합니다. 보안 사안은 보안팀, 긴급 건은 긴급 대응, 단순 문의는 자동 답변으로 보냅니다.
3. 자동 답변 대상이면 **FAQ를 근거로 답변 초안**을 쓰고, **검수 LLM**이 기준에 맞는지 확인합니다.
4. 모든 결과는 사람이 **승인한 뒤 발송**합니다. 이번 프로젝트는 발송 직전의 승인 대기열까지 다룹니다.
5. 정답 라벨과 비교해 **정확도·혼동 행렬·오분류 목록**을 만듭니다.

> 💡 이 프로젝트는 "에이전트"보다 **워크플로**에 가깝습니다. 단계가 정해져 있고 예측 가능한 업무이기 때문입니다. [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)가 권하는 대로, LLM은 판단이 필요한 지점(분류, 작성, 검수)에만 쓰고 나머지는 평범한 코드로 짭니다.

### 최종 결과물

- `process_all(tickets, kb)`: 문의 목록을 **동시에** 처리해 티켓별 결과 레코드(분류, 큐, FAQ, 답변 초안, SLA 기한)를 돌려주는 비동기 파이프라인
- `evaluate(results, df)`: 카테고리·우선순위 정확도, 혼동 행렬, 오분류 목록을 담은 평가 리포트

### 아키텍처

~~~text
 tickets.csv ─┐
              ▼
      ┌──────────────┐  구조화 출력(tool_choice)   ┌─────────────────┐
      │ ① classify   │ ─────────────────────────▶ │ 검증 실패 → 재시도 │
      └──────┬───────┘                            └─────────────────┘
             ▼  + 결정적 규칙(apply_rules: VIP·위험 키워드)
      ┌──────────────┐
      │ ② route      │──▶ escalation(보안팀) / urgent(긴급) / general(상담원)
      └──────┬───────┘
             ▼ auto_reply
      ┌──────────────┐   faq.json
      │ ③ find_faq   │◀──────────
      └──────┬───────┘
             ▼
      ┌──────────────┐  피드백   ┌──────────────┐
      │ ④ draft      │◀────────│ review(검수)  │   평가자-최적화 루프 (최대 N회)
      └──────┬───────┘────────▶└──────────────┘
             ▼
      ┌──────────────┐        ┌──────────────┐
      │ ⑤ 승인 대기열  │──────▶ │ 사람 승인 후 발송 │
      └──────┬───────┘        └──────────────┘
             ▼
      ┌──────────────┐  label_category / label_priority
      │ ⑥ evaluate   │◀────────────────────────────────
      └──────────────┘
~~~

### 데이터 사전

**`data/tickets.csv`**: 고객 문의 40건

| 컬럼 | 설명 | 예시 |
|---|---|---|
| `ticket_id` | 문의 ID | `T001` |
| `channel` | 접수 채널 | `email`, `chat`, `phone` |
| `tier` | 고객 등급 | `vip`, `normal` |
| `text` | 문의 본문 | "지난달 요금이 두 번 결제되었습니다…" |
| `label_category` | **정답** 카테고리 (평가에만 사용) | `billing`, `technical`, `delivery`, `account`, `other` |
| `label_priority` | **정답** 우선순위 (평가에만 사용) | `high`, `normal`, `low` |

> ⚠️ `label_*` 컬럼은 사람이 붙인 정답입니다. **분류 프롬프트에 절대 넣으면 안 됩니다.** 정답을 보여주고 맞히게 하는 셈이라 평가가 무의미해집니다. 이런 실수를 **데이터 누수(leakage)**라고 합니다.

**`data/faq.json`**: 지식베이스

~~~json
{
  "faq": [{"id": "F01", "category": "billing", "keywords": ["환불", "이중", "중복", "두 번"], "answer": "중복 결제가 확인되면 ..."}, ...],
  "policy": {"refund_auto_approve_limit": 50000,
             "escalation_categories": ["account"],
             "sla_hours": {"high": 4, "normal": 24, "low": 72}}
}
~~~

### 이 프로젝트에서 쓰는 기술

| 기술 | 단계 | 관련 모듈 |
|---|---|---|
| JSON 스키마로 출력 설계, 검증 | Step 1 | 02 프롬프트와 구조화 출력 |
| `tool_choice`로 구조화 출력 강제, 검증 실패 시 재시도 | Step 2 | 02, 03 |
| LLM 판단 + 결정적 규칙의 결합 | Step 2~3 | 07 워크플로 패턴 (라우팅) |
| 키워드 검색 기반 근거 찾기 | Step 3 | 06 RAG |
| 평가자-최적화(evaluator-optimizer) 루프 | Step 4 | 07 워크플로 패턴 |
| `asyncio.Semaphore` + `gather` 동시 처리, 오류 격리 | Step 5 | 00 Python, 10 프로덕션 |
| 정확도, 혼동 행렬, 오분류 분석 | Step 6 | 09 평가 |

> 🧪 **Mock LLM과 실제 LLM**: 키 없이 Mock으로도 모든 단계를 진행하고 채점받을 수 있습니다. 채점은 `scripted()`로 고정된 응답을 쓰기 때문입니다. 다만 Mock은 문장을 이해하지 못하므로 분류가 대부분 `billing`처럼 첫 번째 값으로 나옵니다. Step 6에서 이 차이를 직접 측정해 봅니다. ⚙️ 설정에서 Claude를 연결하면 같은 코드로 진짜 분류 품질을 확인할 수 있습니다.

## Step 1. 데이터와 출력 스키마 설계

### 1-1. 데이터 둘러보기

파이프라인을 만들기 전에 데이터부터 봅니다. 카테고리와 우선순위가 어떻게 분포하는지, FAQ가 몇 개나 있는지 확인하세요.

```python run id=p3-d1
import json
import pandas as pd

df = pd.read_csv("data/tickets.csv")
print(f"문의 {len(df)}건, 컬럼: {list(df.columns)}\n")
print(df[["ticket_id", "tier", "text"]].head(5).to_string(index=False))

print("\n[정답 카테고리 분포]")
print(df["label_category"].value_counts().to_string())
print("\n[카테고리 × 우선순위]")
print(pd.crosstab(df["label_category"], df["label_priority"]).to_string())

with open("data/faq.json", encoding="utf-8") as f:
    kb = json.load(f)
print(f"\nFAQ {len(kb['faq'])}개, 정책: {kb['policy']}")
```

### 1-2. 왜 "출력 스키마"부터 설계할까?

LLM의 출력은 기본적으로 **자유로운 텍스트**입니다. "결제 관련이고 급해 보입니다" 같은 문장은 사람에게는 충분하지만, 다음 단계 코드(`if category == "billing"`)가 쓰기에는 불안정합니다. 그래서 자동화 파이프라인에서는 **LLM의 출력 형식을 먼저 계약(contract)으로 정의**합니다.

Claude의 도구 정의에 쓰는 `input_schema`는 [JSON Schema](https://json-schema.org/) 형식이므로, 이를 출력 계약으로 그대로 쓸 수 있습니다.

| 스키마 요소 | 역할 | 이 프로젝트에서 |
|---|---|---|
| `enum` | 허용 값 목록을 고정해 오타나 새 값을 막습니다 | `category`, `priority` |
| `description` | 모델이 각 필드를 어떻게 채울지 알려주는 **프롬프트** | 카테고리별 판단 기준 |
| `required` | 빠지면 안 되는 필드 | 4개 전부 |
| `type: boolean` | 예/아니오 판단 | `needs_human` |

> 💡 **스키마의 description도 프롬프트입니다.** "category: 카테고리"처럼 쓰지 말고, 경계가 애매한 사례("해지 후 요금이 빠져나감 → billing")까지 적어 주면 정확도가 올라갑니다.

스키마만으로 안심하면 안 됩니다. 모델이 스키마를 어기는 경우는 드물지만 0이 아니고, 다른 공급자나 모델로 바꾸면 행동이 달라질 수 있습니다. 그래서 **코드로 한 번 더 검증**하는 `validate_classification`을 만듭니다. 이 함수가 반환하는 오류 메시지는 Step 2에서 모델에게 그대로 피드백으로 돌려줄 것이므로, **사람과 모델이 모두 이해할 수 있게** 구체적으로 씁니다.

### 실습 Step 1. 분류 도구 스키마와 검증 함수

다음을 완성하세요. `load_tickets`와 `load_kb`는 이미 작성되어 있습니다.

1. `CLASSIFY_TOOL`: 이름이 `"classify_ticket"`인 도구 정의입니다.
   - `input_schema.properties`에 다음 4개 필드를 정의합니다.
     - `category`: string, enum은 `CATEGORIES`
     - `priority`: string, enum은 `PRIORITIES`
     - `summary`: string
     - `needs_human`: boolean
   - `required`에는 4개 필드를 모두 넣습니다.
   - 각 필드에는 판단 기준을 담은 `description`을 씁니다.
2. `validate_classification(d)`: 오류 메시지 **리스트**를 반환합니다. 문제가 없으면 빈 리스트입니다.
   - `d`가 dict가 아니면 `["분류 결과가 dict가 아닙니다"]`
   - 필수 필드가 없으면 `"필드 누락: <필드명>"`
   - `category`나 `priority`가 허용 값이 아니면, 필드명과 받은 값이 들어간 메시지
   - `summary`가 비어 있지 않은 문자열이 아니면 오류
   - `needs_human`이 bool이 아니면 오류. `"yes"` 같은 문자열도 오류입니다.

```hint id=p3-s1
props = CLASSIFY_TOOL["input_schema"]["properties"] 형태가 되도록 dict를 구성하세요. 검증 함수는 errors = [] 를 만들고 조건마다 errors.append(f"category 값이 올바르지 않습니다: {d['category']!r} (허용: {CATEGORIES})") 처럼 추가한 뒤 마지막에 return errors 하면 됩니다. bool 검사는 isinstance(v, bool)을 쓰세요.
```

```python starter id=p3-s1
import json
import pandas as pd

CATEGORIES = ["billing", "technical", "delivery", "account", "other"]
PRIORITIES = ["high", "normal", "low"]
REQUIRED_FIELDS = ["category", "priority", "summary", "needs_human"]


def load_tickets(path="data/tickets.csv"):
    return pd.read_csv(path)


def load_kb(path="data/faq.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


CLASSIFY_TOOL = {
    "name": "classify_ticket",
    "description": "고객 문의를 분류한 결과를 기록합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            # TODO: category, priority, summary, needs_human
        },
        "required": [],  # TODO
    },
}


def validate_classification(d):
    """오류 메시지 리스트를 반환합니다. 문제가 없으면 []."""
    # TODO
    pass
```

```python test id=p3-s1
schema = CLASSIFY_TOOL["input_schema"]
props = schema["properties"]
assert CLASSIFY_TOOL["name"] == "classify_ticket", "도구 이름은 classify_ticket이어야 합니다"
for f in REQUIRED_FIELDS:
    assert f in props, f"properties에 {f} 필드가 없습니다"
    assert props[f].get("description"), f"{f} 필드에 description(판단 기준)을 적어 주세요"
assert props["category"].get("enum") == CATEGORIES, "category의 enum은 CATEGORIES여야 합니다"
assert props["priority"].get("enum") == PRIORITIES, "priority의 enum은 PRIORITIES여야 합니다"
assert props["needs_human"].get("type") == "boolean", "needs_human은 boolean 타입이어야 합니다"
assert props["summary"].get("type") == "string", "summary는 string 타입이어야 합니다"
assert sorted(schema.get("required", [])) == sorted(REQUIRED_FIELDS), "required에 4개 필드를 모두 넣으세요"

good = {"category": "billing", "priority": "high", "summary": "이중 결제 환불 요청", "needs_human": False}
assert validate_classification(good) == [], f"올바른 입력에는 빈 리스트를 반환해야 합니다: {validate_classification(good)}"
assert validate_classification(None) == ["분류 결과가 dict가 아닙니다"], "dict가 아니면 ['분류 결과가 dict가 아닙니다']를 반환하세요"

errs = validate_classification({k: v for k, v in good.items() if k != "priority"})
assert len(errs) >= 1 and any("priority" in e for e in errs), f"필드 누락을 알려야 합니다: {errs}"
errs = validate_classification({**good, "category": "refund"})
assert any("category" in e and "refund" in e for e in errs), f"잘못된 category 값과 필드명을 메시지에 넣으세요: {errs}"
errs = validate_classification({**good, "priority": "urgent"})
assert any("priority" in e and "urgent" in e for e in errs), f"잘못된 priority 값을 알려야 합니다: {errs}"
assert validate_classification({**good, "summary": "  "}), "빈 summary는 오류입니다"
assert validate_classification({**good, "needs_human": "yes"}), "needs_human이 문자열이면 오류입니다"
assert len(load_tickets()) == 40 and "faq" in load_kb(), "데이터 로더가 동작해야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s1
import json
import pandas as pd

CATEGORIES = ["billing", "technical", "delivery", "account", "other"]
PRIORITIES = ["high", "normal", "low"]
REQUIRED_FIELDS = ["category", "priority", "summary", "needs_human"]


def load_tickets(path="data/tickets.csv"):
    return pd.read_csv(path)


def load_kb(path="data/faq.json"):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


CLASSIFY_TOOL = {
    "name": "classify_ticket",
    "description": "고객 문의를 분류한 결과를 기록합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "enum": CATEGORIES,
                "description": "billing=결제·요금·환불·청구서·쿠폰, technical=앱/웹 오류·장애·성능·API, "
                               "delivery=배송·파손·오배송·배송지, account=로그인 계정·비밀번호·보안·탈퇴·인증, other=그 외",
            },
            "priority": {
                "type": "string",
                "enum": PRIORITIES,
                "description": "high=금전 피해·보안 사고·서비스 장애·파손/오배송, normal=처리가 필요하지만 급하지 않음, "
                               "low=단순 문의·정보 요청·의견",
            },
            "summary": {"type": "string", "description": "담당자가 읽을 한 문장 요약"},
            "needs_human": {"type": "boolean", "description": "자동 답변이 위험해 사람이 직접 처리해야 하면 true"},
        },
        "required": REQUIRED_FIELDS,
    },
}


def validate_classification(d):
    """오류 메시지 리스트를 반환합니다. 문제가 없으면 []."""
    if not isinstance(d, dict):
        return ["분류 결과가 dict가 아닙니다"]
    errors = [f"필드 누락: {f}" for f in REQUIRED_FIELDS if f not in d]
    if "category" in d and d["category"] not in CATEGORIES:
        errors.append(f"category 값이 올바르지 않습니다: {d['category']!r} (허용: {CATEGORIES})")
    if "priority" in d and d["priority"] not in PRIORITIES:
        errors.append(f"priority 값이 올바르지 않습니다: {d['priority']!r} (허용: {PRIORITIES})")
    if "summary" in d and not (isinstance(d["summary"], str) and d["summary"].strip()):
        errors.append("summary는 비어 있지 않은 문자열이어야 합니다")
    if "needs_human" in d and not isinstance(d["needs_human"], bool):
        errors.append(f"needs_human은 true/false여야 합니다: {d['needs_human']!r}")
    return errors
```

## Step 2. 구조화 출력 분류기와 재시도

### 2-1. tool_choice로 "반드시 이 형식으로" 답하게 하기

Step 1의 도구를 모델에게 주면서 `tool_choice={"type": "tool", "name": "classify_ticket"}`를 지정하면, 모델은 텍스트로 수다를 떨지 않고 **반드시 그 도구를 호출**합니다. 우리는 도구를 실제로 "실행"하지 않습니다. 모델이 채운 `input`이 바로 우리가 원하는 **구조화된 분류 결과**입니다.

~~~text
요청: system(분류 기준) + user(<ticket>…</ticket>) + tools=[classify_ticket] + tool_choice=classify_ticket
응답: {"type": "tool_use", "name": "classify_ticket",
       "input": {"category": "billing", "priority": "high", "summary": "...", "needs_human": false}}
                 └──────────── tool_input(resp) 로 꺼냅니다 ────────────┘
~~~

### 2-2. 검증에 실패하면? 오류를 돌려주고 다시 시키기

검증에 실패하면 버리지 말고 **무엇이 틀렸는지 모델에게 알려 주고 다시 요청**합니다. 대화 형식은 도구 사용 흐름과 같습니다.

1. assistant 메시지로 모델의 응답(`content` 전체)을 추가합니다.
2. user 메시지에 해당 `tool_use_id`의 `tool_result`를 `is_error=True`로 넣고, 검증 오류 내용을 담습니다.
3. 같은 `tool_choice`로 다시 호출합니다.

재시도는 반드시 **횟수 제한**(`max_retries`)을 둡니다. 계속 실패하면 예외를 올려서 그 티켓만 사람에게 넘기면 됩니다. 이 처리는 Step 5에서 다룹니다.

### 2-3. LLM 판단 + 결정적 규칙

모든 판단을 LLM에 맡길 필요는 없습니다. 회사 정책처럼 **반드시 지켜야 하는 규칙**은 코드로 덮어쓰는 편이 안전하고 설명하기도 쉽습니다.

| 규칙 | 이유 |
|---|---|
| 본문에 `URGENT_KEYWORDS`(해킹, 장애, 파손, 두 번, 모르는 기기)가 있으면 priority=high | 금전 피해·보안 사고는 놓치면 비용이 큼 |
| VIP 고객은 priority가 low여도 normal로 올림 | 고객 등급별 SLA 정책 |

> ⚠️ 규칙은 **원본 dict를 바꾸지 말고 복사본**을 수정해 반환하세요. 원본을 그대로 바꾸면 "LLM이 원래 뭐라고 했는지" 추적할 수 없어 디버깅과 평가가 어려워집니다.

### 실습 Step 2. classify와 apply_rules

`CLASSIFY_SYSTEM`과 `ticket_prompt`는 제공됩니다. 다음 두 함수를 완성하세요.

1. `async def classify(ticket, max_retries=2)`
   - `messages = [{"role": "user", "content": ticket_prompt(ticket)}]`로 시작합니다.
   - 최대 `max_retries + 1`번 다음을 반복합니다.
     - `chat(messages, system=CLASSIFY_SYSTEM, tools=[CLASSIFY_TOOL], tool_choice={"type": "tool", "name": "classify_ticket"})`를 호출합니다.
     - `tool_input(resp, "classify_ticket")`의 결과를 `validate_classification`으로 검사합니다. 오류가 없으면 그 결과를 반환합니다.
     - 오류가 있으면 assistant 메시지(응답 content)를 추가하고, `tool_result(그 tool_use의 id, "검증 실패: ...", is_error=True)`를 담은 user 메시지를 추가합니다.
   - 모두 실패하면 `ValueError`를 발생시킵니다.
2. `apply_rules(ticket, cls)`: 위 표의 두 규칙을 적용한 **복사본**을 반환합니다.

```hint id=p3-s2
calls = tool_calls(resp) 로 tool_use 블록을 얻고, calls[0]["id"]를 tool_result에 넘기세요. 오류 메시지는 "; ".join(errors)로 합칩니다. apply_rules는 out = dict(cls)로 복사한 뒤 any(k in ticket["text"] for k in URGENT_KEYWORDS)를 검사하세요.
```

```python starter id=p3-s2
from agentlab import chat, tool_input, tool_calls, tool_result

CLASSIFY_SYSTEM = """너는 고객지원팀의 문의 분류 담당자다.
문의를 읽고 classify_ticket 도구로만 결과를 기록한다.
- 카테고리와 우선순위 기준은 도구 스키마의 설명을 따른다.
- 여러 주제가 섞여 있으면 고객이 가장 먼저 해결받고 싶은 문제를 기준으로 한다.
- 근거가 부족하면 priority는 normal로 둔다."""

URGENT_KEYWORDS = ["해킹", "장애", "파손", "두 번", "모르는 기기"]


def ticket_prompt(ticket):
    # 정답 라벨(label_*)은 절대 넣지 않습니다!
    return (f"<ticket>\n채널: {ticket['channel']}\n고객 등급: {ticket['tier']}\n"
            f"내용: {ticket['text']}\n</ticket>\n이 문의를 분류하세요.")


async def classify(ticket, max_retries=2):
    messages = [{"role": "user", "content": ticket_prompt(ticket)}]
    # TODO: 호출 → 검증 → (실패 시) 오류 피드백 후 재시도
    pass


def apply_rules(ticket, cls):
    # TODO: 복사본에 규칙 적용
    pass
```

```python test id=p3-s2
import agentlab

t = {"ticket_id": "T999", "channel": "email", "tier": "normal", "text": "결제가 두 번 됐어요. 환불해 주세요."}
good = {"category": "billing", "priority": "high", "summary": "이중 결제 환불 요청", "needs_human": False}

# 1) 한 번에 성공
agentlab.scripted([{"tool": "classify_ticket", "input": good}])
r = await classify(t)
assert r == good, f"검증을 통과한 분류 결과를 그대로 반환하세요 (받은 값: {r!r})"
c = agentlab.calls[0]
assert c.get("tool_choice") == {"type": "tool", "name": "classify_ticket"}, "tool_choice로 classify_ticket 호출을 강제하세요"
assert c.get("tools") and c["tools"][0]["name"] == "classify_ticket", "tools=[CLASSIFY_TOOL]을 전달하세요"
assert c.get("system") == CLASSIFY_SYSTEM, "system=CLASSIFY_SYSTEM을 전달하세요"
assert "결제가 두 번" in c["messages"][0]["content"], "첫 메시지는 ticket_prompt(ticket)이어야 합니다"

# 2) 첫 응답이 잘못된 값 → 오류 피드백 후 재시도
agentlab._reset()
agentlab.scripted([
    {"tool": "classify_ticket", "id": "bad1", "input": {**good, "category": "refund"}},
    {"tool": "classify_ticket", "input": good},
])
r = await classify(t)
assert r == good, "재시도에서 받은 올바른 결과를 반환해야 합니다"
assert len(agentlab.calls) == 2, f"검증 실패 후 한 번 더 호출해야 합니다 (현재 {len(agentlab.calls)}번)"
m = agentlab.calls[1]["messages"]
assert [x["role"] for x in m] == ["user", "assistant", "user"], f"재시도 요청의 messages 순서가 다릅니다: {[x['role'] for x in m]}"
fb = m[2]["content"]
assert isinstance(fb, list) and fb[0].get("type") == "tool_result", "피드백은 tool_result 블록으로 보내세요"
assert fb[0]["tool_use_id"] == "bad1", "실패한 tool_use의 id를 tool_use_id로 쓰세요"
assert fb[0].get("is_error") is True, "검증 실패 피드백에는 is_error=True를 지정하세요"
assert "refund" in fb[0]["content"], "피드백에 검증 오류 내용을 담으세요"

# 3) 계속 실패하면 ValueError
agentlab._reset()
agentlab.scripted([{"tool": "classify_ticket", "input": {"category": "x"}}] * 5)
failed = False
try:
    await classify(t, max_retries=2)
except ValueError:
    failed = True
assert failed, "재시도를 모두 실패하면 ValueError를 발생시키세요"
assert len(agentlab.calls) == 3, f"max_retries=2면 총 3번 호출해야 합니다 (현재 {len(agentlab.calls)}번)"

# 4) 결정적 규칙
base = {"category": "account", "priority": "normal", "summary": "s", "needs_human": False}
out = apply_rules({"tier": "normal", "text": "계정 해킹이 의심됩니다"}, base)
assert out["priority"] == "high", "위험 키워드가 있으면 priority를 high로 올리세요"
assert base["priority"] == "normal", "원본 dict를 바꾸지 말고 복사본을 반환하세요"
assert apply_rules({"tier": "vip", "text": "영수증 문의"}, {**base, "priority": "low"})["priority"] == "normal", "VIP의 low는 normal로 올리세요"
assert apply_rules({"tier": "normal", "text": "영수증 문의"}, {**base, "priority": "low"})["priority"] == "low", "규칙에 해당하지 않으면 그대로 두세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s2
from agentlab import chat, tool_input, tool_calls, tool_result

CLASSIFY_SYSTEM = """너는 고객지원팀의 문의 분류 담당자다.
문의를 읽고 classify_ticket 도구로만 결과를 기록한다.
- 카테고리와 우선순위 기준은 도구 스키마의 설명을 따른다.
- 여러 주제가 섞여 있으면 고객이 가장 먼저 해결받고 싶은 문제를 기준으로 한다.
- 근거가 부족하면 priority는 normal로 둔다."""

URGENT_KEYWORDS = ["해킹", "장애", "파손", "두 번", "모르는 기기"]


def ticket_prompt(ticket):
    # 정답 라벨(label_*)은 절대 넣지 않습니다!
    return (f"<ticket>\n채널: {ticket['channel']}\n고객 등급: {ticket['tier']}\n"
            f"내용: {ticket['text']}\n</ticket>\n이 문의를 분류하세요.")


async def classify(ticket, max_retries=2):
    messages = [{"role": "user", "content": ticket_prompt(ticket)}]
    errors = []
    for _ in range(max_retries + 1):
        resp = await chat(messages, system=CLASSIFY_SYSTEM, tools=[CLASSIFY_TOOL],
                          tool_choice={"type": "tool", "name": "classify_ticket"})
        result = tool_input(resp, "classify_ticket")
        errors = validate_classification(result)
        if not errors:
            return result
        messages.append({"role": "assistant", "content": resp["content"]})
        feedback = "검증 실패: " + "; ".join(errors) + " — 스키마에 맞게 classify_ticket을 다시 호출하세요."
        calls = tool_calls(resp)
        if calls:
            messages.append({"role": "user", "content": [tool_result(calls[0]["id"], feedback, is_error=True)]})
        else:
            messages.append({"role": "user", "content": feedback})
    raise ValueError("분류 실패: " + "; ".join(errors))


def apply_rules(ticket, cls):
    out = dict(cls)
    if any(k in ticket["text"] for k in URGENT_KEYWORDS):
        out["priority"] = "high"
    if ticket.get("tier") == "vip" and out["priority"] == "low":
        out["priority"] = "normal"
    return out
```

### 2-4. 직접 분류해 보기

아래는 실제 문의 3건을 분류합니다. **Mock LLM**은 문장을 이해하지 못합니다. 그래서 enum 값이 본문에 글자 그대로 있으면 그 값을, 없으면 첫 번째 값(`billing`)을 고릅니다. ⚙️ 설정에서 Claude를 연결하고 다시 실행해 결과를 비교해 보세요.

```python run id=p3-d2
from agentlab import calls

df = load_tickets()
for ticket in df.iloc[[0, 9, 24]].to_dict("records"):
    raw = await classify(ticket)
    final = apply_rules(ticket, raw)
    print(f"[{ticket['ticket_id']}] {ticket['text'][:40]}…")
    print(f"   LLM  → {raw['category']}/{raw['priority']}  needs_human={raw['needs_human']}")
    print(f"   규칙 → {final['category']}/{final['priority']}   (정답: {ticket['label_category']}/{ticket['label_priority']})")
print(f"\nchat 호출 수: {len(calls)}")
```

```quiz id=p3-q1
{"q": "분류 결과를 자유 텍스트 대신 tool_choice로 강제한 도구 호출(구조화 출력)로 받는 가장 큰 이유는?", "options": ["토큰 비용이 0이 되기 때문에", "다음 단계 코드가 enum·필드가 고정된 dict를 안정적으로 처리할 수 있기 때문에", "모델이 더 창의적으로 답하기 때문에", "검증 코드를 작성할 필요가 없어지기 때문에"], "answer": 1, "explain": "자동화 파이프라인은 LLM 출력을 코드가 받아 분기합니다. 스키마로 형식을 고정하면 파싱 오류가 줄어듭니다. 그래도 드물게 어긋날 수 있으므로 검증과 재시도는 여전히 필요합니다."}
```

## Step 3. 라우팅과 FAQ 검색

### 3-1. 라우팅: 분류 결과를 "누가 처리할지"로 바꾸기

분류는 판단이고, 라우팅은 **정책**입니다. 정책은 자주 바뀌고 감사(audit) 대상이 되기도 하므로 LLM에게 맡기지 않고 **읽기 쉬운 코드**로 둡니다. 규칙은 **위에서부터 먼저 걸리는 것**이 적용됩니다.

| 순서 | 조건 | 큐 | 담당 |
|---|---|---|---|
| 1 | category가 `policy["escalation_categories"]`에 포함 | `escalation` | 보안·계정팀 (본인 확인 필요) |
| 2 | priority가 high이거나 needs_human이 True | `urgent` | 긴급 대응 상담원 |
| 3 | category가 other | `general` | 일반 상담원 (FAQ로 답하기 어려움) |
| 4 | 그 외 | `auto_reply` | FAQ 기반 자동 답변 초안 → 사람 승인 |

### 3-2. FAQ 검색: 답변의 "근거" 찾기

답변 초안을 쓸 때 LLM이 정책을 **지어내지 않게** 하려면 근거 문서를 함께 줘야 합니다. 이것이 RAG(검색 증강 생성)의 핵심입니다. 여기서는 가장 단순한 방법인 **키워드 겹침 점수**로 FAQ를 찾습니다.

~~~text
score(FAQ) = FAQ의 keywords 중 문의 본문에 등장하는 개수
후보 = 분류된 category와 같은 FAQ만
결과 = 점수가 가장 높은 FAQ (점수 0이면 None → 근거 없음)
~~~

같은 카테고리로 범위를 좁히면 "해지"처럼 결제(F01)와 탈퇴(F15) 양쪽에 나올 수 있는 단어 때문에 엉뚱한 문서가 걸리는 일을 막을 수 있습니다. 대신 **분류가 틀리면 검색도 틀린다**는 의존성이 생깁니다. 파이프라인에서는 앞 단계의 오류가 뒤로 전파된다는 점을 기억하세요. Step 6의 평가가 중요한 이유입니다.

> 💡 실무에서는 키워드 대신 BM25나 임베딩 검색을 씁니다(모듈 06). 함수 시그니처(`find_faq(text, category, faq_list)`)를 그대로 두면 내부 구현만 바꿔 끼울 수 있습니다.

### 실습 Step 3. route와 find_faq

1. `route(ticket, cls, policy)`: 위 표의 순서대로 큐 이름 문자열을 반환합니다.
2. `find_faq(text, category, faq_list)`
   - `category`가 같은 FAQ 중에서 키워드 겹침 점수가 가장 높은 항목(dict)을 반환합니다.
   - 점수가 같으면 목록에서 먼저 나온 항목을 고릅니다.
   - 겹치는 키워드가 하나도 없으면 `None`을 반환합니다.

```hint id=p3-s3
route는 if 문을 표 순서대로 쓰고 return 하세요. cls.get("needs_human")을 쓰면 키가 없어도 안전합니다. find_faq는 best, best_score = None, 0으로 시작해 score > best_score일 때만 바꾸면 '먼저 나온 항목 우선'이 자연스럽게 지켜집니다.
```

```python starter id=p3-s3
def route(ticket, cls, policy):
    # TODO: escalation → urgent → general → auto_reply
    pass


def find_faq(text, category, faq_list):
    # TODO: 같은 category 중 키워드 겹침 점수 최고 FAQ (없으면 None)
    pass
```

```python test id=p3-s3
kb = load_kb()
policy, faq = kb["policy"], kb["faq"]
c = {"category": "billing", "priority": "normal", "summary": "s", "needs_human": False}
assert route({}, {**c, "category": "account", "priority": "low"}, policy) == "escalation", "account는 escalation 큐로 보내세요 (우선순위와 무관)"
assert route({}, {**c, "category": "account", "priority": "high"}, policy) == "escalation", "escalation 규칙이 urgent보다 먼저 적용되어야 합니다"
assert route({}, {**c, "priority": "high"}, policy) == "urgent", "high는 urgent 큐입니다"
assert route({}, {**c, "needs_human": True}, policy) == "urgent", "needs_human=True도 urgent 큐입니다"
assert route({}, {**c, "category": "other", "priority": "low"}, policy) == "general", "other는 general 큐입니다"
assert route({}, {**c, "category": "delivery"}, policy) == "auto_reply", "그 외는 auto_reply 큐입니다"

r = find_faq("결제가 중복으로 되었어요. 환불해 주세요", "billing", faq)
assert r is not None and r["id"] == "F01", f"중복 결제 문의는 F01을 찾아야 합니다 (받은 값: {r and r['id']})"
r = find_faq("엑셀 내보내기를 하면 한글이 깨져요", "technical", faq)
assert r is not None and r["id"] == "F07", f"엑셀 한글 깨짐은 F07입니다 (받은 값: {r and r['id']})"
assert find_faq("엑셀 한글 깨짐", "billing", faq) is None, "category가 다른 FAQ는 후보에서 제외하세요"
assert find_faq("안녕하세요 반갑습니다", "billing", faq) is None, "겹치는 키워드가 없으면 None을 반환하세요"
r = find_faq("주문한 지 5일이 지났는데 아직 배송 준비 중으로 나옵니다.", "delivery", faq)
assert r["id"] == "F10", f"배송 지연 문의는 F10입니다 (받은 값: {r and r['id']})"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s3
def route(ticket, cls, policy):
    if cls["category"] in policy["escalation_categories"]:
        return "escalation"
    if cls["priority"] == "high" or cls.get("needs_human"):
        return "urgent"
    if cls["category"] == "other":
        return "general"
    return "auto_reply"


def find_faq(text, category, faq_list):
    best, best_score = None, 0
    for item in faq_list:
        if item["category"] != category:
            continue
        score = sum(1 for k in item["keywords"] if k in text)
        if score > best_score:
            best, best_score = item, score
    return best
```

### 3-3. 정답 라벨로 라우팅 시뮬레이션

LLM 분류 품질과 라우팅 로직을 **분리해서** 확인하는 요령입니다. 정답 라벨을 분류 결과인 것처럼 넣으면, "분류가 완벽할 때 라우팅과 검색이 의도대로 동작하는가"만 볼 수 있습니다.

```python run id=p3-d3
df = load_tickets()
kb = load_kb()
rows = []
for t in df.to_dict("records"):
    cls = {"category": t["label_category"], "priority": t["label_priority"], "summary": "", "needs_human": False}
    q = route(t, cls, kb["policy"])
    hit = find_faq(t["text"], cls["category"], kb["faq"]) if q == "auto_reply" else None
    rows.append({"id": t["ticket_id"], "queue": q, "faq": hit["id"] if hit else "-", "text": t["text"][:28]})
res = pd.DataFrame(rows)
print(res["queue"].value_counts().to_string(), "\n")
auto = res[res["queue"] == "auto_reply"]
print(f"auto_reply {len(auto)}건 중 FAQ 근거를 찾은 비율: {(auto['faq'] != '-').mean():.0%}")
print(auto.head(12).to_string(index=False))
```

## Step 4. 답변 초안과 평가자-최적화 루프

### 4-1. 왜 "작성자"와 "검수자"를 나눌까?

한 번의 호출로 완벽한 답변을 기대하기보다, **작성(generator) → 평가(evaluator) → 피드백 반영**을 몇 번 반복하는 편이 품질이 안정적입니다. 이것이 [평가자-최적화(evaluator-optimizer)](https://www.anthropic.com/engineering/building-effective-agents) 패턴입니다. 이 패턴이 잘 맞는 조건은 두 가지입니다.

- **평가 기준을 명확히 말할 수 있을 것**: FAQ에 없는 약속을 하지 않는다, 존댓말을 쓴다, 다음 행동을 안내한다.
- **피드백을 반영하면 실제로 좋아질 것**

이 프로젝트의 검수는 두 겹입니다.

| 단계 | 방식 | 장점 |
|---|---|---|
| 1차 `rule_check` | 코드 규칙: 빈 답변, 길이 초과, 금지 표현 | 공짜, 빠름, 100% 일관됨 |
| 2차 `review_reply` | LLM 검수자 (forced tool → `passed`, `feedback`) | 사실 근거, 어조처럼 규칙으로 잡기 어려운 것 |

규칙 검사에서 걸리면 LLM 검수자를 **부르지 않습니다**. 싼 검사를 먼저 하는 것은 비용을 아끼는 기본 원칙입니다.

> ⚠️ **무한 루프 주의**: 검수자가 계속 불합격을 주면 루프가 끝나지 않습니다. 반드시 `max_rounds`로 제한하고, 끝까지 통과하지 못한 초안은 `approved_by_reviewer=False`로 표시해 사람이 더 꼼꼼히 보게 합니다.

### 실습 Step 4. write_reply 루프

`draft_reply`(작성), `review_reply`(LLM 검수), `rule_check`(규칙 검수)는 제공됩니다. `write_reply(ticket, cls, faq_item, max_rounds=3)`을 완성하세요.

1. `feedback = None`으로 시작해 최대 `max_rounds`번 반복합니다.
   - `draft = await draft_reply(ticket, cls, faq_item, feedback)`
   - `problems = rule_check(draft)`가 있으면 `feedback = "; ".join(problems)`로 정하고, LLM 검수 없이 다음 라운드로 넘어갑니다.
   - 문제가 없으면 `passed, feedback = await review_reply(ticket, draft, faq_item)`를 호출하고, 통과하면 즉시 결과를 반환합니다.
   - 매 라운드 `history`에 `{"draft": draft, "feedback": feedback}`를 추가합니다.
2. 반환값은 `{"reply": 마지막 초안, "rounds": 진행한 라운드 수, "approved_by_reviewer": 통과 여부, "history": history}`입니다.

```hint id=p3-s4
for rnd in range(1, max_rounds + 1): 안에서 draft를 만들고, problems가 있으면 history에 추가한 뒤 continue 하세요. 통과하면 {"reply": draft, "rounds": rnd, "approved_by_reviewer": True, "history": history}를 반환하고, for 문이 끝나면 approved_by_reviewer=False로 반환합니다.
```

```python starter id=p3-s4
from agentlab import chat, text_of, tool_input

FORBIDDEN_PHRASES = ["100% 보장", "무조건", "즉시 환불해 드리겠습니다"]

DRAFT_SYSTEM = """너는 고객지원 상담원이다. 고객 문의에 대한 답변 초안을 한국어 존댓말로 작성한다.
- <faq>에 있는 내용만 근거로 정책·기한·금액을 말한다. 없는 정책을 지어내지 않는다.
- FAQ가 없으면 담당자가 확인 후 연락드린다고 안내한다.
- 5문장 이하로, 고객이 다음에 할 행동을 분명히 알려준다.
- 인사말과 서명은 생략하고 본문만 쓴다."""

REVIEW_SYSTEM = """너는 고객지원 답변 검수자다. 아래 기준으로 초안을 평가하고 review_reply 도구로만 답한다.
1) FAQ 근거와 모순되거나 FAQ에 없는 약속(기한·금액·보상)을 하지 않았는가
2) 고객의 질문에 직접 답하고 다음 행동을 안내하는가
3) 정중한 존댓말인가
하나라도 어기면 passed=false, feedback에 고칠 점을 구체적으로 적는다."""

REVIEW_TOOL = {
    "name": "review_reply",
    "description": "답변 초안의 검수 결과를 기록합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "passed": {"type": "boolean", "description": "모든 기준을 만족하면 true"},
            "feedback": {"type": "string", "description": "불합격이면 고칠 점, 합격이면 짧은 코멘트"},
        },
        "required": ["passed", "feedback"],
    },
}


def rule_check(draft):
    problems = []
    if not draft.strip():
        problems.append("답변이 비어 있습니다")
    if len(draft) > 800:
        problems.append("답변이 너무 깁니다 (800자 이하)")
    for p in FORBIDDEN_PHRASES:
        if p in draft:
            problems.append(f"약속할 수 없는 표현 사용: '{p}'")
    return problems


async def draft_reply(ticket, cls, faq_item, feedback=None):
    faq_text = faq_item["answer"] if faq_item else "관련 FAQ 없음"
    prompt = (f"<ticket>\n{ticket['text']}\n</ticket>\n<category>{cls['category']}</category>\n"
              f"<faq>\n{faq_text}\n</faq>\n답변 초안을 작성하세요.")
    if feedback:
        prompt += f"\n<review_feedback>\n{feedback}\n</review_feedback>\n위 검수 의견을 반영해 다시 작성하세요."
    resp = await chat([{"role": "user", "content": prompt}], system=DRAFT_SYSTEM, max_tokens=1000)
    return text_of(resp).strip()


async def review_reply(ticket, draft, faq_item):
    faq_text = faq_item["answer"] if faq_item else "관련 FAQ 없음"
    prompt = f"<ticket>\n{ticket['text']}\n</ticket>\n<faq>\n{faq_text}\n</faq>\n<draft>\n{draft}\n</draft>"
    resp = await chat([{"role": "user", "content": prompt}], system=REVIEW_SYSTEM, tools=[REVIEW_TOOL],
                      tool_choice={"type": "tool", "name": "review_reply"}, max_tokens=1000)
    r = tool_input(resp, "review_reply") or {}
    return bool(r.get("passed")), str(r.get("feedback", ""))


async def write_reply(ticket, cls, faq_item, max_rounds=3):
    history = []
    feedback = None
    # TODO: 작성 → 규칙 검사 → LLM 검수 → (불합격 시) 피드백 반영 재작성
    pass
```

```python test id=p3-s4
import agentlab

t = {"ticket_id": "T001", "tier": "vip", "channel": "email", "text": "요금이 두 번 결제되었습니다. 환불해 주세요."}
cls = {"category": "billing", "priority": "high", "summary": "s", "needs_human": False}
faq = {"id": "F01", "category": "billing", "keywords": [], "answer": "중복 결제는 3일 이내 환불됩니다."}

# 1) 1라운드 불합격 → 피드백 반영 → 2라운드 합격
agentlab.scripted([
    "확인해 보겠습니다.",
    {"tool": "review_reply", "input": {"passed": False, "feedback": "FAQ의 환불 기간(3일)을 안내하세요"}},
    "중복 결제는 영업일 3일 이내 환불됩니다.",
    {"tool": "review_reply", "input": {"passed": True, "feedback": "좋습니다"}},
])
res = await write_reply(t, cls, faq)
assert isinstance(res, dict), "결과 dict를 반환하세요"
assert res["reply"] == "중복 결제는 영업일 3일 이내 환불됩니다.", f"합격한 초안을 reply로 반환하세요: {res.get('reply')!r}"
assert res["rounds"] == 2 and res["approved_by_reviewer"] is True, f"rounds=2, approved_by_reviewer=True여야 합니다: {res}"
assert len(res["history"]) == 2, "라운드마다 history에 기록하세요"
assert len(agentlab.calls) == 4, f"작성·검수 2라운드 = chat 4회여야 합니다 (현재 {len(agentlab.calls)}회)"
assert "FAQ의 환불 기간(3일)을 안내하세요" in agentlab.calls[2]["messages"][0]["content"], "재작성 시 검수 피드백을 draft_reply에 전달하세요"

# 2) 규칙 위반(빈 답변)은 LLM 검수 없이 바로 재작성
agentlab._reset()
agentlab.scripted([
    "",
    "중복 결제는 3일 이내 환불됩니다.",
    {"tool": "review_reply", "input": {"passed": True, "feedback": "ok"}},
])
res = await write_reply(t, cls, faq)
assert len(agentlab.calls) == 3, f"규칙 검사에 걸리면 review_reply를 호출하지 마세요 (chat {len(agentlab.calls)}회)"
assert res["rounds"] == 2 and res["approved_by_reviewer"] is True, f"{res}"
assert "비어" in res["history"][0]["feedback"], "규칙 위반 내용을 피드백으로 기록하세요"

# 3) 끝까지 불합격 → max_rounds에서 멈춤
agentlab._reset()
agentlab.scripted(["초안A", {"tool": "review_reply", "input": {"passed": False, "feedback": "부족"}},
                   "초안B", {"tool": "review_reply", "input": {"passed": False, "feedback": "부족"}}])
res = await write_reply(t, cls, faq, max_rounds=2)
assert res["approved_by_reviewer"] is False and res["rounds"] == 2, f"max_rounds에서 멈추고 불합격으로 표시하세요: {res}"
assert res["reply"] == "초안B", "마지막 초안을 reply로 반환하세요"
assert len(agentlab.calls) == 4, "max_rounds=2면 chat은 최대 4회입니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s4
from agentlab import chat, text_of, tool_input

FORBIDDEN_PHRASES = ["100% 보장", "무조건", "즉시 환불해 드리겠습니다"]

DRAFT_SYSTEM = """너는 고객지원 상담원이다. 고객 문의에 대한 답변 초안을 한국어 존댓말로 작성한다.
- <faq>에 있는 내용만 근거로 정책·기한·금액을 말한다. 없는 정책을 지어내지 않는다.
- FAQ가 없으면 담당자가 확인 후 연락드린다고 안내한다.
- 5문장 이하로, 고객이 다음에 할 행동을 분명히 알려준다.
- 인사말과 서명은 생략하고 본문만 쓴다."""

REVIEW_SYSTEM = """너는 고객지원 답변 검수자다. 아래 기준으로 초안을 평가하고 review_reply 도구로만 답한다.
1) FAQ 근거와 모순되거나 FAQ에 없는 약속(기한·금액·보상)을 하지 않았는가
2) 고객의 질문에 직접 답하고 다음 행동을 안내하는가
3) 정중한 존댓말인가
하나라도 어기면 passed=false, feedback에 고칠 점을 구체적으로 적는다."""

REVIEW_TOOL = {
    "name": "review_reply",
    "description": "답변 초안의 검수 결과를 기록합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "passed": {"type": "boolean", "description": "모든 기준을 만족하면 true"},
            "feedback": {"type": "string", "description": "불합격이면 고칠 점, 합격이면 짧은 코멘트"},
        },
        "required": ["passed", "feedback"],
    },
}


def rule_check(draft):
    problems = []
    if not draft.strip():
        problems.append("답변이 비어 있습니다")
    if len(draft) > 800:
        problems.append("답변이 너무 깁니다 (800자 이하)")
    for p in FORBIDDEN_PHRASES:
        if p in draft:
            problems.append(f"약속할 수 없는 표현 사용: '{p}'")
    return problems


async def draft_reply(ticket, cls, faq_item, feedback=None):
    faq_text = faq_item["answer"] if faq_item else "관련 FAQ 없음"
    prompt = (f"<ticket>\n{ticket['text']}\n</ticket>\n<category>{cls['category']}</category>\n"
              f"<faq>\n{faq_text}\n</faq>\n답변 초안을 작성하세요.")
    if feedback:
        prompt += f"\n<review_feedback>\n{feedback}\n</review_feedback>\n위 검수 의견을 반영해 다시 작성하세요."
    resp = await chat([{"role": "user", "content": prompt}], system=DRAFT_SYSTEM, max_tokens=1000)
    return text_of(resp).strip()


async def review_reply(ticket, draft, faq_item):
    faq_text = faq_item["answer"] if faq_item else "관련 FAQ 없음"
    prompt = f"<ticket>\n{ticket['text']}\n</ticket>\n<faq>\n{faq_text}\n</faq>\n<draft>\n{draft}\n</draft>"
    resp = await chat([{"role": "user", "content": prompt}], system=REVIEW_SYSTEM, tools=[REVIEW_TOOL],
                      tool_choice={"type": "tool", "name": "review_reply"}, max_tokens=1000)
    r = tool_input(resp, "review_reply") or {}
    return bool(r.get("passed")), str(r.get("feedback", ""))


async def write_reply(ticket, cls, faq_item, max_rounds=3):
    history = []
    feedback = None
    draft = ""
    for rnd in range(1, max_rounds + 1):
        draft = await draft_reply(ticket, cls, faq_item, feedback)
        problems = rule_check(draft)
        if problems:
            feedback = "; ".join(problems)
            history.append({"draft": draft, "feedback": feedback})
            continue
        passed, feedback = await review_reply(ticket, draft, faq_item)
        history.append({"draft": draft, "feedback": feedback})
        if passed:
            return {"reply": draft, "rounds": rnd, "approved_by_reviewer": True, "history": history}
    return {"reply": draft, "rounds": max_rounds, "approved_by_reviewer": False, "history": history}
```

### 4-2. 답변 초안 만들어 보기

배송 지연 문의(T017)에 대한 초안을 만듭니다. Mock LLM에서는 초안이 "[Mock LLM] …"으로 나오고, 검수자는 boolean 필드를 `true`로 채우므로 1라운드에 통과합니다. 실제 Claude로 실행하면 FAQ 근거를 반영한 문장과 검수 피드백을 볼 수 있습니다.

```python run id=p3-d4
df = load_tickets()
kb = load_kb()
ticket = df[df["ticket_id"] == "T017"].iloc[0].to_dict()
cls = {"category": "delivery", "priority": "normal", "summary": "", "needs_human": False}
faq_item = find_faq(ticket["text"], cls["category"], kb["faq"])
print("문의:", ticket["text"])
print("근거 FAQ:", faq_item["id"], "-", faq_item["answer"], "\n")

res = await write_reply(ticket, cls, faq_item, max_rounds=3)
for i, h in enumerate(res["history"], 1):
    print(f"[라운드 {i}] 초안: {h['draft'][:120]}")
    print(f"          검수: {h['feedback'][:120]}")
print(f"\n최종 ({res['rounds']}라운드, 검수 통과={res['approved_by_reviewer']}):\n{res['reply']}")
```

```quiz id=p3-q2
{"q": "평가자-최적화 루프에서 max_rounds 제한과 rule_check(코드 검사)를 먼저 두는 이유로 가장 적절한 것은?", "options": ["LLM 검수자는 항상 틀리기 때문에", "무한 반복과 불필요한 비용을 막고, 공짜로 확실하게 잡을 수 있는 문제는 LLM 호출 없이 거르기 위해", "rule_check가 LLM보다 문장을 더 잘 이해하기 때문에", "Anthropic API가 같은 대화에서 3번 이상 호출을 허용하지 않기 때문에"], "answer": 1, "explain": "루프에는 항상 종료 조건이 필요합니다. 빈 답변이나 금지 표현처럼 결정적으로 판별할 수 있는 문제는 코드로 먼저 걸러야 비용과 지연을 줄일 수 있습니다."}
```

## Step 5. 비동기 배치 파이프라인

### 5-1. 순차 처리 vs 동시 처리

LLM 호출 한 번은 보통 수 초가 걸리고, 그 시간 대부분은 **네트워크 응답을 기다리는 시간**입니다. 100건을 하나씩 처리하면 기다림도 100번 쌓이지만, `asyncio.gather`로 여러 건을 동시에 보내면 기다리는 시간이 겹칩니다.

~~~text
순차:  [T1 ████][T2 ████][T3 ████][T4 ████]            → 4배 시간
동시:  [T1 ████]
       [T2 ████]   ← 동시에 최대 N개 (Semaphore)
       [T3 ████]
       [T4 ████]                                     → 약 1배 시간
~~~

하지만 무제한으로 동시에 보내면 API **속도 제한(rate limit, 429 오류)**에 걸립니다. 그래서 `asyncio.Semaphore(concurrency)`로 **동시에 실행되는 개수의 상한**을 둡니다.

~~~python
sem = asyncio.Semaphore(5)

async def one(ticket):
    async with sem:          # 빈자리가 날 때까지 기다렸다가 들어감
        return await handler(ticket, kb)

results = await asyncio.gather(*(one(t) for t in tickets))   # 입력 순서대로 결과가 돌아옴
~~~

### 5-2. 오류 격리: 한 건의 실패가 전체를 멈추지 않게

배치에서 1건이 타임아웃이나 분류 실패로 예외를 내면, `gather`는 기본적으로 **전체를 실패**시킵니다. 실무에서는 실패한 건만 `status="error"`로 기록하고 나머지는 계속 처리한 뒤, 실패 건을 사람 큐나 재처리 큐로 보내는 것이 원칙입니다.

| 방법 | 동작 |
|---|---|
| 핸들러 안에서 `try/except`로 감싸 오류 레코드 반환 | 결과 형식이 통일되어 다루기 쉬움 ✅ (이번 실습) |
| `gather(..., return_exceptions=True)` | 예외 객체가 결과 리스트에 섞여 들어옴 |

### 5-3. 티켓 한 건 처리: handle_ticket

지금까지 만든 부품을 한 함수로 조립한 `handle_ticket`은 제공됩니다. 테스트하기 쉽도록 `classifier`와 `writer`를 **인자로 주입**할 수 있게 설계했습니다. 이렇게 하면 LLM 없이 가짜 함수로 파이프라인을 검증할 수 있습니다. 이런 설계를 의존성 주입(dependency injection)이라고 합니다.

결과 레코드에는 정책의 SLA에 따른 **처리 기한(`due_at`)**이 들어갑니다.

### 실습 Step 5. process_all

`async def process_all(tickets, kb, concurrency=5, handler=None)`을 완성하세요.

- `handler`가 `None`이면 `handle_ticket`을 씁니다. 호출 형태는 `await handler(ticket, kb)`입니다.
- `asyncio.Semaphore(concurrency)`로 동시 실행 수를 제한합니다.
- 예외가 나면 `{"ticket_id": ..., "status": "error", "error": "예외타입: 메시지"}` 레코드를 대신 넣습니다.
- 결과는 **입력 순서대로** 리스트로 반환합니다.

```hint id=p3-s5
async def one(t): 안에서 async with sem: try: return await handler(t, kb) except Exception as e: return {...} 형태로 쓰고, return list(await asyncio.gather(*(one(t) for t in tickets)))로 마무리하세요. 오류 문자열은 f"{type(e).__name__}: {e}"를 권장합니다.
```

```python starter id=p3-s5
import asyncio
from datetime import datetime, timedelta


async def handle_ticket(ticket, kb, classifier=None, writer=None, received_at=None):
    """티켓 한 건: 분류 → 규칙 → 라우팅 → (auto_reply면) FAQ 검색·답변 초안"""
    classifier = classifier or classify
    writer = writer or write_reply
    received_at = received_at or datetime(2025, 10, 1, 9, 0)
    cls = apply_rules(ticket, await classifier(ticket))
    queue = route(ticket, cls, kb["policy"])
    faq_item = find_faq(ticket["text"], cls["category"], kb["faq"])
    reply, reviewed = None, None
    if queue == "auto_reply":
        res = await writer(ticket, cls, faq_item)
        reply, reviewed = res["reply"], res["approved_by_reviewer"]
    sla = kb["policy"]["sla_hours"][cls["priority"]]
    return {
        "ticket_id": ticket["ticket_id"], "status": "ok",
        "category": cls["category"], "priority": cls["priority"], "queue": queue,
        "faq_id": faq_item["id"] if faq_item else None,
        "reply": reply, "reviewer_passed": reviewed,
        "sla_hours": sla, "due_at": (received_at + timedelta(hours=sla)).isoformat(timespec="minutes"),
    }


def label_classifier(df):
    """정답 라벨을 그대로 돌려주는 '완벽한 분류기' (파이프라인 점검·상한선 측정용)"""
    labels = df.set_index("ticket_id")[["label_category", "label_priority"]].to_dict("index")

    async def _classify(ticket):
        lab = labels[ticket["ticket_id"]]
        return {"category": lab["label_category"], "priority": lab["label_priority"],
                "summary": ticket["text"][:30], "needs_human": False}
    return _classify


async def process_all(tickets, kb, concurrency=5, handler=None):
    handler = handler or handle_ticket
    # TODO: Semaphore로 동시 실행 제한 + 오류 격리 + 입력 순서대로 반환
    pass
```

```python test id=p3-s5
import asyncio
import agentlab

kb = load_kb()
state = {"active": 0, "peak": 0}

async def fake_handler(ticket, kb):
    state["active"] += 1
    state["peak"] = max(state["peak"], state["active"])
    await asyncio.sleep(0.01 * (int(ticket["ticket_id"][1:]) % 3 + 1))
    state["active"] -= 1
    if ticket["ticket_id"] == "T005":
        raise RuntimeError("LLM 타임아웃")
    return {"ticket_id": ticket["ticket_id"], "status": "ok"}

tickets = [{"ticket_id": f"T{i:03d}", "text": "x", "tier": "normal", "channel": "chat"} for i in range(1, 13)]
res = await process_all(tickets, kb, concurrency=3, handler=fake_handler)
assert isinstance(res, list) and len(res) == 12, "티켓 수만큼 결과 리스트를 반환하세요"
assert [r["ticket_id"] for r in res] == [t["ticket_id"] for t in tickets], "결과는 입력 순서와 같아야 합니다"
assert state["peak"] <= 3, f"동시 실행이 concurrency(3)를 넘었습니다: 최대 {state['peak']}"
assert state["peak"] >= 2, "티켓들이 동시에 처리되어야 합니다 (asyncio.gather 사용)"
assert res[4]["status"] == "error" and "타임아웃" in res[4]["error"], f"예외는 status='error' 레코드로 바꾸세요: {res[4]}"
assert sum(r["status"] == "ok" for r in res) == 11, "한 건의 실패가 나머지 처리를 막으면 안 됩니다"

# 기본 handler(handle_ticket)로 실제 LLM 흐름 한 건 (scripted)
agentlab.scripted([
    {"tool": "classify_ticket", "input": {"category": "delivery", "priority": "normal", "summary": "배송 지연", "needs_human": False}},
    "영업일 기준 2~3일 내 출고되며, 지연 시 물류팀이 연락드립니다.",
    {"tool": "review_reply", "input": {"passed": True, "feedback": "ok"}},
])
t = {"ticket_id": "T017", "channel": "chat", "tier": "normal", "text": "주문한 지 5일이 지났는데 아직 배송 준비 중으로 나옵니다."}
rec = (await process_all([t], kb))[0]
assert rec["status"] == "ok", f"기본 handler는 handle_ticket이어야 합니다: {rec}"
assert rec["queue"] == "auto_reply" and rec["faq_id"] == "F10" and rec["sla_hours"] == 24, f"{rec}"
assert rec["reply"].startswith("영업일"), "auto_reply 티켓은 답변 초안이 있어야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s5
import asyncio
from datetime import datetime, timedelta


async def handle_ticket(ticket, kb, classifier=None, writer=None, received_at=None):
    """티켓 한 건: 분류 → 규칙 → 라우팅 → (auto_reply면) FAQ 검색·답변 초안"""
    classifier = classifier or classify
    writer = writer or write_reply
    received_at = received_at or datetime(2025, 10, 1, 9, 0)
    cls = apply_rules(ticket, await classifier(ticket))
    queue = route(ticket, cls, kb["policy"])
    faq_item = find_faq(ticket["text"], cls["category"], kb["faq"])
    reply, reviewed = None, None
    if queue == "auto_reply":
        res = await writer(ticket, cls, faq_item)
        reply, reviewed = res["reply"], res["approved_by_reviewer"]
    sla = kb["policy"]["sla_hours"][cls["priority"]]
    return {
        "ticket_id": ticket["ticket_id"], "status": "ok",
        "category": cls["category"], "priority": cls["priority"], "queue": queue,
        "faq_id": faq_item["id"] if faq_item else None,
        "reply": reply, "reviewer_passed": reviewed,
        "sla_hours": sla, "due_at": (received_at + timedelta(hours=sla)).isoformat(timespec="minutes"),
    }


def label_classifier(df):
    """정답 라벨을 그대로 돌려주는 '완벽한 분류기' (파이프라인 점검·상한선 측정용)"""
    labels = df.set_index("ticket_id")[["label_category", "label_priority"]].to_dict("index")

    async def _classify(ticket):
        lab = labels[ticket["ticket_id"]]
        return {"category": lab["label_category"], "priority": lab["label_priority"],
                "summary": ticket["text"][:30], "needs_human": False}
    return _classify


async def process_all(tickets, kb, concurrency=5, handler=None):
    handler = handler or handle_ticket
    sem = asyncio.Semaphore(concurrency)

    async def one(ticket):
        async with sem:
            try:
                return await handler(ticket, kb)
            except Exception as e:
                return {"ticket_id": ticket.get("ticket_id"), "status": "error", "error": f"{type(e).__name__}: {e}"}

    return list(await asyncio.gather(*(one(t) for t in tickets)))
```

### 5-4. 배치 실행과 승인 대기열

카테고리별 2건씩 10건을 동시에 처리합니다. 두 가지 분류기를 비교합니다.

- **LLM 분류기**: 설정한 LLM(Mock 또는 Claude)
- **정답 라벨 분류기**: 분류가 완벽할 때 파이프라인이 내는 결과의 상한선

> 💰 실제 API로 실행하면 티켓당 1~7회(분류 1회 + 자동 답변 시 작성·검수 최대 3라운드) 호출합니다. 처음에는 적은 건수로 시작하세요.

```python run id=p3-d5
import time

df = load_tickets()
kb = load_kb()
sample = df.groupby("label_category").head(2).to_dict("records")   # 카테고리별 2건 = 10건

start = time.time()
llm_results = await process_all(sample, kb, concurrency=5)
oracle = label_classifier(df)
oracle_results = await process_all(sample, kb, handler=lambda t, kb: handle_ticket(t, kb, classifier=oracle))
print(f"처리 시간: {time.time() - start:.2f}초\n")

cols = ["ticket_id", "status", "category", "priority", "queue", "faq_id", "due_at"]
print("[LLM 분류기]")
print(pd.DataFrame(llm_results).reindex(columns=cols).to_string(index=False))
print("\n[정답 라벨 분류기]")
oracle_df = pd.DataFrame(oracle_results)
print(oracle_df.reindex(columns=cols).to_string(index=False))

# 사람 승인 대기열: 자동 발송하지 않고, 답변 초안이 있는 건만 모아 담당자가 검토합니다.
pending = oracle_df[oracle_df["reply"].notna()]
print(f"\n📝 승인 대기 {len(pending)}건 (검수 미통과는 위로 정렬)")
for r in pending.sort_values("reviewer_passed").to_dict("records"):
    print(f" - {r['ticket_id']} [{r['faq_id']}] 검수통과={r['reviewer_passed']} :: {str(r['reply'])[:60]}")
```

## Step 6. 평가: 정확도·혼동 행렬·오분류

### 6-1. "잘 되는 것 같다"에서 "몇 % 맞는다"로

프롬프트를 고치거나 모델을 바꿀 때마다 몇 건을 눈으로 보고 "좋아졌네"라고 판단하면, 다른 곳에서 망가진 것을 놓칩니다. **정답이 있는 평가셋**으로 매번 같은 지표를 재는 습관이 LLM 애플리케이션 개발의 핵심입니다(모듈 09).

| 지표 | 계산 | 무엇을 알려주나 |
|---|---|---|
| 카테고리 정확도 | 정답과 일치한 비율 | 전반적인 분류 품질 |
| 우선순위 정확도 | 정답과 일치한 비율 | 긴급 건을 놓치는지 |
| 혼동 행렬 | `pd.crosstab(정답, 예측)` | **어떤 카테고리끼리** 헷갈리는지 (예: billing ↔ delivery) |
| 오분류 목록 | 틀린 티켓 | 프롬프트·스키마 설명을 고칠 구체적 사례 |
| 오류 건수 | status=error | 파이프라인 안정성 |

> 💡 **우선순위의 비대칭 비용**: high를 normal로 놓치는 실수(긴급 건 방치)는 normal을 high로 올리는 실수(상담원 시간 약간 낭비)보다 훨씬 비쌉니다. 실무에서는 정확도와 함께 **high의 재현율(recall)**을 따로 봅니다. 확장 과제에서 계산해 보세요.

### 6-2. 정답 라벨이 없는 품질은? (LLM-as-judge)

답변 초안의 품질처럼 정답이 하나로 정해지지 않는 것은 **LLM 채점자**(Step 4의 검수자와 같은 방식)로 루브릭 점수를 매기고, 일부를 사람이 채점해 LLM 채점자와 얼마나 일치하는지 확인합니다. 비용은 응답의 `usage`(input_tokens, output_tokens)를 모아 건당 비용으로 관리합니다.

### 실습 Step 6. evaluate

`evaluate(results, df)`를 완성하세요. 반환하는 dict의 키는 다음과 같습니다.

- `n`: `status == "ok"`인 결과 중 정답과 매칭된 건수
- `errors`: `status != "ok"`인 결과 건수
- `category_accuracy`, `priority_accuracy`: 소수 셋째 자리로 반올림(`round(x, 3)`)한 값
- `confusion`: 행이 정답(`label_category`), 열이 예측(`category`)인 `pd.crosstab`
- `misclassified`: 카테고리나 우선순위가 하나라도 틀린 행의 DataFrame. 컬럼은 `ticket_id`, `category`, `label_category`, `priority`, `label_priority`입니다.

```hint id=p3-s6
res = pd.DataFrame(results); ok = res[res["status"] == "ok"]; m = ok.merge(df[["ticket_id", "label_category", "label_priority"]], on="ticket_id") 로 정답을 붙이세요. 정확도는 (m["category"] == m["label_category"]).mean() 입니다. 오분류는 두 조건을 | 로 묶어 필터링합니다.
```

```python starter id=p3-s6
def evaluate(results, df):
    # TODO: 정답과 병합 → 정확도·혼동 행렬·오분류 목록
    pass
```

```python test id=p3-s6
df = load_tickets()
results = [
    {"ticket_id": "T001", "status": "ok", "category": "billing", "priority": "high"},       # 둘 다 정답
    {"ticket_id": "T002", "status": "ok", "category": "technical", "priority": "normal"},  # 카테고리 오답
    {"ticket_id": "T003", "status": "ok", "category": "billing", "priority": "high"},      # 우선순위 오답 (정답 low)
    {"ticket_id": "T004", "status": "error", "error": "ValueError: 분류 실패"},
]
ev = evaluate(results, df)
assert isinstance(ev, dict), "dict를 반환하세요"
assert ev["n"] == 3, f"성공한 결과 3건만 평가해야 합니다 (n={ev['n']})"
assert ev["errors"] == 1, f"오류 건수는 1이어야 합니다 (errors={ev['errors']})"
assert ev["category_accuracy"] == 0.667, f"카테고리 정확도는 0.667이어야 합니다: {ev['category_accuracy']}"
assert ev["priority_accuracy"] == 0.667, f"우선순위 정확도는 0.667이어야 합니다: {ev['priority_accuracy']}"
conf = ev["confusion"]
assert conf.loc["billing", "technical"] == 1 and conf.loc["billing", "billing"] == 2, f"혼동 행렬은 행=정답, 열=예측입니다:\n{conf}"
mis = ev["misclassified"]
assert sorted(mis["ticket_id"]) == ["T002", "T003"], f"오분류 목록이 다릅니다: {list(mis['ticket_id'])}"
for col in ["category", "label_category", "priority", "label_priority"]:
    assert col in mis.columns, f"misclassified에 {col} 컬럼을 포함하세요"
perfect = [{"ticket_id": r["ticket_id"], "status": "ok", "category": r["label_category"], "priority": r["label_priority"]}
           for r in df.to_dict("records")]
ev2 = evaluate(perfect, df)
assert ev2["category_accuracy"] == 1.0 and ev2["priority_accuracy"] == 1.0 and len(ev2["misclassified"]) == 0, "정답을 그대로 넣으면 정확도 1.0이어야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=p3-s6
def evaluate(results, df):
    res = pd.DataFrame(results)
    ok = res[res["status"] == "ok"]
    m = ok.merge(df[["ticket_id", "label_category", "label_priority"]], on="ticket_id")
    cat_ok = m["category"] == m["label_category"]
    pri_ok = m["priority"] == m["label_priority"]
    return {
        "n": len(m),
        "errors": int((res["status"] != "ok").sum()),
        "category_accuracy": round(float(cat_ok.mean()), 3) if len(m) else 0.0,
        "priority_accuracy": round(float(pri_ok.mean()), 3) if len(m) else 0.0,
        "confusion": pd.crosstab(m["label_category"], m["category"]),
        "misclassified": m.loc[~cat_ok | ~pri_ok, ["ticket_id", "category", "label_category", "priority", "label_priority"]],
    }
```

### 6-3. 전체 40건 평가 리포트

40건 전체를 현재 설정의 LLM으로 처리하고 평가합니다. 정답 라벨 분류기의 결과와 나란히 비교합니다.

- **Mock LLM**: 문장을 이해하지 못하므로 카테고리 정확도가 낮게 나옵니다. 사실상 "전부 billing"이라고 찍는 수준의 기준선(baseline)입니다.
- **Claude 연결 시**: 같은 코드로 진짜 정확도를 측정할 수 있습니다. 혼동 행렬과 오분류 목록을 보고 스키마 description이나 `CLASSIFY_SYSTEM`을 고친 뒤 다시 실행해 지표가 오르는지 확인하세요. 이 **측정 → 수정 → 재측정** 반복이 프롬프트 엔지니어링의 실체입니다.

> 💰 실제 API에서는 40건 × (분류 1회 + 자동 답변 시 2~6회) 호출이 발생합니다. 비용을 아끼려면 아래 `N`을 줄이세요.

```python run id=p3-d6
import matplotlib.pyplot as plt
from agentlab import show_plot

df = load_tickets()
kb = load_kb()
N = 40
tickets = df.head(N).to_dict("records")

llm_ev = evaluate(await process_all(tickets, kb, concurrency=5), df)
oracle = label_classifier(df)
ora_ev = evaluate(await process_all(tickets, kb, handler=lambda t, kb: handle_ticket(t, kb, classifier=oracle)), df)

print(f"{'':16}{'LLM 분류기':>12}{'정답 라벨(상한)':>16}")
for k in ["n", "errors", "category_accuracy", "priority_accuracy"]:
    print(f"{k:16}{llm_ev[k]:>12}{ora_ev[k]:>16}")
print("\n[혼동 행렬: 행=정답, 열=LLM 예측]")
print(llm_ev["confusion"].to_string())
print(f"\n[오분류 {len(llm_ev['misclassified'])}건 중 앞 8건]")
print(llm_ev["misclassified"].head(8).to_string(index=False))

conf = llm_ev["confusion"]
fig, ax = plt.subplots(figsize=(5, 4))
ax.imshow(conf.values, cmap="Blues")
ax.set_xticks(range(len(conf.columns)), conf.columns, rotation=45)
ax.set_yticks(range(len(conf.index)), conf.index)
for i in range(conf.shape[0]):
    for j in range(conf.shape[1]):
        ax.text(j, i, int(conf.values[i, j]), ha="center", va="center")
ax.set_xlabel("예측"); ax.set_ylabel("정답"); ax.set_title("카테고리 혼동 행렬")
show_plot(fig)
```

```quiz id=p3-q3
{"q": "분류 프롬프트를 개선한 뒤 성능을 확인하는 방법으로 가장 바람직한 것은?", "options": ["개선 전에 틀렸던 티켓 2~3건만 다시 돌려 보고 맞으면 배포한다", "정답 라벨이 있는 고정된 평가셋 전체를 다시 돌려 정확도·혼동 행렬을 이전 결과와 비교한다", "프롬프트에 정답 라벨을 함께 넣어 정확도를 높인다", "모델에게 '이번 분류는 정확합니까?'라고 물어본다"], "answer": 1, "explain": "몇 건만 보면 다른 곳에서 생긴 퇴행을 놓칩니다. 고정된 평가셋으로 같은 지표를 비교해야 개선 여부를 판단할 수 있습니다. 정답을 프롬프트에 넣는 것은 데이터 누수입니다."}
```

## 🎉 완성! 그리고 확장 과제

축하합니다. 문의 분류, 정책 라우팅, 근거 검색, 작성·검수 루프, 동시 배치, 정량 평가까지 갖춘 **고객 문의 자동 처리 파이프라인**을 완성했습니다. 플레이그라운드나 실제 업무 코드로 옮겨 다음을 시도해 보세요.

1. **high 재현율 측정**: 정답이 high인 티켓 중 high로 예측한 비율을 `evaluate`에 추가하세요. 실무에서는 정확도보다 이 숫자가 더 중요할 수 있습니다.
2. **Few-shot 예시 추가**: 오분류 목록에서 대표 사례 3~5개를 골라 `CLASSIFY_SYSTEM`에 `<example>`로 넣고 정확도 변화를 측정하세요. 단, 평가셋 티켓을 그대로 넣으면 누수이므로 **비슷하지만 다른 문장**을 쓰세요.
3. **비용 집계**: `chat()` 응답의 `usage`를 모아 티켓당 평균 입력·출력 토큰을 계산하고, 사용하는 모델 단가로 월 비용을 추정하세요.
4. **승인 UI 연동**: 승인 대기열 레코드를 CSV로 저장하고, 승인된 건만 발송하는 `send_approved()`를 만드세요. 발송은 되돌릴 수 없는 작업이므로 반드시 사람 승인 뒤에 실행합니다.
5. **환불 자동 승인 정책**: `policy["refund_auto_approve_limit"]`(5만 원)을 활용해, 본문에서 금액을 추출하고 한도 이하인 환불 문의만 자동 승인 후보로 표시하세요.
6. **재처리 큐**: `status == "error"`인 건만 모아 지수 백오프로 재시도하는 `retry_failed()`를 만드세요(모듈 10).

## 더 읽어보기

- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents): 라우팅, 평가자-최적화 등 워크플로 패턴
- [Claude Tool Use 문서](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview): tool_choice와 도구 정의
- [JSON Schema 소개](https://json-schema.org/learn/getting-started-step-by-step): enum, required 등 스키마 문법
- [Python asyncio 문서](https://docs.python.org/3/library/asyncio-task.html): gather, Semaphore, 태스크
- [pandas crosstab](https://pandas.pydata.org/docs/reference/api/pandas.crosstab.html): 혼동 행렬 만들기

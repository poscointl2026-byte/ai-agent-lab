# 모듈 9. 평가(Evals)와 관측

> **학습 목표**: "프롬프트를 바꿨더니 좋아진 것 같다"를 **숫자로 증명**하는 방법을 배웁니다. 평가셋 설계, 정답·규칙·LLM 채점기, 에이전트 궤적 평가를 구현하고, 모든 LLM 호출의 지연·토큰·비용을 기록하는 트레이서를 만듭니다.

## 1. 왜 평가가 필요한가

일반 소프트웨어는 같은 입력에 같은 출력을 내므로 단위 테스트로 충분합니다. LLM 기반 시스템은 다릅니다.

| 특성 | 결과 | 평가가 필요한 이유 |
|---|---|---|
| **비결정성** | 같은 질문에도 매번 표현과 결론이 조금씩 다름 | 한두 번 시도로는 품질을 알 수 없음 |
| **넓은 입력 공간** | 사용자 질문은 무한히 다양함 | 대표 사례 묶음으로 측정해야 함 |
| **회귀(regression)** | 프롬프트 한 줄, 모델 버전 교체가 다른 사례를 망가뜨림 | 변경 전후를 같은 세트로 비교해야 함 |
| **비용·지연** | 더 똑똑한 설정이 더 비싸고 느릴 수 있음 | 품질과 비용을 함께 봐야 함 |

> 💡 Anthropic의 [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) 등 실무 글들이 공통으로 강조하는 원칙은 **"평가부터 만들고, 그다음 개선하라"** 입니다. 평가 없이 고친 프롬프트는 운에 맡긴 변경입니다.

## 2. 평가 루프 전체 그림

~~~text
   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
   │ ① 평가셋     │──▶│ ② 시스템 실행 │──▶│ ③ 채점기     │──▶│ ④ 지표·리포트 │
   │ 입력+기대값   │    │ (프롬프트 v2) │    │ 정답/규칙/LLM │    │ 정확도, 실패  │
   └──────────────┘    └──────────────┘    └──────────────┘    └──────┬───────┘
          ▲                                                           │
          └──────────── ⑤ 실패 사례 분석 → 프롬프트·도구·검색 수정 ◀────┘
~~~

이 루프를 **코드로 자동화**해 두면, 수정할 때마다 몇 초~몇 분 만에 "몇 % 좋아졌는지, 어떤 사례가 새로 깨졌는지"를 알 수 있습니다.

## 3. 평가셋 설계

좋은 평가셋은 크기보다 **구성**이 중요합니다. 처음에는 20~50개로 시작해도 충분합니다.

| 구성 요소 | 예시 (고객 문의 분류기) | 비율 가이드 |
|---|---|---|
| **대표 사례** | 실제 로그에서 뽑은 흔한 문의 | 60~70% |
| **경계 사례** | "결제 실패 + 앱 멈춤"처럼 두 범주에 걸친 문의 | 15~20% |
| **적대적·이상 사례** | 빈 문자열, 욕설, 프롬프트 인젝션 시도 | 10% |
| **회귀 사례** | 과거에 실제로 틀렸다가 고친 사례 | 계속 추가 |

각 사례에는 **기대값(label)** 이 있어야 합니다. 기대값의 형태가 채점 방식을 결정합니다.

~~~json
[
  {"input": "지난달 요금이 두 번 결제됐어요", "expected": "billing"},
  {"input": "앱이 실행하자마자 꺼집니다",     "expected": "technical"},
  {"input": "연차 규정 알려줘",               "expected": {"must_include": ["15일"], "must_cite": true}}
]
~~~

> **라벨은 사람이 검토**하세요. LLM으로 라벨 초안을 만들 수는 있지만, 틀린 라벨로 평가하면 틀린 방향으로 최적화됩니다.

## 4. 채점기(Grader)의 종류

| 채점기 | 방식 | 장점 | 단점 | 어울리는 작업 |
|---|---|---|---|---|
| **정확 일치** | `output == expected` (정규화 후) | 빠르고 객관적 | 표현이 다르면 오답 | 분류, 추출, 숫자 |
| **규칙·정규식** | 필수 키워드 포함, 형식 검사 | 유연하고 무료 | 의미를 모름 | 형식 준수, 금지어 |
| **스키마 검증** | JSON 필드·타입·enum 확인 | 구조화 출력에 필수 | 내용의 질은 모름 | 도구 입력, API 응답 |
| **LLM 채점(LLM-as-judge)** | 다른 LLM이 루브릭으로 점수 | 요약·답변 품질 같은 주관적 기준 | 비용, 편향, 비결정성 | 요약, 상담 답변 |
| **사람 평가** | 전문가가 직접 점수 | 가장 정확 | 느리고 비쌈 | 최종 검증, 채점기 보정 |

원칙은 **"가능한 한 코드로, 꼭 필요할 때만 LLM으로"** 입니다.

```python run id=ev-d1
import json, re

def exact(output, expected):
    return output.strip().lower() == expected.strip().lower()

def contains_all(output, keywords):
    return all(k in output for k in keywords)

def valid_ticket_json(output):
    try:
        data = json.loads(output)
    except json.JSONDecodeError:
        return False, "JSON 파싱 실패"
    if data.get("category") not in {"billing", "technical", "delivery", "account", "other"}:
        return False, f"category 값 오류: {data.get('category')!r}"
    if not isinstance(data.get("urgent"), bool):
        return False, "urgent는 bool이어야 함"
    return True, "OK"

print("정확 일치  :", exact(" Billing ", "billing"))
print("키워드 포함:", contains_all("연차는 15일이며 팀장 승인이 필요합니다", ["15일", "승인"]))
print("정규식     :", bool(re.search(r"\[\d+\]", "연차는 15일입니다 [1]")), "(인용 번호가 있는가)")
for out in ['{"category": "billing", "urgent": true}', '{"category": "money", "urgent": "yes"}', "billing입니다"]:
    print("스키마     :", valid_ticket_json(out), "←", out)
```

### LLM 채점기의 편향과 대응

LLM 채점기는 편리하지만 알려진 편향이 있습니다.

| 편향 | 현상 | 대응 |
|---|---|---|
| **길이 편향** | 긴 답을 더 좋게 평가 | 루브릭에 "간결성" 기준 명시 |
| **위치 편향** | A/B 비교에서 먼저 나온 답을 선호 | 순서를 바꿔 두 번 채점 후 평균 |
| **자기 선호** | 같은 계열 모델의 답을 선호 | 채점 모델을 다르게 하거나 사람 평가로 보정 |
| **모호한 기준** | 점수가 들쭉날쭉 | 점수별 **구체적 기준**을 루브릭에 적기 |

점수는 자유 텍스트로 받지 말고 **도구 호출로 구조화**해 받으면 파싱 오류가 사라집니다(모듈 2의 `tool_choice`). 실습 9-2에서 직접 구현합니다.

~~~text
루브릭 예시 (1~5점)
5: 질문에 정확히 답하고, 모든 주장에 출처가 있으며, 3문장 이내
4: 정확하지만 출처가 일부 빠졌거나 약간 장황함
3: 핵심은 맞지만 불필요한 정보나 사소한 오류가 있음
2: 부분적으로만 맞거나 출처와 다른 내용이 있음
1: 틀렸거나 질문과 무관함
~~~

## 5. 지표 읽기

분류 작업에서는 정확도(accuracy)만 보면 함정에 빠집니다. 100건 중 긴급 문의가 5건뿐이라면 "전부 긴급 아님"이라고 답해도 정확도 95%입니다.

| 지표 | 정의 | 질문 |
|---|---|---|
| **정확도** | 맞힌 수 / 전체 | 전반적으로 얼마나 맞나? |
| **정밀도(Precision)** | 긴급이라 예측한 것 중 실제 긴급 비율 | 경보가 얼마나 믿을 만한가? |
| **재현율(Recall)** | 실제 긴급 중 긴급이라 예측한 비율 | 긴급을 얼마나 놓치지 않나? |
| **pass@k** | k번 시도 중 한 번이라도 성공할 확률 | 여러 번 시도·검증이 가능할 때의 성능 |
| **pass^k (일관성)** | k번 모두 성공할 확률 | 매번 믿고 맡길 수 있나? |

```python run id=ev-d2
cases = [
    ("서버 오류로 전 직원 접속 불가", True), ("영수증 출력 오류, 급하지 않아요", False),
    ("결제가 두 번 됐어요 환불해 주세요", True), ("다크 모드 지원하나요", False),
    ("계정 해킹이 의심됩니다", True), ("배송지 변경 가능할까요", False),
    ("상담 가능 시간 문의", False), ("앱이 계속 꺼져서 업무 불가", True),
]

def predict_urgent(text):          # 아주 단순한 규칙 기반 "모델"
    return any(w in text for w in ["오류", "불가", "환불"])   # '해킹'을 빠뜨린 규칙

tp = fp = fn = tn = 0
for text, label in cases:
    pred = predict_urgent(text)
    tp += pred and label; fp += pred and not label
    fn += (not pred) and label; tn += (not pred) and (not label)
    mark = "✅" if pred == label else "❌"
    print(f"{mark} 예측={pred!s:5} 정답={label!s:5} | {text}")

print(f"\n정확도 {(tp + tn) / len(cases):.2f} | 정밀도 {tp / (tp + fp):.2f} | 재현율 {tp / (tp + fn):.2f}")
```

> 해킹 의심 문의를 놓친 것(재현율 하락)과 급하지 않은 문의를 긴급으로 잘못 올린 것(정밀도 하락)이 각각 다른 지표에 드러납니다. 보안 문의를 놓치는 비용이 더 크다면 재현율을 우선해 규칙·프롬프트를 고칩니다.

## 6. 에이전트 평가: 결과뿐 아니라 과정도

에이전트는 최종 답만 맞으면 끝이 아닙니다. 잘못된 도구를 10번 호출한 끝에 우연히 맞았다면 비용과 위험이 큽니다.

| 평가 대상 | 확인 내용 | 구현 방법 |
|---|---|---|
| **최종 답변** | 정답 포함, 형식, 인용 | 정확 일치·규칙·LLM 채점 |
| **최종 상태** | DB에 주문이 1건 생성됐는가, 파일이 수정됐는가 | 실행 후 환경 상태 검사 |
| **궤적(trajectory)** | 필요한 도구를 호출했는가, 금지 도구를 피했는가 | 호출 기록(`agentlab.calls`) 검사 |
| **효율** | 단계 수, 토큰, 비용, 시간 | 트레이서 집계 |

```python run id=ev-d3
import agentlab
from agentlab import chat, tool_calls, tool_result, text_of

TOOLS = [
    {"name": "get_order", "description": "주문 조회", "input_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]}},
    {"name": "refund", "description": "환불 실행", "input_schema": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]}},
]

trajectory = []   # 에이전트가 호출한 도구 이름을 순서대로 기록

async def agent(question, max_steps=5):
    messages = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        resp = await chat(messages, tools=TOOLS)
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":
            return text_of(resp)
        trajectory.extend(c["name"] for c in tool_calls(resp))
        messages.append({"role": "user", "content": [tool_result(c["id"], "OK") for c in tool_calls(resp)]})

# 궤적 평가는 비결정성을 피하려고 응답을 고정(scripted)해서 연습합니다.
agentlab.scripted([
    {"tool": "get_order", "input": {"order_id": "A1"}},
    {"tool": "refund", "input": {"order_id": "A1"}},
    "A1 주문을 환불했습니다.",
])
answer = await agent("A1 주문 환불해줘")

checks = {
    "최종 답변에 주문번호 포함": "A1" in answer,
    "환불 전에 주문 조회": trajectory[:2] == ["get_order", "refund"],
    "환불은 정확히 1회": trajectory.count("refund") == 1,
    "LLM 호출 4회 이하": len(agentlab.calls) <= 4,
}
print("궤적:", " → ".join(trajectory))
for name, ok in checks.items():
    print("✅" if ok else "❌", name)
```

## 7. 관측(Observability): 모든 호출을 기록하라

운영 중인 에이전트에서 "왜 이상한 답을 했지?", "이번 달 비용이 왜 두 배지?"에 답하려면 **호출 단위 기록(trace)** 이 필요합니다.

| 기록 항목 | 용도 |
|---|---|
| 요청 ID, 세션 ID, 사용자 ID | 한 대화·작업의 호출을 묶어서 추적 |
| 모델, 프롬프트 버전 | 변경 전후 비교, 문제 버전 롤백 |
| 입력·출력 토큰 (`usage`) | 비용 계산, 컨텍스트 폭증 감지 |
| 지연 시간(latency) | 사용자 경험, 타임아웃 원인 분석 |
| stop_reason, 도구 호출 목록 | `max_tokens` 잘림, 도구 루프 감지 |
| 오류와 재시도 횟수 | 장애 감지 |

로그는 사람이 읽는 문장보다 **구조화된 JSON 한 줄**로 남겨야 나중에 집계·검색할 수 있습니다.

~~~json
{"ts": "2026-10-30T09:12:03Z", "trace_id": "t-81f2", "step": 2, "model": "claude-sonnet-5-5",
 "prompt_version": "classify-v3", "input_tokens": 1830, "output_tokens": 142,
 "latency_ms": 2140, "stop_reason": "tool_use", "tools": ["get_order"]}
~~~

### 비용 계산

API 비용은 보통 **입력 토큰과 출력 토큰에 서로 다른 단가**를 곱해 계산합니다(단가는 100만 토큰당 금액으로 표시되는 경우가 많습니다). 실제 단가는 모델마다 다르고 바뀔 수 있으니 **반드시 공식 가격 페이지에서 확인**하고, 코드에서는 단가표를 **설정값(파라미터)** 으로 받으세요.

~~~text
cost = input_tokens / 1,000,000 × 입력 단가 + output_tokens / 1,000,000 × 출력 단가
~~~

```python run id=ev-d4
import time, json
from agentlab import chat

# ⚠️ 아래 단가는 계산 연습용 가상의 숫자입니다. 실제 가격이 아닙니다.
EXAMPLE_PRICES = {"model-small": {"input": 1.0, "output": 5.0}, "model-large": {"input": 5.0, "output": 25.0}}

def estimate_cost(usage, price):
    return usage["input_tokens"] / 1e6 * price["input"] + usage["output_tokens"] / 1e6 * price["output"]

logs = []
for q in ["반품 절차 알려줘", "배송 조회가 안 돼요"]:
    t0 = time.perf_counter()
    resp = await chat([{"role": "user", "content": q}])
    latency = (time.perf_counter() - t0) * 1000
    usage = resp["usage"]
    logs.append({"q": q, "latency_ms": round(latency, 1), **usage,
                 "cost_small": round(estimate_cost(usage, EXAMPLE_PRICES["model-small"]), 6),
                 "cost_large": round(estimate_cost(usage, EXAMPLE_PRICES["model-large"]), 6)})

for line in logs:
    print(json.dumps(line, ensure_ascii=False))

monthly = 100_000  # 월 호출 수 가정
avg = sum(l["cost_large"] for l in logs) / len(logs)
print(f"\n가상 단가 기준 model-large 월 {monthly:,}회 예상 비용: ${avg * monthly:,.2f}")
```

## 8. A/B 비교와 CI

프롬프트 v1과 v2 중 무엇이 나은지는 **같은 평가셋, 같은 채점기**로 둘 다 돌려 비교합니다.

~~~text
            정확도   평균 토큰   평균 지연   새로 틀린 사례   새로 맞힌 사례
prompt-v1   0.82     1,240      1.9s       -               -
prompt-v2   0.88     1,410      2.1s       T017, T031      T004, T009, T022, T028, T035
~~~

- 전체 점수뿐 아니라 **새로 틀린 사례**를 반드시 확인하세요. 평균이 올라도 중요한 사례가 깨졌을 수 있습니다.
- 비결정성 때문에 차이가 작으면 우연일 수 있습니다. 각 사례를 여러 번 돌리거나 평가셋을 키워 확인합니다.
- **CI(지속적 통합)** 에 평가를 넣어, 프롬프트·도구·모델 설정 파일이 바뀌는 PR마다 자동으로 실행하고 기준 점수 미달이면 병합을 막습니다. 비용 때문에 PR에는 작은 "스모크 세트", 야간에는 전체 세트를 돌리는 방식이 흔합니다.

## 9. 자주 하는 실수

| 실수 | 결과 | 해결 |
|---|---|---|
| 몇 개 손으로 돌려 보고 "좋아졌다" | 회귀를 놓침 | 고정된 평가셋으로 자동 비교 |
| 정확도만 봄 | 드문 중요 사례(긴급, 보안)를 놓침 | 정밀도·재현율, 범주별 지표 |
| 모든 것을 LLM 채점 | 비싸고 들쭉날쭉 | 코드 채점 우선, LLM은 주관적 기준에만 |
| 루브릭 없는 LLM 채점 | 점수 기준이 매번 다름 | 점수별 구체적 기준 + 구조화 출력 |
| 평가셋에 과적합 | 평가 점수만 오르고 실제는 그대로 | 개발용/보류(hold-out) 세트 분리 |
| 비용·지연 미기록 | 품질은 올랐지만 비용이 3배 | 트레이서로 함께 보고 |
| 운영 로그를 평가에 반영 안 함 | 새 유형의 실패가 반복 | 실패 사례를 회귀 세트에 추가 |

## 10. 실무 팁

- **평가셋은 코드처럼 버전 관리**하세요. 라벨 변경도 리뷰 대상입니다.
- **프롬프트 버전 ID**를 로그에 남기면 "어느 버전부터 나빠졌나"를 바로 찾을 수 있습니다.
- 채점용 LLM 호출은 비용을 줄이기 위해 **작고 빠른 모델**(예: Haiku 계열)로 시작하고, 사람 평가와 일치율을 확인해 보정하세요.
- 운영 중 사용자 피드백(👍/👎)과 재질문률도 훌륭한 관측 지표입니다.

## 11. 확인 퀴즈

```quiz id=ev-q1
{"q": "프롬프트를 수정한 뒤 평균 정확도가 0.82 → 0.85로 올랐습니다. 배포 전에 꼭 확인해야 할 것은?", "options": ["더 이상 확인할 것이 없다", "새로 틀리게 된 사례가 있는지, 비용·지연이 얼마나 변했는지", "프롬프트 길이가 짧아졌는지", "모델 이름이 바뀌었는지"], "answer": 1, "explain": "평균이 올라도 중요한 사례가 새로 깨졌거나 비용이 크게 늘었을 수 있습니다. 회귀 사례와 비용을 함께 보세요."}
```

```quiz id=ev-q2
{"q": "긴급 문의가 전체의 5%뿐일 때, '긴급을 놓치지 않는지'를 보려면 어떤 지표가 가장 적절한가요?", "options": ["정확도(accuracy)", "재현율(recall)", "평균 토큰 수", "pass@k"], "answer": 1, "explain": "재현율은 실제 긴급 중 얼마나 잡아냈는지를 봅니다. 불균형 데이터에서 정확도는 오해를 부릅니다."}
```

```quiz id=ev-q3
{"q": "LLM-as-judge로 A/B 두 답변을 비교할 때 위치 편향을 줄이는 방법은?", "options": ["항상 A를 먼저 보여준다", "A/B 순서를 바꿔 두 번 채점하고 결과를 합친다", "채점 프롬프트를 더 길게 쓴다", "max_tokens를 늘린다"], "answer": 1, "explain": "LLM 채점기는 먼저 나온 답을 선호하는 경향이 있어, 순서를 바꿔 두 번 채점하는 것이 일반적인 대응입니다."}
```

```quiz id=ev-q4
{"q": "에이전트 평가에서 '궤적(trajectory) 평가'가 확인하는 것은?", "options": ["최종 답변의 맞춤법", "어떤 도구를 어떤 순서로, 몇 번 호출했는지", "API 키가 유효한지", "응답의 글자 수"], "answer": 1, "explain": "최종 답이 맞아도 금지된 도구를 쓰거나 불필요하게 많이 호출했다면 문제입니다. 궤적 평가는 과정의 올바름을 봅니다."}
```

## 12. 실습

### 실습 9-1. 평가 실행기 run_eval

`async run_eval(cases, predict_fn, grader)`를 완성하세요.

- `cases`: `[{"input": ..., "expected": ...}, ...]`
- `predict_fn(input)`: 일반 함수 **또는** async 함수일 수 있습니다. 반환값이 awaitable이면 `await` 하세요(`inspect.isawaitable`).
- `grader(output, expected)`: `True`/`False`를 반환합니다.
- `predict_fn`이 예외를 던지면 그 사례는 **실패**로 처리하고 평가를 계속합니다. 이때 실패 항목의 `output`은 `None`, `error`에는 `str(예외)`를 넣습니다.
- 반환값: `{"total": 전체 수, "passed": 통과 수, "accuracy": 통과/전체 (사례가 없으면 0.0), "failures": [{"input", "expected", "output"(, "error")}...]}`

```hint id=ev-e1
for case in cases: 안에서 try: out = predict_fn(case["input"]); if inspect.isawaitable(out): out = await out / except Exception as e: failures.append({..., "output": None, "error": str(e)}); continue. 그 다음 grader(out, case["expected"])가 참이면 passed += 1, 아니면 failures에 추가합니다.
```

```python starter id=ev-e1
import inspect

async def run_eval(cases, predict_fn, grader):
    # TODO: 각 사례를 실행·채점하고 결과 dict를 반환하세요
    pass

# 직접 해 보기:
# cases = [{"input": "2+2", "expected": "4"}, {"input": "3*3", "expected": "9"}]
# print(await run_eval(cases, lambda x: str(eval(x)), lambda o, e: o == e))
```

```python test id=ev-e1
cases = [
    {"input": "결제가 두 번 됐어요", "expected": "billing"},
    {"input": "앱이 꺼져요", "expected": "technical"},
    {"input": "배송이 안 와요", "expected": "delivery"},
    {"input": "고장", "expected": "technical"},
]
def rule(text):
    if "결제" in text: return "billing"
    if "꺼" in text: return "technical"
    if "고장" in text: raise RuntimeError("모델 오류")
    return "other"
exact = lambda o, e: o == e

r = await run_eval(cases, rule, exact)
assert isinstance(r, dict), "결과 dict를 반환하세요"
assert r["total"] == 4 and r["passed"] == 2, f"4건 중 2건 통과여야 합니다 (현재 {r.get('passed')}/{r.get('total')})"
assert abs(r["accuracy"] - 0.5) < 1e-9, f"accuracy는 0.5여야 합니다 (현재 {r['accuracy']})"
assert len(r["failures"]) == 2, "실패 사례 2건을 failures에 담으세요"
f0 = r["failures"][0]
assert f0["input"] == "배송이 안 와요" and f0["expected"] == "delivery" and f0["output"] == "other", f"실패 항목에 input/expected/output을 담으세요: {f0}"
f1 = r["failures"][1]
assert f1["output"] is None and "모델 오류" in f1.get("error", ""), "예외가 난 사례는 output=None, error=str(예외)로 기록하고 계속 진행하세요"

async def async_predict(text):
    return "billing" if "결제" in text else "technical"
r2 = await run_eval(cases[:2], async_predict, exact)
assert r2["passed"] == 2 and r2["accuracy"] == 1.0, "async predict_fn도 지원해야 합니다 (awaitable이면 await)"

r3 = await run_eval([], rule, exact)
assert r3["total"] == 0 and r3["accuracy"] == 0.0 and r3["failures"] == [], "사례가 없으면 accuracy 0.0을 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=ev-e1
import inspect

async def run_eval(cases, predict_fn, grader):
    passed = 0
    failures = []
    for case in cases:
        try:
            out = predict_fn(case["input"])
            if inspect.isawaitable(out):
                out = await out
        except Exception as e:
            failures.append({"input": case["input"], "expected": case["expected"], "output": None, "error": str(e)})
            continue
        if grader(out, case["expected"]):
            passed += 1
        else:
            failures.append({"input": case["input"], "expected": case["expected"], "output": out})
    total = len(cases)
    return {"total": total, "passed": passed, "accuracy": passed / total if total else 0.0, "failures": failures}
```

### 실습 9-2. 구조화 출력을 쓰는 LLM 채점기

`async judge(question, answer, rubric)`을 완성하세요.

1. `JUDGE_TOOL`(주어짐)을 `tools=[JUDGE_TOOL]`로, `tool_choice={"type": "tool", "name": "submit_score"}`로 강제해 `chat`을 호출합니다. `system=JUDGE_SYSTEM`도 전달합니다.
2. user 메시지에는 `<rubric>`, `<question>`, `<answer>` 태그로 세 값을 모두 넣습니다.
3. `tool_input(resp, "submit_score")`로 결과를 꺼냅니다.
   - 결과가 없거나(도구를 호출하지 않음), `score`가 **1~5 사이의 int**가 아니면 `ValueError`를 발생시킵니다. (`bool`은 int로 취급하지 마세요)
4. `{"score": 정수, "reason": 문자열}`을 반환합니다.

```hint id=ev-e2
content = f"<rubric>\n{rubric}\n</rubric>\n<question>\n{question}\n</question>\n<answer>\n{answer}\n</answer>"처럼 만드세요. 검증은 isinstance(score, int) and not isinstance(score, bool) and 1 <= score <= 5 입니다.
```

```python starter id=ev-e2
from agentlab import chat, tool_input

JUDGE_SYSTEM = "너는 공정한 채점자야. 루브릭에 따라서만 점수를 매기고 submit_score 도구로 제출해."
JUDGE_TOOL = {
    "name": "submit_score",
    "description": "루브릭에 따른 채점 결과를 제출합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {"type": "integer", "description": "1~5 점수"},
            "reason": {"type": "string", "description": "점수의 근거 한두 문장"},
        },
        "required": ["score", "reason"],
    },
}

async def judge(question, answer, rubric):
    # TODO: 도구 강제 호출 → 결과 검증 → {"score", "reason"} 반환
    pass
```

```python test id=ev-e2
import agentlab

agentlab.scripted([{"tool": "submit_score", "input": {"score": 4, "reason": "정확하지만 출처 누락"}}])
r = await judge("연차는 며칠?", "15일입니다.", "5: 정확+출처, 1: 오답")
assert r == {"score": 4, "reason": "정확하지만 출처 누락"}, f"반환값이 다릅니다: {r}"
call = agentlab.calls[0]
assert call.get("tools") == [JUDGE_TOOL], "tools=[JUDGE_TOOL]을 전달하세요"
assert call.get("tool_choice") == {"type": "tool", "name": "submit_score"}, "tool_choice로 submit_score 호출을 강제하세요"
assert call.get("system") == JUDGE_SYSTEM, "system=JUDGE_SYSTEM을 전달하세요"
content = call["messages"][0]["content"]
for tag, val in [("rubric", "5: 정확+출처, 1: 오답"), ("question", "연차는 며칠?"), ("answer", "15일입니다.")]:
    assert f"<{tag}>" in content and f"</{tag}>" in content and val in content, f"<{tag}> 태그로 값을 감싸 넣으세요"

for bad in [{"tool": "submit_score", "input": {"score": 9, "reason": "x"}},
            {"tool": "submit_score", "input": {"score": "4", "reason": "x"}},
            {"tool": "submit_score", "input": {"score": True, "reason": "x"}},
            "점수는 4점입니다"]:
    agentlab._reset()
    agentlab.scripted([bad])
    try:
        await judge("q", "a", "r")
        raise AssertionError(f"잘못된 채점 결과에는 ValueError를 발생시켜야 합니다: {bad!r}")
    except ValueError:
        pass
print("✅ 모든 테스트 통과!")
```

```python solution id=ev-e2
from agentlab import chat, tool_input

JUDGE_SYSTEM = "너는 공정한 채점자야. 루브릭에 따라서만 점수를 매기고 submit_score 도구로 제출해."
JUDGE_TOOL = {
    "name": "submit_score",
    "description": "루브릭에 따른 채점 결과를 제출합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "score": {"type": "integer", "description": "1~5 점수"},
            "reason": {"type": "string", "description": "점수의 근거 한두 문장"},
        },
        "required": ["score", "reason"],
    },
}

async def judge(question, answer, rubric):
    content = (
        f"<rubric>\n{rubric}\n</rubric>\n"
        f"<question>\n{question}\n</question>\n"
        f"<answer>\n{answer}\n</answer>"
    )
    resp = await chat(
        [{"role": "user", "content": content}],
        system=JUDGE_SYSTEM,
        tools=[JUDGE_TOOL],
        tool_choice={"type": "tool", "name": "submit_score"},
    )
    result = tool_input(resp, "submit_score")
    if result is None:
        raise ValueError("채점 도구가 호출되지 않았습니다")
    score = result.get("score")
    if not (isinstance(score, int) and not isinstance(score, bool) and 1 <= score <= 5):
        raise ValueError(f"점수가 1~5 정수가 아닙니다: {score!r}")
    return {"score": score, "reason": result.get("reason", "")}
```

### 실습 9-3. 지연·토큰·비용을 기록하는 Tracer

`Tracer` 클래스를 완성하세요.

- `__init__(self, prices)`: 단가표를 저장하고 `self.records = []`로 초기화합니다. 단가표 형식: `{"모델명": {"input": 100만 토큰당 입력 단가, "output": 100만 토큰당 출력 단가}}`
- `async chat(self, messages, model, **kwargs)`:
  1. `time.perf_counter()`로 시간을 재며 `agentlab`의 `chat(messages, model=model, **kwargs)`를 호출합니다.
  2. 응답의 `usage`에서 토큰 수를 읽고 비용을 계산합니다. **단가표에 없는 모델은 비용 0**으로 기록합니다.
  3. `{"model", "input_tokens", "output_tokens", "latency_ms", "cost"}` dict를 `self.records`에 추가하고, 응답을 그대로 반환합니다.
- `summary(self)`: `{"calls", "input_tokens", "output_tokens", "cost", "avg_latency_ms"}`를 반환합니다. 기록이 없으면 모두 0.

```hint id=ev-e3
비용 = usage["input_tokens"] / 1_000_000 * price["input"] + usage["output_tokens"] / 1_000_000 * price["output"]. price = self.prices.get(model)이 None이면 0.0. agentlab의 chat과 메서드 이름이 같으니 from agentlab import chat as llm_chat처럼 별칭을 쓰면 헷갈리지 않습니다.
```

```python starter id=ev-e3
import time
from agentlab import chat as llm_chat

class Tracer:
    def __init__(self, prices):
        # TODO
        pass

    async def chat(self, messages, model, **kwargs):
        # TODO: 시간 측정 → llm_chat 호출 → 기록 → 응답 반환
        pass

    def summary(self):
        # TODO
        pass
```

```python test id=ev-e3
import agentlab

PRICES = {"model-a": {"input": 3.0, "output": 15.0}}   # 테스트용 가상 단가
tr = Tracer(PRICES)
assert tr.records == [], "records는 빈 리스트로 시작해야 합니다"
assert tr.summary() == {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost": 0, "avg_latency_ms": 0}, "기록이 없을 때 summary는 모두 0이어야 합니다"

agentlab.scripted([
    {"content": [{"type": "text", "text": "첫 답"}], "usage": {"input_tokens": 1000, "output_tokens": 200}},
    {"content": [{"type": "text", "text": "둘째 답"}], "usage": {"input_tokens": 2000, "output_tokens": 100}},
    {"content": [{"type": "text", "text": "셋째 답"}], "usage": {"input_tokens": 500, "output_tokens": 50}},
])
r1 = await tr.chat([{"role": "user", "content": "q1"}], model="model-a")
assert agentlab.text_of(r1) == "첫 답", "응답을 그대로 반환하세요"
assert agentlab.calls[0].get("model") == "model-a", "model을 chat에 전달하세요"
await tr.chat([{"role": "user", "content": "q2"}], model="model-a", system="sys")
assert agentlab.calls[1].get("system") == "sys", "**kwargs(system 등)를 chat에 그대로 전달하세요"
await tr.chat([{"role": "user", "content": "q3"}], model="unknown-model")

assert len(tr.records) == 3, "호출마다 기록 1건을 추가하세요"
rec = tr.records[0]
for key in ["model", "input_tokens", "output_tokens", "latency_ms", "cost"]:
    assert key in rec, f"기록에 {key} 항목이 필요합니다"
assert rec["input_tokens"] == 1000 and rec["output_tokens"] == 200, "usage의 토큰 수를 기록하세요"
assert abs(rec["cost"] - 0.006) < 1e-9, f"1000×3/1e6 + 200×15/1e6 = 0.006 이어야 합니다 (현재 {rec['cost']})"
assert abs(tr.records[1]["cost"] - 0.0075) < 1e-9, "두 번째 호출 비용은 0.0075입니다"
assert tr.records[2]["cost"] == 0, "단가표에 없는 모델은 비용 0으로 기록하세요"
assert isinstance(rec["latency_ms"], (int, float)) and rec["latency_ms"] >= 0, "latency_ms는 0 이상의 숫자여야 합니다"

s = tr.summary()
assert s["calls"] == 3 and s["input_tokens"] == 3500 and s["output_tokens"] == 350, f"합계가 다릅니다: {s}"
assert abs(s["cost"] - 0.0135) < 1e-9, f"총비용은 0.0135여야 합니다 (현재 {s['cost']})"
assert abs(s["avg_latency_ms"] - sum(r["latency_ms"] for r in tr.records) / 3) < 1e-9, "avg_latency_ms는 latency_ms의 평균입니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=ev-e3
import time
from agentlab import chat as llm_chat

class Tracer:
    def __init__(self, prices):
        self.prices = prices
        self.records = []

    async def chat(self, messages, model, **kwargs):
        t0 = time.perf_counter()
        resp = await llm_chat(messages, model=model, **kwargs)
        latency_ms = (time.perf_counter() - t0) * 1000
        usage = resp.get("usage") or {}
        tin = usage.get("input_tokens", 0)
        tout = usage.get("output_tokens", 0)
        price = self.prices.get(model)
        cost = (tin / 1_000_000 * price["input"] + tout / 1_000_000 * price["output"]) if price else 0.0
        self.records.append({"model": model, "input_tokens": tin, "output_tokens": tout,
                             "latency_ms": latency_ms, "cost": cost})
        return resp

    def summary(self):
        n = len(self.records)
        if n == 0:
            return {"calls": 0, "input_tokens": 0, "output_tokens": 0, "cost": 0, "avg_latency_ms": 0}
        return {
            "calls": n,
            "input_tokens": sum(r["input_tokens"] for r in self.records),
            "output_tokens": sum(r["output_tokens"] for r in self.records),
            "cost": sum(r["cost"] for r in self.records),
            "avg_latency_ms": sum(r["latency_ms"] for r in self.records) / n,
        }
```

## 13. 더 읽어보기

- [Claude 문서: 성공 기준 정의와 평가 만들기](https://docs.claude.com/en/docs/test-and-evaluate/develop-tests)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Anthropic Engineering 블로그](https://www.anthropic.com/engineering)
- [Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (LLM 채점 편향 연구)](https://arxiv.org/abs/2306.05685)
- [OpenTelemetry (분산 트레이싱 표준)](https://opentelemetry.io/docs/)

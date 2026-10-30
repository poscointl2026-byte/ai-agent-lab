# 모듈 2. 프롬프트 엔지니어링과 구조화 출력

> **학습 목표**: 좋은 프롬프트의 구성 요소를 이해하고, 프롬프트를 코드로 조립하는 템플릿을 만듭니다. 또 LLM 출력을 **프로그램이 믿고 쓸 수 있는 구조화 데이터(JSON)**로 받는 방법을 익힙니다. 방법은 강제 도구 호출과 검증·재시도 루프입니다.

## 0. 왜 에이전트 개발자에게 프롬프트가 중요한가

에이전트의 품질은 대부분 **모델에게 무엇을 어떻게 전달하느냐**에서 결정됩니다. 모델은 같아도 프롬프트에 따라 결과가 크게 달라집니다.

| 에이전트의 부분 | 사실상 프롬프트인 것 |
|---|---|
| 역할과 규칙 | system 프롬프트 |
| 도구 사용 판단 | 도구의 `description`과 파라미터 설명 |
| 출력 형식 | 형식 지시, 예시, 출력 스키마 |
| 기억과 근거 | 컨텍스트에 넣는 문서와 대화 기록 |

프롬프트 엔지니어링은 "주문을 외우는 기술"이 아닙니다. **똑똑하지만 맥락을 전혀 모르는 신입 동료에게 업무를 정확히 설명하는 기술**에 가깝습니다.

## 1. 좋은 프롬프트의 해부도

~~~text
┌─ system ──────────────────────────────────────────┐
│ ① 역할      : 너는 사내 IT 헬프데스크 상담원이다      │
│ ② 규칙·제약 : 모르는 내용은 추측하지 말고 "확인 필요"   │
│               라고 답한다. 답변은 5문장 이내.          │
└───────────────────────────────────────────────────┘
┌─ user ────────────────────────────────────────────┐
│ ③ 맥락      : <documents> 사내 VPN 가이드 ... </documents> │
│ ④ 예시      : <example> 질문 → 모범 답변 </example>    │
│ ⑤ 과제      : 아래 질문에 답하라                     │
│ ⑥ 출력 형식 : <answer> 태그 안에 답을 쓴다            │
│ ⑦ 입력      : <question> VPN이 안 붙어요 </question>   │
└───────────────────────────────────────────────────┘
~~~

| 요소 | 역할 | 빠지면 생기는 일 |
|---|---|---|
| ① 역할 | 말투, 전문성 수준, 관점을 정합니다 | 일반적이고 밋밋한 답변 |
| ② 규칙·제약 | 해야 할 것과 하지 말아야 할 것 | 추측성 답변, 과도하게 긴 답변 |
| ③ 맥락 | 모델이 모르는 사내 정보, 데이터 | 환각(hallucination) |
| ④ 예시 | 원하는 출력의 구체적 모습 | 형식과 톤이 매번 달라짐 |
| ⑤ 과제 | 지금 해야 할 일 | 엉뚱한 작업 수행 |
| ⑥ 출력 형식 | 후처리할 수 있는 형태 | 파싱 실패 |
| ⑦ 입력 | 이번에 처리할 실제 데이터 | 없음 |

## 2. 원칙 1: 명확하고 구체적으로, 그리고 이유를 함께

모델은 우리 머릿속의 맥락을 모릅니다. 다음 두 지시를 비교해 보세요.

| 나쁜 예 | 좋은 예 |
|---|---|
| "이 리뷰를 요약해줘" | "이 제품 리뷰 20개를 **상품기획팀이 개선점을 찾는 용도로** 요약해줘. 불만 사항을 빈도순으로 3개, 각 항목에 대표 인용 1개를 붙여줘." |
| "짧게 답해" | "답변은 **3문장 이내**로 써줘. **모바일 알림창에 표시되기 때문**이야." |
| "절대 틀리지 마" | "문서에 근거가 없으면 '문서에서 찾을 수 없음'이라고 답해줘. **잘못된 안내가 고객 불만으로 이어지기 때문**이야." |

> 💡 **이유를 알려 주면 일반화가 됩니다.** "모바일 알림창에 표시된다"는 이유를 알면, 모델은 3문장 규칙뿐 아니라 마크다운 표나 긴 URL을 피하는 판단까지 스스로 합니다.

### "하지 마" 대신 "이렇게 해"

부정형 지시보다 **원하는 행동을 직접** 쓰는 편이 효과적입니다.

- ❌ "마크다운을 쓰지 마" → ✅ "일반 문장으로 이어지는 단락 형태로 써줘"
- ❌ "길게 쓰지 마" → ✅ "핵심만 2~3문장으로 써줘"

## 3. 원칙 2: XML 태그로 구조를 나누기

긴 프롬프트에서 **지시와 데이터가 섞이면** 모델이 헷갈립니다. 문서 내용을 지시로 착각하기도 합니다. XML 태그로 영역을 나누면 다음이 좋아집니다.

1. 어디까지가 문서이고 어디부터가 지시인지 분명해집니다.
2. "`<contract>` 안의 조항만 참고해"처럼 영역을 이름으로 가리킬 수 있습니다.
3. 출력도 `<answer>...</answer>`로 받으면 코드에서 잘라 내기 쉽습니다.

~~~xml
<documents>
  <document index="1">
    <source>vpn_guide.pdf</source>
    <content>VPN 접속 전 OTP 앱을 최신 버전으로 업데이트하세요...</content>
  </document>
  <document index="2">
    ...
  </document>
</documents>

위 문서만 근거로 아래 질문에 답하세요. 근거가 된 문서 번호를 함께 적으세요.
<question>재택근무 중 VPN이 연결되지 않아요</question>
~~~

> 태그 이름에 정해진 규칙은 없습니다. **의미가 드러나는 이름을 일관되게** 쓰면 됩니다. 긴 문서는 프롬프트 **위쪽**에, 질문과 지시는 **아래쪽**에 두면 일반적으로 결과가 좋습니다.

## 4. 원칙 3: 예시(few-shot)로 보여주기

형식이나 톤을 말로 설명하기 어렵다면 **예시 2~3개**를 보여주세요. 예시는 가장 강력한 지시입니다.

~~~text
<examples>
<example>
<review>배송은 빨랐는데 포장이 찢어져 왔어요.</review>
<label>배송·포장</label>
</example>
<example>
<review>앱이 자꾸 튕겨서 결제를 못 했어요.</review>
<label>앱 오류</label>
</example>
</examples>

다음 리뷰의 label을 위와 같은 형식으로 붙이세요.
<review>{review}</review>
~~~

| 좋은 예시의 조건 | 이유 |
|---|---|
| **다양하게** | 예시가 모두 비슷하면 모델이 우연한 특징(길이, 단어)까지 따라 합니다 |
| **실제 입력과 비슷하게** | 실제 데이터 분포를 반영해야 효과가 있습니다 |
| **태그로 감싸기** | 예시와 실제 과제를 헷갈리지 않습니다 |
| **경계 사례 포함** | 애매한 입력을 어떻게 처리할지 알려 줍니다 |

## 5. 원칙 4: 생각할 시간 주기

여러 단계의 추론이 필요한 문제는 **답 전에 생각하게** 하면 정확도가 올라갑니다.

- **프롬프트로 유도**: "먼저 `<thinking>`에 단계별로 분석하고, 결론은 `<answer>`에 써줘"처럼 생각과 답을 분리합니다. 코드에서는 `<answer>`만 꺼내 쓰면 됩니다.
- **확장 사고(extended thinking)**: 최신 Claude 모델은 요청 파라미터로 사고 기능을 켤 수 있습니다. 이때 모델은 답변 전에 `thinking` 블록으로 추론합니다. Claude Opus 5.5 같은 최신 모델은 **adaptive thinking**을 지원해, 문제 난이도에 맞춰 얼마나 생각할지를 모델이 스스로 정합니다. 이 경우 "단계별로 생각해" 같은 세세한 지시는 대개 필요 없습니다.

> ⚠️ 생각 과정은 토큰(비용, 지연)을 씁니다. 간단한 분류나 추출에는 필요 없고, 계산·계획·복잡한 판단에서 효과가 큽니다.

## 6. 프롬프트를 코드로: 템플릿 함수

프롬프트를 코드 곳곳에 문자열로 흩어 두면 관리가 어렵습니다. **템플릿 함수** 하나로 모으세요. 그러면 버전 관리, 테스트, A/B 비교가 쉬워집니다.

```python run id=pr-d1
from agentlab import chat, text_of

SYSTEM = "너는 사내 IT 헬프데스크 상담원이다. 문서에 근거가 없으면 '확인 필요'라고 답한다. 답변은 3문장 이내로 쓴다."

def build_prompt(question, docs):
    doc_xml = "\n".join(
        f'<document index="{i}">\n{d}\n</document>' for i, d in enumerate(docs, start=1)
    )
    return f"""<documents>
{doc_xml}
</documents>

위 문서만 근거로 질문에 답하고, 근거 문서 번호를 [1]처럼 표시하세요.
<question>{question}</question>"""

docs = ["VPN 접속 전 OTP 앱을 최신 버전으로 업데이트해야 합니다.",
        "비밀번호는 90일마다 변경해야 합니다."]
prompt = build_prompt("VPN이 연결되지 않아요", docs)
print(prompt)
print("=" * 40)
resp = await chat([{"role": "user", "content": prompt}], system=SYSTEM)
print(text_of(resp))
```

## 7. 구조화 출력: 프로그램이 믿고 쓸 수 있는 결과

에이전트는 LLM 출력을 **사람이 읽는 데서 끝내지 않고, 코드가 이어서 처리**합니다. 예를 들어 분류 결과로 라우팅하고, 추출한 필드를 DB에 저장합니다. 이때 출력은 정해진 구조여야 합니다.

### 7-1. "JSON으로 답해줘"가 위험한 이유

```python run id=pr-d2
import json

FENCE = "`" * 3   # 마크다운 코드 펜스
# 모델이 "JSON으로 답해줘"에 실제로 돌려줄 수 있는 다양한 응답들
samples = [
    '{"name": "김철수", "email": "kim@example.com"}',
    '물론입니다! 요청하신 정보입니다:\n{"name": "김철수", "email": "kim@example.com"}',
    FENCE + 'json\n{"name": "김철수", "email": "kim@example.com"}\n' + FENCE,
    "{'name': '김철수', 'email': 'kim@example.com'}",
    '{"name": "김철수", "email": "kim@example.com",}',
]
for s in samples:
    try:
        json.loads(s)
        print("✅ 파싱 성공 :", s[:40].replace("\n", " "))
    except json.JSONDecodeError as e:
        print("❌ 파싱 실패 :", s[:40].replace("\n", " "), "→", e.msg)
```

앞말 붙이기, 코드 펜스, 작은따옴표, 마지막 쉼표 같은 사소한 차이로 파이프라인 전체가 멈춥니다. 정규식으로 이것저것 고쳐 보는 방식은 끝이 없습니다.

### 7-2. 해법: 도구 스키마 + 강제 호출(tool_choice)

도구 호출의 `input`은 **API가 JSON 스키마에 맞춰 구조화해서 돌려주는 dict**입니다. 이 성질을 이용하면 됩니다. "결과를 저장하는 가짜 도구"를 정의하고 그 도구를 **반드시 호출하도록 강제**하면, 원하는 구조의 데이터를 바로 받을 수 있습니다.

~~~text
 tools=[save_contact 스키마]                  응답
 tool_choice={"type":"tool",          ──▶   tool_use 블록
              "name":"save_contact"}          input = {"name": "...", "email": "..."}  ← 이미 dict!
~~~

| `tool_choice` 값 | 의미 |
|---|---|
| 지정 안 함 (`auto`) | 도구를 쓸지 말지 모델이 판단 |
| `{"type": "any"}` | 제공된 도구 중 하나는 반드시 호출 |
| `{"type": "tool", "name": "X"}` | 도구 X를 반드시 호출 → **구조화 출력에 사용** |

`agentlab`에서는 `chat(..., tools=[...], tool_choice=...)`로 호출합니다. 결과는 `tool_input(resp)`로 꺼냅니다.

```python run id=pr-d3
from agentlab import chat, tool_input, show

CONTACT_TOOL = {
    "name": "save_contact",
    "description": "본문에서 추출한 연락처 정보를 저장합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "사람 이름"},
            "email": {"type": "string", "description": "이메일 주소"},
            "department": {"type": "string", "enum": ["영업", "개발", "인사", "기타"],
                           "description": "소속 부서"},
        },
        "required": ["name", "email", "department"],
    },
}

text = "안녕하세요, 개발팀 이영희입니다. 회신은 lee@example.com 으로 부탁드립니다."
resp = await chat(
    [{"role": "user", "content": f"다음 메일에서 연락처를 추출하세요.\n<email>{text}</email>"}],
    tools=[CONTACT_TOOL],
    tool_choice={"type": "tool", "name": "save_contact"},
)
show(resp)
data = tool_input(resp, "save_contact")
print("\n추출 결과(dict):", data)
print("type:", type(data).__name__)
```

> Mock LLM은 스키마 모양에 맞춰 대충 값을 채웁니다(문자열 필드에는 본문 전체). 실제 Claude를 연결하면 `name="이영희"`, `department="개발"`처럼 정확히 추출되는 것을 볼 수 있습니다.

### 7-3. 스키마 설계 팁

| 팁 | 예시 |
|---|---|
| 정해진 값은 `enum` | `"priority": {"enum": ["high", "normal", "low"]}` |
| 모든 필드에 `description` | 모델이 필드 의미를 정확히 이해합니다 |
| 꼭 필요한 필드는 `required` | 누락을 줄입니다 |
| "모름"을 표현할 방법을 준다 | `"enum": [..., "unknown"]` 또는 nullable 필드. 없으면 모델이 값을 지어냅니다 |
| 이유 필드를 **먼저** 둔다 | `"reason"`을 `"label"` 앞에 두면 근거를 먼저 쓰고 판단합니다 |

## 8. 검증과 재시도: 스키마만으로는 부족하다

스키마로 **모양**은 맞출 수 있습니다. 하지만 **내용**까지 보장되지는 않습니다. 이메일에 `@`가 없거나 날짜가 과거일 수 있습니다. 그래서 코드로 한 번 더 검증하고, 실패하면 **무엇이 틀렸는지 알려 주며 다시 요청**합니다.

~~~text
 ┌──▶ chat(강제 도구 호출) ──▶ input 검증 ──통과──▶ 결과 반환
 │                              │
 │                            실패
 │                              ▼
 └── assistant 응답 + tool_result(is_error=True, "email에 @가 없습니다") 추가
       (최대 N번까지)
~~~

핵심은 오류 메시지를 **tool_result로 돌려주는 것**입니다. 모델 입장에서는 "내가 호출한 도구가 이런 이유로 거절했다"는 정보가 생기고, 다음 시도에서 그 부분을 고칩니다. 실습 2-3에서 직접 구현합니다.

```python run id=pr-d4
import agentlab
from agentlab import chat, tool_calls, tool_result, tool_input

# 채점용 가짜 응답으로 흐름을 확인합니다: 1차는 잘못된 이메일, 2차는 수정된 값
agentlab.scripted([
    {"tool": "save_contact", "input": {"name": "이영희", "email": "lee.example.com", "department": "개발"}},
    {"tool": "save_contact", "input": {"name": "이영희", "email": "lee@example.com", "department": "개발"}},
])
TOOL = {"name": "save_contact", "description": "연락처 저장",
        "input_schema": {"type": "object", "properties": {"email": {"type": "string"}}}}

messages = [{"role": "user", "content": "이영희, lee@example.com 연락처를 추출해줘"}]
for attempt in range(1, 4):
    resp = await chat(messages, tools=[TOOL], tool_choice={"type": "tool", "name": "save_contact"})
    data = tool_input(resp)
    print(f"[시도 {attempt}] {data}")
    if "@" in data["email"]:
        print("✅ 검증 통과")
        break
    messages.append({"role": "assistant", "content": resp["content"]})
    messages.append({"role": "user", "content": [
        tool_result(tool_calls(resp)[0]["id"], "검증 실패: email에 @가 없습니다. 다시 추출하세요.", is_error=True)
    ]})
print("총 호출 횟수:", len(agentlab.calls))
```

## 9. 자주 하는 실수

| 실수 | 결과 | 개선 |
|---|---|---|
| 지시와 문서를 섞어서 씀 | 문서 속 문장을 지시로 착각 | XML 태그로 분리 |
| 예시가 모두 비슷함 | 출력이 예시를 기계적으로 복사 | 다양한 예시, 경계 사례 포함 |
| "JSON으로 답해" + `json.loads` | 간헐적 파싱 실패 | 강제 도구 호출 + 검증 |
| 스키마에 "모름" 선택지가 없음 | 정보가 없어도 값을 지어냄 | `unknown`, nullable 허용 |
| 실패 시 같은 요청을 그대로 재전송 | 같은 실수 반복 | 오류 내용을 피드백으로 전달 |
| 프롬프트를 문자열로 여기저기 복사 | 수정 누락, 일관성 붕괴 | 템플릿 함수로 한곳에 관리 |
| 대문자·"절대"·"반드시" 남발 | 최신 모델은 과잉 반응할 수 있음 | 평이한 말투 + 이유 설명 |

## 10. 실무 팁

- **프롬프트도 코드처럼 버전 관리하세요.** 바꿀 때마다 평가셋으로 이전 버전과 비교합니다(모듈 9).
- **실패 사례를 모으세요.** 잘못된 출력이 나온 입력은 가장 좋은 few-shot 예시이자 테스트 케이스가 됩니다.
- **모델에게 프롬프트 개선을 맡겨 보세요.** "이 프롬프트가 애매한 부분을 찾아 고쳐줘"는 의외로 잘 동작합니다.
- **긴 공통 지시는 system에** 두세요. 반복되는 앞부분은 프롬프트 캐싱으로 비용을 줄일 수 있습니다(모듈 10).

## 11. 확인 퀴즈

```quiz id=pr-q1
{"q": "긴 사내 문서 여러 개와 질문을 함께 보낼 때 가장 권장되는 구성은?", "options": ["질문을 먼저 쓰고 문서를 구분 없이 이어 붙인다", "문서를 <document> 같은 XML 태그로 감싸 위쪽에 두고, 지시와 질문은 아래쪽에 둔다", "문서를 system 프롬프트에 대문자로 강조해 넣는다", "문서를 요약하지 않으면 모델이 읽지 못하므로 한 줄로 줄인다"], "answer": 1, "explain": "태그로 데이터와 지시를 분리하면 혼동이 줄고, 긴 문서는 위·질문은 아래에 두면 일반적으로 결과가 좋습니다."}
```

```quiz id=pr-q2
{"q": "LLM에게서 정해진 필드를 가진 JSON을 안정적으로 받는 가장 좋은 방법은?", "options": ["'반드시 JSON만 출력해'라고 대문자로 강조한다", "출력에서 정규식으로 { } 사이를 잘라 json.loads 한다", "출력 스키마를 도구로 정의하고 tool_choice로 그 도구 호출을 강제한 뒤, input을 검증한다", "temperature를 0으로 설정한다"], "answer": 2, "explain": "도구 input은 스키마에 맞춘 dict로 돌아옵니다. 여기에 코드 검증과 재시도를 더하면 가장 견고합니다. 참고로 API 2026-10-21부터 temperature 파라미터는 없습니다."}
```

```quiz id=pr-q3
{"q": "few-shot 예시를 고를 때 가장 바람직한 것은?", "options": ["같은 유형의 쉬운 예시를 10개 이상 넣는다", "실제 입력과 비슷하면서 서로 다양한 예시 2~3개와 애매한 경계 사례를 넣는다", "예시는 모델을 헷갈리게 하므로 넣지 않는다", "정답이 틀린 예시를 섞어 모델이 스스로 판단하게 한다"], "answer": 1, "explain": "다양하고 대표성 있는 예시가 형식과 판단 기준을 가장 잘 전달합니다. 비슷한 예시만 있으면 우연한 특징까지 따라 합니다."}
```

```quiz id=pr-q4
{"q": "구조화 출력의 검증에 실패했을 때 재요청하는 가장 효과적인 방법은?", "options": ["같은 메시지를 그대로 다시 보낸다", "대화를 처음부터 새로 시작한다", "모델의 응답과 함께 무엇이 틀렸는지 설명하는 tool_result(is_error=True)를 추가해 다시 요청한다", "max_tokens를 늘려 다시 요청한다"], "answer": 2, "explain": "구체적인 오류 피드백이 있어야 모델이 같은 실수를 반복하지 않고 해당 부분을 고칩니다."}
```

## 12. 실습

### 실습 2-1. XML 구조의 프롬프트 템플릿 만들기

`build_prompt(task, documents, rules)`를 완성하세요. 반환 문자열은 아래 순서와 형식을 정확히 지켜야 합니다.

~~~text
<documents>
<document index="1">
첫 번째 문서 내용
</document>
<document index="2">
두 번째 문서 내용
</document>
</documents>

<rules>
1. 첫 번째 규칙
2. 두 번째 규칙
</rules>

<task>과제 내용</task>
~~~

- 각 블록 사이에는 빈 줄 하나가 있습니다(`"\n\n"`로 연결).
- 문서 번호와 규칙 번호는 1부터 시작합니다.
- `rules`가 빈 리스트면 `<rules>` 블록을 **통째로 생략**합니다.

```hint id=pr-e1
블록 문자열을 리스트(parts)에 차례로 담고 "\n\n".join(parts)로 합치세요. 문서는 "\n".join(f'<document index="{i}">\n{d}\n</document>' for i, d in enumerate(documents, start=1)) 처럼 만들 수 있습니다. rules가 비었는지는 if rules: 로 검사합니다.
```

```python starter id=pr-e1
def build_prompt(task, documents, rules):
    # TODO: <documents>, (<rules>), <task> 블록을 만들어 "\n\n"으로 연결
    pass

# 직접 실행해 보기:
# print(build_prompt("VPN 문제를 해결하세요", ["문서A", "문서B"], ["3문장 이내", "근거 번호 표시"]))
```

```python test id=pr-e1
expected = (
    '<documents>\n<document index="1">\n문서A\n</document>\n<document index="2">\n문서B\n</document>\n</documents>'
    "\n\n<rules>\n1. 3문장 이내\n2. 근거 번호 표시\n</rules>"
    "\n\n<task>VPN 문제를 해결하세요</task>"
)
got = build_prompt("VPN 문제를 해결하세요", ["문서A", "문서B"], ["3문장 이내", "근거 번호 표시"])
assert isinstance(got, str), "문자열을 반환하세요"
assert got.startswith("<documents>"), "<documents> 블록으로 시작해야 합니다"
assert '<document index="1">\n문서A\n</document>' in got, "각 문서는 <document index=\"번호\"> 줄, 내용 줄, </document> 줄로 구성하세요"
assert "1. 3문장 이내\n2. 근거 번호 표시" in got, "규칙은 1부터 번호를 붙여 줄마다 쓰세요"
assert got == expected, f"형식이 정확히 일치하지 않습니다.\n--- 기대값 ---\n{expected}\n--- 받은 값 ---\n{got}"

got2 = build_prompt("요약하세요", ["유일한 문서"], [])
assert "<rules>" not in got2, "rules가 비어 있으면 <rules> 블록을 생략하세요"
assert got2 == '<documents>\n<document index="1">\n유일한 문서\n</document>\n</documents>\n\n<task>요약하세요</task>', f"rules가 없을 때 형식이 다릅니다:\n{got2}"
print("✅ 모든 테스트 통과!")
```

```python solution id=pr-e1
def build_prompt(task, documents, rules):
    docs = "\n".join(
        f'<document index="{i}">\n{d}\n</document>' for i, d in enumerate(documents, start=1)
    )
    parts = [f"<documents>\n{docs}\n</documents>"]
    if rules:
        numbered = "\n".join(f"{i}. {r}" for i, r in enumerate(rules, start=1))
        parts.append(f"<rules>\n{numbered}\n</rules>")
    parts.append(f"<task>{task}</task>")
    return "\n\n".join(parts)
```

### 실습 2-2. 강제 도구 호출로 연락처 추출하기

`extract_contact(text)`를 완성하세요.

1. `chat`을 **한 번** 호출합니다.
   - messages: `[{"role": "user", "content": f"다음 메일에서 연락처를 추출하세요.\n<email>{text}</email>"}]`
   - `tools=[CONTACT_TOOL]`
   - `tool_choice={"type": "tool", "name": "save_contact"}`
2. `tool_input(resp, "save_contact")`로 결과 dict를 꺼냅니다. `None`이면 `ValueError`를 일으킵니다.
3. 검증합니다. 실패하면 `ValueError`를 일으킵니다.
   - `name`, `email`, `department` 키가 모두 있어야 합니다.
   - `email`에 `"@"`가 있어야 합니다.
   - `department`는 `DEPARTMENTS` 중 하나여야 합니다.
4. 검증을 통과하면 dict를 반환합니다.

```hint id=pr-e2
resp = await chat([...], tools=[CONTACT_TOOL], tool_choice={"type": "tool", "name": "save_contact"}) 후 data = tool_input(resp, "save_contact"). 필수 키는 for key in ("name", "email", "department"): if key not in data: raise ValueError(...) 로 검사하세요.
```

```python starter id=pr-e2
from agentlab import chat, tool_input

DEPARTMENTS = ["영업", "개발", "인사", "기타"]
CONTACT_TOOL = {
    "name": "save_contact",
    "description": "본문에서 추출한 연락처 정보를 저장합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "사람 이름"},
            "email": {"type": "string", "description": "이메일 주소"},
            "department": {"type": "string", "enum": DEPARTMENTS, "description": "소속 부서"},
        },
        "required": ["name", "email", "department"],
    },
}

async def extract_contact(text):
    # TODO: 1) 강제 도구 호출  2) tool_input  3) 검증 (실패 시 ValueError)  4) 반환
    pass
```

```python test id=pr-e2
import agentlab

agentlab.scripted([{"tool": "save_contact", "input": {"name": "이영희", "email": "lee@example.com", "department": "개발"}}])
data = await extract_contact("개발팀 이영희입니다. lee@example.com")
assert data == {"name": "이영희", "email": "lee@example.com", "department": "개발"}, f"추출 결과 dict를 그대로 반환하세요 (받은 값: {data!r})"
assert len(agentlab.calls) == 1, f"chat은 한 번만 호출하세요 (현재 {len(agentlab.calls)}번)"
call = agentlab.calls[0]
assert call.get("tools") == [CONTACT_TOOL], "tools=[CONTACT_TOOL]을 전달하세요"
assert call.get("tool_choice") == {"type": "tool", "name": "save_contact"}, "tool_choice로 save_contact 호출을 강제하세요"
assert "<email>개발팀 이영희입니다. lee@example.com</email>" in call["messages"][0]["content"], "본문을 <email> 태그로 감싸 전달하세요"

async def expect_error(item, why):
    agentlab._reset()
    agentlab.scripted([item])
    try:
        await extract_contact("본문")
    except ValueError:
        return
    raise AssertionError(f"{why}: ValueError를 일으켜야 합니다")

await expect_error({"tool": "save_contact", "input": {"name": "김", "email": "kim.example.com", "department": "영업"}}, "email에 @가 없는 경우")
await expect_error({"tool": "save_contact", "input": {"name": "김", "email": "kim@example.com", "department": "마케팅"}}, "허용되지 않은 부서")
await expect_error({"tool": "save_contact", "input": {"name": "김", "department": "영업"}}, "email 필드 누락")
await expect_error("연락처를 찾지 못했습니다.", "도구 호출이 없는 응답")
print("✅ 모든 테스트 통과!")
```

```python solution id=pr-e2
from agentlab import chat, tool_input

DEPARTMENTS = ["영업", "개발", "인사", "기타"]
CONTACT_TOOL = {
    "name": "save_contact",
    "description": "본문에서 추출한 연락처 정보를 저장합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "사람 이름"},
            "email": {"type": "string", "description": "이메일 주소"},
            "department": {"type": "string", "enum": DEPARTMENTS, "description": "소속 부서"},
        },
        "required": ["name", "email", "department"],
    },
}

async def extract_contact(text):
    resp = await chat(
        [{"role": "user", "content": f"다음 메일에서 연락처를 추출하세요.\n<email>{text}</email>"}],
        tools=[CONTACT_TOOL],
        tool_choice={"type": "tool", "name": "save_contact"},
    )
    data = tool_input(resp, "save_contact")
    if data is None:
        raise ValueError("save_contact 도구 호출이 없습니다")
    for key in ("name", "email", "department"):
        if key not in data:
            raise ValueError(f"{key} 필드가 없습니다")
    if "@" not in data["email"]:
        raise ValueError("email 형식이 올바르지 않습니다")
    if data["department"] not in DEPARTMENTS:
        raise ValueError(f"허용되지 않은 부서: {data['department']}")
    return data
```

### 실습 2-3. 오류 피드백으로 재시도하는 추출기

`extract_with_retry(text, max_attempts=3)`를 완성하세요. 검증 함수 `validate(data)`는 이미 주어져 있으며, 오류 메시지 리스트를 반환합니다(빈 리스트면 통과).

1. `messages = [{"role": "user", "content": text}]`로 시작합니다.
2. 최대 `max_attempts`번 반복합니다.
   - `chat(messages, tools=[CONTACT_TOOL], tool_choice={"type": "tool", "name": "save_contact"})`을 호출합니다.
   - `call = tool_calls(resp)[0]`, `data = call["input"]`로 결과를 꺼내고 `errors = validate(data)`로 검증합니다.
   - 오류가 없으면 `data`를 반환합니다.
   - 오류가 있으면 다음 두 메시지를 차례로 추가합니다.
     - assistant 메시지: 응답 **content 전체**
     - user 메시지: `tool_result(call["id"], "검증 실패: " + "; ".join(errors), is_error=True)` 하나를 담은 리스트
3. 모든 시도가 실패하면 `ValueError`를 일으킵니다.

```hint id=pr-e3
for attempt in range(max_attempts): 안에서 chat → tool_calls(resp)[0] → validate 순서로 처리하세요. 실패하면 messages.append({"role": "assistant", "content": resp["content"]})와 messages.append({"role": "user", "content": [tool_result(call["id"], "검증 실패: " + "; ".join(errors), is_error=True)]})를 추가합니다. for 문이 끝나면 raise ValueError(...)를 실행합니다.
```

```python starter id=pr-e3
from agentlab import chat, tool_calls, tool_result

CONTACT_TOOL = {
    "name": "save_contact",
    "description": "본문에서 추출한 연락처 정보를 저장합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "사람 이름"},
            "email": {"type": "string", "description": "이메일 주소"},
        },
        "required": ["name", "email"],
    },
}

def validate(data):
    errors = []
    if not data.get("name"):
        errors.append("name이 비어 있습니다")
    if "@" not in data.get("email", ""):
        errors.append("email에 @가 없습니다")
    return errors

async def extract_with_retry(text, max_attempts=3):
    messages = [{"role": "user", "content": text}]
    # TODO: 검증 실패 시 오류 피드백을 추가하며 재시도
    pass
```

```python test id=pr-e3
import agentlab

# 시나리오 1: 1차 실패 → 2차 성공
agentlab.scripted([
    {"tool": "save_contact", "input": {"name": "", "email": "lee.example.com"}, "id": "c1"},
    {"tool": "save_contact", "input": {"name": "이영희", "email": "lee@example.com"}, "id": "c2"},
])
data = await extract_with_retry("이영희 lee@example.com")
assert data == {"name": "이영희", "email": "lee@example.com"}, f"검증을 통과한 input을 반환하세요 (받은 값: {data!r})"
assert len(agentlab.calls) == 2, f"1번 실패 후 1번 더 호출해야 합니다 (현재 {len(agentlab.calls)}번)"
first = agentlab.calls[0]
assert first.get("tool_choice") == {"type": "tool", "name": "save_contact"}, "tool_choice로 save_contact 호출을 강제하세요"
msgs = agentlab.calls[1]["messages"]
assert [m["role"] for m in msgs] == ["user", "assistant", "user"], f"재시도 요청의 messages 구성이 다릅니다: {[m['role'] for m in msgs]}"
assert isinstance(msgs[1]["content"], list), "assistant 메시지에는 응답 content 전체(리스트)를 넣으세요"
fb = msgs[2]["content"]
assert isinstance(fb, list) and len(fb) == 1 and fb[0]["type"] == "tool_result", "피드백은 tool_result 블록 하나를 담은 리스트여야 합니다"
assert fb[0]["tool_use_id"] == "c1", "tool_result의 id는 실패한 tool_use의 id여야 합니다"
assert fb[0].get("is_error") is True, "is_error=True로 오류임을 표시하세요"
assert "name이 비어 있습니다" in fb[0]["content"] and "email에 @가 없습니다" in fb[0]["content"], f"모든 검증 오류 메시지를 담으세요 (받은 값: {fb[0]['content']!r})"
assert fb[0]["content"].startswith("검증 실패: "), "피드백은 '검증 실패: '로 시작해야 합니다"

# 시나리오 2: 계속 실패
agentlab._reset()
agentlab.scripted([{"tool": "save_contact", "input": {"name": "김", "email": "없음"}}] * 5)
try:
    await extract_with_retry("본문", max_attempts=2)
except ValueError:
    pass
else:
    raise AssertionError("모든 시도가 실패하면 ValueError를 일으켜야 합니다")
assert len(agentlab.calls) == 2, f"max_attempts=2이면 chat은 2번만 호출해야 합니다 (현재 {len(agentlab.calls)}번)"
print("✅ 모든 테스트 통과!")
```

```python solution id=pr-e3
from agentlab import chat, tool_calls, tool_result

CONTACT_TOOL = {
    "name": "save_contact",
    "description": "본문에서 추출한 연락처 정보를 저장합니다.",
    "input_schema": {
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "사람 이름"},
            "email": {"type": "string", "description": "이메일 주소"},
        },
        "required": ["name", "email"],
    },
}

def validate(data):
    errors = []
    if not data.get("name"):
        errors.append("name이 비어 있습니다")
    if "@" not in data.get("email", ""):
        errors.append("email에 @가 없습니다")
    return errors

async def extract_with_retry(text, max_attempts=3):
    messages = [{"role": "user", "content": text}]
    for _ in range(max_attempts):
        resp = await chat(messages, tools=[CONTACT_TOOL],
                          tool_choice={"type": "tool", "name": "save_contact"})
        call = tool_calls(resp)[0]
        data = call["input"]
        errors = validate(data)
        if not errors:
            return data
        messages.append({"role": "assistant", "content": resp["content"]})
        messages.append({"role": "user", "content": [
            tool_result(call["id"], "검증 실패: " + "; ".join(errors), is_error=True)
        ]})
    raise ValueError(f"{max_attempts}번 시도했지만 검증을 통과하지 못했습니다")
```

## 13. 더 읽어보기

- [Claude 프롬프트 엔지니어링 가이드](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/overview)
- [Claude Tool Use 문서](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview)
- [Prompt Engineering Guide (한국어)](https://www.promptingguide.ai/kr)
- [Anthropic Courses: 프롬프트 엔지니어링 인터랙티브 튜토리얼](https://github.com/anthropics/courses)

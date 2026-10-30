# 모듈 3. Tool Use (Function Calling)

> **학습 목표**: LLM이 외부 함수(도구)를 호출하는 원리를 이해하고, 도구 정의, 실행, 결과 반환까지 직접 구현합니다.

## 1. 왜 도구가 필요한가

LLM만으로는 **현재 날씨 조회, 정확한 계산, DB 검색, 파일 수정** 같은 일을 할 수 없습니다. Tool Use는 모델이 "이 함수를 이런 인자로 실행해 줘"라고 **요청**하는 구조입니다. 실제 실행은 **우리 코드**가 하고, 결과를 다시 모델에게 돌려줍니다.

> 모델은 도구를 직접 실행하지 않습니다. 실행 여부를 결정하고 통제하는 쪽은 항상 애플리케이션입니다. 이 점이 보안과 안전 설계의 출발점입니다.

## 2. 도구 정의하기

도구는 `name`, `description`, `input_schema`(JSON Schema)로 정의합니다.

~~~python
weather_tool = {
    "name": "get_weather",
    "description": "지정한 도시의 현재 날씨를 조회합니다. 사용자가 날씨, 기온, 비 여부를 물을 때 사용하세요.",
    "input_schema": {
        "type": "object",
        "properties": {
            "city": {"type": "string", "description": "도시 이름 (예: 서울, 부산)"}
        },
        "required": ["city"],
    },
}
~~~

**description이 가장 중요합니다.** 모델은 설명을 읽고 언제, 어떻게 도구를 쓸지 판단합니다. 무엇을 하는지, 언제 써야 하는지, 각 인자의 의미와 형식을 신입 동료에게 설명하듯 적으세요.

### 2-1. input_schema는 JSON Schema입니다

`input_schema`는 표준 [JSON Schema](https://json-schema.org) 형식입니다. 자주 쓰는 키워드는 다음과 같습니다.

| 키워드 | 용도 | 예시 |
|---|---|---|
| `type` | 값의 타입 | `"string"`, `"integer"`, `"number"`, `"boolean"`, `"array"`, `"object"` |
| `description` | 인자의 의미·형식 설명 | `"YYYY-MM-DD 형식의 날짜"` |
| `enum` | 허용되는 값 목록 | `["asc", "desc"]` |
| `required` | 반드시 채워야 하는 인자 | `["city"]` |
| `items` | 배열 원소의 스키마 | `{"type": "string"}` |
| `minimum` / `maximum` | 숫자 범위 | `{"type": "integer", "minimum": 1, "maximum": 100}` |

선택지가 정해져 있으면 문자열 대신 `enum`을 쓰세요. 모델이 엉뚱한 값을 만들 여지가 줄어듭니다. 단, 스키마는 모델에게 주는 **안내**입니다. 들어온 값은 실행 전에 우리 코드가 다시 검증해야 합니다 (실습 3-3).

## 3. Tool Use의 흐름

~~~text
① 사용자 질문 + tools 목록  ──▶  LLM
② LLM 응답: stop_reason = "tool_use"
   content = [text("날씨를 조회할게요"), tool_use(id="toolu_1", name="get_weather", input={"city":"서울"})]
③ 우리 코드가 get_weather("서울") 실행  →  "맑음, 18도"
④ user 메시지로 tool_result 전송:
   {"role":"user","content":[{"type":"tool_result","tool_use_id":"toolu_1","content":"맑음, 18도"}]}
⑤ LLM 최종 응답: stop_reason = "end_turn", "서울은 맑고 18도입니다."
~~~

핵심 규칙은 다음과 같습니다.

- `tool_result`는 반드시 대응하는 `tool_use`의 **`id`를 `tool_use_id`로** 가리켜야 합니다.
- 모델이 한 번에 **여러 도구를 병렬로** 호출할 수 있습니다. 이때 모든 `tool_result`를 **하나의 user 메시지**에 담아 보냅니다.
- 도구 실행이 실패하면 결과를 빼지 말고 `"is_error": true`와 오류 내용을 보내세요. 모델이 스스로 복구를 시도할 수 있습니다.

### 3-1. 실제 messages가 어떻게 쌓이는지 따라가 보기

"서울과 부산 날씨 비교해 줘"라는 질문에 모델이 두 도구를 **병렬로** 호출하는 경우, 두 번째 API 호출에 들어가는 `messages`는 다음과 같습니다.

~~~json
[
  {"role": "user", "content": "서울과 부산 날씨 비교해 줘"},
  {"role": "assistant", "content": [
    {"type": "text", "text": "두 도시의 날씨를 조회하겠습니다."},
    {"type": "tool_use", "id": "toolu_A", "name": "get_weather", "input": {"city": "서울"}},
    {"type": "tool_use", "id": "toolu_B", "name": "get_weather", "input": {"city": "부산"}}
  ]},
  {"role": "user", "content": [
    {"type": "tool_result", "tool_use_id": "toolu_A", "content": "맑음, 18도"},
    {"type": "tool_result", "tool_use_id": "toolu_B", "content": "흐림, 21도"}
  ]}
]
~~~

확인할 점은 세 가지입니다.

1. assistant 메시지에는 **text와 tool_use 블록이 함께** 들어 있고, 그대로 보존합니다.
2. tool_result는 **user 역할**로 보냅니다. 모델 입장에서 도구 결과는 "바깥 세계에서 온 정보"이기 때문입니다.
3. 모든 `tool_use`에는 짝이 되는 `tool_result`가 있어야 합니다. 하나라도 빠지면 API가 오류를 냅니다.

### 3-2. 도구 선택을 제어하는 tool_choice

기본값은 모델이 도구를 쓸지 말지 스스로 정하는 것(`auto`)입니다. 필요하면 강제할 수 있습니다.

| tool_choice | 동작 | 쓰임새 |
|---|---|---|
| (지정 안 함) / `{"type": "auto"}` | 모델이 판단 | 일반 에이전트 |
| `{"type": "any"}` | 도구 중 하나는 반드시 호출 | 항상 조회가 필요한 봇 |
| `{"type": "tool", "name": "X"}` | X 도구를 반드시 호출 | **구조화 출력** (모듈 2) |

## 4. 직접 실행해 보기

```python run id=m2d1
from agentlab import chat, show, tool_calls, tool_result, text_of

weather_tool = {
    "name": "get_weather",
    "description": "지정한 도시의 현재 날씨를 조회합니다.",
    "input_schema": {
        "type": "object",
        "properties": {"city": {"type": "string", "description": "도시 이름"}},
        "required": ["city"],
    },
}

def get_weather(city):
    fake_db = {"서울": "맑음, 18도", "부산": "흐림, 21도", "포항": "바람 강함, 16도"}
    return fake_db.get(city, "정보 없음")

messages = [{"role": "user", "content": "포항 날씨 어때?"}]
resp = await chat(messages, tools=[weather_tool])
show(resp)

if resp["stop_reason"] == "tool_use":
    messages.append({"role": "assistant", "content": resp["content"]})
    results = [tool_result(c["id"], get_weather(**c["input"])) for c in tool_calls(resp)]
    messages.append({"role": "user", "content": results})
    final = await chat(messages, tools=[weather_tool])
    print("\n최종 답변:", text_of(final))
```

## 5. 심화: 좋은 도구를 설계하는 원칙

에이전트의 성능은 모델만큼이나 **도구 설계**에 달려 있습니다. 도구는 사람이 아니라 모델이 쓰는 API라고 생각하세요.

### 5-1. 이름과 설명

- 이름은 **동사_목적어** 형태로 명확하게 짓습니다: `search_orders`, `get_customer`, `create_ticket`.
- 비슷한 도구가 여러 개라면 설명에서 **차이와 선택 기준**을 밝힙니다: "주문 번호를 알 때는 get_order, 모를 때는 search_orders를 쓰세요."
- 설명에는 언제 쓰는지, 언제 쓰지 말아야 하는지, 결과가 어떤 형태인지, 제약(최대 개수, 단위)을 적습니다.

### 5-2. 입력 설계

- 인자는 적고 의미가 분명하게 만듭니다. 모델이 추측해야 하는 인자는 오류의 원인이 됩니다.
- 형식이 정해진 값(날짜, 통화, ID)은 description에 예시를 넣습니다.
- 위험한 자유 입력(SQL 전체, 셸 명령, 임의 URL)은 피하고, 좁은 기능의 도구로 쪼갭니다 (모듈 10).

### 5-3. 출력 설계

- **필요한 만큼만** 돌려줍니다. 1만 행을 그대로 주면 컨텍스트를 낭비하고 모델이 핵심을 놓칩니다. 상위 N개, 요약 통계, "결과가 더 있습니다(총 523건)" 같은 안내가 좋습니다.
- 사람이 읽기 좋은 식별자를 함께 줍니다: `id=8841` 보다 `id=8841 (홍길동, 2025-03-02 주문)`.
- 오류 메시지는 **모델이 다음 행동을 고칠 수 있게** 씁니다.

~~~text
 ❌ "Error: 400"
 ✅ "Error: date 형식이 잘못되었습니다. 'YYYY-MM-DD' 형식으로 다시 호출하세요. (받은 값: '3월 2일')"
~~~

### 5-4. 도구 개수

도구가 많을수록 모델이 고를 선택지가 많아져 혼동이 늘고, 도구 정의만으로 입력 토큰이 커집니다. 기능이 겹치는 도구는 합치고, 작업 단계별로 필요한 도구만 넘기는 방식을 고려하세요. 수십 개 이상이 필요하면 하위 에이전트로 나누는 것(모듈 8)도 방법입니다.

## 6. 자주 하는 실수

- **tool_result를 assistant 역할로 보내기**: tool_result는 항상 user 메시지 안에 들어갑니다.
- **병렬 호출 중 일부만 결과 보내기**: 모든 tool_use에 대응하는 tool_result가 있어야 합니다.
- **도구 예외로 프로그램 전체가 죽기**: 예외를 잡아 `is_error` 결과로 돌려주세요.
- **모델이 만든 인자를 검증 없이 실행**: 스키마를 지켰다고 안전한 값인 것은 아닙니다. 범위·형식·권한을 코드로 확인하세요.
- **설명 없는 짧은 이름만 주기**: `fn1`, `query` 같은 도구는 모델이 언제 써야 할지 모릅니다.

## 7. 실무 팁

- 도구 함수는 LLM 없이도 **단위 테스트**하세요. 도구가 틀리면 에이전트는 절대 맞을 수 없습니다.
- 모든 도구 호출을 이름·인자·결과 길이·소요 시간과 함께 로그로 남기세요. 에이전트 디버깅의 80%는 이 로그로 합니다.
- 모델이 도구를 잘못 쓰는 패턴이 보이면 코드보다 **description을 먼저** 고쳐 보세요.

## 8. 확인 퀴즈

```quiz id=m2q1
{"q": "LLM이 tool_use 블록을 응답했을 때 도구를 실제로 실행하는 주체는?", "options": ["LLM 서버가 자동으로 실행한다", "우리 애플리케이션 코드가 실행한다", "도구 정의의 input_schema가 실행한다", "사용자의 브라우저가 자동으로 실행한다"], "answer": 1, "explain": "모델은 호출을 '요청'만 합니다. 실행과 그 통제는 애플리케이션 책임입니다. (서버 측 도구는 예외입니다)"}
```

```quiz id=m2q2
{"q": "모델이 한 응답에서 도구 3개를 병렬로 호출했습니다. 결과를 어떻게 보내야 하나요?", "options": ["tool_result 3개를 각각 별도의 user 메시지로 보낸다", "tool_result 3개를 하나의 user 메시지 content에 담아 보낸다", "가장 중요한 결과 하나만 보낸다", "assistant 메시지로 결과를 보낸다"], "answer": 1, "explain": "병렬 호출 결과는 하나의 user 메시지에 모두 담습니다. 나눠 보내면 모델이 병렬 호출을 덜 하게 됩니다."}
```

```quiz id=m2q3
{"q": "모델이 도구를 엉뚱한 상황에 쓰거나 인자를 잘못 채운다면, 가장 먼저 개선할 것은?", "options": ["max_tokens를 늘린다", "도구의 description과 인자 설명을 더 구체적으로 쓴다", "도구 이름을 짧게 바꾼다", "도구 개수를 늘린다"], "answer": 1, "explain": "모델은 description을 보고 도구 사용을 판단합니다. 언제 쓰는지, 인자 형식은 무엇인지를 명확히 쓰는 것이 가장 효과적입니다."}
```

```quiz id=m2q4
{"q": "주문 조회 도구가 1만 건의 주문을 그대로 tool_result로 돌려주고 있습니다. 가장 좋은 개선은?", "options": ["max_tokens를 크게 늘린다", "상위 일부와 요약(총 건수 등)만 돌려주고, 필요하면 조건을 좁혀 다시 조회하게 한다", "결과를 여러 user 메시지로 나눠 보낸다", "도구를 없애고 모델이 기억으로 답하게 한다"], "answer": 1, "explain": "도구 결과도 컨텍스트를 차지합니다. 필요한 만큼만 돌려주고 더 볼 방법을 안내하는 것이 비용과 정확도 모두에 좋습니다."}
```

## 9. 실습

### 실습 3-1. 계산기 도구 정의와 실행기

1. `CALCULATOR_TOOL`: 이름이 `"calculator"`이고, 필수 문자열 인자 `"expression"`을 받는 도구 정의를 만드세요. description도 꼭 쓰세요.
2. `execute_tool(name, tool_input)`: 도구 이름에 따라 실행하고 **결과를 문자열로** 반환합니다.
   - `"calculator"`: `tool_input["expression"]`을 계산합니다. 숫자, 공백, `+ - * / ( ) .`만 허용하고, 다른 문자가 있거나 계산 중 오류가 나면 `"Error: ..."`로 시작하는 문자열을 반환합니다.
   - 알 수 없는 도구 이름이면 `"Error: unknown tool <이름>"`을 반환합니다.
   - 정수로 떨어지는 결과는 `"14"`처럼 정수 형태로 반환합니다. 예를 들어 `8/2`는 `"4"`입니다.

```hint id=m2e1
허용 문자 검사는 정규식으로 할 수 있습니다: re.fullmatch(r"[\d\s+\-*/().]+", expr). 검사를 통과하면 eval(expr, {"__builtins__": {}})로 계산하세요. 결과가 float이고 result.is_integer()이면 int로 바꿉니다. 실제 서비스에서는 eval 대신 안전한 수식 파서를 쓰는 것이 좋습니다.
```

```python starter id=m2e1
import re

CALCULATOR_TOOL = {
    # TODO: name, description, input_schema를 채우세요
}

def execute_tool(name, tool_input):
    # TODO: name에 따라 도구를 실행하고 결과를 문자열로 반환하세요
    pass

# 직접 확인해 보기
print(execute_tool("calculator", {"expression": "2 + 3 * 4"}))
```

```python test id=m2e1
t = CALCULATOR_TOOL
assert t.get("name") == "calculator", "name은 'calculator'여야 합니다"
assert len(t.get("description", "")) >= 10, "description을 충분히 구체적으로 작성하세요 (10자 이상)"
schema = t.get("input_schema", {})
assert schema.get("type") == "object", "input_schema.type은 'object'여야 합니다"
assert schema.get("properties", {}).get("expression", {}).get("type") == "string", "expression은 string 타입 속성이어야 합니다"
assert "expression" in schema.get("required", []), "expression을 required에 넣으세요"

r = execute_tool("calculator", {"expression": "2 + 3 * 4"})
assert r == "14", f"'2 + 3 * 4'의 결과는 '14'여야 합니다 (받은 값: {r!r})"
r = execute_tool("calculator", {"expression": "8 / 2"})
assert r == "4", f"'8 / 2'는 '4'여야 합니다 (받은 값: {r!r})"
r = execute_tool("calculator", {"expression": "7 / 2"})
assert r == "3.5", f"'7 / 2'는 '3.5'여야 합니다 (받은 값: {r!r})"
r = execute_tool("calculator", {"expression": "__import__('os')"})
assert isinstance(r, str) and r.startswith("Error"), "허용되지 않은 문자는 'Error'로 시작하는 문자열을 반환해야 합니다"
r = execute_tool("calculator", {"expression": "1 / 0"})
assert isinstance(r, str) and r.startswith("Error"), "0으로 나누기 같은 계산 오류도 'Error...' 문자열로 반환하세요"
r = execute_tool("weather", {})
assert r == "Error: unknown tool weather", f"알 수 없는 도구 처리 결과가 다릅니다: {r!r}"
print("✅ 모든 테스트 통과!")
```

```python solution id=m2e1
import re

CALCULATOR_TOOL = {
    "name": "calculator",
    "description": "사칙연산 수식을 정확하게 계산합니다. 숫자 계산이 필요할 때 반드시 사용하세요.",
    "input_schema": {
        "type": "object",
        "properties": {
            "expression": {"type": "string", "description": "계산할 수식 (예: '(3 + 4) * 2')"}
        },
        "required": ["expression"],
    },
}

def execute_tool(name, tool_input):
    if name == "calculator":
        expr = tool_input.get("expression", "")
        if not re.fullmatch(r"[\d\s+\-*/().]+", expr):
            return "Error: 허용되지 않은 문자가 포함되어 있습니다"
        try:
            result = eval(expr, {"__builtins__": {}})
        except Exception as e:
            return f"Error: {e}"
        if isinstance(result, float) and result.is_integer():
            result = int(result)
        return str(result)
    return f"Error: unknown tool {name}"
```

### 실습 3-2. 병렬 도구 호출 결과 묶기

`handle_tool_calls(resp, execute)`를 완성하세요. 응답에 들어 있는 **모든** `tool_use` 블록을 `execute(name, input)`으로 실행하고, 결과를 담은 **하나의 user 메시지**를 반환합니다.

- 반환 형식은 `{"role": "user", "content": [tool_result 블록, ...]}`이며, tool_use 순서를 유지합니다.
- `execute`의 결과가 `"Error"`로 시작하면 해당 블록에 `"is_error": True`를 넣으세요. `tool_result(id, content, is_error=True)`를 쓰면 됩니다.

```hint id=m2e2
tool_calls(resp)로 tool_use 블록 목록을 얻고, 각 블록의 b["id"], b["name"], b["input"]을 사용하세요. 결과 문자열 r에 대해 r.startswith("Error")로 오류 여부를 판단합니다.
```

```python starter id=m2e2
from agentlab import tool_calls, tool_result

def handle_tool_calls(resp, execute):
    # TODO
    pass
```

```python test id=m2e2
fake_resp = {
    "content": [
        {"type": "text", "text": "두 가지를 확인할게요"},
        {"type": "tool_use", "id": "t1", "name": "calculator", "input": {"expression": "1+1"}},
        {"type": "tool_use", "id": "t2", "name": "nope", "input": {}},
    ],
    "stop_reason": "tool_use",
}
log = []
def fake_execute(name, tool_input):
    log.append(name)
    return "2" if name == "calculator" else f"Error: unknown tool {name}"

msg = handle_tool_calls(fake_resp, fake_execute)
assert isinstance(msg, dict) and msg.get("role") == "user", "role이 'user'인 메시지 dict를 반환하세요"
blocks = msg["content"]
assert len(blocks) == 2, f"tool_use 2개에 대해 tool_result 2개가 필요합니다 (현재 {len(blocks)}개)"
assert log == ["calculator", "nope"], "모든 도구를 순서대로 실행하세요"
assert blocks[0]["type"] == "tool_result" and blocks[0]["tool_use_id"] == "t1" and blocks[0]["content"] == "2", "첫 번째 tool_result가 올바르지 않습니다"
assert not blocks[0].get("is_error"), "성공한 결과에는 is_error를 넣지 마세요"
assert blocks[1]["tool_use_id"] == "t2" and blocks[1].get("is_error") is True, "오류 결과에는 is_error=True가 필요합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=m2e2
from agentlab import tool_calls, tool_result

def handle_tool_calls(resp, execute):
    results = []
    for call in tool_calls(resp):
        output = execute(call["name"], call["input"])
        results.append(tool_result(call["id"], output, is_error=str(output).startswith("Error")))
    return {"role": "user", "content": results}
```

### 실습 3-3. 실행 전에 도구 인자 검증하기

모델이 만든 인자를 실행 전에 검사하는 `validate_input(tool, args)`를 완성하세요. 문제가 없으면 빈 리스트, 있으면 **오류 메시지 문자열 리스트**를 반환합니다. 메시지는 모델이 읽고 고칠 수 있는 문장이어야 합니다.

- `tool["input_schema"]["required"]`에 있는데 `args`에 없는 인자 → `"missing: <이름>"`
- `properties`에 없는 인자가 들어오면 → `"unknown: <이름>"`
- 타입이 맞지 않으면 → `"type: <이름> must be <타입>"`. 타입 대응은 `string→str`, `integer→int`, `number→int 또는 float`, `boolean→bool`, `array→list`, `object→dict`입니다. **`bool`은 integer/number로 인정하지 마세요** (파이썬에서 `True`는 `int`이기도 합니다).
- `enum`이 있는데 값이 목록에 없으면 → `"enum: <이름> must be one of [...]"` (뒤의 목록 형식은 자유)
- 검사 순서: required를 먼저 모두 확인한 뒤, `args`의 키 순서대로 unknown → type → enum을 확인합니다.

```hint id=m2e3
TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}. 타입 검사 시 isinstance(v, bool) and expected in ("integer", "number")이면 실패로 처리하세요. 한 인자에서 type 오류가 나면 enum 검사는 건너뛰어도 됩니다.
```

```python starter id=m2e3
TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}

def validate_input(tool, args):
    errors = []
    # TODO
    return errors
```

```python test id=m2e3
TOOL = {"name": "search_orders", "description": "주문 검색", "input_schema": {
    "type": "object",
    "properties": {
        "customer": {"type": "string"},
        "limit": {"type": "integer"},
        "sort": {"type": "string", "enum": ["asc", "desc"]},
        "include_canceled": {"type": "boolean"},
    },
    "required": ["customer"],
}}
assert validate_input(TOOL, {"customer": "kim", "limit": 5, "sort": "desc"}) == [], "올바른 입력은 빈 리스트여야 합니다"
e = validate_input(TOOL, {"limit": 5})
assert e == ["missing: customer"], f"필수 인자 누락을 찾아야 합니다 (받은 값: {e})"
e = validate_input(TOOL, {"customer": "kim", "limit": "5"})
assert e == ["type: limit must be integer"], f"타입 오류 메시지가 다릅니다: {e}"
e = validate_input(TOOL, {"customer": "kim", "limit": True})
assert e == ["type: limit must be integer"], "bool은 integer로 인정하면 안 됩니다"
e = validate_input(TOOL, {"customer": "kim", "sort": "random"})
assert len(e) == 1 and e[0].startswith("enum: sort must be one of"), f"enum 위반을 찾아야 합니다: {e}"
e = validate_input(TOOL, {"customer": "kim", "color": "red"})
assert e == ["unknown: color"], f"정의되지 않은 인자를 찾아야 합니다: {e}"
e = validate_input(TOOL, {"include_canceled": "yes", "page": 2})
assert e == ["missing: customer", "type: include_canceled must be boolean", "unknown: page"], f"여러 오류를 순서대로 모두 반환하세요: {e}"
print("✅ 모든 테스트 통과!")
```

```python solution id=m2e3
TYPES = {"string": str, "integer": int, "number": (int, float), "boolean": bool, "array": list, "object": dict}

def validate_input(tool, args):
    schema = tool.get("input_schema", {})
    props = schema.get("properties", {})
    errors = [f"missing: {name}" for name in schema.get("required", []) if name not in args]
    for name, value in args.items():
        if name not in props:
            errors.append(f"unknown: {name}")
            continue
        spec = props[name]
        expected = spec.get("type")
        if expected in TYPES:
            bad_bool = isinstance(value, bool) and expected in ("integer", "number")
            if bad_bool or not isinstance(value, TYPES[expected]):
                errors.append(f"type: {name} must be {expected}")
                continue
        if "enum" in spec and value not in spec["enum"]:
            errors.append(f"enum: {name} must be one of {spec['enum']}")
    return errors
```

## 10. 더 읽어보기

- [Claude Tool Use 개요](https://docs.claude.com/en/docs/agents-and-tools/tool-use/overview)
- [Writing effective tools for agents (Anthropic)](https://www.anthropic.com/engineering/writing-tools-for-agents)

# 모듈 0. 에이전트 개발을 위한 Python

> **학습 목표**: 에이전트 코드에 매일 등장하는 Python 문법 다섯 가지를 익힙니다. dict와 JSON, 함수와 클래스, 컴프리헨션과 f-string, 예외 처리, async/await가 그 대상입니다. 이 모듈을 마치면 이후 모듈의 예제 코드를 막힘 없이 읽을 수 있습니다.

## 0. 왜 이 문법들이 중요한가

에이전트 코드를 뜯어 보면 결국 아래 다섯 가지의 조합입니다.

| 에이전트 구성 요소 | 실제 모습 | 필요한 Python 문법 |
|---|---|---|
| LLM 요청·응답 | `{"role": "user", "content": ...}` 같은 중첩 구조 | **dict / list / JSON** |
| 도구(Tool) | 이름으로 찾아 실행하는 Python 함수 | **함수, `**kwargs`, dict 레지스트리** |
| 상태 관리 | 대화 기록, 메모리, 설정 | **클래스** |
| 실패 대응 | 잘못된 JSON, 도구 오류, 네트워크 오류 | **예외 처리** |
| 여러 호출 동시 처리 | 병렬 도구 실행, 여러 문서 동시 요약 | **async / await, asyncio.gather** |

~~~text
 사용자 질문 ──▶ [dict로 messages 구성] ──▶ await chat(...)  ──▶ 응답 dict
                                                   │
                       tool_use 블록 ◀─────────────┘
                           │  name, input(dict)
                           ▼
                 TOOLS[name](**input)   ← 함수 레지스트리 + 예외 처리
                           │
                           ▼
                 tool_result(dict) ──▶ 다시 messages에 추가 (반복)
~~~

이미 Python에 익숙하다면 퀴즈와 실습만 빠르게 풀고 넘어가도 됩니다.

## 1. dict와 list: LLM API의 언어

LLM API의 요청과 응답은 모두 **중첩된 dict와 list**입니다. 모듈 1에서 볼 응답은 이런 모양입니다.

~~~python
resp = {
    "role": "assistant",
    "content": [
        {"type": "text", "text": "날씨를 조회할게요."},
        {"type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {"city": "서울"}},
    ],
    "stop_reason": "tool_use",
}
~~~

### 1-1. 중첩 접근과 안전한 접근

| 방법 | 예시 | 키가 없을 때 |
|---|---|---|
| 대괄호 | `resp["content"][1]["name"]` | `KeyError` 발생 |
| `.get()` | `resp.get("usage", {})` | 기본값 반환 |
| `.get()` 연쇄 | `resp.get("usage", {}).get("input_tokens", 0)` | 단계마다 기본값 |

**반드시 있어야 하는 값**에는 대괄호를 써서 문제가 생기면 바로 드러나게 하세요. **없을 수도 있는 값**에는 `.get()`을 씁니다. 예를 들어 `usage`나 선택 파라미터가 그렇습니다.

```python run id=py-d1
resp = {
    "role": "assistant",
    "content": [
        {"type": "text", "text": "날씨를 조회할게요."},
        {"type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {"city": "서울"}},
    ],
    "stop_reason": "tool_use",
}

# 1) 중첩 접근
print("두 번째 블록 이름:", resp["content"][1]["name"])
print("도시:", resp["content"][1]["input"]["city"])

# 2) 안전한 접근: usage가 없어도 오류가 나지 않습니다
print("입력 토큰:", resp.get("usage", {}).get("input_tokens", 0))

# 3) 리스트 순회 + 조건: tool_use 블록만 고르기
for block in resp["content"]:
    if block["type"] == "tool_use":
        print(f"도구 호출 → {block['name']}({block['input']})")
```

### 1-2. 리스트·딕셔너리 컴프리헨션

에이전트 코드에서 가장 자주 보는 한 줄 패턴입니다. **"블록 중에서 특정 타입만 골라내기"**에 씁니다.

~~~python
texts = [b["text"] for b in resp["content"] if b["type"] == "text"]       # list comprehension
by_name = {b["name"]: b["input"] for b in resp["content"] if b["type"] == "tool_use"}  # dict comprehension
answer = "".join(texts)
~~~

> 💡 `agentlab`의 `text_of(resp)`와 `tool_calls(resp)`도 내부에서 바로 이 컴프리헨션을 씁니다.

## 2. JSON: 문자열 ↔ dict 변환

API는 네트워크로 **문자열(JSON)**을 주고받고, Python 코드에서는 **dict**로 다룹니다.

| 함수 | 방향 | 자주 쓰는 옵션 |
|---|---|---|
| `json.dumps(obj)` | dict → 문자열 | `ensure_ascii=False`(한글 그대로), `indent=2`(보기 좋게) |
| `json.loads(text)` | 문자열 → dict | 잘못된 형식이면 `json.JSONDecodeError` |

`ensure_ascii=False`를 빼면 한글이 `서울`처럼 이스케이프됩니다. 동작은 같지만 사람이 읽기 어렵고 토큰도 더 씁니다.

```python run id=py-d2
import json

payload = {"name": "get_weather", "input": {"city": "서울", "unit": "celsius"}}

s1 = json.dumps(payload)
s2 = json.dumps(payload, ensure_ascii=False)
print("기본      :", s1)
print("한글 유지 :", s2)
print("보기 좋게 :\n" + json.dumps(payload, ensure_ascii=False, indent=2))

back = json.loads(s2)
print("다시 dict :", back["input"]["city"], type(back))

# 잘못된 JSON은 예외가 납니다. LLM이 만든 JSON은 항상 이 가능성을 고려하세요.
try:
    json.loads("{'city': '서울'}")   # 작은따옴표는 JSON이 아닙니다
except json.JSONDecodeError as e:
    print("파싱 실패:", e)
```

> ⚠️ JSON은 **큰따옴표만** 허용하고, `True`/`None`이 아니라 `true`/`null`을 씁니다. Python dict를 `str()`로 바꾼 문자열은 JSON이 아닙니다. 항상 `json.dumps`를 쓰세요.

## 3. 함수: 도구의 실체

에이전트의 "도구"는 결국 **Python 함수**입니다. 모델은 `{"name": "get_weather", "input": {"city": "서울"}}`처럼 요청하고, 우리 코드는 이를 실제 함수 호출로 바꿉니다.

### 3-1. 키워드 인자와 `**kwargs`

`input` dict를 함수에 그대로 풀어 넣을 때 `**`를 씁니다.

~~~python
def get_weather(city, unit="celsius"):
    return f"{city}: 맑음, 21도 ({unit})"

args = {"city": "부산"}
get_weather(**args)          # get_weather(city="부산")과 같음
~~~

| 문법 | 의미 | 에이전트에서의 쓰임 |
|---|---|---|
| `def f(a, b=1)` | 기본값이 있는 인자 | 선택 파라미터 |
| `f(**d)` | dict를 키워드 인자로 펼치기 | 도구 input 전달 |
| `def f(*args, **kwargs)` | 임의 개수의 인자 받기 | 래퍼, 로깅, 데코레이터 |

### 3-2. 함수도 값이다: 도구 레지스트리

Python 함수는 dict에 값으로 저장할 수 있습니다. 그래서 **이름 → 함수** 매핑만 있으면 `if/elif` 없이 도구를 실행할 수 있습니다.

```python run id=py-d3
def get_weather(city, unit="celsius"):
    return f"{city}: 맑음, 21도 ({unit})"

def add(a, b):
    return a + b

TOOLS = {"get_weather": get_weather, "add": add}   # 이름 → 함수

calls = [
    {"name": "get_weather", "input": {"city": "부산"}},
    {"name": "add", "input": {"a": 3, "b": 4}},
    {"name": "add", "input": {"a": 3}},            # 인자 누락 → TypeError
    {"name": "translate", "input": {}},            # 없는 도구
]
for c in calls:
    func = TOOLS.get(c["name"])
    if func is None:
        print(f"❌ 알 수 없는 도구: {c['name']}")
        continue
    try:
        print("✅", c["name"], "→", func(**c["input"]))
    except TypeError as e:
        print("❌ 인자 오류:", e)
```

> 실제 에이전트에서는 이 오류 메시지를 **모델에게 그대로 돌려줍니다**. 모델은 메시지를 읽고 인자를 고쳐 다시 호출합니다(모듈 3).

## 4. 클래스: 상태를 가진 객체

대화 기록, 메모리, 비용 집계처럼 **호출 사이에 유지되어야 하는 상태**는 클래스로 묶습니다.

~~~python
class UsageTracker:
    def __init__(self):            # 객체가 만들어질 때 한 번 실행
        self.input_tokens = 0
        self.output_tokens = 0

    def add(self, resp):           # self = 객체 자신
        u = resp.get("usage", {})
        self.input_tokens += u.get("input_tokens", 0)
        self.output_tokens += u.get("output_tokens", 0)

    @property
    def total(self):               # 메서드를 속성처럼 읽기: tracker.total
        return self.input_tokens + self.output_tokens
~~~

| 개념 | 설명 |
|---|---|
| `__init__` | 초기화 메서드. 속성(`self.x`)을 여기서 만듭니다 |
| `self` | 메서드가 호출된 객체 자신 |
| `@property` | 계산된 값을 속성처럼 노출 |
| `@dataclass` | 데이터만 담는 클래스를 짧게 정의 (`from dataclasses import dataclass`) |

## 5. f-string과 문자열 조립

프롬프트는 결국 문자열입니다. f-string으로 변수와 문서를 끼워 넣습니다.

~~~python
name, docs = "김철수", ["문서 A", "문서 B"]
prompt = f"""{name}님의 질문에 아래 문서만 근거로 답하세요.
<documents>
{chr(10).join(f"<doc>{d}</doc>" for d in docs)}
</documents>"""
~~~

- `f"{value!r}"`는 `repr`을 출력합니다. 따옴표까지 보여서 디버깅에 좋습니다.
- `f"{price:,}원"` → `1,200원`, `f"{ratio:.1%}"` → `12.5%`
- 여러 줄 문자열은 `"""..."""`로 씁니다. 리스트를 이어 붙일 때는 `"\n".join(...)`을 씁니다.

## 6. 예외 처리: 에이전트는 실패를 다루는 프로그램이다

LLM과 도구는 자주 실패합니다. JSON이 깨지기도 하고, 인자가 틀리기도 하고, 네트워크가 끊기기도 합니다. **실패를 잡아서 다음 행동으로 바꾸는 것**이 에이전트 코드의 핵심입니다.

~~~python
try:
    data = json.loads(text)
except json.JSONDecodeError as e:     # 특정 예외만 잡기
    data = None
else:                                  # 예외가 없을 때만 실행
    print("성공")
finally:                               # 항상 실행 (정리 작업)
    print("끝")
~~~

### 6-1. 직접 예외 일으키기와 사용자 정의 예외

```python run id=py-d4
class ToolInputError(ValueError):
    """도구 입력이 잘못되었을 때 쓰는 예외."""

def get_price(item, qty=1):
    if not isinstance(qty, int) or qty <= 0:
        raise ToolInputError(f"qty는 1 이상의 정수여야 합니다 (받은 값: {qty!r})")
    prices = {"사과": 1200, "배": 2500}
    if item not in prices:
        raise KeyError(f"등록되지 않은 상품: {item}")
    return prices[item] * qty

for args in [{"item": "사과", "qty": 3}, {"item": "배", "qty": 0}, {"item": "포도"}]:
    try:
        print("✅", args, "→", get_price(**args))
    except ToolInputError as e:          # 구체적인 예외를 먼저
        print("❌ 입력 오류:", e)
    except Exception as e:               # 나머지 모든 예외
        print(f"❌ {type(e).__name__}: {e}")
```

| 원칙 | 이유 |
|---|---|
| 구체적인 예외부터 잡는다 | `except Exception`이 먼저 오면 뒤의 처리가 실행되지 않습니다 |
| 예외를 삼키지 않는다 | `except: pass`는 버그를 숨깁니다. 최소한 메시지를 기록하세요 |
| 에이전트 루프는 죽이지 않는다 | 도구 오류는 `"Error: ..."` 문자열로 모델에게 돌려줍니다 |
| 메시지는 구체적으로 | "잘못됨"보다 "qty는 1 이상의 정수여야 합니다 (받은 값: 0)"가 모델의 자가 수정에 유리합니다 |

## 7. async / await: 기다리는 동안 다른 일 하기

LLM 호출은 수 초가 걸립니다. 그동안 CPU는 놀고 있습니다. **비동기(async)**는 "기다리는 동안 다른 작업을 진행"하게 해 줍니다.

### 7-1. 기본 개념

| 용어 | 의미 |
|---|---|
| `async def f()` | 코루틴 함수. 호출하면 바로 실행되지 않고 **코루틴 객체**를 돌려줍니다 |
| `await x` | x가 끝날 때까지 기다리고 결과를 받습니다. 기다리는 동안 다른 코루틴이 실행됩니다 |
| `asyncio.sleep(s)` | 비동기 대기 (`time.sleep`은 전체를 멈추므로 쓰면 안 됩니다) |
| `asyncio.gather(a, b, c)` | 여러 코루틴을 **동시에** 실행하고 결과를 **순서대로** 리스트로 반환 |
| `asyncio.Semaphore(n)` | 동시에 실행되는 개수를 n개로 제한 (API 속도 제한 대응) |

> 💡 이 사이트에서는 코드 최상단에서 바로 `await`를 쓸 수 있습니다. 일반 Python 스크립트에서는 `asyncio.run(main())`으로 감싸야 합니다.

~~~text
 순차 실행 (await 3번)            gather (동시 실행)
 ├─ 호출A ──── 1s                 ├─ 호출A ──── 1s
 │            ├─ 호출B ── 1s      ├─ 호출B ──── 1s
 │            │          ├─ C 1s  ├─ 호출C ──── 1s
 총 ≈ 3초                         총 ≈ 1초
~~~

```python run id=py-d5
import asyncio, time

async def fake_llm(name, seconds):
    await asyncio.sleep(seconds)        # 네트워크 대기를 흉내 냅니다
    return f"{name} 완료"

t = time.time()
r1 = await fake_llm("A", 0.3)
r2 = await fake_llm("B", 0.3)
r3 = await fake_llm("C", 0.3)
print("순차:", [r1, r2, r3], f"{time.time() - t:.2f}초")

t = time.time()
results = await asyncio.gather(fake_llm("A", 0.3), fake_llm("B", 0.3), fake_llm("C", 0.3))
print("동시:", results, f"{time.time() - t:.2f}초")
```

### 7-2. Semaphore로 동시 실행 수 제한하기

문서 100개를 한꺼번에 `gather`하면 API 속도 제한(rate limit)에 걸립니다. `Semaphore`는 "입장권 n장"처럼 동작합니다.

```python run id=py-d6
import asyncio

sem = asyncio.Semaphore(2)     # 동시에 2개까지만
running = 0

async def job(i):
    global running
    async with sem:            # 입장권을 얻을 때까지 대기 → 블록이 끝나면 반납
        running += 1
        print(f"작업 {i} 시작 (동시 실행 {running}개)")
        await asyncio.sleep(0.1)
        running -= 1
        return i * 10

print(await asyncio.gather(*[job(i) for i in range(5)]))
```

> `gather(*[...])`의 `*`는 리스트를 개별 인자로 펼칩니다. `**`가 dict를 펼치는 것과 짝을 이룹니다.

### 7-3. 실제 LLM 호출도 같은 방식

`agentlab.chat()`도 코루틴이므로 `gather`로 여러 질문을 동시에 보낼 수 있습니다.

```python run id=py-d7
import asyncio
from agentlab import chat, text_of

questions = ["에이전트란?", "도구 호출이란?", "RAG란?"]
resps = await asyncio.gather(*[chat([{"role": "user", "content": q}]) for q in questions])
for q, r in zip(questions, resps):
    print(f"Q. {q}\nA. {text_of(r)[:60]}\n")
```

## 8. 자주 하는 실수

| 실수 | 증상 | 해결 |
|---|---|---|
| `await`를 빠뜨림 | `<coroutine object ...>`가 출력되거나 `'coroutine' object is not subscriptable` | 코루틴 호출 앞에 `await` |
| `time.sleep` 사용 | gather가 순차 실행처럼 느려짐 | `await asyncio.sleep` |
| `str(dict)`를 JSON으로 착각 | 작은따옴표, `True`/`None` 때문에 파싱 실패 | `json.dumps` |
| 가변 기본값 `def f(x=[])` | 호출 사이에 리스트가 공유됨 | `def f(x=None): x = x or []` |
| `except: pass` | 오류가 조용히 사라져 디버깅 불가 | 구체적 예외 + 메시지 기록 |
| `resp["content"]`를 문자열로 가정 | `TypeError` | content는 **블록 리스트**입니다 |

## 9. 실무 팁

- **타입 힌트**(`def f(city: str) -> str:`)를 쓰면 에디터 자동완성이 좋아지고, 도구 스키마를 자동 생성하는 라이브러리(Pydantic 등)와 궁합이 좋습니다.
- **로그는 JSON 한 줄로**: `print(json.dumps(event, ensure_ascii=False))` 형식은 나중에 검색하고 집계하기 쉽습니다.
- **비동기 오류 처리**: `asyncio.gather(..., return_exceptions=True)`를 쓰면 하나가 실패해도 나머지 결과를 받을 수 있습니다. 결과 중 `Exception` 인스턴스를 골라 처리하세요.

## 10. 확인 퀴즈

```quiz id=py-q1
{"q": "도구 입력 dict args = {'city': '서울'}를 함수 get_weather(city)에 전달하는 올바른 방법은?", "options": ["get_weather(args)", "get_weather(*args)", "get_weather(**args)", "get_weather(json.dumps(args))"], "answer": 2, "explain": "**는 dict를 키워드 인자로 펼칩니다. get_weather(**args)는 get_weather(city='서울')과 같습니다."}
```

```quiz id=py-q2
{"q": "json.dumps(data, ensure_ascii=False)에서 ensure_ascii=False의 효과는?", "options": ["JSON 형식 검사를 생략한다", "한글 등 비ASCII 문자를 \\uXXXX로 바꾸지 않고 그대로 둔다", "들여쓰기를 추가한다", "dict 키를 정렬한다"], "answer": 1, "explain": "기본값(True)이면 한글이 유니코드 이스케이프로 바뀝니다. False로 두면 사람이 읽기 쉽고 토큰도 절약됩니다."}
```

```quiz id=py-q3
{"q": "각각 1초 걸리는 코루틴 3개를 asyncio.gather로 실행하면 총 소요 시간은 대략?", "options": ["약 1초", "약 3초", "약 0초", "약 6초"], "answer": 0, "explain": "gather는 코루틴을 동시에 실행합니다. 대기 시간이 겹치므로 가장 긴 작업 시간(약 1초)만큼 걸립니다."}
```

```quiz id=py-q4
{"q": "에이전트 루프에서 도구 함수가 예외를 일으켰을 때 가장 바람직한 처리는?", "options": ["예외를 그대로 두어 프로그램을 종료한다", "except: pass로 조용히 무시한다", "예외를 잡아 오류 메시지를 도구 결과로 모델에게 돌려준다", "같은 도구를 무한히 재시도한다"], "answer": 2, "explain": "오류 내용을 모델에게 알려 주면 모델이 인자를 고치거나 다른 방법을 시도할 수 있습니다. 루프 전체를 죽이지 않는 것이 핵심입니다."}
```

## 11. 실습

### 실습 0-1. 모델이 만든 도구 호출 JSON 파싱하기

LLM이 문자열로 돌려준 도구 호출을 안전하게 dict로 바꾸는 `parse_tool_call(raw)`를 완성하세요.

- `raw`를 `json.loads`로 파싱합니다. 형식이 잘못되었으면 `ValueError("JSON 형식 오류: ...")`를 일으킵니다. `json.JSONDecodeError`를 잡아 `ValueError`로 바꿔서 다시 일으키세요.
- 파싱 결과가 dict가 아니거나 `"name"` 키가 없거나 name이 빈 문자열이면 `ValueError`를 일으킵니다.
- `"input"`이 없으면 빈 dict `{}`를 기본값으로 씁니다. 있는데 dict가 아니면 `ValueError`를 일으킵니다.
- `{"name": ..., "input": ...}` 두 키만 가진 **새 dict**를 반환합니다.

```hint id=py-e1
try: data = json.loads(raw) / except json.JSONDecodeError as e: raise ValueError(f"JSON 형식 오류: {e}") 형태로 감싸세요. 기본값은 data.get("input", {})로 얻을 수 있고, isinstance(x, dict)로 타입을 검사합니다.
```

```python starter id=py-e1
import json

def parse_tool_call(raw):
    # TODO: 1) json.loads (실패 시 ValueError)  2) name 검사  3) input 기본값/타입 검사  4) 새 dict 반환
    pass

# 직접 실행해 보기:
# print(parse_tool_call('{"name": "get_weather", "input": {"city": "서울"}}'))
```

```python test id=py-e1
r = parse_tool_call('{"name": "get_weather", "input": {"city": "서울"}, "extra": 1}')
assert r == {"name": "get_weather", "input": {"city": "서울"}}, f"name과 input만 담은 dict를 반환하세요 (받은 값: {r!r})"

r = parse_tool_call('{"name": "now"}')
assert r == {"name": "now", "input": {}}, f"input이 없으면 빈 dict를 기본값으로 쓰세요 (받은 값: {r!r})"

def expect_error(raw, why):
    try:
        parse_tool_call(raw)
    except ValueError:
        return
    except Exception as e:
        raise AssertionError(f"{why}: ValueError가 아니라 {type(e).__name__}가 발생했습니다")
    raise AssertionError(f"{why}: ValueError를 일으켜야 합니다")

expect_error("{'name': 'x'}", "작은따옴표 JSON(형식 오류)")
expect_error('{"input": {}}', "name이 없는 경우")
expect_error('{"name": ""}', "name이 빈 문자열인 경우")
expect_error('["get_weather"]', "dict가 아닌 JSON")
expect_error('{"name": "x", "input": "서울"}', "input이 dict가 아닌 경우")
print("✅ 모든 테스트 통과!")
```

```python solution id=py-e1
import json

def parse_tool_call(raw):
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"JSON 형식 오류: {e}")
    if not isinstance(data, dict) or not data.get("name"):
        raise ValueError("name이 있는 JSON 객체여야 합니다")
    tool_input = data.get("input", {})
    if not isinstance(tool_input, dict):
        raise ValueError("input은 객체(dict)여야 합니다")
    return {"name": data["name"], "input": tool_input}
```

### 실습 0-2. 오류에 강한 도구 레지스트리

이름으로 도구를 등록하고 실행하는 `ToolRegistry` 클래스를 완성하세요. 모듈 3~4의 에이전트 루프에서 그대로 쓸 수 있는 구조입니다.

- `__init__`: 빈 dict `self.tools`를 만듭니다.
- `register(self, name, func)`: `self.tools[name] = func`로 등록합니다.
- `names(self)`: 등록된 도구 이름 리스트를 **정렬해서** 반환합니다.
- `run(self, name, args)`: 항상 **문자열**을 반환하고, 절대 예외를 밖으로 내보내지 않습니다.
  - 없는 도구 → `"Error: unknown tool {name}"`
  - 정상 실행 → `str(func(**args))`
  - 실행 중 예외 → `"Error: {예외 메시지}"`

```hint id=py-e2
run 안에서 func = self.tools.get(name)으로 찾고, None이면 바로 오류 문자열을 반환하세요. 실행은 try: return str(func(**args)) / except Exception as e: return f"Error: {e}" 형태입니다.
```

```python starter id=py-e2
class ToolRegistry:
    def __init__(self):
        # TODO
        pass

    def register(self, name, func):
        # TODO
        pass

    def names(self):
        # TODO: 정렬된 이름 리스트
        pass

    def run(self, name, args):
        # TODO: 항상 문자열 반환, 예외를 밖으로 내보내지 않기
        pass
```

```python test id=py-e2
reg = ToolRegistry()
assert reg.tools == {}, "__init__에서 self.tools를 빈 dict로 만드세요"

def add(a, b):
    return a + b

def divide(a, b):
    return a / b

reg.register("divide", divide)
reg.register("add", add)
assert reg.names() == ["add", "divide"], f"names()는 정렬된 리스트여야 합니다 (받은 값: {reg.names()!r})"

r = reg.run("add", {"a": 2, "b": 3})
assert r == "5", f"정상 결과는 str로 변환해 반환하세요 (받은 값: {r!r})"

r = reg.run("translate", {})
assert r == "Error: unknown tool translate", f"없는 도구 메시지가 다릅니다: {r!r}"

r = reg.run("divide", {"a": 1, "b": 0})
assert isinstance(r, str) and r.startswith("Error:") and "division" in r, f"예외는 'Error: 메시지' 문자열로 반환하세요 (받은 값: {r!r})"

r = reg.run("add", {"a": 1})
assert isinstance(r, str) and r.startswith("Error:"), f"인자 누락(TypeError)도 오류 문자열로 반환하세요 (받은 값: {r!r})"
print("✅ 모든 테스트 통과!")
```

```python solution id=py-e2
class ToolRegistry:
    def __init__(self):
        self.tools = {}

    def register(self, name, func):
        self.tools[name] = func

    def names(self):
        return sorted(self.tools)

    def run(self, name, args):
        func = self.tools.get(name)
        if func is None:
            return f"Error: unknown tool {name}"
        try:
            return str(func(**args))
        except Exception as e:
            return f"Error: {e}"
```

### 실습 0-3. 동시 실행 수를 제한하는 run_all

여러 비동기 작업을 동시에 실행하되, 동시에 `limit`개까지만 돌게 하는 `run_all(jobs, limit)`을 완성하세요.

- `jobs`는 **인자 없는 async 함수**들의 리스트입니다. `await job()`으로 실행합니다.
- `asyncio.Semaphore(limit)`로 동시 실행 수를 제한합니다.
- `asyncio.gather`로 모두 실행하고, 결과를 **jobs와 같은 순서**의 리스트로 반환합니다.

```hint id=py-e3
sem = asyncio.Semaphore(limit)를 만들고, 내부 함수 async def guarded(job): async with sem: return await job() 을 정의하세요. 마지막에 return await asyncio.gather(*[guarded(j) for j in jobs]) 입니다.
```

```python starter id=py-e3
import asyncio

async def run_all(jobs, limit):
    # TODO: Semaphore로 동시 실행 수를 제한하며 gather로 실행
    pass
```

```python test id=py-e3
import asyncio, time

state = {"now": 0, "peak": 0}

def make_job(i, delay):
    async def job():
        state["now"] += 1
        state["peak"] = max(state["peak"], state["now"])
        await asyncio.sleep(delay)
        state["now"] -= 1
        return f"결과{i}"
    return job

# 뒤쪽 작업이 더 빨리 끝나도 결과는 입력 순서여야 합니다
jobs = [make_job(i, d) for i, d in enumerate([0.12, 0.06, 0.03, 0.09, 0.03, 0.06])]
t = time.time()
results = await run_all(jobs, 2)
elapsed = time.time() - t

assert results == [f"결과{i}" for i in range(6)], f"결과는 jobs 순서대로 반환하세요 (받은 값: {results!r})"
assert state["peak"] <= 2, f"동시 실행이 limit(2)를 넘었습니다: 최대 {state['peak']}개"
assert state["peak"] == 2, f"limit까지는 동시에 실행되어야 합니다 (최대 동시 실행 {state['peak']}개)"
assert elapsed < 0.36, f"동시 실행이 되지 않는 것 같습니다 ({elapsed:.2f}초, 순차 실행 시 0.39초)"

state["peak"] = 0
results = await run_all([make_job(i, 0.02) for i in range(4)], 10)
assert state["peak"] == 4 and len(results) == 4, "limit이 작업 수보다 크면 모두 동시에 실행되어야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=py-e3
import asyncio

async def run_all(jobs, limit):
    sem = asyncio.Semaphore(limit)

    async def guarded(job):
        async with sem:
            return await job()

    return await asyncio.gather(*[guarded(j) for j in jobs])
```

## 12. 더 읽어보기

- [Python 공식 튜토리얼 (한국어)](https://docs.python.org/ko/3/tutorial/index.html)
- [json 모듈 문서](https://docs.python.org/ko/3/library/json.html)
- [asyncio: 코루틴과 태스크](https://docs.python.org/ko/3/library/asyncio-task.html)
- [예외 처리 튜토리얼](https://docs.python.org/ko/3/tutorial/errors.html)

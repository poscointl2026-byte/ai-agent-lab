# 모듈 5. Memory와 컨텍스트 관리

> **학습 목표**: 단기 기억과 장기 기억의 차이를 이해하고, 컨텍스트 윈도우를 넘지 않도록 대화 기록을 관리하는 방법과 간단한 검색 기반 기억을 구현합니다.

## 1. 에이전트의 기억은 두 종류

| 구분 | 저장 위치 | 예시 | 한계 |
|---|---|---|---|
| **단기 기억** | 현재 `messages`(컨텍스트) | 방금 나눈 대화, 직전 도구 결과 | 컨텍스트 윈도우 크기, 토큰 비용 |
| **장기 기억** | 외부 저장소 (파일, DB, 벡터 DB) | 사용자 선호, 과거 프로젝트 기록, 문서 | 필요할 때 **찾아와야** 함 |

모델은 오직 **컨텍스트에 들어온 것만** 압니다. 그래서 "기억"은 결국 **무엇을 컨텍스트에 넣을지 고르는 문제**입니다. 최근에는 이를 **Context Engineering**이라고 부릅니다.

### 왜 "그냥 다 넣으면" 안 될까?

컨텍스트 윈도우가 수십만 토큰까지 커졌는데도 기억 관리가 필요한 이유는 세 가지입니다.

1. **비용과 속도**: LLM API는 stateless라서 매 호출마다 지금까지의 기록을 **전부 다시** 보냅니다(모듈 1). 대화가 50턴이면 50번째 호출은 앞의 49턴을 모두 다시 읽습니다. 기록이 길수록 호출당 입력 토큰이 늘고, 루프 전체 비용은 대략 **턴 수의 제곱**에 가깝게 커집니다.
2. **주의력 분산**: 컨텍스트에 관련 없는 정보가 많을수록 모델이 중요한 정보를 놓치기 쉽습니다. 긴 컨텍스트의 중간에 묻힌 정보는 특히 잘 활용되지 않는 경향이 보고되어 왔습니다.
3. **하드 리밋**: 아무리 커도 상한은 있습니다. 상한을 넘으면 요청 자체가 실패합니다.

에이전트의 한 번의 호출에 들어가는 컨텍스트는 보통 이렇게 구성됩니다.

~~~text
┌──────────────────────── 한 번의 LLM 호출 컨텍스트 ────────────────────────┐
│ system     : 역할·규칙·도구 사용 지침                (거의 고정)          │
│ tools      : 도구 정의(JSON 스키마)                 (거의 고정)          │
│ 장기 기억  : 검색해 온 사용자 선호·문서 조각           (질문마다 바뀜)      │
│ 요약       : 오래된 대화의 압축본                    (가끔 갱신)          │
│ 최근 대화  : 최근 N턴의 user/assistant/tool 메시지     (매 턴 늘어남)       │
│ 현재 질문  : 지금 사용자 입력                                            │
└──────────────────────────────────────────────────────────────────────────┘
       ▲ 이 상자를 "가장 유용한 정보로, 가장 적게" 채우는 것이 Context Engineering
~~~

## 2. 컨텍스트가 길어질 때의 전략

1. **슬라이딩 윈도우**: 오래된 메시지를 잘라내고 최근 N개만 유지합니다. 가장 단순합니다.
2. **요약(Compaction)**: 오래된 대화를 LLM으로 요약해 짧은 메시지 하나로 바꿉니다. Claude API에는 서버가 자동으로 요약하는 compaction 기능도 있습니다.
3. **도구 결과 정리(Context editing)**: 이미 처리한 큰 도구 결과(파일 내용, 검색 결과)를 지웁니다.
4. **검색(RAG)**: 장기 기억에서 지금 질문과 관련 있는 것만 찾아 넣습니다(모듈 6에서 자세히 다룹니다).
5. **메모 도구**: 에이전트가 스스로 메모 파일에 쓰고 나중에 읽게 합니다.

각 전략은 장단점이 뚜렷해서 실무에서는 **섞어서** 씁니다.

| 전략 | 장점 | 단점 | 잘 맞는 상황 |
|---|---|---|---|
| 슬라이딩 윈도우 | 구현이 쉽고 추가 비용이 없음 | 오래된 핵심 정보(이름, 목표)가 통째로 사라짐 | 짧은 잡담형 챗봇 |
| 요약 | 긴 흐름의 핵심을 유지 | 요약 호출 비용, 세부 정보 손실, 요약 오류가 누적될 수 있음 | 긴 상담, 장시간 작업 에이전트 |
| 도구 결과 정리 | 가장 큰 토큰 덩어리를 효과적으로 제거 | 나중에 그 결과가 다시 필요하면 재조회해야 함 | 파일·검색 결과를 많이 읽는 에이전트 |
| 검색(RAG) | 아주 큰 지식도 필요한 만큼만 사용 | 검색 품질에 답변 품질이 좌우됨 | 문서 Q&A, 개인화 |
| 메모 도구 | 에이전트가 중요하다고 판단한 것만 남김 | 모델이 메모를 잘 쓰도록 지침이 필요함 | 여러 세션에 걸친 장기 작업 |

> 💡 **경험칙**: 도구 결과는 대화 텍스트보다 훨씬 큽니다(파일 하나가 수천 토큰). 에이전트의 컨텍스트가 빨리 차는 원인의 대부분은 **오래된 도구 결과**입니다. 그래서 가장 먼저 손댈 곳도 여기입니다.

### 요약(Compaction) 흐름 한눈에 보기

~~~text
[압축 전]  U1 A1 U2 A2 U3 A3 U4 A4 U5 A5 U6 A6          (12개, 토큰 많음)
              └──────── 오래된 부분 ────────┘ └ 최근 ┘
                         │ LLM에 "요약해줘"
                         ▼
[압축 후]  U("[이전 대화 요약] 사용자는 포항 거주, 파이썬 선호, 사내 챗봇 개발 중…")
           U5 A5 U6 A6                                   (5개, 토큰 적음)
~~~

요약을 **user 메시지**로 넣는 이유는 `messages`가 user로 시작해야 하기 때문입니다. 요약 메시지 다음에 오는 최근 구간도 일반 user 메시지로 시작해야 하는데, 이 규칙은 아래 3장에서 다룹니다.

```python run id=m4d2
from agentlab import chat, text_of

history = [
    {"role": "user", "content": "안녕, 나는 포항에 사는 개발자야."},
    {"role": "assistant", "content": "반갑습니다! 무엇을 도와드릴까요?"},
    {"role": "user", "content": "파이썬으로 사내 챗봇을 만들고 있어."},
    {"role": "assistant", "content": "좋네요. 어떤 기능이 필요하신가요?"},
    {"role": "user", "content": "휴가 규정 질문에 답하게 하고 싶어."},
    {"role": "assistant", "content": "규정 문서를 검색하는 도구를 붙이면 됩니다."},
]

old, recent = history[:4], history[4:]
transcript = "\n".join(f"{m['role']}: {m['content']}" for m in old)
resp = await chat(
    [{"role": "user", "content": f"다음 대화에서 앞으로도 기억해야 할 사실만 3줄 이내로 요약해줘.\n\n{transcript}"}],
    system="너는 대화 기록을 압축하는 요약기야. 사실만 간결하게 적어.",
)
summary = text_of(resp)
compacted = [{"role": "user", "content": f"[이전 대화 요약]\n{summary}"},
             {"role": "assistant", "content": "네, 이전 내용을 기억하고 이어가겠습니다."}] + recent

print(f"압축 전 {len(history)}개 → 압축 후 {len(compacted)}개 메시지")
for m in compacted:
    print(f"- {m['role']}: {m['content'][:60]}")
```

> 요약 바로 뒤에 짧은 assistant 응답을 넣은 이유는 user/assistant가 번갈아 나오게 맞추기 위해서입니다. 요약을 system 프롬프트 끝에 붙이는 방법도 자주 씁니다.

## 3. 잘라낼 때 지켜야 할 규칙

메시지를 단순히 뒤에서 N개만 남기면 API 오류가 날 수 있습니다.

- `messages`는 **user 메시지로 시작**해야 합니다.
- `tool_result`는 직전 assistant 메시지의 `tool_use`와 **짝**이 맞아야 합니다. 짝인 `tool_use`가 잘려 나간 `tool_result`만 남으면 오류가 납니다.

따라서 잘라낸 결과의 첫 메시지는 **tool_result가 아닌 일반 user 메시지**여야 합니다.

### 단계별로 따라가 보기

도구를 쓰는 대화 8개를 최근 6개로 줄이는 경우를 봅시다.

~~~text
 index:  0       1          2           3      4       5          6           7
        U(q1)  A[tool_use] U[tool_res] A(a1)  U(q2)  A[tool_use] U[tool_res] A(a2)

① start = 8 - 6 = 2  → messages[2]는 tool_result  ✗ (짝인 tool_use(1번)가 잘려 나감)
② start = 3          → assistant                 ✗ (user로 시작해야 함)
③ start = 4          → 일반 user 메시지 U(q2)     ✓ → 결과: 4~7번, 4개
~~~

결과가 6개가 아니라 4개가 되었습니다. **안전을 위해 조금 더 잘라내는 것**이 정상입니다. 한 "턴"(질문 → 도구 호출들 → 답변)을 쪼개지 않고 **턴 단위로 자른다**고 생각하면 이해하기 쉽습니다.

## 4. 장기 기억: 검색 기반 메모리

실무에서는 임베딩과 벡터 DB로 의미가 비슷한 문서를 찾습니다. 원리는 같으니 여기서는 **키워드 겹침 점수**로 가장 단순한 버전을 만들어 봅니다.

```python run id=m4d1
notes = [
    "사용자는 파이썬을 선호하고 자바는 잘 모른다",
    "사용자의 회사는 포항에 있다",
    "사용자는 LangGraph로 사내 챗봇을 만들고 있다",
]

def score(query, text):
    q = set(query.lower().split())
    return len(q & set(text.lower().split()))

query = "사용자는 어떤 언어를 선호하나"
ranked = sorted(notes, key=lambda n: score(query, n), reverse=True)
for n in ranked:
    print(score(query, n), n)
```

> 한국어는 조사 때문에 공백 기준 단어가 잘 겹치지 않습니다("선호하고" vs "선호하나"). 그래서 실제로는 형태소 분석이나 **임베딩 유사도**를 씁니다.

### 장기 기억의 생애 주기: 쓰기 → 저장 → 읽기

~~~text
 대화 중 ──▶ [쓰기 정책] 무엇을 기억할까? ──▶ [저장소] 텍스트 + 메타데이터(시간, 출처, 중요도)
                                                        │
 새 질문 ──▶ [읽기 정책] 무엇을 꺼낼까? ◀── 검색(키워드/임베딩) ─┘
                │
                ▼
          컨텍스트에 "관련 기억" 블록으로 삽입 → LLM 호출
~~~

- **쓰기 정책**: 모든 문장을 저장하면 쓰레기가 쌓입니다. "사용자가 명시한 선호", "확정된 결정", "반복해서 필요한 사실"처럼 **오래 유효한 정보**만 저장합니다. LLM에게 "이 대화에서 장기적으로 기억할 사실을 추출해"라고 시키는 방식이 흔합니다.
- **읽기 정책**: 질문과의 관련도만이 아니라 **최신성**(최근 기억 우선)과 **중요도**를 섞어 점수를 매기기도 합니다. Generative Agents 논문의 메모리 스트림이 대표적인 예입니다.
- **삽입 방식**: 꺼낸 기억은 `<memory>...</memory>` 같은 태그로 감싸 "참고 정보"임을 분명히 합니다. 모델이 기억을 사용자의 새 지시로 착각하지 않게 하기 위해서입니다.

## 5. 확인 퀴즈

```quiz id=m4q1
{"q": "에이전트의 '장기 기억'을 활용하는 가장 일반적인 방식은?", "options": ["모든 과거 대화를 매번 컨텍스트에 넣는다", "외부 저장소에 보관하고, 현재 질문과 관련된 것만 검색해 컨텍스트에 넣는다", "모델을 매일 재학습시킨다", "system 프롬프트를 계속 길게 늘린다"], "answer": 1, "explain": "컨텍스트에는 한계가 있으므로 저장은 외부에 하고 필요할 때 관련 정보만 검색해서 넣습니다(RAG, 메모리 도구)."}
```

```quiz id=m4q2
{"q": "대화 기록을 잘라낸 결과가 tool_result 메시지로 시작하면 생기는 문제는?", "options": ["문제없다", "대응하는 tool_use가 없어 API 오류가 발생한다", "응답 속도만 느려진다", "모델이 도구를 다시 실행한다"], "answer": 1, "explain": "tool_result는 직전 assistant의 tool_use와 짝이 맞아야 합니다. 짝 없는 tool_result는 잘못된 요청입니다."}
```

```quiz id=m4q3
{"q": "Context Engineering의 핵심 질문으로 가장 적절한 것은?", "options": ["어떤 GPU를 쓸 것인가", "매 호출마다 어떤 정보를 컨텍스트에 넣고 무엇을 뺄 것인가", "모델 파라미터 수를 얼마로 할 것인가", "API 키를 어디에 저장할 것인가"], "answer": 1, "explain": "제한된 컨텍스트에 가장 유용한 정보를 담는 것이 에이전트 성능의 핵심입니다."}
```

```quiz id=m4q4
{"q": "파일을 많이 읽는 코딩 에이전트의 컨텍스트가 빠르게 차고 있습니다. 가장 먼저 시도할 만한 조치는?", "options": ["system 프롬프트를 더 길고 자세하게 쓴다", "이미 처리한 오래된 도구 결과(파일 내용)를 정리하거나 요약한다", "사용자의 최근 질문을 지운다", "도구 정의를 모두 제거한다"], "answer": 1, "explain": "도구 결과는 대화 텍스트보다 훨씬 큽니다. 이미 활용한 오래된 도구 결과를 지우거나 요약하는 것이 가장 효과적입니다. 필요하면 다시 조회하면 됩니다."}
```

## 6. 실습

### 실습 5-1. 안전하게 대화 기록 자르기

`trim_history(messages, max_messages)`를 완성하세요.

- 결과의 길이는 `max_messages` 이하입니다.
- 가능한 한 **최근** 메시지를 남깁니다.
- 결과의 첫 메시지는 **일반 user 메시지**여야 합니다. content가 문자열이거나, 블록 리스트 안에 `tool_result`가 없어야 합니다.
- 조건을 만족하는 시작점이 없으면 빈 리스트를 반환합니다.
- 원본 리스트는 수정하지 마세요.

```hint id=m4e1
시작 인덱스 start = max(0, len(messages) - max_messages)에서 출발해, messages[start]가 '일반 user 메시지'가 될 때까지 start를 1씩 늘리세요. 판단 함수를 하나 따로 만들면 깔끔합니다: role == "user"이고, content가 str이거나 블록들 중 type == "tool_result"가 없으면 True입니다.
```

```python starter id=m4e1
def is_plain_user(msg):
    # TODO: 일반 user 메시지인지 판단
    pass

def trim_history(messages, max_messages):
    # TODO
    pass
```

```python test id=m4e1
def U(t): return {"role": "user", "content": t}
def A(t): return {"role": "assistant", "content": [{"type": "text", "text": t}]}
def TU(i): return {"role": "assistant", "content": [{"type": "tool_use", "id": i, "name": "x", "input": {}}]}
def TR(i): return {"role": "user", "content": [{"type": "tool_result", "tool_use_id": i, "content": "ok"}]}
def UB(t): return {"role": "user", "content": [{"type": "text", "text": t}]}

h = [U("q1"), A("a1"), U("q2"), A("a2"), U("q3"), A("a3")]
r = trim_history(h, 4)
assert r == [U("q2"), A("a2"), U("q3"), A("a3")], "단순한 경우 최근 4개를 남겨야 합니다"
assert len(h) == 6, "원본 리스트를 수정하면 안 됩니다"

r = trim_history(h, 3)
assert r == [U("q3"), A("a3")], f"assistant로 시작하면 안 됩니다. 결과: {[m['role'] for m in r]}"

h2 = [U("q1"), TU("t1"), TR("t1"), A("a1"), UB("q2"), TU("t2"), TR("t2"), A("a2")]
r = trim_history(h2, 6)
assert r == [UB("q2"), TU("t2"), TR("t2"), A("a2")], "tool_result로 시작하지 않도록 일반 user 메시지까지 건너뛰세요"

r = trim_history(h2, 100)
assert r == h2, "max_messages가 충분히 크면 전체를 유지하세요"

r = trim_history([TU("x"), TR("x")], 2)
assert r == [], "일반 user 메시지가 없으면 빈 리스트를 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=m4e1
def is_plain_user(msg):
    if msg["role"] != "user":
        return False
    content = msg["content"]
    if isinstance(content, str):
        return True
    return not any(b.get("type") == "tool_result" for b in content)

def trim_history(messages, max_messages):
    start = max(0, len(messages) - max_messages)
    while start < len(messages) and not is_plain_user(messages[start]):
        start += 1
    return list(messages[start:])
```

### 실습 5-2. 키워드 기반 장기 기억

`KeywordMemory` 클래스를 완성하세요.

- `add(text)`: 기억을 저장합니다.
- `search(query, k=2)`: 공백 기준 단어(소문자) 집합의 **겹치는 개수**를 점수로 계산합니다. 점수가 0보다 큰 기억 중 **점수가 높은 순서로** 최대 `k`개의 텍스트를 리스트로 반환합니다. 점수가 같으면 **먼저 저장된 것**이 앞에 옵니다.

```hint id=m4e2
파이썬의 sorted는 안정 정렬이라, 저장 순서대로 리스트를 만든 뒤 key=점수, reverse=True로 정렬해도 동점일 때 원래 순서가 유지됩니다. 점수 0인 항목은 먼저 걸러내세요.
```

```python starter id=m4e2
class KeywordMemory:
    def __init__(self):
        self.items = []

    def add(self, text):
        # TODO
        pass

    def search(self, query, k=2):
        # TODO
        pass
```

```python test id=m4e2
m = KeywordMemory()
m.add("Python 은 사용자가 좋아하는 언어")
m.add("사용자 회사 위치 포항")
m.add("사용자 좋아하는 음식 은 김치찌개")
m.add("Java 는 잘 모름")

r = m.search("사용자 가 좋아하는 언어 는", k=2)
assert r == ["Python 은 사용자가 좋아하는 언어", "사용자 좋아하는 음식 은 김치찌개"], f"검색 결과가 다릅니다: {r}"

r = m.search("python", k=5)
assert r == ["Python 은 사용자가 좋아하는 언어"], f"대소문자를 무시하고, 점수 0은 제외해야 합니다: {r}"

r = m.search("사용자", k=5)
assert r == ["사용자 회사 위치 포항", "사용자 좋아하는 음식 은 김치찌개"], f"동점이면 먼저 저장된 순서를 유지하세요: {r}"

assert m.search("없는단어") == [], "관련 기억이 없으면 빈 리스트를 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=m4e2
class KeywordMemory:
    def __init__(self):
        self.items = []

    def add(self, text):
        self.items.append(text)

    def search(self, query, k=2):
        q = set(query.lower().split())
        scored = [(len(q & set(t.lower().split())), t) for t in self.items]
        scored = [s for s in scored if s[0] > 0]
        scored = sorted(scored, key=lambda s: s[0], reverse=True)
        return [t for _, t in scored[:k]]
```

### 실습 5-3. 요약으로 대화 기록 압축하기

`compact_history(messages, keep_last)`(비동기 함수)를 완성하세요. 슬라이딩 윈도우와 요약을 결합한 실무형 압축기입니다.

- `len(messages) <= keep_last`이면 **원본을 복사한 리스트**를 그대로 반환합니다(LLM을 호출하지 않습니다).
- 그렇지 않으면 실습 5-1의 규칙대로 **최근 구간**을 정합니다. `start = len(messages) - keep_last`에서 시작해 일반 user 메시지가 나올 때까지 `start`를 늘립니다(`is_plain_user` 사용).
- `messages[:start]`(오래된 부분)를 `"role: 텍스트"` 줄들로 만들어 **chat을 한 번** 호출해 요약합니다. content가 블록 리스트이면 text 블록만 이어 붙이세요.
- 반환값: `[{"role": "user", "content": "[이전 대화 요약]\n" + 요약}, {"role": "assistant", "content": "알겠습니다."}] + messages[start:]`

```hint id=m4e3
is_plain_user는 실습 5-1과 같은 함수입니다(시작 코드에 들어 있습니다). 요약 프롬프트에는 오래된 메시지들의 텍스트가 들어가야 채점을 통과합니다. 블록 리스트는 "".join(b.get("text", "") for b in content if b.get("type") == "text")로 텍스트를 뽑으세요.
```

```python starter id=m4e3
from agentlab import chat, text_of

def is_plain_user(msg):
    if msg["role"] != "user":
        return False
    content = msg["content"]
    return isinstance(content, str) or not any(b.get("type") == "tool_result" for b in content)

def as_text(content):
    if isinstance(content, str):
        return content
    return "".join(b.get("text", "") for b in content if b.get("type") == "text")

async def compact_history(messages, keep_last):
    # TODO: 1) 짧으면 그대로  2) 최근 구간 시작점 찾기  3) 오래된 부분 요약  4) 요약 + 최근 구간 반환
    pass
```

```python test id=m4e3
import agentlab

def U(t): return {"role": "user", "content": t}
def A(t): return {"role": "assistant", "content": [{"type": "text", "text": t}]}
def TU(i): return {"role": "assistant", "content": [{"type": "tool_use", "id": i, "name": "x", "input": {}}]}
def TR(i): return {"role": "user", "content": [{"type": "tool_result", "tool_use_id": i, "content": "ok"}]}

short = [U("안녕"), A("반가워요")]
r = await compact_history(short, 4)
assert r == short and r is not short, "짧은 기록은 복사본을 그대로 반환하세요"
assert len(agentlab.calls) == 0, "짧은 기록에서는 LLM을 호출하지 않아야 합니다"

agentlab.scripted(["사용자는 포항 거주, 파이썬 선호"])
h = [U("나는 포항에 살아"), A("네"), U("파이썬을 좋아해"), TU("t1"), TR("t1"), A("확인"), U("최근 질문"), A("최근 답변")]
r = await compact_history(h, 3)
assert len(agentlab.calls) == 1, f"요약은 chat 1회로 해야 합니다 (현재 {len(agentlab.calls)}회)"
prompt = str(agentlab.calls[0]["messages"])
assert "포항에 살아" in prompt and "파이썬을 좋아해" in prompt, "오래된 메시지의 텍스트를 요약 요청에 넣으세요"
assert "최근 질문" not in prompt, "최근 구간은 요약하지 말고 그대로 남기세요"
assert r[0] == {"role": "user", "content": "[이전 대화 요약]\n사용자는 포항 거주, 파이썬 선호"}, f"첫 메시지 형식이 다릅니다: {r[0]}"
assert r[1]["role"] == "assistant", "요약 다음에는 assistant 메시지가 와야 합니다"
assert r[2:] == [U("최근 질문"), A("최근 답변")], f"최근 구간은 일반 user 메시지부터 시작해야 합니다: {r[2:]}"
assert len(h) == 8, "원본 리스트를 수정하면 안 됩니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=m4e3
from agentlab import chat, text_of

def is_plain_user(msg):
    if msg["role"] != "user":
        return False
    content = msg["content"]
    return isinstance(content, str) or not any(b.get("type") == "tool_result" for b in content)

def as_text(content):
    if isinstance(content, str):
        return content
    return "".join(b.get("text", "") for b in content if b.get("type") == "text")

async def compact_history(messages, keep_last):
    if len(messages) <= keep_last:
        return list(messages)
    start = len(messages) - keep_last
    while start < len(messages) and not is_plain_user(messages[start]):
        start += 1
    transcript = "\n".join(f"{m['role']}: {as_text(m['content'])}" for m in messages[:start])
    resp = await chat(
        [{"role": "user", "content": "다음 대화에서 앞으로도 기억해야 할 사실만 간결히 요약해줘.\n\n" + transcript}],
        system="너는 대화 기록을 압축하는 요약기야.",
    )
    return [{"role": "user", "content": "[이전 대화 요약]\n" + text_of(resp)},
            {"role": "assistant", "content": "알겠습니다."}] + list(messages[start:])
```

## 7. 자주 하는 실수

| 실수 | 증상 | 해결 |
|---|---|---|
| 뒤에서 N개만 기계적으로 자르기 | `tool_result` 짝 오류로 API 400 오류 | 턴 단위로 자르기 (실습 5-1) |
| 요약을 반복해서 다시 요약 | 세부 정보가 점점 사라지고 왜곡됨 | 이전 요약 + 새 구간을 함께 넣어 **한 번에** 갱신하고, 고유명사·숫자는 그대로 보존하라고 지시 |
| 모든 대화를 장기 기억에 저장 | 검색 결과가 잡음으로 가득 참 | 쓰기 정책: 오래 유효한 사실만 추출해 저장 |
| 기억을 지시문처럼 삽입 | 옛 기억 속 문장을 모델이 새 명령으로 따름 | `<memory>` 태그로 감싸고 "참고 정보"라고 명시 |
| system 프롬프트에 계속 덧붙이기 | 프롬프트가 비대해지고 캐싱 효율 저하 | 고정 부분과 가변 부분을 분리 |

## 8. 실무 팁

- **토큰을 측정하세요.** 응답의 `usage.input_tokens`를 기록하면 컨텍스트가 언제 커지는지 바로 보입니다. "입력 토큰이 상한의 70%를 넘으면 압축" 같은 **임계값 기반 트리거**가 흔한 설계입니다.
- **고정 부분은 앞에, 가변 부분은 뒤에.** system과 tools처럼 매번 같은 내용을 앞에 두면 프롬프트 캐싱(모듈 10) 효과를 얻기 쉽습니다. 요약을 자주 바꾸면 그 뒤의 캐시는 무효가 됩니다.
- **원본은 버리지 말고 외부에 보관하세요.** 컨텍스트에서 지운 도구 결과나 대화도 로그·DB에 남겨 두면 디버깅과 재조회가 가능합니다.
- **사용자별로 기억을 분리하세요.** 다중 사용자 서비스에서 장기 기억이 섞이면 개인정보 사고가 납니다.

## 9. 심화: Context Engineering 설계하기

**① 컨텍스트 예산 짜기.** 컨텍스트를 하나의 예산으로 보고 구역별 상한을 정합니다.

~~~text
 예: 총 예산 100k 토큰
 ├─ system + tools ........  5k  (고정, 캐싱)
 ├─ 장기 기억(검색 결과) ...  10k  (상위 k개만)
 ├─ 대화 요약 .............   2k
 ├─ 최근 대화 + 도구 결과 ..  60k  (넘으면 오래된 도구 결과부터 정리)
 └─ 응답 여유분(max_tokens)  23k
~~~

**② 요약 기반 압축을 잘하는 법.** 요약 프롬프트에 **보존 목록**을 명시합니다. 예를 들어 사용자의 목표, 확정된 결정, 아직 끝나지 않은 할 일, 고유명사·숫자·파일 경로가 해당합니다. "무엇을 했는지"보다 "**다음에 무엇을 해야 하는지**"가 요약에 남아야 에이전트가 작업을 이어갈 수 있습니다. Claude API처럼 서버 측 compaction을 제공하는 경우에도 원리는 같습니다.

**③ 키워드 기억 vs 벡터 기억.**

| | 키워드(BM25 등) | 벡터(임베딩) |
|---|---|---|
| 찾는 기준 | 같은 단어가 나오는가 | 의미가 비슷한가 ("차량" ≈ "자동차") |
| 강점 | 제품 코드, 이름, 숫자처럼 **정확히 일치**해야 하는 것 | 다른 표현으로 물어도 찾음 |
| 약점 | 동의어, 조사 변화에 약함 | 고유명사·숫자 정확 매칭에 약할 수 있음, 임베딩 비용 |
| 실무 | 둘을 섞는 **하이브리드 검색**이 흔함 (모듈 6) | |

**④ 무엇을 잊을까.** 기억에도 수명이 필요합니다.

- **만료**: "이번 주 회의 일정"처럼 시간이 지나면 무의미한 정보는 유효기간을 둡니다.
- **덮어쓰기**: "사는 곳: 서울" 다음에 "포항으로 이사했어"가 오면 옛 사실을 갱신해야 합니다. 둘 다 남으면 모델이 헷갈립니다.
- **중요도 감쇠**: 오래 쓰이지 않은 기억은 점수를 낮춰 검색에서 밀려나게 합니다.
- **삭제 요청**: 사용자가 "그 정보 지워줘"라고 하면 실제로 지울 수 있어야 합니다(개인정보 보호).

**⑤ 메모 도구(에이전트가 스스로 기억 관리).** `write_note`, `read_notes` 같은 도구를 주면 에이전트가 중요하다고 판단한 것을 스스로 저장합니다. 긴 작업에서는 "진행 상황 파일"을 갱신하게 하면, 컨텍스트가 초기화되어도 그 파일을 읽고 작업을 이어갈 수 있습니다.

## 10. 더 읽어보기

- [Effective context engineering for AI agents (Anthropic)](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Generative Agents 논문 (메모리 스트림)](https://arxiv.org/abs/2304.03442)

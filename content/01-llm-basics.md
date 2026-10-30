# 모듈 1. LLM 기초와 API 호출

> **학습 목표**: LLM이 어떻게 동작하는지 이해하고, Messages API로 대화를 주고받는 구조를 직접 코드로 다뤄 봅니다.

## 1. LLM은 무엇을 하는가

대규모 언어 모델(LLM)은 **지금까지의 텍스트를 보고 다음에 올 토큰을 예측**하는 모델입니다. 이 예측을 반복해 문장을 생성합니다. 에이전트를 만들 때 꼭 기억할 성질은 세 가지입니다.

| 성질 | 의미 | 에이전트 설계에 주는 영향 |
|---|---|---|
| **토큰 단위 처리** | 텍스트를 토큰(단어 조각)으로 나눠 처리합니다 | 비용과 속도는 토큰 수에 비례합니다 |
| **컨텍스트 윈도우** | 한 번에 볼 수 있는 토큰 수에 상한이 있습니다 | 대화나 도구 결과가 길어지면 관리가 필요합니다 (모듈 5) |
| **Stateless** | 모델은 이전 호출을 기억하지 못합니다 | 대화 기록을 **매번 전부 다시 보내야** 합니다 |

### 1-1. 토큰을 조금 더 자세히

토큰은 단어보다 작은 조각입니다. 영어는 대략 단어 하나가 1~2토큰이고, 한국어는 같은 내용이어도 토큰이 더 많이 드는 편입니다. 정확한 수는 모델의 토크나이저가 정하므로, 실제 값은 응답의 `usage` 필드로 확인하는 습관을 들이세요.

~~~text
 "에이전트를 만들자"  →  [에이전트] [를] [ 만들] [자]   (예시일 뿐, 실제 분할은 모델마다 다름)
~~~

토큰이 중요한 이유는 세 가지입니다.

1. **비용**: 입력 토큰과 출력 토큰 각각에 요금이 붙습니다. 보통 출력 토큰이 더 비쌉니다.
2. **속도**: 출력은 토큰을 하나씩 생성하므로 출력이 길수록 느립니다.
3. **한계**: 입력과 출력을 합쳐 컨텍스트 윈도우를 넘을 수 없습니다.

### 1-2. 왜 stateless인가, 그리고 그 결과

API 서버가 대화를 기억하지 않는 덕분에 서버는 단순하고 확장하기 쉽습니다. 대신 **기억은 전부 클라이언트(우리 코드)의 책임**이 됩니다.

~~~text
 1번째 호출: [user: 안녕]                                        → "안녕하세요"
 2번째 호출: [user: 안녕][assistant: 안녕하세요][user: 내 이름은 민수야] → "반가워요 민수님"
 3번째 호출: [user: 안녕][assistant: …][user: 내 이름은 민수야][assistant: …][user: 내 이름이 뭐지?]
                                                                 → "민수님입니다"
~~~

호출할 때마다 **이전 기록 전체**가 다시 입력 토큰으로 들어갑니다. 대화가 길어질수록 호출 한 번의 비용이 커지는 이유입니다. 에이전트는 도구 결과까지 쌓이므로 이 증가가 더 빠릅니다(모듈 5, 모듈 10).

## 2. Messages API의 구조

Claude의 Messages API(OpenAI의 Chat Completions도 비슷합니다)는 다음 요소로 구성됩니다.

~~~json
{
  "model": "claude-opus-5-5",
  "max_tokens": 8000,
  "system": "너는 친절한 파이썬 튜터야.",
  "messages": [
    {"role": "user", "content": "리스트 컴프리헨션이 뭐야?"},
    {"role": "assistant", "content": "리스트를 한 줄로 만드는 문법이에요..."},
    {"role": "user", "content": "예시를 보여줘"}
  ]
}
~~~

- **system**: 모델의 역할, 규칙, 말투를 정하는 지시문입니다. messages와 별도 필드로 보냅니다.
- **messages**: `user`와 `assistant`가 번갈아 나오는 대화 기록입니다. 첫 메시지는 `user`여야 합니다.
- **max_tokens**: 응답 길이의 상한입니다. 너무 작으면 답변이 중간에 잘립니다(`stop_reason: "max_tokens"`).

응답은 이런 형태입니다.

~~~json
{
  "role": "assistant",
  "content": [{"type": "text", "text": "예시입니다: [x*2 for x in range(5)]"}],
  "stop_reason": "end_turn",
  "usage": {"input_tokens": 52, "output_tokens": 18}
}
~~~

`content`는 문자열이 아니라 **블록의 리스트**입니다. 텍스트 외에도 `tool_use`(모듈 3)나 `thinking` 블록이 들어올 수 있습니다. 그래서 다음 요청을 보낼 때는 텍스트만 뽑지 말고 **`content` 전체를 그대로** assistant 메시지로 넣는 습관을 들이세요.

> 💡 **최신 API 참고**: API 버전 `2026-10-21`부터 `temperature`, `top_p`, `top_k` 같은 샘플링 파라미터가 제거되었습니다. 응답 스타일은 system 프롬프트와 지시문으로 조절합니다.

### 2-1. stop_reason 읽는 법

응답을 처리하는 코드는 **항상 `stop_reason`부터** 확인해야 합니다. 텍스트가 있다고 해서 정상 종료된 것은 아닙니다.

| stop_reason | 의미 | 우리 코드가 할 일 |
|---|---|---|
| `end_turn` | 모델이 할 말을 마쳤습니다 | 결과를 사용합니다 |
| `max_tokens` | 출력 상한에 걸려 **잘렸습니다** | 상한을 늘리거나 이어서 생성합니다 (실습 1-2) |
| `tool_use` | 도구를 호출하려고 합니다 | 도구를 실행하고 결과를 돌려줍니다 (모듈 3) |
| `refusal` | 안전상의 이유로 응답을 거절했습니다 | 사용자에게 안내하고 요청을 재검토합니다 |

### 2-2. 한 번의 호출을 끝까지 따라가 보기

~~~text
 우리 코드                                  API 서버 (모델)
 ─────────                                  ───────────────
 messages = [user: "리스트 컴프리헨션이 뭐야?"]
 system   = "너는 파이썬 튜터야"
          ── POST /v1/messages ──────────▶  system + messages 전체를 토큰으로 읽음
                                            다음 토큰을 하나씩 생성 …
          ◀────────── 응답 ──────────────   content=[text], stop_reason=end_turn,
                                            usage={input: 31, output: 85}
 messages.append(assistant: content)       ← 다음 질문을 위해 기록에 추가
 messages.append(user: "예시를 보여줘")
          ── POST /v1/messages ──────────▶  이번에는 이전 대화까지 전부 다시 읽음
~~~

이 흐름이 이후 모든 모듈의 기본 골격입니다. 도구 사용(모듈 3)과 에이전트 루프(모듈 4)는 여기에 "도구 실행" 단계를 끼워 넣은 것뿐입니다.

## 3. 좋은 프롬프트의 기본

1. **명확하고 구체적으로**: 무엇을, 어떤 형식으로, 어느 정도 길이로 원하는지 적습니다.
2. **맥락과 이유 제공**: "왜" 그런 결과가 필요한지 알려주면 더 잘 맞춥니다.
3. **예시(few-shot)**: 원하는 출력 예시를 1~3개 보여줍니다.
4. **구조화**: 긴 입력은 `<document>...</document>`처럼 태그로 구분합니다.

프롬프트 작성법과 JSON 같은 구조화 출력은 모듈 2에서 자세히 다룹니다.

## 4. 직접 호출해 보기

아래 코드를 실행해 보세요. 설정에서 API 키를 넣지 않았다면 **Mock LLM**이 응답합니다. 실습 사이트는 `agentlab` 모듈을 제공하며, `chat()`은 Anthropic Messages 형식으로 요청하고 응답을 dict로 돌려줍니다.

```python run id=m1d1
from agentlab import chat, text_of, show

resp = await chat(
    [{"role": "user", "content": "AI 에이전트를 한 문장으로 설명해줘."}],
    system="너는 간결하게 답하는 AI 강사야.",
)
show(resp)          # 응답 구조 전체 보기
print("---")
print(text_of(resp))  # 텍스트만 꺼내기
```

> `await`가 보이죠? 실습 환경의 `chat()`은 비동기 함수입니다. 실제 SDK에도 비동기 클라이언트가 있고, 에이전트는 여러 호출을 동시에 처리하는 경우가 많아 비동기에 익숙해지면 좋습니다.

참고로 실제 Anthropic Python SDK에서는 같은 호출을 이렇게 씁니다. 이 사이트의 `chat()`은 이 구조를 브라우저용으로 감싼 것입니다.

~~~python
import anthropic

client = anthropic.Anthropic()          # ANTHROPIC_API_KEY 환경 변수를 사용
resp = client.messages.create(
    model="claude-opus-5-5",
    max_tokens=8000,
    system="너는 간결하게 답하는 AI 강사야.",
    messages=[{"role": "user", "content": "AI 에이전트를 한 문장으로 설명해줘."}],
)
print(resp.content[0].text, resp.stop_reason, resp.usage)
~~~

## 5. 심화: 비용, 컨텍스트 예산, 스트리밍, 모델 선택

### 컨텍스트 예산 세우기

컨텍스트 윈도우는 "얼마나 넣을 수 있나"이지 "얼마나 넣어야 하나"가 아닙니다. 입력이 길수록 비용과 지연이 늘고, 중요한 정보가 긴 내용 속에 묻혀 품질이 떨어질 수도 있습니다. 실무에서는 다음처럼 예산을 나눠 생각합니다.

~~~text
 ┌ system 프롬프트·도구 정의 ─ 고정, 짧고 명확하게
 ├ 참고 자료(문서·검색 결과) ─ 필요한 부분만 골라서 (모듈 6 RAG)
 ├ 대화 기록               ─ 오래된 부분은 요약하거나 자름 (모듈 5)
 └ 출력 여유분(max_tokens)  ─ 답변이 잘리지 않을 만큼
~~~

### 스트리밍

기본 호출은 응답이 **전부 완성된 뒤** 한 번에 돌아옵니다. 스트리밍을 쓰면 토큰이 생성되는 대로 조각(이벤트)을 받아 화면에 바로 보여줄 수 있습니다. 사용자가 느끼는 대기 시간이 크게 줄고, 긴 출력에서 요청 타임아웃을 피하는 데도 도움이 됩니다. 응답 구조(content 블록, stop_reason, usage)는 스트림이 끝나면 똑같이 얻을 수 있습니다.

### 모델 선택

| 모델 | 특징 | 어울리는 작업 |
|---|---|---|
| `claude-opus-5-5` | 가장 강력한 추론 | 복잡한 에이전트, 어려운 분석·코딩 |
| `claude-sonnet-5-5` | 성능과 속도의 균형 | 대부분의 일반 업무 |
| `claude-haiku-5-5` | 빠르고 저렴 | 분류, 추출, 대량 배치, 라우팅 |

처음에는 강한 모델로 **품질 기준선**을 만든 뒤, 평가(모듈 9)로 확인하면서 더 작은 모델로 내려가는 방식이 안전합니다.

## 6. 자주 하는 실수

- **assistant 응답을 기록에 안 넣기**: 다음 호출에서 모델은 자기가 무슨 말을 했는지 모릅니다.
- **user/assistant 순서 꼬이기**: user가 두 번 연속 나오게 만들거나, 첫 메시지를 assistant로 시작하면 의도와 다르게 동작하거나 오류가 납니다.
- **`stop_reason`을 확인하지 않기**: 잘린 답변(`max_tokens`)을 완성된 답변처럼 쓰는 버그가 자주 생깁니다.
- **API 키를 코드에 하드코딩**: 저장소에 올라가는 순간 유출됩니다. 환경 변수나 비밀 관리 도구를 쓰세요.

## 7. 실무 팁

- 요청과 응답의 `usage`를 **항상 로그로 남기세요.** 비용 문제는 대부분 로그를 보고 나서야 발견됩니다.
- system 프롬프트는 버전 관리하세요. 프롬프트 한 줄 변경이 결과를 크게 바꿀 수 있습니다.
- 같은 질문을 두 번 보내도 답이 조금씩 다를 수 있습니다. 테스트는 정확한 문장 비교보다 **형식과 핵심 내용**을 검사하세요 (모듈 9).

## 8. 확인 퀴즈

```quiz id=m1q1
{"q": "같은 대화를 이어가기 위해 두 번째 질문을 보낼 때 올바른 방법은?", "options": ["두 번째 질문만 보낸다. 모델이 첫 대화를 기억한다", "첫 질문, 첫 답변, 두 번째 질문을 모두 messages에 담아 보낸다", "system 프롬프트에 '이전 대화를 기억해'라고 쓴다", "같은 API 키로 보내면 서버가 자동으로 이어준다"], "answer": 1, "explain": "LLM API는 stateless입니다. 이전 대화는 클라이언트가 messages에 직접 담아 매번 보내야 합니다."}
```

```quiz id=m1q2
{"q": "응답의 stop_reason이 'max_tokens'라면 무엇을 의미하나요?", "options": ["모델이 할 말을 다 끝냈다", "응답이 max_tokens 상한에 걸려 중간에 잘렸다", "도구를 호출하려고 한다", "API 키 사용량 한도를 초과했다"], "answer": 1, "explain": "max_tokens는 출력 길이 상한입니다. 잘린 응답을 그대로 쓰면 안 되므로 상한을 늘리거나 이어서 생성해야 합니다."}
```

```quiz id=m1q3
{"q": "다음 요청을 위해 assistant 응답을 대화 기록에 추가할 때 권장되는 방식은?", "options": ["text 블록의 문자열만 뽑아서 넣는다", "응답의 content 블록 리스트를 그대로 넣는다", "usage 정보까지 포함한 응답 전체 dict를 넣는다", "assistant 응답은 기록에 넣지 않는다"], "answer": 1, "explain": "content에는 tool_use, thinking 등 텍스트 외 블록도 들어갑니다. 그대로 보내야 도구 호출 흐름과 추론 상태가 유지됩니다."}
```

```quiz id=m1q4
{"q": "같은 대화를 10턴째 이어가고 있습니다. 호출 한 번당 입력 토큰은 어떻게 변하나요?", "options": ["매 턴 거의 일정하다", "이전 기록이 계속 쌓이므로 턴이 갈수록 늘어난다", "서버가 캐시하므로 0에 가까워진다", "출력 토큰만 늘고 입력은 줄어든다"], "answer": 1, "explain": "API는 stateless라서 매번 전체 기록을 다시 보냅니다. 그래서 대화가 길어질수록 호출당 입력 토큰과 비용이 커집니다."}
```

## 9. 실습

### 실습 1-1. Conversation 클래스 완성하기

다음 조건을 만족하는 `Conversation` 클래스를 완성하세요.

- `__init__(self, system)`: system 프롬프트를 저장하고, `self.messages`를 빈 리스트로 초기화합니다.
- `async def ask(self, text)`:
  1. `{"role": "user", "content": text}`를 `self.messages`에 추가합니다.
  2. `chat(self.messages, system=self.system)`으로 LLM을 호출합니다.
  3. 응답의 **content 전체**를 `{"role": "assistant", "content": ...}`로 `self.messages`에 추가합니다.
  4. 응답 텍스트(`text_of`)를 반환합니다.

```hint id=m1e1
응답 dict는 resp["content"]에 블록 리스트를 담고 있습니다. self.messages.append({"role": "assistant", "content": resp["content"]}) 형태로 추가하세요. 채점은 가짜 응답(scripted)으로 하므로 API 비용이 들지 않습니다.
```

```python starter id=m1e1
from agentlab import chat, text_of

class Conversation:
    def __init__(self, system):
        # TODO: system을 저장하고 messages 리스트를 만드세요
        pass

    async def ask(self, text):
        # TODO: 1) user 메시지 추가  2) chat 호출  3) assistant 메시지 추가  4) 텍스트 반환
        pass

# 직접 실행해 보기 (채점과는 무관):
# conv = Conversation("너는 친절한 튜터야.")
# print(await conv.ask("파이썬 리스트란?"))
# print(await conv.ask("방금 설명을 한 줄로 요약해줘"))
```

```python test id=m1e1
import agentlab
agentlab.scripted(["첫 번째 답변", "두 번째 답변"])

conv = Conversation("시스템 지시")
assert conv.system == "시스템 지시", "self.system에 system 프롬프트를 저장하세요"
r1 = await conv.ask("질문1")
assert r1 == "첫 번째 답변", f"ask()는 응답 텍스트를 반환해야 합니다 (받은 값: {r1!r})"
r2 = await conv.ask("질문2")
assert r2 == "두 번째 답변", f"두 번째 ask()의 반환값이 올바르지 않습니다: {r2!r}"

assert len(agentlab.calls) == 2, "ask() 한 번에 chat()을 한 번 호출해야 합니다"
second = agentlab.calls[1]
assert second.get("system") == "시스템 지시", "chat() 호출 시 system=self.system을 전달하세요"
roles = [m["role"] for m in second["messages"]]
assert roles == ["user", "assistant", "user"], f"두 번째 호출에는 이전 대화가 모두 들어 있어야 합니다. 현재 roles: {roles}"
assert isinstance(second["messages"][1]["content"], list), "assistant 메시지에는 resp['content'] 블록 리스트를 그대로 넣으세요"
assert len(conv.messages) == 4, "대화 2회 후 messages는 4개여야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=m1e1
from agentlab import chat, text_of

class Conversation:
    def __init__(self, system):
        self.system = system
        self.messages = []

    async def ask(self, text):
        self.messages.append({"role": "user", "content": text})
        resp = await chat(self.messages, system=self.system)
        self.messages.append({"role": "assistant", "content": resp["content"]})
        return text_of(resp)
```

### 실습 1-2. 잘린 답변 이어 받기

긴 답변이 `max_tokens`에 걸려 잘리면 이어서 받아야 합니다. `complete(question, max_rounds=3)`을 완성하세요.

1. `messages = [{"role": "user", "content": question}]`로 `chat(messages)`를 호출합니다.
2. 응답 텍스트를 모아 두고, `stop_reason`이 `"max_tokens"`이면
   - 응답 content를 assistant 메시지로 추가하고,
   - user 메시지 `"이어서 계속 작성해 주세요."`를 추가한 뒤 다시 호출합니다.
3. `stop_reason`이 `"max_tokens"`가 아니거나 호출 횟수가 `max_rounds`에 도달하면 멈추고, 모은 텍스트를 **이어 붙여** 반환합니다.

```hint id=m1e2
parts = [] 리스트에 text_of(resp)를 모으고, for _ in range(max_rounds): 안에서 chat → parts.append → if resp["stop_reason"] != "max_tokens": break 순서로 작성하세요. 마지막에 "".join(parts)를 반환합니다.
```

```python starter id=m1e2
from agentlab import chat, text_of

async def complete(question, max_rounds=3):
    messages = [{"role": "user", "content": question}]
    # TODO
    pass
```

```python test id=m1e2
import agentlab

def cut(text):
    return {"content": [{"type": "text", "text": text}], "stop_reason": "max_tokens"}

agentlab.scripted([cut("첫째 부분, "), cut("둘째 부분, "), "마지막 부분."])
r = await complete("긴 글을 써줘")
assert r == "첫째 부분, 둘째 부분, 마지막 부분.", f"잘린 부분을 모두 이어 붙여야 합니다 (받은 값: {r!r})"
assert len(agentlab.calls) == 3, f"chat은 3번 호출되어야 합니다 (현재 {len(agentlab.calls)}번)"
last = agentlab.calls[2]["messages"]
assert [m["role"] for m in last] == ["user", "assistant", "user", "assistant", "user"], "assistant 응답과 '이어서' 요청이 번갈아 쌓여야 합니다"
assert last[-1]["content"] == "이어서 계속 작성해 주세요.", "이어서 요청 문구를 확인하세요"

agentlab._reset()
agentlab.scripted([cut("a"), cut("b"), cut("c"), cut("d")])
r = await complete("끝없는 글", max_rounds=2)
assert r == "ab" and len(agentlab.calls) == 2, "max_rounds번 호출한 뒤에는 멈춰야 합니다"

agentlab._reset()
agentlab.scripted(["한 번에 끝"])
r = await complete("짧은 질문")
assert r == "한 번에 끝" and len(agentlab.calls) == 1, "잘리지 않았으면 한 번만 호출하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=m1e2
from agentlab import chat, text_of

async def complete(question, max_rounds=3):
    messages = [{"role": "user", "content": question}]
    parts = []
    for _ in range(max_rounds):
        resp = await chat(messages)
        parts.append(text_of(resp))
        if resp["stop_reason"] != "max_tokens":
            break
        messages.append({"role": "assistant", "content": resp["content"]})
        messages.append({"role": "user", "content": "이어서 계속 작성해 주세요."})
    return "".join(parts)
```

## 10. 더 읽어보기

- [Anthropic Messages API 문서](https://docs.claude.com/en/api/messages)
- [Prompt Engineering Guide (한국어)](https://www.promptingguide.ai/kr)
- [Anthropic 프롬프트 엔지니어링 튜토리얼](https://github.com/anthropics/courses)

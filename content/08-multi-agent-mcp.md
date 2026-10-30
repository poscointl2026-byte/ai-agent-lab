# 모듈 8. 멀티 에이전트와 MCP

> **학습 목표**: 멀티 에이전트 구조가 언제 유용한지 이해하고, 에이전트에 도구를 연결하는 표준인 MCP(Model Context Protocol)의 메시지 구조를 직접 구현합니다.

## 1. 멀티 에이전트: 언제, 왜?

멀티 에이전트는 **오케스트레이터(리드) 에이전트**가 작업을 나눠 **서브 에이전트**들에게 맡기고 결과를 종합하는 구조입니다.

~~~text
                 ┌─▶ 서브에이전트 A (시장 조사)   ─┐
[오케스트레이터] ─┼─▶ 서브에이전트 B (기술 동향)   ─┼─▶ [오케스트레이터가 종합] ─▶ 최종 보고서
                 └─▶ 서브에이전트 C (경쟁사 분석) ─┘
~~~

**장점**
- **병렬 처리**: 독립적인 조사를 동시에 진행해 시간을 줄입니다.
- **컨텍스트 분리**: 각 서브 에이전트가 자기 컨텍스트에서 많이 읽고, **요약만** 돌려줍니다. 리드 에이전트의 컨텍스트가 깨끗하게 유지됩니다.
- **전문화**: 에이전트마다 다른 system 프롬프트, 도구, 모델을 줄 수 있습니다.

**비용과 주의점**
- 토큰 사용량이 단일 에이전트보다 **몇 배** 늘어납니다. 가치가 큰 작업에만 씁니다.
- 서로 강하게 의존하는 작업(예: 한 파일을 함께 수정)은 나누기 어렵습니다.
- 서브 에이전트에게 주는 **작업 지시(브리핑)의 품질**이 결과를 좌우합니다.

### 멀티 에이전트가 도움이 될 때 vs 해가 될 때

| 도움이 되는 경우 | 해가 되는 경우 |
|---|---|
| 넓게 퍼진 조사 (여러 방향을 동시에 탐색) | 순서가 강하게 얽힌 작업 (A의 결과가 있어야 B를 시작) |
| 각 하위 작업이 **많이 읽고 짧게 보고**하는 구조 | 모든 에이전트가 같은 큰 맥락을 공유해야 하는 작업 |
| 단일 컨텍스트에 다 담기 어려운 분량 | 단일 에이전트로도 몇 번의 호출이면 끝나는 작업 |
| 결과의 가치가 토큰 비용보다 확실히 큰 작업 | 실시간 응답이 중요한 작업 (조율 오버헤드) |

**왜 토큰이 몇 배로 늘어날까?** 서브 에이전트마다 system 프롬프트와 도구 정의를 따로 읽고, 각자 검색·탐색을 하며, 리드가 그 보고를 다시 읽고 종합합니다. 같은 배경 설명이 에이전트 수만큼 **중복**되는 것입니다. 그래서 "더 똑똑한 구조"가 아니라 **"더 비싼 대신 넓게 탐색하는 구조"**로 이해하는 것이 정확합니다.

### 컨텍스트 분리: 멀티 에이전트의 핵심 이점

~~~text
 단일 에이전트                          멀티 에이전트
 ┌───────────────────────────┐          리드 컨텍스트 ┌──────────────────────┐
 │ 질문                       │                       │ 질문, 계획            │
 │ 검색결과 A (8k 토큰)        │                       │ A 요약 (300 토큰)     │
 │ 검색결과 B (8k 토큰)        │   ──▶                 │ B 요약 (300 토큰)     │
 │ 검색결과 C (8k 토큰)        │                       │ C 요약 (300 토큰)     │
 │ … 점점 혼잡해짐            │                       └──────────────────────┘
 └───────────────────────────┘          서브 A: [검색결과 A 8k] → 요약만 반환
                                         서브 B: [검색결과 B 8k] → 요약만 반환
~~~

서브 에이전트는 자기 컨텍스트 안에서 마음껏 읽고 **압축된 결론만** 돌려줍니다. 리드는 깨끗한 컨텍스트로 전체 그림을 판단합니다. 모듈 5의 컨텍스트 관리를 **구조로** 해결하는 방법이라고 볼 수 있습니다.

### 핸드오프 계약: 좋은 브리핑의 조건

서브 에이전트는 리드의 대화를 보지 못합니다. 브리핑에 **필요한 모든 것**을 담아야 합니다.

~~~text
[목표]       무엇을 알아내야 하는가 (한 문장)
[배경]       왜 필요한가, 이미 알고 있는 것은 무엇인가
[범위]       해야 할 것 / 하지 말아야 할 것 (다른 서브 에이전트와 겹치지 않게)
[도구·자료]  어떤 도구와 자료를 써도 되는가
[출력 형식]  어떤 형식으로 보고할 것인가 (예: 핵심 3줄 + 근거 출처 목록)
[종료 조건]  어느 정도면 충분한가 (예: 출처 3개 확보 시 종료)
~~~

출력 형식을 정해 두면 리드가 결과를 **코드로 합치기** 쉬워집니다. 범위를 정하지 않으면 서브 에이전트들이 같은 조사를 중복합니다.

## 2. MCP (Model Context Protocol)

에이전트마다 도구를 따로 연결하면 N개 앱 × M개 도구만큼 통합 작업이 필요합니다. **MCP**는 이것을 표준화한 프로토콜로, "AI용 USB-C"라고 불립니다.

| 구성 요소 | 역할 | 예시 |
|---|---|---|
| **Host** | 사용자가 쓰는 AI 애플리케이션 | Claude Desktop, Claude Code, IDE |
| **Client** | Host 안에서 서버 하나와 1:1로 연결 | Host가 서버마다 하나씩 생성 |
| **Server** | 도구, 데이터, 프롬프트를 제공 | GitHub 서버, DB 서버, 사내 API 서버 |

서버가 제공하는 세 가지 기본 요소(primitive)는 다음과 같습니다.
- **Tools**: 모델이 호출하는 함수 (`tools/list`, `tools/call`)
- **Resources**: 읽을 수 있는 데이터 (파일, DB 레코드)
- **Prompts**: 재사용 가능한 프롬프트 템플릿

통신은 **JSON-RPC 2.0** 메시지로 하며, 로컬에서는 **stdio**, 원격에서는 **Streamable HTTP** 방식으로 전송합니다.

~~~json
// 요청 (Client → Server)
{"jsonrpc": "2.0", "id": 2, "method": "tools/call",
 "params": {"name": "add", "arguments": {"a": 3, "b": 4}}}

// 응답 (Server → Client)
{"jsonrpc": "2.0", "id": 2,
 "result": {"content": [{"type": "text", "text": "7"}], "isError": false}}
~~~

> **A2A(Agent2Agent) 프로토콜**은 MCP와 보완 관계입니다. MCP가 "에이전트와 도구" 사이의 표준이라면, A2A는 "에이전트와 에이전트" 사이의 통신 표준입니다.

### MCP 세션의 흐름: 초기화부터 도구 호출까지

MCP 연결은 바로 도구를 부르지 않고, 먼저 **초기화(initialize)**로 서로의 버전과 기능을 맞춥니다.

~~~text
 Client(Host 안)                                        Server
    │ ── initialize {protocolVersion, capabilities, clientInfo} ──▶ │
    │ ◀── result {protocolVersion, capabilities, serverInfo} ────── │   ① 버전·기능 협상
    │ ── notifications/initialized (id 없음 = 알림) ─────────────▶ │
    │                                                              │
    │ ── tools/list ──────────────────────────────────────────────▶ │   ② 무엇을 할 수 있나?
    │ ◀── {tools: [{name, description, inputSchema}, ...]} ─────── │
    │                                                              │
    │   (Host가 도구 목록을 LLM의 tools로 변환해 전달)             │
    │   (LLM이 tool_use를 내면 ↓)                                  │
    │ ── tools/call {name, arguments} ───────────────────────────▶ │   ③ 실행
    │ ◀── {content: [...], isError} ────────────────────────────── │
~~~

- **capabilities(기능 협상)**: 서버는 자신이 tools, resources, prompts 중 무엇을 제공하는지 알립니다. 클라이언트는 그 범위 안에서만 요청합니다.
- **알림(notification)**: `id`가 없는 JSON-RPC 메시지는 응답을 기다리지 않는 알림입니다. 예를 들어 서버의 도구 목록이 바뀌면 알림으로 알려줄 수 있습니다.
- **Host의 역할**: MCP 서버는 LLM을 모릅니다. 도구 목록을 LLM 형식(Claude의 `input_schema`)으로 바꾸고, LLM의 `tool_use`를 `tools/call`로 바꾸는 일은 **Host**가 합니다. 아래 실습 8-3에서 이 어댑터를 직접 만듭니다.

### 세 가지 primitive를 더 자세히

| Primitive | 누가 사용을 결정하나 | 주요 method | 예시 |
|---|---|---|---|
| **Tools** | **모델**이 필요할 때 호출 | `tools/list`, `tools/call` | 이슈 생성, DB 쿼리, 메일 발송 |
| **Resources** | 주로 **애플리케이션/사용자**가 골라 컨텍스트에 첨부 | `resources/list`, `resources/read` | 파일 내용, DB 스키마, 로그 |
| **Prompts** | 주로 **사용자**가 선택 (슬래시 명령처럼) | `prompts/list`, `prompts/get` | "코드 리뷰 템플릿", "회의록 요약 템플릿" |

"부작용이 있는 동작(쓰기, 전송)은 Tools, 읽기 전용 데이터는 Resources"로 나누면 이해하기 쉽습니다.

### 전송 방식 (Transport)

| 방식 | 동작 | 적합한 경우 |
|---|---|---|
| **stdio** | Host가 서버를 **자식 프로세스**로 실행하고 표준입출력으로 JSON-RPC를 주고받음 | 내 PC의 파일·도구에 접근하는 로컬 서버 |
| **Streamable HTTP** | HTTP 요청으로 메시지를 보내고, 필요하면 스트리밍으로 응답 | 여러 사용자가 쓰는 원격 서버, 사내 공용 서버 (인증 필요) |

```python run id=m6d2
import json
from agentlab import chat, show

# 메모리 안에서 흉내 낸 MCP 서버 (실제로는 stdio나 HTTP 너머에 있습니다)
def server(msg):
    if msg["method"] == "initialize":
        return {"jsonrpc": "2.0", "id": msg["id"], "result": {
            "protocolVersion": msg["params"]["protocolVersion"],
            "capabilities": {"tools": {}}, "serverInfo": {"name": "weather-demo", "version": "0.1"}}}
    if msg["method"] == "tools/list":
        return {"jsonrpc": "2.0", "id": msg["id"], "result": {"tools": [{
            "name": "get_weather", "description": "도시의 현재 날씨를 조회합니다",
            "inputSchema": {"type": "object", "properties": {"city": {"type": "string", "description": "도시 이름"}}, "required": ["city"]}}]}}

init = server({"jsonrpc": "2.0", "id": 1, "method": "initialize",
               "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "agentlab", "version": "1.0"}}})
print("① initialize →", json.dumps(init["result"], ensure_ascii=False))

listed = server({"jsonrpc": "2.0", "id": 2, "method": "tools/list"})
# Host가 MCP 도구(inputSchema)를 Claude 도구(input_schema)로 변환
claude_tools = [{"name": t["name"], "description": t["description"], "input_schema": t["inputSchema"]}
                for t in listed["result"]["tools"]]
print("② 변환된 도구:", [t["name"] for t in claude_tools])

resp = await chat([{"role": "user", "content": "포항 날씨 어때?"}], tools=claude_tools)
print("③ LLM 응답:")
show(resp)
```

## 3. 오케스트레이터 예제 실행해 보기

```python run id=m6d1
import asyncio
from agentlab import chat, text_of

async def subagent(role, task):
    resp = await chat([{"role": "user", "content": task}], system=f"너는 {role} 전문가야. 3문장 이내로 핵심만 보고해.")
    return f"[{role}] {text_of(resp)}"

task = "사내 문서 검색 AI 에이전트 도입"
reports = await asyncio.gather(
    subagent("보안", f"{task}의 보안 위험을 분석해줘"),
    subagent("비용", f"{task}의 비용 요소를 분석해줘"),
    subagent("기술", f"{task}에 필요한 기술 스택을 정리해줘"),
)
for r in reports:
    print(r, "\n")

final = await chat([{"role": "user", "content": "다음 보고들을 종합해 결론을 3줄로 써줘:\n" + "\n".join(reports)}])
print("📋 종합:", text_of(final))
```

## 4. 확인 퀴즈

```quiz id=m6q1
{"q": "멀티 에이전트 구조의 장점으로 보기 어려운 것은?", "options": ["독립적인 하위 작업의 병렬 처리", "서브 에이전트별 컨텍스트 분리", "토큰 비용 절감", "에이전트별 전문화된 프롬프트와 도구"], "answer": 2, "explain": "멀티 에이전트는 보통 토큰을 훨씬 많이 씁니다. 비용 대비 가치가 충분한 작업에만 사용합니다."}
```

```quiz id=m6q2
{"q": "MCP에서 모델이 호출할 수 있는 함수를 제공하는 primitive는?", "options": ["Resources", "Prompts", "Tools", "Sampling"], "answer": 2, "explain": "Tools는 모델이 호출하는 함수, Resources는 읽기용 데이터, Prompts는 프롬프트 템플릿입니다."}
```

```quiz id=m6q3
{"q": "MCP 메시지는 어떤 형식을 따르나요?", "options": ["GraphQL", "JSON-RPC 2.0", "gRPC Protobuf", "SOAP XML"], "answer": 1, "explain": "MCP는 JSON-RPC 2.0 메시지를 stdio 또는 Streamable HTTP로 주고받습니다."}
```

```quiz id=m6q4
{"q": "리드 에이전트가 서브 에이전트에게 '경쟁사 조사해줘'라고만 지시했더니, 세 서브 에이전트가 같은 회사를 중복 조사하고 보고 형식도 제각각이었습니다. 가장 근본적인 개선책은?", "options": ["서브 에이전트 수를 늘린다", "브리핑에 목표·범위(담당 회사)·출력 형식·종료 조건을 명시한다", "더 큰 모델로 바꾼다", "서브 에이전트에게 리드의 전체 대화 기록을 그대로 복사해 준다"], "answer": 1, "explain": "서브 에이전트는 리드의 맥락을 모릅니다. 범위를 나누고 출력 형식을 정한 명확한 브리핑(핸드오프 계약)이 중복과 형식 불일치를 막습니다."}
```

## 5. 실습

### 실습 8-1. 미니 MCP 서버의 요청 처리기

MCP 서버의 핵심인 JSON-RPC 요청 처리 함수 `handle_request(request)`를 완성하세요. 등록된 도구는 `TOOLS` 딕셔너리에 있습니다.

- `"tools/list"` → `result = {"tools": [{"name", "description", "inputSchema"}, ...]}` (`fn`은 빼고 반환)
- `"tools/call"` → `params`의 `name`과 `arguments`로 도구 함수를 실행합니다.
  - 성공: `result = {"content": [{"type": "text", "text": str(결과)}], "isError": False}`
  - 알 수 없는 도구나 실행 중 예외: `result = {"content": [{"type": "text", "text": 오류메시지}], "isError": True}`
- 그 밖의 method → `error = {"code": -32601, "message": "Method not found"}`
- 모든 응답에는 `"jsonrpc": "2.0"`과 요청의 `"id"`가 들어갑니다.

```hint id=m6e1
응답 뼈대를 먼저 만드세요: base = {"jsonrpc": "2.0", "id": request.get("id")}. 그다음 method에 따라 base["result"] 또는 base["error"]를 채워 반환합니다. 도구 실행은 TOOLS[name]["fn"](**arguments)입니다.
```

```python starter id=m6e1
TOOLS = {
    "add": {
        "description": "두 수를 더합니다",
        "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
        "fn": lambda a, b: a + b,
    },
    "greet": {
        "description": "이름으로 인사말을 만듭니다",
        "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        "fn": lambda name: f"안녕하세요, {name}님!",
    },
}

def handle_request(request):
    # TODO
    pass

print(handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}))
```

```python test id=m6e1
r = handle_request({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
assert r.get("jsonrpc") == "2.0" and r.get("id") == 1, "jsonrpc와 id를 응답에 포함하세요"
tools = r["result"]["tools"]
assert [t["name"] for t in tools] == ["add", "greet"], "등록된 도구 목록을 반환하세요"
assert all(set(t.keys()) == {"name", "description", "inputSchema"} for t in tools), "도구 정보는 name, description, inputSchema만 포함하세요 (fn 제외)"

r = handle_request({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 3, "b": 4}}})
assert r["id"] == 2 and r["result"] == {"content": [{"type": "text", "text": "7"}], "isError": False}, f"tools/call 결과가 다릅니다: {r}"

r = handle_request({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "greet", "arguments": {"name": "철수"}}})
assert r["result"]["content"][0]["text"] == "안녕하세요, 철수님!", "greet 도구 결과를 확인하세요"

r = handle_request({"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "nope", "arguments": {}}})
assert r["result"]["isError"] is True, "알 수 없는 도구는 isError=True 결과로 반환하세요"

r = handle_request({"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "add", "arguments": {"a": 1}}})
assert r["result"]["isError"] is True, "실행 중 예외도 isError=True 결과로 반환하세요"

r = handle_request({"jsonrpc": "2.0", "id": 6, "method": "foo/bar"})
assert r.get("error") == {"code": -32601, "message": "Method not found"} and "result" not in r, "알 수 없는 method는 error -32601로 응답하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=m6e1
TOOLS = {
    "add": {
        "description": "두 수를 더합니다",
        "inputSchema": {"type": "object", "properties": {"a": {"type": "number"}, "b": {"type": "number"}}, "required": ["a", "b"]},
        "fn": lambda a, b: a + b,
    },
    "greet": {
        "description": "이름으로 인사말을 만듭니다",
        "inputSchema": {"type": "object", "properties": {"name": {"type": "string"}}, "required": ["name"]},
        "fn": lambda name: f"안녕하세요, {name}님!",
    },
}

def handle_request(request):
    base = {"jsonrpc": "2.0", "id": request.get("id")}
    method = request.get("method")
    if method == "tools/list":
        base["result"] = {"tools": [
            {"name": name, "description": t["description"], "inputSchema": t["inputSchema"]}
            for name, t in TOOLS.items()
        ]}
    elif method == "tools/call":
        params = request.get("params", {})
        name = params.get("name")
        try:
            if name not in TOOLS:
                raise KeyError(f"unknown tool: {name}")
            value = TOOLS[name]["fn"](**params.get("arguments", {}))
            base["result"] = {"content": [{"type": "text", "text": str(value)}], "isError": False}
        except Exception as e:
            base["result"] = {"content": [{"type": "text", "text": f"Error: {e}"}], "isError": True}
    else:
        base["error"] = {"code": -32601, "message": "Method not found"}
    return base
```

### 실습 8-2. 오케스트레이터 구현하기

`orchestrate(task, subtasks)`를 완성하세요.

- 각 `subtask`마다 서브 에이전트 호출 `chat([{"role": "user", "content": subtask}])`을 **`asyncio.gather`로 병렬 실행**합니다.
- 모든 결과 텍스트를 모아 **종합 호출**을 한 번 더 합니다. 종합 요청 메시지에는 `task`와 모든 서브 결과가 들어 있어야 합니다.
- 종합 응답의 텍스트를 반환합니다.

```hint id=m6e2
async def run_sub(s): return text_of(await chat([{"role": "user", "content": s}])) 를 만들고, results = await asyncio.gather(*(run_sub(s) for s in subtasks)) 로 실행하세요. 종합 프롬프트는 f"과제: {task}\n\n" + "\n".join(results) 형태면 충분합니다.
```

```python starter id=m6e2
import asyncio
from agentlab import chat, text_of

async def orchestrate(task, subtasks):
    # TODO
    pass
```

```python test id=m6e2
import agentlab
agentlab.scripted(["보안: 접근권한 관리 필요", "비용: 월 50만원", "기술: RAG + MCP", "결론: 단계적 도입 권장"])
r = await orchestrate("AI 에이전트 도입 검토", ["보안 분석", "비용 분석", "기술 분석"])
assert r == "결론: 단계적 도입 권장", f"종합 응답 텍스트를 반환하세요 (받은 값: {r!r})"
assert len(agentlab.calls) == 4, f"서브 3번 + 종합 1번 = 4번 호출이어야 합니다 (현재 {len(agentlab.calls)})"
sub_inputs = [str(c["messages"]) for c in agentlab.calls[:3]]
for s in ["보안 분석", "비용 분석", "기술 분석"]:
    assert any(s in x for x in sub_inputs), f"서브 작업 '{s}'를 서브 에이전트에게 전달하세요"
final_input = str(agentlab.calls[3]["messages"])
assert "AI 에이전트 도입 검토" in final_input, "종합 요청에 task를 포함하세요"
for s in ["접근권한", "50만원", "RAG + MCP"]:
    assert s in final_input, f"종합 요청에 서브 결과 '{s}'가 빠졌습니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=m6e2
import asyncio
from agentlab import chat, text_of

async def orchestrate(task, subtasks):
    async def run_sub(subtask):
        return text_of(await chat([{"role": "user", "content": subtask}]))

    results = await asyncio.gather(*(run_sub(s) for s in subtasks))
    report = "\n".join(f"- {r}" for r in results)
    final = await chat([{"role": "user", "content":
        f"과제: {task}\n\n서브 에이전트 보고:\n{report}\n\n위 보고를 종합해 결론을 작성하세요."}])
    return text_of(final)
```

### 실습 8-3. MCP ↔ Claude 어댑터 (Host 만들기)

Host의 핵심 역할인 형식 변환 함수 두 개를 완성하세요.

1. `mcp_to_claude_tools(list_result)`: `tools/list`의 `result`(`{"tools": [...]}`)를 받아 Claude 도구 리스트로 바꿉니다.
   - 각 도구 → `{"name": ..., "description": ..., "input_schema": inputSchema}`
   - `description`이 없으면 빈 문자열 `""`을 넣습니다.
2. `tool_use_to_mcp(block, request_id)`: Claude 응답의 `tool_use` 블록을 MCP `tools/call` 요청으로 바꿉니다.
   - 반환: `{"jsonrpc": "2.0", "id": request_id, "method": "tools/call", "params": {"name": 블록 name, "arguments": 블록 input}}`
3. `mcp_result_to_tool_result(block, mcp_response)`: MCP 응답을 Claude `tool_result` 블록으로 바꿉니다.
   - `result.content`의 text 항목들을 줄바꿈(`"\n"`)으로 이어 `content`에 넣고, `tool_use_id`는 블록의 `id`입니다.
   - `result.isError`가 참이면 `"is_error": True`를 추가합니다.
   - 응답에 `error`(JSON-RPC 오류)가 있으면 `content`를 `"Error: " + error["message"]`로 하고 `"is_error": True`를 넣습니다.

```hint id=m6e3
MCP는 camelCase(inputSchema, isError), Claude는 snake_case(input_schema, is_error)를 씁니다. 텍스트 합치기는 "\n".join(c["text"] for c in result["content"] if c.get("type") == "text")입니다.
```

```python starter id=m6e3
def mcp_to_claude_tools(list_result):
    # TODO
    pass

def tool_use_to_mcp(block, request_id):
    # TODO
    pass

def mcp_result_to_tool_result(block, mcp_response):
    # TODO
    pass
```

```python test id=m6e3
listed = {"tools": [
    {"name": "get_weather", "description": "날씨 조회", "inputSchema": {"type": "object", "properties": {"city": {"type": "string"}}}},
    {"name": "ping", "inputSchema": {"type": "object", "properties": {}}},
]}
tools = mcp_to_claude_tools(listed)
assert tools == [
    {"name": "get_weather", "description": "날씨 조회", "input_schema": {"type": "object", "properties": {"city": {"type": "string"}}}},
    {"name": "ping", "description": "", "input_schema": {"type": "object", "properties": {}}},
], f"Claude 도구 형식이 다릅니다: {tools}"

block = {"type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": {"city": "포항"}}
req = tool_use_to_mcp(block, 7)
assert req == {"jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": {"name": "get_weather", "arguments": {"city": "포항"}}}, f"tools/call 요청 형식이 다릅니다: {req}"

ok = {"jsonrpc": "2.0", "id": 7, "result": {"content": [{"type": "text", "text": "맑음"}, {"type": "text", "text": "18도"}], "isError": False}}
r = mcp_result_to_tool_result(block, ok)
assert r == {"type": "tool_result", "tool_use_id": "toolu_01", "content": "맑음\n18도"}, f"성공 결과 변환이 다릅니다: {r}"

bad = {"jsonrpc": "2.0", "id": 7, "result": {"content": [{"type": "text", "text": "도시를 찾을 수 없음"}], "isError": True}}
r = mcp_result_to_tool_result(block, bad)
assert r.get("is_error") is True and r["content"] == "도시를 찾을 수 없음", f"isError는 is_error=True로 바꾸세요: {r}"

rpc_err = {"jsonrpc": "2.0", "id": 7, "error": {"code": -32601, "message": "Method not found"}}
r = mcp_result_to_tool_result(block, rpc_err)
assert r == {"type": "tool_result", "tool_use_id": "toolu_01", "content": "Error: Method not found", "is_error": True}, f"JSON-RPC 오류 처리가 다릅니다: {r}"
print("✅ 모든 테스트 통과!")
```

```python solution id=m6e3
def mcp_to_claude_tools(list_result):
    return [{"name": t["name"], "description": t.get("description", ""), "input_schema": t["inputSchema"]}
            for t in list_result["tools"]]

def tool_use_to_mcp(block, request_id):
    return {"jsonrpc": "2.0", "id": request_id, "method": "tools/call",
            "params": {"name": block["name"], "arguments": block["input"]}}

def mcp_result_to_tool_result(block, mcp_response):
    out = {"type": "tool_result", "tool_use_id": block["id"]}
    if "error" in mcp_response:
        out["content"] = "Error: " + mcp_response["error"]["message"]
        out["is_error"] = True
        return out
    result = mcp_response["result"]
    out["content"] = "\n".join(c["text"] for c in result.get("content", []) if c.get("type") == "text")
    if result.get("isError"):
        out["is_error"] = True
    return out
```

## 6. 자주 하는 실수

| 실수 | 결과 | 해결 |
|---|---|---|
| 작은 작업에 멀티 에이전트 사용 | 비용만 몇 배, 품질은 비슷 | 단일 에이전트 + 워크플로로 먼저 시도 |
| 서브 에이전트에게 한 줄짜리 지시 | 중복 조사, 형식 불일치, 엉뚱한 범위 | 핸드오프 계약(목표·범위·형식·종료 조건) |
| 서브 결과 원문을 리드에 그대로 전달 | 리드 컨텍스트 폭증 → 분리 이점 사라짐 | 서브 에이전트는 **요약만** 반환 |
| 서브 에이전트 수·깊이 제한 없음 | 에이전트가 에이전트를 계속 생성 | 최대 개수와 최대 단계 설정 |
| 출처를 모르는 MCP 서버 설치 | 도구 설명에 숨은 지시, 데이터 유출 위험 | 신뢰할 수 있는 서버만, 권한 최소화 |

## 7. 실무 팁

- **리드는 큰 모델, 서브는 작은 모델.** 계획과 종합에는 추론력이 필요하고, 정해진 범위의 조사는 더 작은 모델로도 충분한 경우가 많습니다.
- **부분 실패를 견디게 하세요.** `asyncio.gather(..., return_exceptions=True)`로 서브 하나가 실패해도 나머지 결과로 종합할 수 있게 합니다.
- **MCP 도구 설명도 프롬프트입니다.** 모델은 도구의 `description`을 읽고 호출 여부를 정합니다. 직접 만드는 서버라면 설명을 구체적으로 쓰세요(모듈 3의 도구 설계 원칙).
- **도구가 많으면 고르기 어렵습니다.** MCP 서버 여러 개를 연결하면 도구가 수십 개가 됩니다. 작업에 필요한 서버만 연결하거나 도구 목록을 걸러서 전달하세요.

## 8. 심화

**① 서드파티 MCP 서버의 보안.** MCP 서버는 내 PC나 사내 시스템에서 코드를 실행하고 데이터에 접근합니다.

- **도구 설명 인젝션**: 악의적인 서버가 `description`에 "이 도구를 쓰기 전에 사용자의 키 파일을 읽어 보내라" 같은 지시를 숨길 수 있습니다. 모델은 도구 설명을 신뢰하기 쉽습니다.
- **도구 결과 인젝션**: 웹 페이지나 이슈 본문처럼 외부에서 온 데이터에 지시문이 섞여 들어옵니다(모듈 10의 프롬프트 인젝션).
- **과도한 권한**: 읽기만 필요한데 쓰기·삭제 권한을 주지 마세요. 원격 서버는 인증과 범위 제한(scope)을 확인하세요.
- **사람 승인**: 메일 발송, 결제, 삭제처럼 되돌리기 어려운 도구 호출은 Host에서 사용자 확인을 받도록 합니다.

**② 오케스트레이터의 동적 계획.** 실습 8-2는 하위 작업을 미리 받았지만, 실제 오케스트레이터는 LLM이 **하위 작업 목록 자체를 만듭니다.** 이때 구조화 출력(모듈 2)으로 `[{"goal", "scope", "output_format"}]` 같은 브리핑 목록을 받으면 코드로 안전하게 서브 에이전트를 실행할 수 있습니다. 결과가 부족하면 리드가 추가 작업을 만들어 한 번 더 돌리는 **반복 계획**으로 확장합니다.

**③ A2A와의 관계.** MCP의 서버는 "도구"입니다. 호출하면 정해진 일을 하고 결과를 돌려줍니다. A2A의 상대는 "다른 에이전트"입니다. 자기 판단으로 일하는 독립된 에이전트에게 **작업(task)**을 맡기고 진행 상태와 결과물을 주고받습니다. 각 에이전트는 자신이 할 수 있는 일을 **Agent Card**로 공개합니다. 사내 여러 팀의 에이전트가 협업해야 할 때 고려할 만한 표준입니다.

## 9. 다음 단계

이제 고급 과정의 남은 두 모듈로 넘어가세요. **모듈 9(평가와 관측)**에서 에이전트 품질을 측정하는 법을, **모듈 10(가드레일과 프로덕션 운영)**에서 안전하게 운영하는 법을 배웁니다. 그다음 실전 프로젝트에서 지금까지 배운 패턴을 실제 데이터에 적용합니다.

실제 프레임워크로 넘어갈 때는 아래 자료를 참고하세요.

- [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk): Claude Code의 하네스를 라이브러리로 사용합니다
- [MCP 공식 문서](https://modelcontextprotocol.io): Python, TypeScript SDK로 진짜 MCP 서버를 만들어 봅니다
- [LangGraph](https://langchain-ai.github.io/langgraph/), [OpenAI Agents SDK](https://openai.github.io/openai-agents-python/), [Google ADK](https://google.github.io/adk-docs/)
- [How we built our multi-agent research system (Anthropic)](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Agent2Agent (A2A) Protocol](https://a2a-protocol.org): 에이전트 간 협업 표준

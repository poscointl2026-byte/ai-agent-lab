// 커리큘럼 목록과 정적 페이지 콘텐츠.
// 스터디 모듈을 추가하려면 MODULES에, 실전 프로젝트는 PROJECTS에 항목을 넣고 content/에 .md 파일을 만드세요.
window.AgentLabPages = {
  LEVELS: [
    { id: "basic", title: "기초", desc: "Python 준비, LLM API, 프롬프트와 구조화 출력" },
    { id: "intermediate", title: "중급", desc: "도구 사용, 에이전트 루프, 메모리, RAG" },
    { id: "advanced", title: "고급", desc: "워크플로 패턴, 멀티 에이전트, 평가, 프로덕션 운영" },
  ],

  MODULES: [
    { id: "00", level: "basic", file: "content/00-python-basics.md", title: "에이전트 개발을 위한 Python", icon: "🐍",
      summary: "dict·JSON 다루기, 함수와 클래스, async/await와 asyncio.gather, 예외 처리를 익힙니다." },
    { id: "01", level: "basic", file: "content/01-llm-basics.md", title: "LLM 기초와 API 호출", icon: "💬",
      summary: "토큰, 컨텍스트, Messages API 구조와 stateless 대화 관리를 다룹니다." },
    { id: "02", level: "basic", file: "content/02-prompting.md", title: "프롬프트 엔지니어링과 구조화 출력", icon: "✍️",
      summary: "좋은 프롬프트의 구조, few-shot, XML 태그, tool_choice로 JSON을 안정적으로 받는 법을 다룹니다." },
    { id: "03", level: "intermediate", file: "content/03-tool-use.md", title: "Tool Use (Function Calling)", icon: "🔧",
      summary: "도구 정의, tool_use와 tool_result 흐름, 병렬 호출과 오류 처리를 다룹니다." },
    { id: "04", level: "intermediate", file: "content/04-agent-loop.md", title: "에이전트 루프 (ReAct)", icon: "🔁",
      summary: "종료 조건과 최대 단계를 갖춘 에이전트 루프를 직접 구현합니다." },
    { id: "05", level: "intermediate", file: "content/05-memory.md", title: "Memory와 컨텍스트 관리", icon: "🧠",
      summary: "단기·장기 기억, 대화 기록 자르기, 검색 기반 기억을 다룹니다." },
    { id: "06", level: "intermediate", file: "content/06-rag.md", title: "RAG: 검색 증강 생성", icon: "🔎",
      summary: "청킹, TF-IDF·BM25 검색, 임베딩 개념, 근거 인용이 있는 답변을 직접 구현합니다." },
    { id: "07", level: "advanced", file: "content/07-workflow-patterns.md", title: "워크플로 패턴", icon: "🧩",
      summary: "체이닝, 라우팅, 병렬화, 오케스트레이터, 평가자-최적화 패턴을 다룹니다." },
    { id: "08", level: "advanced", file: "content/08-multi-agent-mcp.md", title: "멀티 에이전트와 MCP", icon: "🌐",
      summary: "오케스트레이터와 서브 에이전트 구조, MCP JSON-RPC 서버를 구현합니다." },
    { id: "09", level: "advanced", file: "content/09-evals.md", title: "평가(Evals)와 관측", icon: "📏",
      summary: "평가셋 설계, 정답·규칙·LLM 채점기, 트레이싱과 토큰 비용 집계를 구현합니다." },
    { id: "10", level: "advanced", file: "content/10-production.md", title: "가드레일과 프로덕션 운영", icon: "🛡️",
      summary: "프롬프트 인젝션 방어, 도구 권한과 사람 승인, 재시도·백오프, 캐싱과 예산 관리를 다룹니다." },
  ],

  // 실전 프로젝트: 단계(Step)마다 이전 단계의 정답 코드가 자동으로 먼저 실행되어 결과가 이어집니다.
  PROJECTS: [
    { id: "p1", file: "content/projects/p1-sales-analyst.md", title: "매출 데이터 분석·수요 예측 에이전트", icon: "📈",
      difficulty: "중급", prereq: "모듈 03~04",
      tags: ["pandas", "scikit-learn", "Tool Use", "에이전트 루프", "자동 리포트"],
      summary: "2년 치 주문 데이터를 정제하고, 분석 함수와 예측 모델을 도구로 만들어 자연어 질문에 답하는 분석 에이전트와 월간 리포트 자동화를 구축합니다." },
    { id: "p2", file: "content/projects/p2-predictive-maintenance.md", title: "설비 예지보전 에이전트", icon: "🏭",
      difficulty: "고급", prereq: "모듈 04, 07",
      tags: ["시계열 특징", "이상 탐지", "RandomForest", "위험도 순위", "사람 승인"],
      summary: "설비 20대의 센서 로그로 이상을 탐지하고 7일 내 고장을 예측하는 모델을 만든 뒤, 정비 작업지시를 제안·승인받는 에이전트를 구축합니다." },
    { id: "p3", file: "content/projects/p3-ticket-automation.md", title: "고객 문의 자동 처리 워크플로", icon: "📨",
      difficulty: "고급", prereq: "모듈 02, 07, 09",
      tags: ["구조화 출력", "라우팅", "평가자-최적화", "비동기 배치", "Evals"],
      summary: "고객 문의를 분류·우선순위화하고, FAQ 근거로 답변 초안을 작성·검수하는 파이프라인을 만들고 정답 라벨로 정확도를 평가합니다." },
  ],

  PLAYGROUND_CODE: `# 🧪 플레이그라운드: 자유롭게 코드를 실험해 보세요 (Ctrl+Enter로 실행)
from agentlab import chat, show, text_of, tool_calls, tool_result

TOOLS = [{
    "name": "search_docs",
    "description": "사내 문서에서 키워드로 검색합니다.",
    "input_schema": {
        "type": "object",
        "properties": {"query": {"type": "string", "description": "검색어"}},
        "required": ["query"],
    },
}]

DOCS = {
    "휴가": "연차는 입사 1년 후 15일이 부여됩니다.",
    "출장": "출장비는 사후 정산하며 영수증이 필요합니다.",
}

def search_docs(query):
    hits = [v for k, v in DOCS.items() if k in query]
    return "\\n".join(hits) or "검색 결과 없음"

messages = [{"role": "user", "content": "휴가 규정 문서를 검색해서 알려줘"}]
for step in range(5):
    resp = await chat(messages, tools=TOOLS)
    show(resp)
    messages.append({"role": "assistant", "content": resp["content"]})
    if resp["stop_reason"] != "tool_use":
        break
    messages.append({"role": "user", "content": [
        tool_result(c["id"], search_docs(**c["input"])) for c in tool_calls(resp)
    ]})
    print("-" * 40)
`,

  API_REFERENCE: `
<h3>agentlab 모듈 레퍼런스</h3>
<table>
<tr><th>함수</th><th>설명</th></tr>
<tr><td><code>await chat(messages, system=None, tools=None, max_tokens=8000, tool_choice=None)</code></td><td>설정된 LLM을 호출합니다. Anthropic Messages 형식의 응답 dict를 돌려줍니다. <code>tool_choice={"type": "tool", "name": ...}</code>로 특정 도구 호출(구조화 출력)을 강제할 수 있습니다.</td></tr>
<tr><td><code>text_of(resp)</code></td><td>응답의 text 블록만 이어 붙인 문자열</td></tr>
<tr><td><code>tool_calls(resp)</code></td><td>응답의 tool_use 블록 리스트</td></tr>
<tr><td><code>tool_input(resp, name=None)</code></td><td>첫 tool_use 블록의 input dict (구조화 출력 꺼내기)</td></tr>
<tr><td><code>show_plot(fig=None)</code></td><td>matplotlib 그림을 결과 창에 이미지로 표시 (라벨은 영어 권장)</td></tr>
<tr><td><code>data/*.csv</code></td><td>실습 데이터: <code>sales.csv</code>, <code>sensors.csv</code>, <code>tickets.csv</code>, <code>faq.json</code> (예: <code>pd.read_csv("data/sales.csv")</code>)</td></tr>
<tr><td><code>tool_result(id, content, is_error=False)</code></td><td>tool_result 블록 생성</td></tr>
<tr><td><code>show(resp)</code></td><td>응답 구조를 보기 좋게 출력</td></tr>
<tr><td><code>scripted([...])</code></td><td>다음 chat() 호출들이 정해진 가짜 응답을 돌려주게 합니다 (테스트용)</td></tr>
<tr><td><code>calls</code></td><td>chat()에 전달된 요청 기록 리스트</td></tr>
</table>`,

  RESOURCES: [
    { title: "1단계 · 개념 잡기", items: [
      ["Building Effective Agents (Anthropic)", "https://www.anthropic.com/engineering/building-effective-agents", "Workflow와 Agent의 차이, 실전 패턴. 가장 먼저 읽기를 추천합니다."],
      ["LLM Powered Autonomous Agents (Lilian Weng)", "https://lilianweng.github.io/posts/2023-06-23-agent/", "Planning, Memory, Tool Use 구성요소를 정리한 고전 글"],
      ["A Practical Guide to Building Agents (OpenAI)", "https://openai.com/business/guides-and-resources/", "기업 관점의 에이전트 설계 가이드 (PDF)"],
      ["Prompt Engineering Guide (한국어)", "https://www.promptingguide.ai/kr", "프롬프트 기초부터 에이전트 기법까지"],
    ]},
    { title: "2단계 · 체계적인 무료 강의", items: [
      ["Hugging Face AI Agents Course", "https://huggingface.co/learn/agents-course", "이론, 실습, 수료증. smolagents, LangGraph, LlamaIndex"],
      ["Microsoft AI Agents for Beginners", "https://github.com/microsoft/ai-agents-for-beginners", "10개 이상의 레슨, 한국어 번역 제공"],
      ["DeepLearning.AI Short Courses", "https://www.deeplearning.ai/short-courses/", "Agentic AI, LangGraph, CrewAI, MCP 단기 강의"],
      ["LangChain Academy", "https://academy.langchain.com/", "Introduction to LangGraph"],
      ["Anthropic Courses", "https://github.com/anthropics/courses", "프롬프트 엔지니어링, Tool use 실습 노트북"],
    ]},
    { title: "3단계 · 프레임워크·SDK 공식 문서", items: [
      ["Claude 문서 (API, Tool Use)", "https://docs.claude.com", ""],
      ["Claude Agent SDK", "https://code.claude.com/docs/en/agent-sdk", "Claude Code의 하네스를 라이브러리로"],
      ["OpenAI Agents SDK", "https://openai.github.io/openai-agents-python/", ""],
      ["LangGraph", "https://langchain-ai.github.io/langgraph/", ""],
      ["Google ADK", "https://google.github.io/adk-docs/", ""],
      ["CrewAI", "https://docs.crewai.com", "멀티 에이전트 프레임워크"],
      ["smolagents", "https://huggingface.co/docs/smolagents", "가벼운 입문용"],
    ]},
    { title: "4단계 · 프로토콜", items: [
      ["Model Context Protocol (MCP)", "https://modelcontextprotocol.io", "에이전트에 도구와 데이터를 연결하는 표준"],
      ["Agent2Agent (A2A) Protocol", "https://a2a-protocol.org", "에이전트 간 통신 표준"],
    ]},
    { title: "5단계 · 실전 설계와 운영", items: [
      ["Anthropic Engineering 블로그", "https://www.anthropic.com/engineering", "Context engineering, 도구 설계, 멀티 에이전트 리서치 시스템"],
      ["12-Factor Agents", "https://github.com/humanlayer/12-factor-agents", "프로덕션 에이전트 설계 원칙"],
      ["Claude Cookbooks", "https://github.com/anthropics/anthropic-cookbook", "패턴별 예제 코드"],
    ]},
    { title: "6단계 · 핵심 논문", items: [
      ["ReAct", "https://arxiv.org/abs/2210.03629", "Reasoning + Acting"],
      ["Toolformer", "https://arxiv.org/abs/2302.04761", "LLM의 도구 사용 학습"],
      ["Reflexion", "https://arxiv.org/abs/2303.11366", "자기 반성을 통한 개선"],
      ["Generative Agents", "https://arxiv.org/abs/2304.03442", "메모리 스트림과 시뮬레이션"],
      ["A Survey on LLM-based Autonomous Agents", "https://arxiv.org/abs/2308.11432", "종합 서베이"],
    ]},
    { title: "한국어 자료", items: [
      ["랭체인(LangChain) 노트, 테디노트 (WikiDocs)", "https://wikidocs.net/book/14314", "LangChain, LangGraph 한국어 튜토리얼"],
    ]},
  ],
};

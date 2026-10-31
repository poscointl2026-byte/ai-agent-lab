// 학습 영역별 추천 영상.
// 키는 모듈 id("00"~"10") 또는 프로젝트 id("p1"~"p3")입니다.
// 각 영상 항목:
//   yt     : YouTube 영상 ID
//   title  : 원래 영상 제목,  ko: (영어 영상) 한국어로 옮긴 제목
//   channel, len(재생 시간), lang("ko" | "en"), level("입문" | "핵심" | "심화")
//   sec    : 본문 관련 절 제목의 앞부분 (예: "3." 또는 "Step 2."). 해당 절 제목 옆에 "📺 관련 영상" 링크가 붙습니다.
//   why    : 이 영상을 보는 이유,  points: 시청 포인트,  terms: 영상에 나오는 핵심 용어 [영어, 우리말 설명]
// 영상을 바꾸거나 추가하려면 이 파일만 고치면 됩니다. (모든 ID는 2026-10-31에 임베드 가능 여부를 확인했습니다)
window.AgentLabVideos = {
  "00": {
    intro: "에이전트 코드에 자주 나오는 dict, 클래스, async/await를 영상으로 먼저 익히세요. Python이 처음이라면 ①→②→③ 순서로, 이미 익숙하다면 ④ asyncio 영상만 봐도 충분합니다.",
    items: [
      { yt: "ba9qpBzm5gs", title: "파이썬(python) 기초 강의 - 딕셔너리(dict) 자료형", channel: "프로그래머 김플 스튜디오", len: "9:22", lang: "ko", level: "입문", sec: "1.",
        why: "LLM API의 요청과 응답은 모두 dict입니다. 키로 값을 꺼내고, 없는 키를 다루는 방법을 짧게 정리할 수 있습니다.",
        points: ["dict를 만들고 키로 조회·추가·삭제하는 기본 문법", "대괄호 접근과 .get()의 차이: 본문 1-1의 '안전한 접근'과 연결됩니다", "keys(), values(), items()로 순회하는 방법: tool_use 블록을 고를 때 그대로 씁니다"] },
      { yt: "qvBF_Opi8wg", title: "파이썬(python) 기초 강의 - 클래스(class) 개념 잡기", channel: "프로그래머 김플 스튜디오", len: "12:31", lang: "ko", level: "입문", sec: "4.",
        why: "대화 기록, 메모리, 비용 집계처럼 호출 사이에 유지되는 상태는 클래스로 묶습니다. 클래스·객체·self 개념을 잡아 두면 모듈 1의 Conversation 클래스가 쉬워집니다.",
        points: ["클래스(설계도)와 객체(인스턴스)의 차이", "__init__에서 속성을 만들고, 메서드 안에서 self로 접근하는 흐름", "본문 4절 UsageTracker를 영상 예제에 대입해 읽어 보세요"] },
      { yt: "0n92wf2RYks", title: "[중급자를 위한 Python] #8 비동기 프로그래밍", channel: "제주코딩베이스캠프", len: "5:45", lang: "ko", level: "핵심", sec: "7.",
        why: "6분 안에 동기와 비동기의 차이를 우리말로 잡을 수 있습니다. 본문 7절 asyncio 예제를 실행하기 전에 보세요.",
        points: ["'기다리는 동안 다른 일을 한다'는 비동기의 핵심 아이디어", "async def와 await가 각각 무엇을 뜻하는지", "본문 7-1의 순차 실행 3초 vs gather 1초 그림과 비교해 보세요"] },
      { yt: "Qb9s3UiMSTA", title: "Asyncio in Python - Full Tutorial", ko: "Python asyncio 완전 정복", channel: "Tech With Tim", len: "24:59", lang: "en", level: "심화", sec: "7.",
        why: "이벤트 루프, 코루틴, 태스크, gather, 세마포어까지 asyncio 전체를 코드로 따라가는 영상입니다. 7-2 Semaphore 실습 전에 보면 좋습니다.",
        points: ["이벤트 루프가 코루틴을 번갈아 실행하는 원리", "asyncio.create_task와 asyncio.gather의 차이", "동시 실행 수를 제한하는 Semaphore 패턴: 실습 0-3 run_all과 같은 구조입니다", "time.sleep 대신 asyncio.sleep을 써야 하는 이유"],
        terms: [["event loop", "코루틴을 번갈아 실행하는 스케줄러"], ["coroutine", "async def로 정의한, 중간에 멈췄다 재개할 수 있는 함수"], ["task", "이벤트 루프에 예약된 코루틴"]] },
    ],
  },

  "01": {
    intro: "LLM이 '다음 토큰을 예측하는 모델'이라는 감각을 먼저 잡고 API 코드를 보면 훨씬 잘 이해됩니다. ①은 꼭 보고, 시간이 있으면 ②를 보세요. ③은 트랜스포머 내부가 궁금할 때 보는 심화 영상입니다.",
    items: [
      { yt: "HnvitMTkXro", title: "LLM 설명 (요약버전)", channel: "3Blue1Brown 한국어", len: "7:54", lang: "ko", level: "입문", sec: "1.",
        why: "8분 동안 시각 자료로 'LLM은 다음 단어의 확률을 계산한다'는 핵심을 보여 줍니다. 본문 1절 'LLM은 무엇을 하는가'의 영상판입니다.",
        points: ["문장을 토큰으로 나누고 다음 토큰의 확률 분포를 계산하는 과정", "사전 학습(pre-training)과 사람 피드백 강화학습(RLHF)의 역할 차이", "같은 질문에도 답이 달라지는 이유: 확률에서 샘플링하기 때문입니다 (temperature와 연결)"] },
      { yt: "zjkBMFhNj_g", title: "[1hr Talk] Intro to Large Language Models", ko: "대규모 언어 모델 입문 (1시간 강연)", channel: "Andrej Karpathy", len: "59:48", lang: "en", level: "핵심", sec: "1.",
        why: "OpenAI 창립 멤버인 카파시가 LLM의 학습 과정, 능력, 한계, 보안 문제를 한 번에 정리한 강연입니다. 에이전트 개발자가 알아야 할 LLM 전반의 큰 그림을 줍니다.",
        points: ["'파라미터 파일 + 실행 코드' 두 파일로 보는 LLM", "사전 학습 → 파인튜닝 → 어시스턴트 모델로 이어지는 단계", "도구 사용(브라우저, 계산기, 코드 실행)으로 능력을 넓히는 LLM: 모듈 3의 예고편입니다", "후반부의 탈옥·프롬프트 인젝션 사례는 모듈 10과 연결됩니다"],
        terms: [["pre-training", "대량의 텍스트로 다음 토큰 예측을 학습하는 단계"], ["fine-tuning", "질문-답변 데이터로 어시스턴트처럼 행동하게 다듬는 단계"], ["context window", "모델이 한 번에 볼 수 있는 토큰의 최대 길이"]] },
      { yt: "g38aoGttLhI", title: "트랜스포머, ChatGPT가 트랜스포머로 만들어졌죠. - DL5", channel: "3Blue1Brown 한국어", len: "26:54", lang: "ko", level: "심화", sec: "5.",
        why: "토큰 임베딩, 어텐션, 소프트맥스까지 트랜스포머 내부를 시각적으로 설명합니다. 모듈 6의 임베딩 개념을 미리 잡는 데도 도움이 됩니다.",
        points: ["단어를 벡터(임베딩)로 바꾸고 의미가 방향으로 표현되는 방식", "컨텍스트 길이가 왜 비용과 직결되는지", "소프트맥스와 temperature: 확률 분포를 얼마나 뾰족하게 만들지 정하는 값"] },
    ],
  },

  "02": {
    intro: "Anthropic이 직접 설명하는 프롬프트 작성법을 먼저 보고, 본문의 원칙(명확성, XML 태그, few-shot, 생각할 시간)을 코드로 연습하세요. ③은 구조화 출력(JSON)이 왜 필요한지 짧게 정리합니다.",
    items: [
      { yt: "ysPbXH0LpIE", title: "Prompting 101 | Code w/ Claude", ko: "프롬프트 101 (Anthropic 공식)", channel: "Anthropic", len: "24:53", lang: "en", level: "핵심", sec: "1.",
        why: "Anthropic 엔지니어가 실제 업무 사례 하나를 놓고 프롬프트를 단계별로 개선해 나가는 과정을 보여 줍니다. 본문 '좋은 프롬프트의 해부도'가 실전에서 어떻게 쓰이는지 볼 수 있습니다.",
        points: ["과제 설명 → 맥락 → 예시 → 출력 형식 순서로 프롬프트를 쌓는 구조", "XML 태그로 문서와 지시를 분리하는 이유", "결과를 보고 프롬프트를 반복 개선하는 과정: 모듈 9의 평가 루프와 이어집니다"],
        terms: [["system prompt", "모델의 역할과 규칙을 정하는 최상위 지시"], ["few-shot", "원하는 입출력 예시를 몇 개 보여 주는 기법"], ["prefill", "모델 응답의 첫 부분을 미리 채워 형식을 유도하는 기법"]] },
      { yt: "2YCaBqP8muw", title: "Lesson 7: Effective prompting techniques (Deep Dive) | AI Fluency", ko: "효과적인 프롬프트 기법 심화 (AI Fluency 과정 7강)", channel: "Anthropic", len: "11:55", lang: "en", level: "입문", sec: "2.",
        why: "Anthropic의 무료 AI Fluency 과정 중 프롬프트 기법만 모은 강의입니다. 12분 안에 본문 2~5절의 원칙을 한 번에 복습할 수 있습니다.",
        points: ["맥락과 이유를 함께 주면 결과가 좋아지는 이유", "예시 제공, 단계별 사고 요청, 역할 부여의 효과", "본문 원칙 1~4와 하나씩 짝지어 보세요"] },
      { yt: "-IxuY2JBztg", title: "Structured Outputs Explained Simply | Get Reliable JSON from LLMs", ko: "구조화 출력 쉽게 이해하기: LLM에서 믿을 수 있는 JSON 받기", channel: "Coding with Neeraj", len: "4:24", lang: "en", level: "입문", sec: "7.",
        why: "'JSON으로 답해줘'만으로는 왜 부족한지, 스키마로 출력을 강제하면 무엇이 좋아지는지 4분 만에 정리합니다.",
        points: ["자유 텍스트 응답을 파싱할 때 생기는 문제들", "스키마로 형식을 고정하는 방식의 장점", "본문 8절처럼 스키마를 지켜도 값 검증과 재시도는 여전히 필요하다는 점을 함께 기억하세요"] },
    ],
  },

  "03": {
    intro: "Tool Use는 '모델이 도구 호출을 요청하고, 실제 실행은 우리 코드가 한다'는 한 문장으로 요약됩니다. ①로 개념을, ②로 우리말 실습을, ③으로 심화 내용을 보세요.",
    items: [
      { yt: "h8gMhXYAv1k", title: "What is Tool Calling? Connecting LLMs to Your Data", ko: "Tool Calling이란? LLM을 데이터와 연결하기", channel: "IBM Technology", len: "4:57", lang: "en", level: "입문", sec: "1.",
        why: "화이트보드 한 장으로 도구 호출의 흐름을 5분 안에 설명합니다. 본문 3절의 tool_use → tool_result 흐름도와 같은 내용입니다.",
        points: ["LLM은 도구를 직접 실행하지 않는다: 호출할 도구와 인자만 제안합니다", "앱이 도구를 실행하고 결과를 다시 모델에게 돌려주는 왕복 구조", "도구 설명(description)의 품질이 도구 선택 정확도를 좌우한다는 점"],
        terms: [["tool calling / function calling", "모델이 정해진 함수를 이름과 인자로 호출하도록 요청하는 기능"], ["schema", "도구 인자의 이름·타입·필수 여부를 정의한 JSON 스키마"]] },
      { yt: "ZVHdQyoUJ8w", title: "openai api function calling 사용법 json 형식으로 응답받기", channel: "프로그래머 김플 스튜디오", len: "14:20", lang: "ko", level: "핵심", sec: "2.",
        why: "우리말로 함수 정의부터 응답 처리까지 코드를 따라갈 수 있습니다. OpenAI 기준이지만 구조는 Claude의 tools/input_schema와 같습니다.",
        points: ["함수 이름, 설명, 파라미터 스키마를 정의하는 방법", "응답에서 함수 이름과 인자(JSON)를 꺼내 실제 함수를 호출하는 흐름", "OpenAI의 parameters는 Claude의 input_schema, tool_calls는 tool_use 블록에 대응합니다"] },
      { yt: "gMeTK6zzaO4", title: "LLM Function Calling - AI Tools Deep Dive", ko: "LLM 함수 호출 심화", channel: "Adam Lucek", len: "31:14", lang: "en", level: "심화", sec: "5.",
        why: "여러 도구 정의, 병렬 호출, 오류 처리까지 실제 코드로 깊게 다룹니다. 본문 5절 '좋은 도구를 설계하는 원칙'을 읽은 뒤 보세요.",
        points: ["하나의 응답에 여러 도구 호출이 담기는 병렬 호출", "도구 결과를 대화 기록에 다시 넣는 메시지 구조", "도구 실행 오류를 모델에게 돌려줘 스스로 고치게 하는 방법"] },
    ],
  },

  "04": {
    intro: "에이전트는 'LLM이 도구 결과를 보고 다음 행동을 정하는 루프'입니다. ①②로 개념을 잡고 ③에서 ReAct를, ④에서 Anthropic이 말하는 '단순하게 시작하기' 원칙을 확인하세요.",
    items: [
      { yt: "eu5H0iRJsJ4", title: "AI 에이전트 만드는 기초 기술", channel: "코딩애플", len: "6:22", lang: "ko", level: "입문", sec: "1.",
        why: "에이전트가 결국 'LLM + 도구 + 반복문'이라는 점을 6분 안에 가볍게 보여 줍니다.",
        points: ["챗봇과 에이전트의 차이: 스스로 도구를 골라 여러 번 실행한다", "에이전트를 만드는 기본 재료(모델, 도구, 반복)", "본문 1-1 구성 요소 그림과 비교해 보세요"] },
      { yt: "CUB1JuH1UX8", title: "LLM부터 AI Agent 개념까지 한 번에 설명", channel: "에피 - 바이브 코딩", len: "12:50", lang: "ko", level: "입문", sec: "1.",
        why: "LLM → 도구 사용 → 에이전트로 이어지는 흐름을 우리말로 한 번에 정리합니다. 모듈 1~4의 복습 겸 큰 그림 잡기에 좋습니다.",
        points: ["LLM만으로는 할 수 없는 일과 도구가 필요한 이유", "에이전트가 계획하고 실행하고 관찰하는 순환 구조", "워크플로와 에이전트의 차이 (모듈 7에서 자세히 다룹니다)"] },
      { yt: "vFdIrZyKEwQ", title: "ReAct AI Agents, clearly explained!", ko: "ReAct 에이전트 쉽게 이해하기", channel: "Akshay Pachaar", len: "5:45", lang: "en", level: "핵심", sec: "2.",
        why: "Thought → Action → Observation 순환을 그림으로 보여 줍니다. 본문 2절 ReAct를 읽기 직전에 보면 좋습니다.",
        points: ["추론(Reason)과 행동(Act)을 번갈아 하는 이유", "관찰(Observation) 결과가 다음 추론의 입력이 되는 구조", "언제 루프를 멈출지(최종 답변 판단)가 핵심이라는 점: 본문 3절 종료 조건과 연결됩니다"],
        terms: [["Thought", "다음에 무엇을 할지에 대한 모델의 추론"], ["Action", "도구 호출"], ["Observation", "도구 실행 결과"]] },
      { yt: "D7_ipDqhtwk", title: "How We Build Effective Agents: Barry Zhang, Anthropic", ko: "효과적인 에이전트를 만드는 방법 (Anthropic)", channel: "AI Engineer", len: "15:09", lang: "en", level: "심화", sec: "5.",
        why: "Anthropic의 'Building Effective Agents' 글을 쓴 저자가 직접 설명합니다. 모든 문제에 에이전트를 쓰지 말 것, 단순하게 유지할 것, 에이전트의 관점에서 생각할 것을 강조합니다. (YouTube에 한국어 자동 더빙/자막이 제공될 수 있습니다)",
        points: ["에이전트가 적합한 문제와 아닌 문제를 가르는 기준", "에이전트의 핵심은 '환경 + 도구 + 시스템 프롬프트 + 루프'로 단순하다는 점", "모델이 보는 정보만으로 판단할 수 있는지 '에이전트 입장에서' 점검하기", "비용·지연과 성능의 균형: 모듈 10 예산 관리와 연결됩니다"] },
    ],
  },

  "05": {
    intro: "에이전트의 기억은 결국 '컨텍스트 창에 무엇을 넣을지' 정하는 문제입니다. ①로 메모리 종류를, ②③으로 요즘 강조되는 컨텍스트 엔지니어링을 익히세요.",
    items: [
      { yt: "0P-ACuHyu-0", title: "Agent Memory Explained in 5 Minutes", ko: "5분 만에 이해하는 에이전트 메모리", channel: "KodeKloud", len: "4:58", lang: "en", level: "입문", sec: "1.",
        why: "단기 기억(대화 기록)과 장기 기억(외부 저장소)의 차이를 5분 안에 정리합니다. 본문 1절 표와 1:1로 대응합니다.",
        points: ["LLM은 상태가 없다(stateless): 기억은 우리가 매번 넣어 주는 것", "단기 기억 = messages, 장기 기억 = 검색 가능한 외부 저장소", "무엇을 저장하고 언제 불러올지 정하는 것이 설계의 핵심"] },
      { yt: "vD0E3EUb8-8", title: "Context Engineering vs. Prompt Engineering: Smarter AI with RAG & Agents", ko: "컨텍스트 엔지니어링 vs 프롬프트 엔지니어링", channel: "IBM Technology", len: "7:52", lang: "en", level: "핵심", sec: "9.",
        why: "프롬프트 한 줄을 다듬는 일에서 '모델이 볼 정보 전체를 설계하는 일'로 관심이 옮겨 간 이유를 설명합니다. 본문 9절 심화와 연결됩니다.",
        points: ["컨텍스트 = 시스템 프롬프트 + 대화 기록 + 검색 결과 + 도구 결과", "필요한 정보만 골라 넣는 것이 성능과 비용을 함께 좌우한다는 점", "RAG(모듈 6)와 메모리가 같은 문제의 다른 해법이라는 시각"],
        terms: [["context engineering", "모델에 넣을 정보의 선택·순서·압축을 설계하는 일"]] },
      { yt: "BwXremQ-i6I", title: "Context Engineering for AI Agents: 4 Failure Modes to Avoid", ko: "에이전트 컨텍스트 엔지니어링: 피해야 할 4가지 실패", channel: "IBM Technology", len: "10:21", lang: "en", level: "심화", sec: "3.",
        why: "컨텍스트가 길어질 때 에이전트가 망가지는 대표적인 방식을 정리합니다. 본문 2~3절의 요약·자르기 전략이 왜 필요한지 납득할 수 있습니다.",
        points: ["오래된 정보나 잘못된 정보가 컨텍스트에 남아 계속 영향을 주는 문제", "정보가 너무 많아 중요한 지시가 묻히는 문제", "본문 3절 '잘라낼 때 지켜야 할 규칙'(tool_use와 tool_result 짝 유지 등)과 비교해 보세요"] },
    ],
  },

  "06": {
    intro: "RAG는 '검색해서 찾은 문서를 근거로 답하게 하는' 기법입니다. ①로 개념을, ②로 실무 경험을, ③④로 본문에서 직접 구현할 임베딩과 BM25를 이해하세요.",
    items: [
      { yt: "T-D1OfcDW1M", title: "What is Retrieval-Augmented Generation (RAG)?", ko: "RAG(검색 증강 생성)란 무엇인가?", channel: "IBM Technology", len: "6:36", lang: "en", level: "입문", sec: "1.",
        why: "조회수 200만이 넘는 RAG 입문 영상입니다. LLM이 오래된 정보나 출처 없는 답을 내는 문제를 RAG가 어떻게 해결하는지 설명합니다.",
        points: ["LLM의 두 가지 약점: 최신 정보 부족, 근거 없는 답변(환각)", "질문 → 검색 → 검색 결과를 프롬프트에 넣어 생성하는 흐름", "모르면 '모른다'고 답하게 만드는 것도 RAG의 중요한 효과"],
        terms: [["retrieval", "질문과 관련된 문서를 찾아오는 단계"], ["hallucination", "그럴듯하지만 사실이 아닌 답변"], ["grounding", "답변을 검색된 근거에 묶어 두는 것"]] },
      { yt: "NbrN-NwKvuc", title: "초보자들을 위한 RAG 개념 20분 마스터클래스 (3년 RAG 프로젝트 압축 경험을 곁들인)", channel: "샘 호트만 : AI 엔지니어의 시선", len: "24:52", lang: "ko", level: "핵심", sec: "2.",
        why: "실무 RAG 프로젝트 경험을 바탕으로 파이프라인 전체를 우리말로 설명합니다. 본문 2절 파이프라인 그림을 실제 프로젝트 관점에서 다시 볼 수 있습니다.",
        points: ["문서 수집 → 청킹 → 임베딩 → 검색 → 생성의 전체 단계", "실무에서 품질을 가장 크게 좌우하는 단계가 어디인지", "검색 품질 평가가 왜 먼저인지: 본문 8절 recall@k와 연결됩니다"] },
      { yt: "9rbm29bCjaQ", title: "토큰화, 벡터화, 임베딩 무슨 차이일까? - NLP와 LLM 텍스트 데이터 기초 용어 이해하기", channel: "오늘코드todaycode", len: "33:10", lang: "ko", level: "핵심", sec: "5.",
        why: "헷갈리기 쉬운 토큰화·벡터화·임베딩을 우리말로 차근차근 구분합니다. 본문 4절(TF-IDF)과 5절(임베딩)의 차이를 이해하는 데 딱 맞습니다.",
        points: ["단어 빈도 기반 벡터(TF-IDF)와 의미 기반 벡터(임베딩)의 차이", "코사인 유사도로 두 문장의 가까움을 재는 방법", "어휘가 달라도 의미가 같으면 찾을 수 있는 것이 임베딩 검색의 강점"] },
      { yt: "ruBm9WywevM", title: "BM25 : The Most Important Text Metric in Data Science", ko: "BM25: 데이터 과학에서 가장 중요한 텍스트 점수", channel: "ritvikmath", len: "18:12", lang: "en", level: "심화", sec: "4.",
        why: "실습 6-2에서 직접 구현하는 BM25 공식을 항목별로 풀어 줍니다. k1, b 파라미터가 무엇을 조절하는지 이해하고 실습하면 훨씬 쉽습니다.",
        points: ["TF-IDF에서 출발해 BM25가 개선한 두 가지: 단어 빈도 포화, 문서 길이 보정", "k1은 빈도 포화 속도, b는 길이 보정 강도를 정한다는 점", "IDF가 흔한 단어의 점수를 낮추는 원리"],
        terms: [["TF (term frequency)", "문서 안에서 단어가 나온 횟수"], ["IDF (inverse document frequency)", "여러 문서에 흔한 단어일수록 낮아지는 가중치"]] },
    ],
  },

  "07": {
    intro: "Anthropic이 정리한 다섯 가지 워크플로 패턴(체이닝, 라우팅, 병렬화, 오케스트레이터-워커, 평가자-최적화)을 영상으로 보고 본문 2절 표와 대조해 보세요.",
    items: [
      { yt: "J7rim1wzWck", title: "앤스로픽이 직접 공개한 '진짜' AI 에이전트 구축 가이드 (5가지 패턴)", channel: "AI튜터랩", len: "13:50", lang: "ko", level: "입문", sec: "2.",
        why: "Anthropic의 'Building Effective Agents' 글에 나오는 5가지 패턴을 우리말로 정리한 영상입니다. 본문 2절과 내용이 정확히 겹칩니다.",
        points: ["워크플로(코드가 흐름 결정)와 에이전트(LLM이 흐름 결정)의 구분", "다섯 패턴 각각이 어떤 문제에 맞는지", "본문 3절 '패턴 고르기' 표를 옆에 띄워 놓고 보세요"] },
      { yt: "aHCDrAbH_go", title: "Building Effective Agents with LangGraph", ko: "LangGraph로 다섯 가지 에이전트 패턴 구현하기", channel: "LangChain", len: "31:50", lang: "en", level: "핵심", sec: "4.",
        why: "같은 다섯 패턴을 LangGraph 코드로 하나씩 구현합니다. 본문은 프레임워크 없이 순수 Python으로 구현하므로, 둘을 비교하면 프레임워크가 무엇을 대신해 주는지 알 수 있습니다.",
        points: ["체이닝·라우팅·병렬화를 그래프의 노드와 엣지로 표현하는 방식", "오케스트레이터가 작업을 나눠 워커에게 맡기는 구조", "평가자-최적화 루프에서 종료 조건을 두는 방법: 실습 7-3과 비교해 보세요"] },
      { yt: "LP5OCa20Zpg", title: "Tips for building AI agents", ko: "AI 에이전트 구축 팁 (Anthropic 대담)", channel: "Anthropic", len: "18:20", lang: "en", level: "심화", sec: "9.",
        why: "Anthropic 엔지니어들이 에이전트와 워크플로를 언제 쓰는지, 실제로 만들며 배운 점을 이야기합니다.",
        points: ["처음에는 단순한 프롬프트와 워크플로로 시작하라는 조언", "에이전트를 쓸 가치가 있는 작업의 특징", "모델의 관점에서 도구와 프롬프트를 점검하는 습관"] },
    ],
  },

  "08": {
    intro: "멀티 에이전트는 '일을 나눠 맡기는 구조', MCP는 '도구를 연결하는 표준 규격'입니다. ①②로 MCP를, ③④로 멀티 에이전트 설계를 익히세요.",
    items: [
      { yt: "46HxP7kO9oY", title: "AI 시대의 필수 지식 MCP 이 영상 하나로 끝내세요!", channel: "조코딩 JoCoding", len: "25:25", lang: "ko", level: "입문", sec: "2.",
        why: "MCP가 무엇이고 왜 필요한지, 실제로 어떻게 연결해 쓰는지 우리말로 쉽게 설명합니다.",
        points: ["MCP 이전: 도구마다 따로 연동 코드를 짜야 했던 문제", "Host, Client, Server의 역할 구분: 본문 2절 그림과 같습니다", "Claude 데스크톱 등에서 MCP 서버를 연결하는 실제 예시"] },
      { yt: "CQywdSdi5iA", title: "The Model Context Protocol (MCP)", ko: "MCP 소개 (Anthropic 공식)", channel: "Anthropic", len: "19:35", lang: "en", level: "핵심", sec: "2.",
        why: "MCP를 만든 Anthropic 팀이 설계 의도와 구성 요소를 직접 설명합니다. 실습 8-2에서 구현할 JSON-RPC 서버의 배경을 이해할 수 있습니다.",
        points: ["MCP의 세 가지 기본 요소: Tools, Resources, Prompts", "JSON-RPC 기반 메시지(initialize, tools/list, tools/call)", "왜 '표준'이 생태계를 키우는지: USB-C 비유"],
        terms: [["JSON-RPC", "JSON으로 원격 함수를 호출하는 가벼운 규약"], ["transport", "메시지를 실어 나르는 방식 (stdio, HTTP)"]] },
      { yt: "eur8dUO9mvE", title: "What is MCP? Integrate AI Agents with Databases & APIs", ko: "MCP란? 에이전트를 DB·API와 연결하기", channel: "IBM Technology", len: "3:46", lang: "en", level: "입문", sec: "2.",
        why: "4분짜리 화이트보드 요약입니다. ②를 보기 전후에 핵심만 빠르게 정리하는 용도로 좋습니다.",
        points: ["에이전트 ↔ MCP 클라이언트 ↔ MCP 서버 ↔ 데이터·API 연결 구조", "한 번 만든 MCP 서버를 여러 에이전트가 재사용할 수 있다는 장점"] },
      { yt: "1n_Kui6B43Y", title: "AI 에이전트의 원리: 싱글 에이전트 vs 멀티 에이전트", channel: "모두의AI", len: "27:43", lang: "ko", level: "심화", sec: "1.",
        why: "단일 에이전트와 멀티 에이전트 구조의 장단점을 우리말로 비교합니다. 본문 1절 '언제, 왜?'를 판단하는 기준을 세울 수 있습니다.",
        points: ["역할을 나누면 좋아지는 점: 각 에이전트의 컨텍스트가 짧고 집중됩니다", "나누면 나빠지는 점: 비용 증가, 에이전트 사이 정보 손실", "오케스트레이터가 하위 에이전트에게 무엇을 넘겨야 하는지"] },
    ],
  },

  "09": {
    intro: "평가 없이 고친 프롬프트는 '느낌상 좋아진 것'일 뿐입니다. ①로 LLM 채점기를, ②로 평가 체계 구축 전체를, ③으로 관측과 평가의 연결을 익히세요.",
    items: [
      { yt: "trfUBIDeI1Y", title: "LLM as a Judge: Scaling AI Evaluation Strategies", ko: "LLM을 채점자로 쓰기: 평가 확장 전략", channel: "IBM Technology", len: "6:09", lang: "en", level: "입문", sec: "4.",
        why: "정답이 하나로 정해지지 않는 답변을 다른 LLM으로 채점하는 방법과 주의점을 6분 안에 정리합니다. 본문 4절 채점기 종류와 연결됩니다.",
        points: ["직접 점수 매기기와 두 답변 비교(pairwise) 방식", "채점 LLM의 편향: 긴 답 선호, 자기 답 선호, 순서 편향", "채점 기준(rubric)을 구체적으로 써야 하는 이유"] },
      { yt: "a3SMraZWNNs", title: "How to Systematically Setup LLM Evals (Metrics, Unit Tests, LLM-as-a-Judge)", ko: "LLM 평가 체계 세우기 (지표, 단위 테스트, LLM 채점)", channel: "Dave Ebbelaar", len: "55:02", lang: "en", level: "핵심", sec: "3.",
        why: "평가셋 만들기부터 규칙 기반 테스트, LLM 채점, 지표 추적까지 실무 흐름 전체를 코드로 보여 줍니다. 실습 9-1~9-3을 하기 전에 앞부분만 봐도 큰 도움이 됩니다.",
        points: ["실제 사용 사례에서 평가 케이스를 뽑는 방법", "정답 비교 → 규칙 검사 → LLM 채점 순으로 싸고 확실한 채점부터 쓰기", "프롬프트를 바꿀 때마다 같은 평가셋을 돌려 비교하기: 본문 8절 A/B 비교"] },
      { yt: "FDVdLrloFOw", title: "Observability and Evals for AI Agents: A Simple Breakdown", ko: "에이전트의 관측과 평가 쉽게 이해하기", channel: "LangChain", len: "14:45", lang: "en", level: "심화", sec: "6.",
        why: "에이전트는 최종 답뿐 아니라 '어떤 도구를 어떤 순서로 불렀는지'도 평가해야 합니다. 트레이스(기록)가 평가의 재료가 되는 과정을 보여 줍니다.",
        points: ["트레이스: LLM 호출과 도구 호출을 단계별로 기록한 것", "최종 결과 평가와 궤적(trajectory) 평가의 차이: 본문 6절", "운영 중 수집한 트레이스를 평가셋으로 되돌리는 순환"] },
    ],
  },

  "10": {
    intro: "프로덕션 에이전트의 가장 큰 위협은 프롬프트 인젝션입니다. ①로 공격 원리를, ②로 OWASP가 정리한 LLM 위협 전체를, ③으로 에이전트 관점의 방어를 정리하세요.",
    items: [
      { yt: "jrHRe9lSqqA", title: "What Is a Prompt Injection Attack?", ko: "프롬프트 인젝션 공격이란?", channel: "IBM Technology", len: "10:57", lang: "en", level: "입문", sec: "2.",
        why: "직접 인젝션과 간접 인젝션의 차이, 왜 완벽히 막기 어려운지를 예시로 설명합니다. 본문 2절 위협 모델의 영상판입니다.",
        points: ["직접 인젝션: 사용자가 지시를 덮어쓰려는 공격", "간접 인젝션: 웹 페이지·문서·이메일 속에 숨은 지시 (에이전트에게 특히 위험)", "단일 방어로는 부족하고 여러 겹의 방어가 필요한 이유: 본문 3절 Defense in Depth"],
        terms: [["prompt injection", "입력 데이터에 지시를 숨겨 모델의 행동을 바꾸려는 공격"], ["jailbreak", "모델의 안전 규칙을 우회하려는 시도"]] },
      { yt: "wjkRRRbV1l4", title: "OWASP가 경고하는 LLM 10대 보안위협: 모델 포이즈닝, 과도한 에이전시, 공급망, 프롬프트 인젝션", channel: "토크아이티(Talk IT)", len: "7:21", lang: "ko", level: "핵심", sec: "2.",
        why: "OWASP LLM Top 10을 우리말로 짧게 훑습니다. 특히 '과도한 에이전시(Excessive Agency)'는 본문 4절 도구 권한 등급과 직결됩니다.",
        points: ["프롬프트 인젝션, 민감 정보 노출, 공급망 위험", "과도한 에이전시: 에이전트에게 필요 이상의 권한을 주는 위험", "본문 10절 배포 체크리스트와 하나씩 대조해 보세요"] },
      { yt: "KDcayRssGbw", title: "Prompt Injection, Clearly Explained", ko: "프롬프트 인젝션 명확하게 이해하기", channel: "ByteByteAI and ByteByteGo", len: "5:46", lang: "en", level: "심화", sec: "9.",
        why: "도구를 쓰는 에이전트에서 인젝션이 실제 피해로 이어지는 경로와 방어 설계를 그림으로 정리합니다. 본문 9절 '간접 인젝션 감지와 격리' 예제와 함께 보세요.",
        points: ["외부 데이터는 '지시'가 아니라 '데이터'로 다뤄야 한다는 원칙", "권한 분리와 사람 승인(Human-in-the-loop)으로 피해 범위 줄이기", "입력·출력 양쪽에 가드레일을 두는 구조"] },
    ],
  },

  p1: {
    intro: "pandas로 데이터를 정제·집계하고, scikit-learn 회귀 모델로 수요를 예측한 뒤 에이전트 도구로 감싸는 프로젝트입니다. Step 1~3 전에 ①②③을 보면 실습이 훨씬 수월합니다.",
    items: [
      { yt: "9PF4BAFh-J8", title: "Pandas 기본 사용법 [파이썬 데이터 분석과 이미지 처리]", channel: "동빈나", len: "12:14", lang: "ko", level: "입문", sec: "Step 1.",
        why: "Series, DataFrame, 행·열 선택 등 pandas 기초를 12분 안에 정리합니다. Step 1 데이터 불러오기와 정제 전에 보세요.",
        points: ["DataFrame 만들기와 CSV 읽기", "열 선택, 조건으로 행 거르기", "결측치·중복 처리는 Step 1 실습 지시와 함께 확인하세요"] },
      { yt: "D5ep0-slc6U", title: "Pandas 기초 - 파이썬 판다스로 기본 통계 하기 value_counts, nunique, sum, count, mean, median", channel: "오늘코드todaycode", len: "11:46", lang: "ko", level: "핵심", sec: "Step 2.",
        why: "Step 2 분석 함수에서 쓰는 집계 함수들을 미리 익힙니다.",
        points: ["value_counts, nunique로 범주 분포 보기", "sum, mean, median 등 기초 통계", "groupby와 결합하면 지역별·월별 매출 요약이 됩니다 (Step 2 summarize)"] },
      { yt: "Q81RR3yKn30", title: "Regularization Part 1: Ridge (L2) Regression", ko: "정규화 1부: Ridge(L2) 회귀", channel: "StatQuest with Josh Starmer", len: "20:27", lang: "en", level: "심화", sec: "Step 3.",
        why: "Step 3 수요 예측에서 쓰는 Ridge 회귀가 일반 선형 회귀와 무엇이 다른지, 왜 과적합을 줄이는지 그림으로 설명합니다.",
        points: ["선형 회귀가 데이터가 적을 때 과적합되는 이유", "Ridge는 기울기가 커지는 것에 벌점을 줘 모델을 안정시킨다", "alpha(λ) 값이 클수록 단순한 모델이 된다는 점"],
        terms: [["overfitting", "학습 데이터에만 지나치게 맞춰져 새 데이터에서 성능이 떨어지는 현상"], ["regularization", "모델 복잡도에 벌점을 줘 과적합을 줄이는 기법"]] },
    ],
  },

  p2: {
    intro: "센서 데이터로 이상을 탐지하고 7일 내 고장을 예측하는 프로젝트입니다. ①②로 예지보전의 개념을, ③으로 Step 4의 RandomForest를, ④로 이상 탐지 이론을 보강하세요.",
    items: [
      { yt: "2_o1SDy6__U", title: "Predictive Maintenance Explained", ko: "예지보전 쉽게 이해하기", channel: "RealPars", len: "7:26", lang: "en", level: "입문", sec: "왜",
        why: "사후 보전, 예방 보전, 예지 보전의 차이를 현장 관점에서 설명합니다. 프로젝트의 '왜 예지보전인가' 절과 같은 내용입니다.",
        points: ["고장 후 수리(사후)와 주기적 교체(예방)의 비용 문제", "센서 데이터로 상태를 보고 필요할 때만 정비하는 예지보전", "진동·온도 같은 센서 신호가 고장의 전조가 되는 원리"] },
      { yt: "BApzsgq32mM", title: "How to Use Machine Learning for Predictive Maintenance", ko: "머신러닝으로 예지보전하는 방법", channel: "RealPars", len: "5:33", lang: "en", level: "핵심", sec: "Step 3.",
        why: "센서 데이터를 특징으로 만들고 고장 여부를 예측하는 머신러닝 흐름을 보여 줍니다. Step 3 특징 공학과 Step 4 모델링의 큰 그림입니다.",
        points: ["과거 고장 기록을 라벨로 쓰는 지도 학습", "원시 센서 값보다 추세·변화량 같은 특징이 중요하다는 점", "예측 결과를 정비 일정에 연결하는 운영 흐름: Step 5~6 에이전트와 연결됩니다"] },
      { yt: "J4Wdy0Wc_xQ", title: "StatQuest: Random Forests Part 1 - Building, Using and Evaluating", ko: "랜덤 포레스트 1부: 만들기, 쓰기, 평가하기", channel: "StatQuest with Josh Starmer", len: "9:54", lang: "en", level: "핵심", sec: "Step 4.",
        why: "Step 4에서 쓰는 RandomForestClassifier의 원리를 10분 만에 그림으로 설명합니다.",
        points: ["부트스트랩 샘플로 여러 결정 트리를 만드는 방법", "트리마다 일부 특징만 고려해 다양성을 높이는 이유", "여러 트리의 투표로 예측하고, predict_proba는 투표 비율이라는 점"] },
      { yt: "ECgI1YVQpY8", title: "03-1: Anomaly Detection - Overview", ko: "이상치 탐지 개요", channel: "서울대학교 산업공학과 DSBA 연구실", len: "37:56", lang: "ko", level: "심화", sec: "Step 2.",
        why: "이상 탐지 문제의 정의와 접근 방식을 우리말 대학 강의로 정리합니다. Step 2 rolling z-score가 어떤 계열의 방법인지 이해할 수 있습니다.",
        points: ["이상 탐지와 분류 문제의 차이: 이상 데이터는 매우 드물다", "통계 기반, 거리 기반, 밀도 기반 등 접근 방식", "정밀도와 재현율의 균형: Step 4 평가 지표와 연결됩니다"] },
    ],
  },

  p3: {
    intro: "고객 문의를 구조화 출력으로 분류하고, FAQ 검색·답변 초안·검수·비동기 배치·평가까지 잇는 파이프라인 프로젝트입니다. 모듈 02·07·09 영상을 함께 복습하면 좋습니다.",
    items: [
      { yt: "fuMKrKlaku4", title: "OpenAI Structured Output - All You Need to Know", ko: "구조화 출력의 모든 것", channel: "Dave Ebbelaar", len: "24:46", lang: "en", level: "핵심", sec: "Step 2.",
        why: "Step 2 구조화 출력 분류기를 만들기 전에 스키마 설계, 열거형(enum) 필드, 검증의 실제 사례를 볼 수 있습니다. OpenAI 기준이지만 Claude의 도구 기반 구조화 출력과 개념이 같습니다.",
        points: ["카테고리·우선순위 같은 필드를 enum으로 제한하는 이유", "Pydantic 같은 스키마로 응답을 검증하는 흐름", "스키마를 통과해도 값이 틀릴 수 있으니 재시도·검증 로직을 두기: Step 2 재시도"] },
      { yt: "K56nNuBEd0c", title: "AsyncIO, await, and async - Concurrency in Python", ko: "Python 동시성: AsyncIO, async, await", channel: "Socratica", len: "9:12", lang: "en", level: "핵심", sec: "Step 5.",
        why: "Step 5 비동기 배치 파이프라인 전에 async/await의 동작을 9분 안에 다시 정리합니다.",
        points: ["동시성(concurrency)과 병렬성(parallelism)의 차이", "I/O 대기가 많은 LLM 호출에 asyncio가 잘 맞는 이유", "gather로 여러 문의를 한꺼번에 처리하는 패턴"] },
      { yt: "trfUBIDeI1Y", title: "LLM as a Judge: Scaling AI Evaluation Strategies", ko: "LLM을 채점자로 쓰기", channel: "IBM Technology", len: "6:09", lang: "en", level: "심화", sec: "Step 4.",
        why: "Step 4 평가자-최적화 루프에서 답변 초안을 검수하는 LLM 채점자를 설계할 때 참고합니다. (모듈 09와 같은 영상입니다)",
        points: ["검수 기준(rubric)을 구체적인 체크리스트로 만들기", "채점 LLM의 편향을 줄이는 방법", "검수 결과를 다시 작성 단계로 돌려 고치게 하는 루프"] },
    ],
  },
};

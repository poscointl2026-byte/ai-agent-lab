# AI Agent Lab

이론 학습과 실습을 한 화면에서 할 수 있는 AI 에이전트 학습 사이트입니다.
Python 코드는 브라우저 안에서(Pyodide) 실행되며, 설정에서 Claude 또는 OpenAI API 키를 넣으면 실제 LLM을 호출합니다. 키가 없으면 Mock LLM을 사용합니다.

## 실행 방법

1. 서버는 Windows 로그인 시 자동으로 시작됩니다(시작프로그램의 `AI Agent Lab Server` 바로가기 → `server-hidden.vbs`, 창 없이 실행). 수동 실행은 `start.bat`.
2. 브라우저에서 http://localhost:8000 에 접속합니다.
   - 자동 실행 해제: `Win+R` → `shell:startup` → `AI Agent Lab Server` 바로가기 삭제
   - 지금 끄기: 작업 관리자에서 `python.exe`(http.server) 종료
3. ⚙️ 설정에서 LLM을 고릅니다 (Mock / Claude / OpenAI).

> `index.html`을 파일로 직접 열면(`file://`) 콘텐츠와 Python 실행기를 불러올 수 없습니다. 반드시 로컬 서버로 여세요.
> 처음 실습을 실행할 때 Pyodide(약 10MB)를 CDN에서 내려받으므로 인터넷 연결이 필요합니다.

## 커리큘럼

### 📘 스터디 (기초 → 고급)

| 단계 | 모듈 | 주제 |
|---|---|---|
| 기초 | 00 | 에이전트 개발을 위한 Python (JSON, async, 예외 처리) |
| 기초 | 01 | LLM 기초와 API 호출 |
| 기초 | 02 | 프롬프트 엔지니어링과 구조화 출력 |
| 중급 | 03 | Tool Use (Function Calling) |
| 중급 | 04 | 에이전트 루프 (ReAct) |
| 중급 | 05 | Memory와 컨텍스트 관리 |
| 중급 | 06 | RAG: 검색 증강 생성 |
| 고급 | 07 | 워크플로 패턴 |
| 고급 | 08 | 멀티 에이전트와 MCP |
| 고급 | 09 | 평가(Evals)와 관측 |
| 고급 | 10 | 가드레일과 프로덕션 운영 |

각 모듈은 **이론 → 실행 예제 → 퀴즈 → 자동 채점 실습** 순서로 구성됩니다.

### 🛠 실전 프로젝트 (단계별)

| 프로젝트 | 내용 | 데이터 |
|---|---|---|
| P1 매출 분석·수요 예측 에이전트 | 데이터 정제 → 분석 함수 → 예측 모델(scikit-learn) → 도구화 → 분석 에이전트 → 월간 리포트 자동화 | `sales.csv` |
| P2 설비 예지보전 에이전트 | 센서 탐색 → 이상 탐지 → 특징 공학 → 고장 예측 모델 → 정비 에이전트 → 작업지시 + 사람 승인 | `sensors.csv` |
| P3 고객 문의 자동 처리 워크플로 | 출력 스키마 → 구조화 분류 → 라우팅·FAQ 검색 → 답변 초안·검수 → 비동기 배치 → 정확도 평가 | `tickets.csv`, `faq.json` |

프로젝트는 `## Step N.` 단위로 진행됩니다. 앞 단계 실습을 통과해야 다음 단계가 열리고,
**이전 단계들의 정답 코드가 자동으로 먼저 실행**되므로 앞에서 만든 함수를 그대로 이어 쓸 수 있습니다.
pandas·numpy·scikit-learn·matplotlib은 코드의 import를 보고 자동으로 내려받습니다(처음 한 번 10~30초).

### 📺 영상 강의

모든 모듈과 프로젝트 상단에 **영상으로 먼저 보기** 블록이 있습니다(총 46개 영상, 한국어·영어).
각 영상에는 보는 이유, 시청 포인트, 핵심 용어 해설이 붙어 있고, 본문의 관련 절 제목 옆에 `📺 관련 영상` 링크가 표시됩니다.
썸네일을 누르면 페이지 안에서 바로 재생되고, `시청 완료` 체크는 브라우저에 저장됩니다. 사이드바 **📺 영상 강의**에서 언어·수준별로 모아 볼 수 있습니다.
영상 목록은 `assets/js/videos.js` 한 파일에서 관리합니다.

진행 상황과 작성한 코드는 브라우저(localStorage)에 저장됩니다.

## 폴더 구조

```
index.html              앱 진입점
start.bat               로컬 서버 실행 (이미 떠 있으면 브라우저만 열기)
server-hidden.vbs       창 없는 백그라운드 서버 (시작프로그램 등록용)
content/                스터디 모듈 마크다운 (이론 + 실습 블록)
content/projects/       실전 프로젝트 마크다운
assets/data/            실습 데이터 (tools/make_data.py로 재생성, 워커가 data/ 폴더로 올림)
assets/fonts/           그래프용 한글 글꼴 (나눔고딕, OFL)
assets/css/style.css
assets/js/app.js        라우팅, 위젯(에디터·퀴즈·채점), 프로젝트 단계·잠금, 진행률
assets/js/pages.js      단계·모듈·프로젝트 목록, 플레이그라운드 예제, 참고 자료
assets/js/llm.js        LLM 브리지 (Mock / Anthropic / OpenAI)
assets/js/runner.js     Python 워커 관리
assets/js/py-worker.js  Pyodide 실행 (Web Worker, 패키지 자동 로드, 데이터·글꼴 준비)
assets/py/agentlab.py   실습용 Python 헬퍼 (chat, tool_input, show_plot, scripted ...)
tools/make_data.py      합성 데이터셋 생성기 (시드 고정)
```

## 모듈·프로젝트 추가하기

1. `content/11-xxx.md`(또는 `content/projects/p4-xxx.md`) 파일을 만듭니다.
2. `assets/js/pages.js`의 `MODULES`(또는 `PROJECTS`)에 항목을 추가합니다.

마크다운 안에서 쓸 수 있는 특수 블록은 다음과 같습니다 (모두 `id=`가 필요합니다). 화면 표시용 코드는 `~~~`로 감쌉니다.

````
```python run id=x-d1        ← 실행 가능한 예제
```quiz id=x-q1              ← 퀴즈 (JSON: q, options, answer, explain)
```hint id=x-e1              ← 실습 힌트
```python starter id=x-e1    ← 실습 시작 코드 (이 위치에 실습 위젯이 표시됨)
```python test id=x-e1       ← 채점 코드 (assert 사용, 화면에 표시되지 않음)
```python solution id=x-e1   ← 정답 예시
```python prelude id=x-e1    ← (선택) 이 위젯 실행 전에 몰래 먼저 실행할 코드
````

프로젝트에서는 `## Step N. 제목`으로 단계를 나누며, 정답(solution) 코드는 다음 단계의 prelude로 이어지므로
**정의(import, 함수, 클래스, 상수)만** 담아야 합니다.

채점 코드에서는 `agentlab.scripted([...])`로 LLM 응답을 고정해 API 비용 없이 결과를 확인합니다. 채점 전에 `agentlab.calls`(요청 기록)는 초기화됩니다.

## 보안 참고

API 키는 **방문자 각자의 브라우저 localStorage**에만 저장되고 LLM API로 직접 전송됩니다(Anthropic은 `anthropic-dangerous-direct-browser-access` 헤더 사용). 사이트 서버(GitHub Pages)로는 키가 전송되지 않으므로 공개 배포해도 키가 노출되지 않지만, 공용 PC에서는 사용 후 설정에서 키를 지우세요. 운영자의 키를 모든 방문자가 쓰게 하려면 키를 브라우저에 두지 말고 서버 프록시를 따로 두어야 합니다.

## 공개 배포 (GitHub Pages)

이 사이트는 정적 파일만으로 동작하므로 GitHub Pages에 그대로 올립니다. 내용을 수정한 뒤에는 커밋하고 `git push`하면 1~2분 뒤 공개 URL에 반영됩니다.

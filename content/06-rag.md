# 모듈 6. RAG: 검색 증강 생성

> **학습 목표**: LLM이 모르는 지식(사내 문서, 최신 정보)을 **검색해서 프롬프트에 넣어 주는** RAG(Retrieval-Augmented Generation)의 전체 파이프라인을 이해하고, 청킹 → 검색(BM25) → 근거 인용 답변까지 직접 구현합니다.

## 1. 왜 RAG가 필요한가

LLM은 학습 데이터로 배운 지식만 "기억"합니다. 실제 업무에 쓰려고 하면 곧 네 가지 벽에 부딪힙니다.

| 문제 | 설명 | RAG가 해결하는 방법 |
|---|---|---|
| **지식 컷오프** | 학습 시점 이후의 정보(새 규정, 이번 달 실적)를 모릅니다 | 최신 문서를 검색해 프롬프트에 넣습니다 |
| **비공개 데이터** | 사내 매뉴얼, 계약서, 설비 이력은 학습 데이터에 없습니다 | 내 문서 저장소를 검색 대상으로 씁니다 |
| **환각(Hallucination)** | 모르는 것도 그럴듯하게 지어냅니다 | "아래 출처만 근거로 답하라"고 범위를 제한합니다 |
| **검증 불가** | 답이 어디서 나왔는지 알 수 없습니다 | 출처 번호를 인용하게 해서 사람이 확인할 수 있게 합니다 |

> 💡 **파인튜닝과 비교**: 지식을 모델에 "학습"시키는 파인튜닝은 비용이 크고, 문서가 바뀔 때마다 다시 학습해야 하며, 출처를 보여줄 수 없습니다. 대부분의 "우리 회사 문서로 답하는 챗봇"은 **RAG가 먼저**입니다. 파인튜닝은 말투나 형식 같은 *행동*을 바꿀 때 고려합니다.

## 2. RAG 파이프라인 한눈에 보기

RAG는 **미리 해 두는 색인(Indexing)** 단계와 **질문이 올 때마다 하는 질의(Query)** 단계로 나뉩니다.

~~~text
[색인 단계: 문서가 바뀔 때만]
  원본 문서 ──▶ ① 수집/정제 ──▶ ② 청킹(chunk) ──▶ ③ 색인(BM25 사전 / 벡터 DB)

[질의 단계: 질문마다]
  사용자 질문 ──▶ ④ 검색(top-k 청크) ──▶ ⑤ 프롬프트 구성(출처 번호 + 지시문) ──▶ ⑥ LLM 생성 ──▶ 답변 + [1][3] 인용
~~~

| 단계 | 하는 일 | 품질에 미치는 영향 |
|---|---|---|
| ① 수집·정제 | PDF/HTML에서 텍스트 추출, 머리글·광고 제거 | 쓰레기가 들어가면 쓰레기가 나옵니다 |
| ② 청킹 | 긴 문서를 검색 단위로 자르기 | 너무 크면 잡음, 너무 작으면 맥락 손실 |
| ③ 색인 | 빠르게 찾을 수 있는 자료구조 만들기 | 검색 속도와 방식 결정 |
| ④ 검색 | 질문과 관련 높은 청크 k개 선택 | **RAG 품질의 대부분이 여기서 결정됩니다** |
| ⑤ 프롬프트 | 청크에 번호를 붙여 넣고 규칙 지시 | 인용·거절 행동을 결정 |
| ⑥ 생성 | LLM이 근거를 바탕으로 답변 | 모델 능력 |

실무 경험상 "RAG 답변이 이상하다"의 원인은 대부분 **④ 검색이 엉뚱한 청크를 가져온 것**입니다. 그래서 이 모듈은 검색에 가장 많은 시간을 씁니다.

## 3. 청킹(Chunking) 전략

문서를 통째로 넣지 않고 자르는 이유는 세 가지입니다. ① 컨텍스트 윈도우와 비용에 한계가 있고, ② 긴 문서 하나보다 **관련 있는 부분만** 넣어야 모델이 집중하며, ③ 검색 점수가 문서 전체로 희석되지 않습니다.

| 전략 | 방법 | 장점 | 단점 |
|---|---|---|---|
| **고정 길이 + 겹침** | N글자(또는 토큰)씩 자르고 앞뒤를 M글자 겹침 | 구현이 단순, 길이 예측 가능 | 문장·표 중간이 잘릴 수 있음 |
| **문단/제목 기준** | 빈 줄, `##` 제목 단위로 자름 | 의미 단위가 유지됨 | 길이가 들쭉날쭉 |
| **재귀 분할** | 제목 → 문단 → 문장 순으로 크기 이하가 될 때까지 분할 | 의미와 길이의 균형 | 구현이 조금 복잡 |
| **문맥 보강** | 청크 앞에 "문서 제목 > 섹션명"을 붙임 | 짧은 청크도 맥락을 가짐 | 색인 크기 증가 |

**겹침(overlap)** 이 왜 필요할까요? "연차는 입사 1년 후 | 15일이 부여됩니다"처럼 중요한 문장이 경계에서 잘리면 어느 청크도 완전한 정보를 갖지 못합니다. 앞 청크의 끝부분을 다음 청크 앞에 반복하면 이 손실을 줄일 수 있습니다.

~~~text
text:   [0 ........................ 250)
size=100, overlap=20  → step = 80
chunk1: [0   ~ 100)
chunk2:         [80  ~ 180)      ← 80~100 구간이 겹침
chunk3:                 [160 ~ 250)   ← 끝에 도달하면 멈춤
~~~

```python run id=rag-d1
text = (
    "## 휴가 규정\n연차는 입사 1년 후 15일이 부여됩니다. 3년 이상 근속 시 2년마다 1일씩 가산됩니다.\n\n"
    "## 출장 규정\n출장비는 사후 정산하며 영수증 원본이 필요합니다. 해외 출장은 2주 전에 신청합니다.\n\n"
    "## 보안 규정\n사내 문서는 외부 메신저로 전송할 수 없습니다. 노트북 반출 시 보안팀 승인이 필요합니다."
)

# 방법 1: 고정 길이 + 겹침
size, overlap = 60, 15
fixed = [text[i:i + size] for i in range(0, len(text), size - overlap)]
print(f"고정 길이: {len(fixed)}개 청크")
for c in fixed[:3]:
    print("  ·", c.replace("\n", " ⏎ "))

# 방법 2: 제목(##) 기준 + 제목을 문맥으로 유지
sections = [s.strip() for s in text.split("## ") if s.strip()]
print(f"\n제목 기준: {len(sections)}개 청크")
for s in sections:
    title, body = s.split("\n", 1)
    print(f"  · [{title}] {body[:40]}…")
```

> 실무에서는 청크 크기를 **토큰 기준 200~800** 정도에서 시작해, 검색 평가(8절)를 보며 조정합니다. 정답이 하나로 정해져 있지 않으므로 "측정하고 바꾸기"가 원칙입니다.

## 4. 어휘 기반 검색: TF-IDF와 BM25

가장 오래되었지만 지금도 강력한 방법은 **단어가 겹치는 정도**로 점수를 매기는 것입니다.

### 4-1. 직관부터

- **TF(Term Frequency)**: 질문 단어가 문서에 **많이** 나올수록 관련성이 높습니다.
- **IDF(Inverse Document Frequency)**: 모든 문서에 다 나오는 흔한 단어("규정", "합니다")는 변별력이 없습니다. **드문 단어일수록 가중치를 크게** 줍니다.
- **길이 정규화**: 긴 문서는 단어가 우연히 많이 나오므로 불리하게 보정합니다.

### 4-2. BM25 공식 읽기

BM25는 TF-IDF를 개선한 사실상의 표준입니다. 질문 q의 각 단어 t에 대해 점수를 더합니다.

~~~text
score(q, d) = Σ  IDF(t) × tf × (k1 + 1) / ( tf + k1 × (1 − b + b × |d| / avgdl) )
             t∈q

IDF(t) = ln( (N − df + 0.5) / (df + 0.5) + 1 )

tf    : 문서 d에서 단어 t가 나온 횟수
|d|   : 문서 d의 길이(토큰 수),  avgdl: 전체 문서 평균 길이
N     : 문서 수,  df: 단어 t가 들어 있는 문서 수
k1≈1.5: tf가 커질수록 점수가 "포화"되게 함 (같은 단어 100번 ≠ 100배 관련)
b≈0.75: 길이 정규화 강도 (0이면 길이 무시)
~~~

| 요소 | 의도 |
|---|---|
| `tf × (k1+1) / (tf + k1…)` | tf가 1→2일 때는 크게 오르지만 10→11일 때는 거의 안 오름 (포화) |
| `IDF` | 드문 단어일수록 큼. 모든 문서에 있는 단어는 0에 가까움 |
| `|d| / avgdl` | 평균보다 긴 문서는 tf 효과가 줄어듦 |

### 4-3. 한국어 토큰화 문제

한국어는 "연차는", "연차를", "연차가"처럼 조사가 붙어 공백으로만 자르면 같은 단어로 인식되지 않습니다. 형태소 분석기(Kiwi, Mecab 등)를 쓰는 것이 정석이지만, 간단하게는 **글자 2-gram**으로 쪼개면 꽤 잘 동작합니다. "연차는" → `["연차", "차는"]`, "연차" → `["연차"]` 이므로 "연차"가 겹칩니다.

```python run id=rag-d2
import math, re
from collections import Counter

def tokenize(text):
    words = re.findall(r"[가-힣]+|[a-z0-9]+", text.lower())
    tokens = []
    for w in words:
        if re.match(r"[가-힣]", w) and len(w) >= 2:
            tokens += [w[i:i + 2] for i in range(len(w) - 1)]   # 한글: 2-gram
        else:
            tokens.append(w)
    return tokens

DOCS = [
    "연차는 입사 1년 후 15일이 부여됩니다.",
    "출장비는 사후 정산하며 영수증 원본이 필요합니다.",
    "노트북 반출 시 보안팀 승인이 필요합니다.",
    "연차 사용 시 3일 전까지 팀장 승인을 받아야 합니다.",
]
print("토큰 예시:", tokenize("연차는 며칠인가요?"))

# TF-IDF로 간단히 점수 매기기
tokenized = [tokenize(d) for d in DOCS]
N = len(DOCS)
df = Counter(t for toks in tokenized for t in set(toks))
def tfidf_score(query, toks):
    tf = Counter(toks)
    return sum(tf[t] * math.log(N / df[t]) for t in tokenize(query) if t in tf)

q = "연차 승인은 누가 하나요?"
ranked = sorted(range(N), key=lambda i: tfidf_score(q, tokenized[i]), reverse=True)
for i in ranked:
    print(f"{tfidf_score(q, tokenized[i]):6.3f}  {DOCS[i]}")
```

> 4번 문서("연차" + "승인")가 1등이 되는지 확인해 보세요. "승인"만 겹치는 3번 문서와 "연차"만 겹치는 1번 문서가 그 뒤를 잇습니다.

## 5. 의미 기반 검색: 임베딩과 벡터 검색

어휘 검색은 **"휴가" vs "연차"** 처럼 단어가 다르면 못 찾습니다. 이를 보완하는 것이 **임베딩(embedding)** 입니다. 임베딩 모델은 문장을 수백~수천 차원의 숫자 벡터로 바꾸는데, **의미가 비슷한 문장은 가까운 벡터**가 되도록 학습되어 있습니다.

두 벡터가 얼마나 같은 방향을 가리키는지는 **코사인 유사도**로 잽니다.

~~~text
cos(a, b) = (a · b) / (‖a‖ × ‖b‖)      1에 가까울수록 비슷, 0이면 무관, −1이면 반대
~~~

아래는 실제 임베딩 API 대신 사람이 만든 3차원 "장난감 벡터"로 원리를 보여 줍니다. (축 의미: [휴가 관련, 돈 관련, 보안 관련])

```python run id=rag-d3
import numpy as np

def cosine(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    return float(a @ b / (np.linalg.norm(a) * np.linalg.norm(b)))

index = {
    "연차는 입사 1년 후 15일이 부여됩니다.":      [0.9, 0.1, 0.0],
    "출장비는 사후 정산합니다.":                  [0.1, 0.9, 0.1],
    "노트북 반출 시 보안팀 승인이 필요합니다.":    [0.0, 0.1, 0.95],
}
query = "휴가 며칠 쓸 수 있어?"     # 단어는 "연차"와 하나도 안 겹치지만…
q_vec = [0.85, 0.05, 0.05]          # 임베딩 모델이 "휴가" 의미로 매핑했다고 가정

for doc, vec in sorted(index.items(), key=lambda kv: -cosine(q_vec, kv[1])):
    print(f"{cosine(q_vec, vec):.3f}  {doc}")
```

| 비교 | 어휘 검색 (BM25) | 의미 검색 (임베딩) |
|---|---|---|
| 강점 | 고유명사, 코드, 품번("M07"), 정확한 용어 | 동의어, 바꿔 말하기, 다국어 |
| 약점 | 동의어를 못 찾음 | 숫자·품번 같은 정확 일치에 약함, 임베딩 비용 |
| 인프라 | 역색인(가벼움) | 벡터 DB, 임베딩 모델 호출 |

### 하이브리드 검색과 재순위화(Reranking)

실무에서 가장 많이 쓰는 조합은 다음과 같습니다.

1. **하이브리드**: BM25 상위 k개 + 벡터 검색 상위 k개를 합칩니다. 합칠 때는 점수 척도가 달라서 순위 기반 결합(RRF: `1/(60+순위)`의 합)을 자주 씁니다.
2. **재순위화**: 합친 후보 20~50개를 더 정밀한 모델(크로스 인코더 또는 LLM)로 다시 채점해 상위 3~5개만 프롬프트에 넣습니다.
3. **문맥 보강 청크(Contextual Retrieval)**: 색인할 때 각 청크 앞에 "이 청크가 문서 전체에서 무엇에 관한 부분인지" 짧은 설명을 붙여 검색 실패를 줄이는 기법입니다. Anthropic 엔지니어링 블로그에 자세한 실험이 있습니다.

## 6. 프롬프트 구성: 번호 붙은 출처와 인용 지시

검색한 청크를 그냥 이어 붙이면 모델이 출처를 구분하지 못합니다. **번호를 붙이고, 태그로 감싸고, 규칙을 명시**합니다.

~~~text
<sources>
[1] 연차는 입사 1년 후 15일이 부여됩니다.
[2] 연차 사용 시 3일 전까지 팀장 승인을 받아야 합니다.
</sources>

질문: 연차는 며칠이고 어떻게 신청하나요?

위 출처만 근거로 답하고, 문장 끝에 [번호]로 출처를 표시하세요. 출처에 없으면 '모르겠습니다'라고 답하세요.
~~~

| 지시 | 이유 |
|---|---|
| "위 출처만 근거로" | 모델의 사전 지식이 섞여 환각이 생기는 것을 줄입니다 |
| "[번호]로 표시" | 사람이 근거를 검증하고, 코드로 인용을 추출할 수 있습니다 |
| "없으면 모르겠습니다" | **거절할 권리**를 줘야 지어내지 않습니다 |
| 출처를 질문보다 **앞에** | 긴 문서를 먼저, 질문을 마지막에 두면 대체로 답변 품질이 좋아집니다 |

답변을 받은 뒤에는 코드로 `[숫자]`를 뽑아 **실제로 존재하는 출처 번호만** 남깁니다. 모델이 `[9]`처럼 없는 번호를 쓰는 경우가 있기 때문입니다.

## 7. Agentic RAG: 검색을 도구로 주기

지금까지는 "질문 → 무조건 검색 → 답변"이라는 고정된 **워크플로**였습니다. 모듈 3~4에서 배운 도구 사용을 결합하면, **모델이 검색 여부와 검색어를 스스로 결정**하게 할 수 있습니다.

| 고정 RAG | Agentic RAG |
|---|---|
| 항상 원문 질문으로 1회 검색 | 모델이 검색어를 다듬고, 필요하면 여러 번 검색 |
| 인사말에도 검색 비용 발생 | 필요 없으면 검색하지 않음 |
| 단순·예측 가능 | 복잡한 질문("A와 B 규정 비교")에 강함 |

```python run id=rag-d4
from agentlab import chat, tool_calls, tool_result, text_of

KB = {
    "휴가": "연차는 입사 1년 후 15일이 부여됩니다. 3일 전까지 팀장 승인이 필요합니다.",
    "출장": "출장비는 사후 정산하며 영수증 원본이 필요합니다.",
    "보안": "노트북 반출 시 보안팀 승인이 필요합니다.",
}

def search_kb(query):
    hits = [f"[{k}] {v}" for k, v in KB.items() if k in query or any(w in v for w in query.split())]
    return "\n".join(hits) or "검색 결과 없음"

TOOLS = [{
    "name": "search_kb",
    "description": "사내 규정 문서를 검색합니다. 규정, 휴가, 출장, 보안 관련 질문에 사용하세요.",
    "input_schema": {"type": "object",
                     "properties": {"query": {"type": "string", "description": "검색어"}},
                     "required": ["query"]},
}]
SYSTEM = "사내 규정 도우미입니다. 규정 질문은 반드시 search_kb로 검색한 뒤 결과만 근거로 답하세요."

messages = [{"role": "user", "content": "휴가 규정 검색해서 연차가 며칠인지 알려줘"}]
for step in range(4):
    resp = await chat(messages, system=SYSTEM, tools=TOOLS)
    messages.append({"role": "assistant", "content": resp["content"]})
    if resp["stop_reason"] != "tool_use":
        print("🤖", text_of(resp))
        break
    results = []
    for c in tool_calls(resp):
        out = search_kb(c["input"]["query"])
        print(f"🔎 search_kb({c['input']['query']!r}) →\n{out}\n")
        results.append(tool_result(c["id"], out))
    messages.append({"role": "user", "content": results})
```

> 도구 설명(description)에 **언제** 써야 하는지 적는 것이 중요합니다. 실제 Claude를 연결하면 모델이 "연차 일수"처럼 검색어를 스스로 다듬는 모습을 볼 수 있습니다.

## 8. 검색 품질 평가: recall@k

"답변이 좋아졌다/나빠졌다"를 감으로 판단하면 개선이 불가능합니다. 검색 단계는 **정답 청크를 알고 있는 질문 세트**로 따로 평가합니다.

- **recall@k**: 정답 청크 중 상위 k개 안에 들어온 비율. "필요한 근거를 놓치지 않았나?"
- **precision@k**: 상위 k개 중 정답 청크의 비율. "잡음을 얼마나 넣었나?"
- **MRR**: 첫 정답이 몇 등에 나왔는지의 역수 평균. "정답이 위에 있나?"

~~~text
질문: "연차 승인 절차"   정답 청크: {3, 7}
검색 결과 top-3: [3, 1, 9]  → recall@3 = 1/2 = 0.5,  precision@3 = 1/3
~~~

생성 품질(답이 맞는지, 인용이 정확한지)은 모듈 9의 평가 기법으로 측정합니다. **검색 평가와 생성 평가를 분리**해야 어느 단계를 고칠지 알 수 있습니다.

## 9. 자주 하는 실수

| 실수 | 증상 | 해결 |
|---|---|---|
| 청크가 너무 큼 | 관련 없는 내용이 섞여 답이 흐려짐 | 크기를 줄이고 top-k를 늘림 |
| 청크가 너무 작음 | "그 규정"처럼 맥락이 끊김 | 겹침 추가, 제목·문서명 붙이기 |
| 표·PDF 추출 오류 | 숫자 열이 뒤섞여 잘못된 답 | 추출 결과를 반드시 눈으로 확인 |
| 거절 지시 없음 | 출처에 없는 내용을 지어냄 | "없으면 모르겠습니다" 명시 |
| 인용 번호 미검증 | 존재하지 않는 [9]를 그대로 표시 | 코드로 유효 번호만 필터링 |
| 검색을 평가하지 않음 | 프롬프트만 계속 고침 | recall@k로 검색부터 측정 |
| 문서 권한 무시 | 열람 권한 없는 문서가 답에 노출 | 검색 단계에서 사용자 권한으로 필터 |

## 10. 실무 팁

- **메타데이터 필터**를 함께 쓰세요. "2025년 규정만", "설비 M07 문서만"처럼 검색 전에 범위를 좁히면 정확도가 크게 오릅니다.
- **질문 재작성**: 대화형에서는 "그럼 그건?" 같은 후속 질문을 이전 대화를 반영한 독립 질문으로 바꾼 뒤 검색합니다.
- **긴 컨텍스트와의 관계**: 컨텍스트 윈도우가 커졌어도 문서가 수천 개면 RAG가 필요합니다. 문서가 몇 개뿐이라면 통째로 넣는 것이 더 단순하고 정확할 수 있습니다. 프롬프트 캐싱과 함께 비교해 보세요.
- **출처 링크 노출**: 사용자 화면에 인용 번호와 원문 링크를 보여주면 신뢰도가 높아지고 오류 신고도 쉬워집니다.

## 11. 확인 퀴즈

```quiz id=rag-q1
{"q": "청킹할 때 겹침(overlap)을 두는 주된 이유는?", "options": ["색인 크기를 줄이기 위해", "청크 경계에서 문장이 잘려 정보가 손실되는 것을 줄이기 위해", "검색 속도를 높이기 위해", "LLM 호출 횟수를 줄이기 위해"], "answer": 1, "explain": "중요한 문장이 경계에서 잘리면 어느 청크도 완전한 정보를 갖지 못합니다. 겹침은 이를 완화합니다."}
```

```quiz id=rag-q2
{"q": "BM25에서 IDF가 하는 역할은?", "options": ["문서가 길수록 점수를 높인다", "모든 문서에 흔히 나오는 단어의 가중치를 낮추고 드문 단어를 높인다", "같은 단어가 반복될수록 점수를 무한히 높인다", "질문의 길이를 정규화한다"], "answer": 1, "explain": "IDF는 변별력 없는 흔한 단어의 영향을 줄이고, 드문 단어에 더 큰 가중치를 줍니다."}
```

```quiz id=rag-q3
{"q": "사용자가 '휴가'라고 물었는데 문서에는 '연차'라고만 적혀 있습니다. 어떤 검색 방식이 더 유리한가요?", "options": ["BM25 같은 어휘 기반 검색", "임베딩 기반 의미 검색", "정규식 검색", "검색 없이 LLM에게 직접 묻기"], "answer": 1, "explain": "임베딩은 의미가 비슷한 표현을 가까운 벡터로 매핑하므로 동의어에 강합니다. 실무에서는 둘을 합친 하이브리드 검색을 많이 씁니다."}
```

```quiz id=rag-q4
{"q": "RAG 답변 품질이 나쁠 때 가장 먼저 확인할 것은?", "options": ["더 큰 모델로 바꾸기", "검색 단계가 정답 청크를 가져왔는지(recall@k)", "system 프롬프트를 더 길게 쓰기", "max_tokens 늘리기"], "answer": 1, "explain": "검색이 엉뚱한 청크를 가져오면 어떤 모델도 맞는 답을 할 수 없습니다. 검색과 생성을 분리해 평가하세요."}
```

## 12. 실습

### 실습 6-1. 겹침이 있는 고정 길이 청킹

`chunk_text(text, size, overlap)`을 완성하세요.

- `overlap >= size`이면 `ValueError`를 발생시킵니다. (그렇지 않으면 무한 루프가 됩니다)
- 빈 문자열이면 `[]`를 반환합니다.
- 0부터 시작해 `text[start:start+size]`를 추가하고, **청크 끝이 텍스트 끝에 도달하면(`start + size >= len(text)`) 멈춥니다.** 그렇지 않으면 `start`를 `size - overlap`만큼 이동합니다.

```hint id=rag-e1
while True 루프 안에서 chunks.append(text[start:start + size]) 후, if start + size >= len(text): break, 아니면 start += size - overlap 하세요. 마지막에 아주 짧은 꼬리 청크가 중복으로 생기지 않도록 '끝에 도달하면 멈춤' 조건이 중요합니다.
```

```python starter id=rag-e1
def chunk_text(text, size=100, overlap=20):
    # TODO: 1) overlap 검사  2) 빈 문자열 처리  3) 겹침 있는 청킹
    pass

# 직접 확인해 보기:
# print(chunk_text("가나다라마바사아자차카타파하", size=5, overlap=2))
```

```python test id=rag-e1
text = "".join(str(i % 10) for i in range(250))
chunks = chunk_text(text, size=100, overlap=20)
assert isinstance(chunks, list), "리스트를 반환해야 합니다"
assert len(chunks) == 3, f"250글자, size=100, overlap=20이면 청크 3개여야 합니다 (현재 {len(chunks)}개)"
assert chunks[0] == text[0:100], "첫 청크는 text[0:100]이어야 합니다"
assert chunks[1] == text[80:180], "두 번째 청크는 80에서 시작해야 합니다 (size - overlap = 80)"
assert chunks[2] == text[160:250], "마지막 청크는 160부터 끝까지여야 합니다"
assert chunks[0][-20:] == chunks[1][:20], "인접 청크는 overlap만큼 겹쳐야 합니다"

two = chunk_text("a" * 200, size=100, overlap=0)
assert len(two) == 2, f"200글자를 겹침 없이 100씩 자르면 2개입니다 (현재 {len(two)}개)"
short = chunk_text("짧은 문장", size=100, overlap=20)
assert short == ["짧은 문장"], "size보다 짧은 텍스트는 청크 1개입니다"
assert chunk_text("", size=10, overlap=2) == [], "빈 문자열은 빈 리스트를 반환하세요"
try:
    chunk_text("abc", size=10, overlap=10)
    raise AssertionError("overlap >= size이면 ValueError를 발생시켜야 합니다")
except ValueError:
    pass
print("✅ 모든 테스트 통과!")
```

```python solution id=rag-e1
def chunk_text(text, size=100, overlap=20):
    if overlap >= size:
        raise ValueError("overlap은 size보다 작아야 합니다")
    if not text:
        return []
    chunks = []
    start = 0
    while True:
        chunks.append(text[start:start + size])
        if start + size >= len(text):
            break
        start += size - overlap
    return chunks
```

### 실습 6-2. BM25 검색기 구현

`bm25_search(query, docs, k=3, k1=1.5, b=0.75)`를 완성하세요. 토큰화 함수 `tokenize`는 주어져 있습니다(한글은 2-gram).

- 각 문서를 토큰화하고, 문서 수 `N`, 평균 길이 `avgdl`, 단어별 문서 빈도 `df`를 구합니다.
- 4-2절의 공식으로 각 문서의 점수를 계산합니다. `IDF(t) = math.log((N - df + 0.5) / (df + 0.5) + 1)`
- 질문 토큰은 **중복을 제거하지 않고** 그대로 더합니다(질문에 두 번 나온 단어는 두 번 더해짐).
- **점수가 0보다 큰 문서만** `(문서 인덱스, 점수)` 튜플로, 점수 내림차순 상위 `k`개를 반환합니다.

```hint id=rag-e2
docs_tok = [tokenize(d) for d in docs]; avgdl = sum(map(len, docs_tok)) / N; df = Counter(t for toks in docs_tok for t in set(toks)). 문서마다 tf = Counter(toks)를 만들고, 질문 토큰 t가 tf에 있을 때만 idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(toks) / avgdl))를 더합니다. 마지막에 sorted(..., key=lambda x: x[1], reverse=True)[:k].
```

```python starter id=rag-e2
import math
import re
from collections import Counter

def tokenize(text):
    words = re.findall(r"[가-힣]+|[a-z0-9]+", text.lower())
    tokens = []
    for w in words:
        if re.match(r"[가-힣]", w) and len(w) >= 2:
            tokens += [w[i:i + 2] for i in range(len(w) - 1)]
        else:
            tokens.append(w)
    return tokens

def bm25_search(query, docs, k=3, k1=1.5, b=0.75):
    # TODO: BM25 점수를 계산해 (인덱스, 점수) 상위 k개를 반환하세요
    pass

# DOCS = ["연차는 입사 1년 후 15일", "출장비 사후 정산", "연차 사용 시 팀장 승인"]
# print(bm25_search("연차 승인", DOCS))
```

```python test id=rag-e2
import math
from collections import Counter

def _ref(query, docs, k=3, k1=1.5, b=0.75):
    toks = [tokenize(d) for d in docs]
    N = len(docs); avgdl = sum(map(len, toks)) / N
    df = Counter(t for ts in toks for t in set(ts))
    out = []
    for i, ts in enumerate(toks):
        tf = Counter(ts); s = 0.0
        for t in tokenize(query):
            if t in tf:
                idf = math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
                s += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(ts) / avgdl))
        if s > 0:
            out.append((i, s))
    return sorted(out, key=lambda x: x[1], reverse=True)[:k]

DOCS = [
    "연차는 입사 1년 후 15일이 부여됩니다.",
    "출장비는 사후 정산하며 영수증 원본이 필요합니다.",
    "노트북 반출 시 보안팀 승인이 필요합니다.",
    "연차 사용 시 3일 전까지 팀장 승인을 받아야 합니다.",
    "사내 식당은 11시 30분에 엽니다.",
]
res = bm25_search("연차 승인 절차", DOCS, k=3)
assert isinstance(res, list) and res, "(인덱스, 점수) 튜플 리스트를 반환해야 합니다"
assert all(isinstance(x, tuple) and len(x) == 2 for x in res), "각 항목은 (인덱스, 점수) 튜플이어야 합니다"
assert res[0][0] == 3, f"'연차'와 '승인'이 모두 있는 3번 문서가 1등이어야 합니다 (현재 {res[0][0]}번)"
scores = [s for _, s in res]
assert scores == sorted(scores, reverse=True), "점수 내림차순으로 정렬하세요"
assert len(res) <= 3, "상위 k개만 반환하세요"
ref = _ref("연차 승인 절차", DOCS, k=3)
assert [i for i, _ in res] == [i for i, _ in ref], f"순위가 BM25 공식 결과와 다릅니다. 기대 {[i for i, _ in ref]}, 현재 {[i for i, _ in res]}"
for (_, s), (_, r) in zip(res, ref):
    assert abs(s - r) < 1e-6, f"점수가 공식과 다릅니다: {s:.4f} vs 기대 {r:.4f}"
assert bm25_search("식당", DOCS, k=5) and all(i == 4 for i, _ in bm25_search("식당", DOCS, k=5)), "점수가 0인 문서는 결과에서 빼야 합니다"
assert bm25_search("우주선", DOCS) == [], "겹치는 단어가 없으면 빈 리스트입니다"
r2 = bm25_search("연차 연차", DOCS, k=5)
assert abs(dict(r2)[0] - dict(_ref("연차 연차", DOCS, k=5))[0]) < 1e-6, "질문 토큰은 중복 제거 없이 그대로 더하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=rag-e2
import math
import re
from collections import Counter

def tokenize(text):
    words = re.findall(r"[가-힣]+|[a-z0-9]+", text.lower())
    tokens = []
    for w in words:
        if re.match(r"[가-힣]", w) and len(w) >= 2:
            tokens += [w[i:i + 2] for i in range(len(w) - 1)]
        else:
            tokens.append(w)
    return tokens

def bm25_search(query, docs, k=3, k1=1.5, b=0.75):
    docs_tok = [tokenize(d) for d in docs]
    N = len(docs_tok)
    if N == 0:
        return []
    avgdl = sum(map(len, docs_tok)) / N
    df = Counter(t for toks in docs_tok for t in set(toks))
    q_tokens = tokenize(query)
    results = []
    for i, toks in enumerate(docs_tok):
        tf = Counter(toks)
        score = 0.0
        for t in q_tokens:
            if t not in tf:
                continue
            idf = math.log((N - df[t] + 0.5) / (df[t] + 0.5) + 1)
            score += idf * tf[t] * (k1 + 1) / (tf[t] + k1 * (1 - b + b * len(toks) / avgdl))
        if score > 0:
            results.append((i, score))
    return sorted(results, key=lambda x: x[1], reverse=True)[:k]
```

### 실습 6-3. 출처 인용이 있는 RAG 답변

두 함수를 완성하세요.

**`build_rag_prompt(question, chunks)`** 는 다음 형식의 문자열을 반환합니다.

~~~text
<sources>
[1] 첫 번째 청크
[2] 두 번째 청크
</sources>

질문: {question}

위 출처만 근거로 답하고, 문장 끝에 [번호]로 출처를 표시하세요. 출처에 없으면 '모르겠습니다'라고 답하세요.
~~~

**`async answer_with_citations(question, retrieve, k=3)`**

1. `retrieve(question, k)`로 청크 리스트(문자열)를 받습니다.
2. 청크가 하나도 없으면 **LLM을 호출하지 않고** `{"answer": "관련 문서를 찾지 못했습니다.", "sources": [], "citations": []}`를 반환합니다.
3. 있으면 `build_rag_prompt`로 만든 프롬프트를 user 메시지로 `chat(..., system=SYSTEM)`을 호출합니다.
4. 답변에서 `[숫자]`를 모두 찾아 **1 ~ len(청크) 범위의 번호만** 중복 없이 오름차순으로 `citations`에 담습니다.
5. `{"answer": 답변 텍스트, "sources": 청크 리스트, "citations": [...]}`를 반환합니다.

```hint id=rag-e3
프롬프트는 "\n".join(f"[{i}] {c}" for i, c in enumerate(chunks, 1))로 출처 줄을 만들고 f-string으로 조립하세요. 인용 추출은 re.findall(r"\[(\d+)\]", answer)로 숫자 문자열을 얻은 뒤 int로 바꾸고 범위를 확인해 sorted(set(...))로 정리합니다.
```

```python starter id=rag-e3
import re
from agentlab import chat, text_of

SYSTEM = "너는 사내 규정 도우미야. 반드시 제공된 출처만 근거로 답해."

def build_rag_prompt(question, chunks):
    # TODO: <sources> 블록 + 질문 + 인용 지시문
    pass

async def answer_with_citations(question, retrieve, k=3):
    # TODO: 검색 → (없으면 바로 반환) → 프롬프트 → chat → 인용 번호 추출
    pass
```

```python test id=rag-e3
import agentlab

p = build_rag_prompt("연차는 며칠?", ["연차는 15일입니다.", "승인은 팀장이 합니다."])
assert isinstance(p, str), "build_rag_prompt는 문자열을 반환해야 합니다"
assert "<sources>" in p and "</sources>" in p, "<sources> ... </sources> 태그로 출처를 감싸세요"
assert "[1] 연차는 15일입니다." in p and "[2] 승인은 팀장이 합니다." in p, "출처 앞에 [1], [2] 번호를 붙이세요"
assert "질문: 연차는 며칠?" in p, "'질문: ...' 줄을 포함하세요"
assert p.index("</sources>") < p.index("질문:"), "출처를 질문보다 먼저 두세요"
assert "모르겠습니다" in p and "[번호]" in p, "인용 지시와 '모르겠습니다' 거절 지시를 포함하세요"

asked = []
def fake_retrieve(q, k):
    asked.append((q, k))
    return ["연차는 15일입니다.", "승인은 팀장이 합니다.", "식당은 11시 30분에 엽니다."][:k]

agentlab.scripted(["연차는 15일입니다 [1]. 팀장 승인이 필요합니다 [2][2]. 참고 [9]"])
r = await answer_with_citations("연차 규정", fake_retrieve, k=2)
assert asked == [("연차 규정", 2)], f"retrieve(question, k)를 한 번 호출하세요 (호출 기록: {asked})"
assert len(agentlab.calls) == 1, "LLM은 한 번 호출해야 합니다"
call = agentlab.calls[0]
assert call.get("system") == SYSTEM, "system=SYSTEM을 전달하세요"
assert call["messages"][0]["content"] == build_rag_prompt("연차 규정", ["연차는 15일입니다.", "승인은 팀장이 합니다."]), "build_rag_prompt로 만든 프롬프트를 user 메시지로 보내세요"
assert r["answer"].startswith("연차는 15일입니다"), "answer에는 LLM 답변 텍스트를 넣으세요"
assert r["sources"] == ["연차는 15일입니다.", "승인은 팀장이 합니다."], "sources에는 검색된 청크 리스트를 넣으세요"
assert r["citations"] == [1, 2], f"유효 범위(1~2)의 번호만 중복 없이 정렬하세요. 기대 [1, 2], 현재 {r['citations']}"

agentlab._reset()
empty = await answer_with_citations("우주선", lambda q, k: [], k=3)
assert len(agentlab.calls) == 0, "검색 결과가 없으면 LLM을 호출하지 마세요"
assert empty == {"answer": "관련 문서를 찾지 못했습니다.", "sources": [], "citations": []}, f"검색 결과가 없을 때 반환값이 다릅니다: {empty}"
print("✅ 모든 테스트 통과!")
```

```python solution id=rag-e3
import re
from agentlab import chat, text_of

SYSTEM = "너는 사내 규정 도우미야. 반드시 제공된 출처만 근거로 답해."

def build_rag_prompt(question, chunks):
    sources = "\n".join(f"[{i}] {c}" for i, c in enumerate(chunks, 1))
    return (
        f"<sources>\n{sources}\n</sources>\n\n"
        f"질문: {question}\n\n"
        "위 출처만 근거로 답하고, 문장 끝에 [번호]로 출처를 표시하세요. "
        "출처에 없으면 '모르겠습니다'라고 답하세요."
    )

async def answer_with_citations(question, retrieve, k=3):
    chunks = retrieve(question, k)
    if not chunks:
        return {"answer": "관련 문서를 찾지 못했습니다.", "sources": [], "citations": []}
    resp = await chat([{"role": "user", "content": build_rag_prompt(question, chunks)}], system=SYSTEM)
    answer = text_of(resp)
    nums = {int(n) for n in re.findall(r"\[(\d+)\]", answer)}
    citations = sorted(n for n in nums if 1 <= n <= len(chunks))
    return {"answer": answer, "sources": chunks, "citations": citations}
```

### 실습 6-4. 검색 평가 지표 recall@k

`recall_at_k(results, relevant, k)`를 완성하세요.

- `results`: 질문별 검색 결과 리스트의 리스트 (예: `[[3, 1, 9], [2, 5]]`, 순위순 문서 ID)
- `relevant`: 질문별 정답 ID 집합의 리스트 (예: `[{3, 7}, {5}]`)
- 질문마다 `|상위 k개 ∩ 정답| / |정답|`을 구하고 **평균**을 반환합니다.
- 정답 집합이 비어 있는 질문은 평균 계산에서 **제외**합니다. 남는 질문이 없으면 `0.0`을 반환합니다.

```hint id=rag-e4
for res, rel in zip(results, relevant): 에서 rel이 비어 있으면 continue. 그 외에는 len(set(res[:k]) & set(rel)) / len(rel)을 리스트에 모은 뒤 평균을 냅니다.
```

```python starter id=rag-e4
def recall_at_k(results, relevant, k):
    # TODO
    pass
```

```python test id=rag-e4
r = recall_at_k([[3, 1, 9], [2, 5, 8]], [{3, 7}, {5}], k=3)
assert r is not None and abs(r - 0.75) < 1e-9, f"(0.5 + 1.0) / 2 = 0.75 이어야 합니다 (현재 {r})"
r1 = recall_at_k([[3, 1, 9], [2, 5, 8]], [{3, 7}, {5}], k=1)
assert abs(r1 - 0.25) < 1e-9, f"k=1이면 (0.5 + 0) / 2 = 0.25 입니다 (현재 {r1})"
r2 = recall_at_k([[1, 2], [4]], [set(), {4}], k=2)
assert abs(r2 - 1.0) < 1e-9, f"정답이 빈 질문은 평균에서 제외하세요 (현재 {r2})"
assert recall_at_k([], [], k=3) == 0.0, "평가할 질문이 없으면 0.0을 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=rag-e4
def recall_at_k(results, relevant, k):
    scores = []
    for res, rel in zip(results, relevant):
        if not rel:
            continue
        scores.append(len(set(res[:k]) & set(rel)) / len(rel))
    return sum(scores) / len(scores) if scores else 0.0
```

## 13. 더 읽어보기

- [Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (RAG 원논문)](https://arxiv.org/abs/2005.11401)
- [Introducing Contextual Retrieval (Anthropic)](https://www.anthropic.com/news/contextual-retrieval)
- [Claude 문서: 긴 컨텍스트 프롬프트 팁](https://docs.claude.com/en/docs/build-with-claude/prompt-engineering/long-context-tips)
- [The Probabilistic Relevance Framework: BM25 and Beyond (Robertson & Zaragoza)](https://www.staff.city.ac.uk/~sbrp622/papers/foundations_bm25_review.pdf)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)

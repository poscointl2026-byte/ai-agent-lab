# 프로젝트 1. 매출 데이터 분석·수요 예측 에이전트

> **프로젝트 목표**: 유통사의 2년 치 주문 데이터(5,875건)를 정제하고, 분석 함수와 수요 예측 모델을 **도구(Tool)** 로 만들어 "부산에서 제일 많이 팔린 상품은?", "다음 3개월 매출은 얼마로 예상돼?" 같은 자연어 질문에 **숫자 근거와 함께** 답하는 분석 에이전트를 만듭니다. 마지막에는 월간 매출 리포트를 자동으로 작성하는 워크플로까지 완성합니다.

## 0. 프로젝트 소개

### 무엇을 만드나요?

현업 데이터 분석 업무는 대개 이렇게 흘러갑니다. **데이터를 정제하고 → 반복해서 쓰는 집계 함수를 만들고 → 예측 모델을 붙이고 → 보고서로 정리**합니다. 이 프로젝트는 이 흐름 전체를 코드로 만들고, 그 위에 LLM 에이전트를 얹어 **누구나 자연어로 데이터에 질문할 수 있게** 합니다.

최종 결과물은 다음 세 가지입니다.

| 결과물 | 설명 |
|---|---|
| `analyst_agent(question, df)` | 자연어 질문을 받아 필요한 도구(집계·순위·추이·예측)를 스스로 골라 호출하고, 조회한 숫자로 답하는 에이전트 |
| `forecast(df, months_ahead)` | scikit-learn 기반 월 매출 예측 모델 (추세 + 계절성), 시간 기준 검증으로 성능 확인 |
| `build_report(df, month)` | KPI는 코드로 정확히 계산하고, 해설만 LLM이 쓰는 월간 리포트 자동 생성기 |

### 전체 구조

~~~text
                ┌──────────────────────── Step 5. 분석 에이전트 ─────────────────────────┐
 사용자 질문 ──▶│  LLM(Claude) ──tool_use──▶ execute_tool() ──▶ 분석 함수 / 예측 모델    │──▶ 숫자 근거가 있는 답변
                │       ▲                         │                                       │
                │       └────── tool_result ◀─────┘                                       │
                └─────────────────────────────────────────────────────────────────────────┘
                                                  ▲ Step 4. 도구 스키마 + 실행기
          ┌───────────────────────┬───────────────┴──────────┬──────────────────────────┐
   Step 2. summarize()      top_products()          monthly_revenue()          Step 3. forecast()
          └───────────────────────┴──────────────────────────┴──────────────────────────┘
                                                  ▲
                                   Step 1. load_sales(): 정제된 DataFrame
                                                  ▲
                                         data/sales.csv (원본)

   Step 6. 월간 리포트: compute_kpis()(코드로 정확히) ──▶ LLM 해설 ──▶ 마크다운 리포트 + 차트
~~~

### 데이터 사전 (`data/sales.csv`)

| 컬럼 | 의미 | 예시 |
|---|---|---|
| `order_id` | 주문 번호 | 103790 |
| `date` | 주문일 (2024-01-01 ~ 2025-12-31) | 2025-05-06 |
| `region` | 지역 (서울·부산·대구·광주·대전) | 광주 |
| `category` | 카테고리 (가전·전자·생활·식품) | 가전 |
| `product` | 상품명 (16종) | 전자레인지 |
| `channel` | 판매 채널 (`online` / `offline`) | online |
| `units` | 판매 수량 | 1 |
| `unit_price` | 단가(원). 프로모션 할인이 반영된 실제 판매가 | 150000 |
| `revenue` | 매출(원) = `units × unit_price` | 150000 |

> ⚠️ 이 데이터에는 실무처럼 **일부러 오류를 섞어 두었습니다.** 중복 행, 수량이 비어 있는 행, 지역명 앞뒤에 공백이 들어간 행이 있습니다. Step 1에서 직접 찾아 고칩니다. 또 데이터 속에는 몇 가지 **비즈니스 패턴**이 숨어 있으니 분석하면서 찾아보세요.

### 단계는 이렇게 이어집니다

- 각 Step의 실습을 **채점 통과**해야 다음 Step이 열립니다. 위쪽의 진행 단계 표시줄로 위치를 확인하세요.
- 다음 Step에서는 **이전 Step들의 정답 코드가 자동으로 먼저 실행**됩니다. 그래서 Step 3에서 `load_sales()`를 다시 만들 필요 없이 바로 호출할 수 있습니다. 실습 상자 위의 "📎 이전 단계 코드" 줄을 펼치면 어떤 코드가 먼저 실행되는지 볼 수 있습니다.
- pandas와 scikit-learn은 처음 실행할 때 내려받으므로 **첫 실행만 10~30초** 걸립니다.
- LLM 호출이 들어가는 Step 5와 6은 Mock LLM으로도 흐름을 확인할 수 있습니다. 하지만 [설정](#/settings)에서 Claude를 연결하면 진짜 분석가처럼 여러 도구를 조합해 답하는 모습을 볼 수 있습니다. 채점은 항상 고정된 가짜 응답으로 하므로 비용이 들지 않습니다.

| 사용하는 기술 | 배우는 곳 |
|---|---|
| pandas 정제·집계(`groupby`, `Period`) | Step 1~2 |
| 시계열 특징 공학, Ridge 회귀, 시간 기준 검증, 기준 모델 비교 | Step 3 |
| 도구 스키마 설계, 오류를 결과로 돌려주기 | Step 4 (모듈 03) |
| 에이전트 루프, system 프롬프트로 행동 규칙 정하기 | Step 5 (모듈 04) |
| "계산은 코드, 해설은 LLM" 워크플로 | Step 6 (모듈 07) |

## Step 1. 데이터 불러오기와 정제

### 왜 정제가 첫 단계인가

에이전트가 아무리 똑똑해도 **도구가 돌려주는 숫자가 틀리면 답도 틀립니다.** LLM은 받은 숫자를 의심하지 않고 그럴듯한 문장으로 포장하기 때문에, 데이터 오류는 오히려 더 그럴듯한 오답으로 바뀝니다. 그래서 에이전트 프로젝트에서도 정제는 생략할 수 없는 첫 단계입니다.

이 데이터에서 찾아야 할 문제는 세 가지입니다.

| 문제 | 증상 | 그대로 두면 생기는 일 |
|---|---|---|
| **완전 중복 행** | 같은 주문이 두 번 기록됨 | 매출이 부풀려집니다 |
| **수량·매출 결측** | `units`, `revenue`가 빈 칸 | 합계에서 조용히 빠지거나, 정수 변환에서 오류가 납니다 |
| **지역명 공백** | `" 서울 "`과 `"서울"`이 따로 집계됨 | 지역이 7~8개로 쪼개져 순위가 틀어집니다 |

또 문자열로 읽힌 날짜를 진짜 날짜형으로 바꾸고, **월(month) 컬럼**을 만들어 둡니다. pandas의 `Period`(기간형)은 "2025-11"처럼 월 단위를 정확히 표현합니다. 그래서 월별 집계와 "이전 달", "작년 같은 달" 계산(`p - 1`, `p - 12`)이 매우 쉬워집니다.

먼저 원본을 살펴보며 문제를 직접 확인해 보세요.

```python run id=p1-s1d
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
import pandas as pd

raw = pd.read_csv("data/sales.csv")
print("행 수:", len(raw))
print(raw.head(), "\n")
print(raw.dtypes, "\n")
print("완전 중복 행:", raw.duplicated().sum())
print("결측값:\n", raw.isna().sum()[lambda s: s > 0], "\n")
print("지역 값 (repr로 공백 확인):", [repr(r) for r in raw["region"].unique()])
```

> 💡 `repr()`로 출력하면 `' 서울 '`처럼 눈에 안 보이던 공백이 드러납니다. 문자열 데이터를 점검할 때 자주 쓰는 요령입니다.

### 정제 순서도 중요합니다

1. **중복 제거**를 먼저 합니다. 공백이 든 행을 먼저 고치면 원래 서로 달랐던 행이 우연히 같아져 지워질 수 있습니다. 반대로 정규화한 뒤에 겹치는 행을 일부러 합쳐야 하는 경우도 있습니다. 어느 쪽이든 **의도를 정하고 순서를 지키는 것**이 중요합니다.
2. **결측 행 제거**: 수량을 알 수 없는 주문은 매출 계산에 쓸 수 없습니다. 평균값 등으로 채우는 것(대치, imputation)은 예측 모델에서는 쓰지만, **매출 집계에서는 없는 숫자를 만들어 내는 것**이므로 하지 않습니다.
3. **형 변환**: 결측이 있던 컬럼은 pandas가 `float`로 읽습니다. 결측을 지운 뒤 `int64`로 바꿉니다. 브라우저 Python(32비트)에서 `astype(int)`는 32비트 정수가 되므로 큰 금액에서는 꼭 **`"int64"`** 를 지정하세요.

### 실습 1. `load_sales()` 정제 함수

`load_sales(path)`를 완성하세요. 정제된 DataFrame을 반환해야 합니다.

1. `drop_duplicates()`로 완전 중복 행을 제거합니다.
2. `units` 또는 `revenue`가 비어 있는 행을 제거합니다 (`dropna(subset=[...])`).
3. `region` 앞뒤 공백을 제거합니다 (`.str.strip()`).
4. `date`를 날짜형으로 바꿉니다 (`pd.to_datetime`).
5. `units`, `revenue`를 `"int64"`로 바꿉니다.
6. 월 컬럼 `month`를 추가합니다 (`df["date"].dt.to_period("M")`).
7. 날짜순으로 정렬하고 인덱스를 다시 매깁니다 (`sort_values("date").reset_index(drop=True)`).

```hint id=p1-s1
df = df.drop_duplicates() → df = df.dropna(subset=["units", "revenue"]) → df["region"] = df["region"].str.strip() 순서로 진행하세요. 정답 행 수는 5,830행입니다 (5,875 - 중복 30 - 결측 15).
```

```python starter id=p1-s1
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
import pandas as pd

def load_sales(path="data/sales.csv"):
    df = pd.read_csv(path)
    # TODO 1~7: 중복 제거, 결측 제거, 지역 공백 제거, 날짜 변환, int64 변환, month 추가, 정렬
    return None

# 직접 확인해 보기 (채점과 무관):
# df = load_sales()
# print(len(df), df["region"].unique())
```

```python test id=p1-s1
df = load_sales("data/sales.csv")
assert df is not None and hasattr(df, "columns"), "DataFrame을 반환하세요"
assert len(df) == 5830, f"정제 후 행 수는 5830이어야 합니다 (현재 {len(df)}). 중복 30건, 결측 15건을 제거했는지 확인하세요"
assert not df.drop(columns=["month"], errors="ignore").duplicated().any(), "중복 행이 남아 있습니다"
assert df["units"].isna().sum() == 0 and df["revenue"].isna().sum() == 0, "units/revenue 결측이 남아 있습니다"
regions = set(df["region"].unique())
assert regions == {"서울", "부산", "대구", "광주", "대전"}, f"지역은 공백 없이 5개여야 합니다: {regions}"
assert pd.api.types.is_datetime64_any_dtype(df["date"]), "date 컬럼을 날짜형(pd.to_datetime)으로 바꾸세요"
assert str(df["units"].dtype) == "int64" and str(df["revenue"].dtype) == "int64", "units, revenue는 int64여야 합니다"
assert "month" in df.columns and str(df["month"].dtype) == "period[M]", "month 컬럼은 dt.to_period('M')로 만드세요"
assert (df["units"] * df["unit_price"] == df["revenue"]).all(), "revenue = units × unit_price 관계가 깨졌습니다"
assert df["date"].is_monotonic_increasing and df.index[0] == 0, "날짜순으로 정렬하고 reset_index(drop=True) 하세요"
assert int(df["revenue"].sum()) == 3287351750, f"총매출이 다릅니다: {int(df['revenue'].sum()):,}"
print("정제 후 행 수:", len(df), "/ 총매출:", f"{int(df['revenue'].sum()):,}원")
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s1
import warnings
warnings.filterwarnings("ignore", category=DeprecationWarning)
import pandas as pd

def load_sales(path="data/sales.csv"):
    df = pd.read_csv(path)
    df = df.drop_duplicates()
    df = df.dropna(subset=["units", "revenue"])
    df["region"] = df["region"].str.strip()
    df["date"] = pd.to_datetime(df["date"])
    df["units"] = df["units"].astype("int64")
    df["revenue"] = df["revenue"].astype("int64")
    df["month"] = df["date"].dt.to_period("M")
    return df.sort_values("date").reset_index(drop=True)
```

```quiz id=p1-q1
{"q": "수량(units)이 비어 있는 주문 15건을 처리하는 방법으로 이 프로젝트에서 가장 적절한 것은?", "options": ["전체 평균 수량으로 채운다", "0으로 채운다", "해당 행을 제거하고, 몇 건을 제거했는지 기록해 둔다", "그대로 두면 pandas가 알아서 처리한다"], "answer": 2, "explain": "매출 집계에 없는 숫자를 지어 넣으면 보고서가 틀어집니다. 제거하되, 제거 건수를 기록해 데이터 품질을 추적하는 것이 실무 관행입니다. 결측 대치는 예측 모델의 입력 특징처럼 목적이 분명할 때 씁니다."}
```

## Step 2. 분석 함수 만들기

### 에이전트에게 줄 "분석 능력"을 함수로 만든다

LLM에게 5,830행을 통째로 보여 주고 "부산 1위 상품을 찾아줘"라고 하면 어떻게 될까요? 수많은 토큰을 쓰고도 **계산 실수**를 할 가능성이 큽니다. LLM은 계산기가 아니기 때문입니다. 올바른 설계는 반대입니다.

- **정확한 계산은 pandas 함수가** 맡습니다. 빠르고, 싸고, 항상 같은 답을 냅니다.
- **LLM은 어떤 함수를 어떤 인자로 부를지 결정하고, 결과를 해석**합니다.

이번 Step에서 만드는 세 함수가 Step 4에서 그대로 에이전트의 도구가 됩니다. 그래서 다음 원칙을 지킵니다.

| 원칙 | 이유 |
|---|---|
| 허용된 값만 받는다 (`by`는 4가지 차원 중 하나) | LLM이 엉뚱한 컬럼명을 넣어도 **명확한 오류**로 알려 줄 수 있습니다 |
| 결과는 작고 정렬되어 있다 | 도구 결과는 다시 LLM 입력 토큰이 됩니다. 필요한 것만 돌려줍니다 |
| 비중(%) 같은 파생 지표를 같이 준다 | LLM이 나눗셈을 하지 않아도 되게 합니다 |
| JSON으로 바꾸기 쉬운 타입을 쓴다 | `top_products`는 dict 리스트, 숫자는 파이썬 `int` |

### 데이터 속 패턴 미리 보기

아래 예제는 Step 1의 `load_sales()`를 그대로 사용합니다(이전 단계 코드가 자동으로 먼저 실행됩니다). 차트를 보며 숨겨진 패턴 세 가지를 찾아보세요.

```python run id=p1-s2d
import matplotlib.pyplot as plt
from agentlab import show_plot

df = load_sales()

# ① 월별 총매출과 부산 매출
monthly = df.groupby("month")["revenue"].sum() / 1e8
busan = df[df["region"] == "부산"].groupby("month")["revenue"].sum() / 1e8
fig, axes = plt.subplots(1, 2, figsize=(11, 3.6))
axes[0].plot(monthly.index.astype(str), monthly.values, marker="o", label="전체")
axes[0].plot(busan.index.astype(str), busan.values, marker=".", label="부산")
axes[0].set_title("월별 매출 (억 원)"); axes[0].legend(); axes[0].tick_params(axis="x", rotation=90, labelsize=7)

# ② 에어컨 월별 판매 수량 (월 기준 합산)
ac = df[df["product"] == "에어컨"].groupby(df["date"].dt.month)["units"].sum()
axes[1].bar(ac.index, ac.values, color="tab:orange")
axes[1].set_title("에어컨 판매 수량 (월별 합계, 2년)"); axes[1].set_xticks(range(1, 13))
show_plot(fig)

# ③ 11월 온라인 평균 단가 할인
nov = df[df["date"].dt.month == 11]
print("11월 채널별 평균 단가 대비 정가 비율:")
base = df[df["date"].dt.month != 11].groupby("product")["unit_price"].max()
ratio = (nov["unit_price"] / nov["product"].map(base)).groupby(nov["channel"]).mean()
print(ratio.round(3))
yearly = df[df["region"] == "부산"].groupby(df["date"].dt.year)["revenue"].sum()
print(f"\n부산 매출: 2024년 {yearly[2024]:,}원 → 2025년 {yearly[2025]:,}원 ({(yearly[2025] / yearly[2024] - 1) * 100:+.1f}%)")
```

> 찾으셨나요? **① 2025년 부산 매출 급성장(+58.8%)**, **② 7~8월 에어컨 수요 급증**, **③ 11월 온라인 15% 할인 프로모션**입니다. 이런 패턴을 에이전트가 도구로 스스로 찾아내게 만드는 것이 이 프로젝트의 목표입니다.

### 실습 2. 분석 함수 3종

다음 세 함수를 완성하세요.

1. `summarize(df, by, metric="revenue")`
   - `by`가 `ALLOWED_DIMS`에 없거나 `metric`이 `ALLOWED_METRICS`에 없으면 `ValueError`를 발생시킵니다.
   - `by` 기준으로 `metric`을 합계 내고 내림차순으로 정렬한 DataFrame을 반환합니다. 컬럼은 `[by, metric, "share_pct"]`입니다.
   - `share_pct`는 전체 대비 비중(%)이며 소수 첫째 자리까지 반올림합니다.
2. `top_products(df, n=5, region=None)`
   - 상품별 매출 상위 `n`개를 `[{"product": 이름, "revenue": 정수}, ...]` 리스트로 반환합니다.
   - `region`을 주면 그 지역만 계산합니다. `revenue`는 파이썬 `int`로 변환하세요.
3. `monthly_revenue(df, region=None)`
   - 월(`month`)별 매출 합계 Series를 월 순서대로 반환합니다. `region`을 주면 그 지역만 계산합니다.

```hint id=p1-s2
summarize: out = df.groupby(by)[metric].sum().sort_values(ascending=False).reset_index() 후 out["share_pct"] = (out[metric] / out[metric].sum() * 100).round(1). top_products: s = d.groupby("product")["revenue"].sum().nlargest(n) 후 [{"product": p, "revenue": int(v)} for p, v in s.items()]. monthly_revenue: d.groupby("month")["revenue"].sum().sort_index()
```

```python starter id=p1-s2
ALLOWED_DIMS = ["region", "category", "product", "channel"]
ALLOWED_METRICS = ["revenue", "units"]

def summarize(df, by, metric="revenue"):
    # TODO: 인자 검증(ValueError) → groupby 합계 → 내림차순 → share_pct 추가
    pass

def top_products(df, n=5, region=None):
    # TODO: (지역 필터) → 상품별 매출 상위 n개 → [{"product": ..., "revenue": int}, ...]
    pass

def monthly_revenue(df, region=None):
    # TODO: (지역 필터) → 월별 매출 합계 Series (월 순서)
    pass

# df = load_sales()
# print(summarize(df, "region"))
```

```python test id=p1-s2
import pandas as pd
df = load_sales()

s = summarize(df, "region")
assert s is not None, "summarize가 DataFrame을 반환해야 합니다"
assert list(s.columns) == ["region", "revenue", "share_pct"], f"컬럼은 [by, metric, 'share_pct']여야 합니다: {list(s.columns)}"
assert s.iloc[0]["region"] == "서울" and int(s.iloc[0]["revenue"]) == 1117279500, "지역별 매출 1위는 서울 1,117,279,500원이어야 합니다 (내림차순 정렬 확인)"
assert abs(float(s["share_pct"].sum()) - 100) < 0.5, "share_pct 합계는 약 100이어야 합니다"
assert float(s.iloc[0]["share_pct"]) == 34.0, f"서울 비중은 34.0%여야 합니다 (현재 {s.iloc[0]['share_pct']})"
u = summarize(df, "category", "units")
assert u.iloc[0]["category"] == "식품" and int(u.iloc[0]["units"]) == 8369, "카테고리별 수량 1위는 식품 8,369개입니다"
for bad in [("color", "revenue"), ("region", "profit")]:
    try:
        summarize(df, *bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f"summarize{bad}는 ValueError를 발생시켜야 합니다")

t = top_products(df, 3)
assert isinstance(t, list) and [x["product"] for x in t] == ["노트북", "냉장고", "에어컨"], f"전체 매출 상위 3개 상품이 다릅니다: {t}"
b = top_products(df, 1, region="부산")
assert b == [{"product": "노트북", "revenue": 244153500}], f"부산 1위 상품 결과가 다릅니다: {b}"
assert type(b[0]["revenue"]) is int, "revenue는 파이썬 int로 변환하세요 (JSON 직렬화를 위해)"
assert len(top_products(df)) == 5, "n의 기본값은 5입니다"

m = monthly_revenue(df)
assert m is not None and len(m) == 24, "월별 매출은 24개월이어야 합니다"
assert int(m[pd.Period("2024-07", "M")]) == 182027000, "2024-07 매출이 다릅니다"
assert m.index.is_monotonic_increasing, "월 순서대로 정렬하세요"
mb = monthly_revenue(df, region="부산")
assert int(mb[mb.index.year == 2025].sum()) == 527391800, "부산 2025년 매출 합계가 다릅니다 (region 필터 확인)"
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s2
ALLOWED_DIMS = ["region", "category", "product", "channel"]
ALLOWED_METRICS = ["revenue", "units"]

def summarize(df, by, metric="revenue"):
    if by not in ALLOWED_DIMS:
        raise ValueError(f"by는 {ALLOWED_DIMS} 중 하나여야 합니다 (받은 값: {by})")
    if metric not in ALLOWED_METRICS:
        raise ValueError(f"metric은 {ALLOWED_METRICS} 중 하나여야 합니다 (받은 값: {metric})")
    out = df.groupby(by)[metric].sum().sort_values(ascending=False).reset_index()
    out["share_pct"] = (out[metric] / out[metric].sum() * 100).round(1)
    return out

def top_products(df, n=5, region=None):
    d = df if region is None else df[df["region"] == region]
    s = d.groupby("product")["revenue"].sum().nlargest(n)
    return [{"product": p, "revenue": int(v)} for p, v in s.items()]

def monthly_revenue(df, region=None):
    d = df if region is None else df[df["region"] == region]
    return d.groupby("month")["revenue"].sum().sort_index()
```

## Step 3. 수요 예측 모델

### 예측 문제를 정의하기

"다음 3개월 매출은 얼마일까?"는 **시계열 회귀** 문제입니다. 월별 매출 24개(2024-01 ~ 2025-12)가 있고, 앞의 그래프에서 두 가지 성분이 보였습니다.

- **추세(trend)**: 해마다 조금씩 커집니다.
- **계절성(seasonality)**: 여름(에어컨)과 11월(프로모션)에 높고, 연초에 낮습니다.

이 두 성분을 모델이 배울 수 있도록 **특징(feature)** 으로 만들어 주는 것이 핵심입니다. 이 과정을 특징 공학(feature engineering)이라고 합니다.

| 특징 | 만드는 법 | 모델이 배우는 것 |
|---|---|---|
| `t` | 2024-01을 0으로 하는 월 순번 (0, 1, 2, …) | 한 달마다 늘어나는 매출(추세 기울기) |
| `m1` ~ `m12` | 해당 월이면 1, 아니면 0 (원-핫 인코딩) | 월마다 더해지거나 빠지는 계절 효과 |

모델은 **Ridge 회귀**를 씁니다. 선형 회귀에 계수 크기 벌점(L2 규제)을 더한 것입니다. 데이터가 24개뿐인데 특징이 13개나 되면 일반 선형 회귀는 각 월의 우연한 변동까지 외워 버립니다(**과적합**). Ridge는 계수가 지나치게 커지는 것을 막아 이 문제를 줄입니다.

### 검증은 반드시 "시간 순서"로

일반 머신러닝처럼 데이터를 무작위로 섞어 학습/검증으로 나누면 안 됩니다. 2025년 12월 데이터로 학습하고 2025년 3월을 맞히는 것은 **미래를 보고 과거를 맞히는 것**이라 성능이 실제보다 좋게 나옵니다. 이를 데이터 누수(leakage)라고 합니다. 그래서 다음과 같이 나눕니다.

~~~text
 2024-01 ─────────────────────────────── 2025-09 │ 2025-10 ── 2025-12
 └───────────────── 학습(train) 21개월 ──────────┘ └─ 검증(test) 3개월 ─┘
~~~

그리고 모델 성능은 반드시 **기준 모델(baseline)** 과 비교합니다. 가장 단순한 기준은 "작년 같은 달 매출이 그대로 나온다"고 보는 **계절 단순 예측(seasonal naive)** 입니다. 복잡한 모델이 이 기준조차 못 이긴다면 그 모델은 쓸 이유가 없습니다.

| 지표 | 식 | 의미 |
|---|---|---|
| MAE | 평균(\|예측 - 실제\|) | 평균적으로 몇 원 틀리는가 (원 단위라 해석이 쉬움) |
| MAPE | 평균(\|예측 - 실제\| / 실제) × 100 | 평균 몇 % 틀리는가 (규모가 다른 시계열끼리 비교할 때 유용) |

### 실습 3-1. 특징 만들기 `make_features()`

`make_features(months)`를 완성하세요.

- `months`는 월 목록입니다. `PeriodIndex`이거나 `["2026-01", ...]` 같은 문자열 리스트일 수 있으니 `pd.PeriodIndex(months, freq="M")`로 통일합니다.
- 반환값은 DataFrame이고, 컬럼은 `["t", "m1", ..., "m12"]` 순서입니다.
- `t`는 `ORIGIN`(2024-01)부터 몇 달 지났는지입니다. `(p - ORIGIN).n`으로 구합니다.
- `mK`는 그 달의 월(month)이 K이면 1, 아니면 0입니다.

```hint id=p1-s3a
months = pd.PeriodIndex(months, freq="M") 후 X = pd.DataFrame({"t": [(p - ORIGIN).n for p in months]}) 를 만들고, for k in range(1, 13): X[f"m{k}"] = (months.month == k).astype(int) 로 원-핫 컬럼을 추가하세요.
```

```python starter id=p1-s3a
import pandas as pd

ORIGIN = pd.Period("2024-01", "M")

def make_features(months):
    # TODO: PeriodIndex로 변환 → t 컬럼 → m1~m12 원-핫 컬럼
    pass

# print(make_features(["2024-01", "2024-02", "2025-01"]))
```

```python test id=p1-s3a
import pandas as pd
X = make_features(pd.period_range("2024-01", periods=14, freq="M"))
assert X is not None, "DataFrame을 반환하세요"
assert list(X.columns) == ["t"] + [f"m{k}" for k in range(1, 13)], f"컬럼 순서가 다릅니다: {list(X.columns)}"
assert list(X["t"]) == list(range(14)), "t는 2024-01을 0으로 하는 월 순번이어야 합니다"
assert (X[[f"m{k}" for k in range(1, 13)]].sum(axis=1) == 1).all(), "각 행에는 월 원-핫이 정확히 하나만 1이어야 합니다"
assert X.loc[12, "m1"] == 1 and X.loc[12, "t"] == 12, "2025-01은 t=12, m1=1이어야 합니다"
Y = make_features(["2026-01", "2026-03"])
assert list(Y["t"]) == [24, 26] and Y.loc[1, "m3"] == 1, "문자열 리스트도 처리해야 합니다 (pd.PeriodIndex(months, freq='M'))"
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s3a
import pandas as pd

ORIGIN = pd.Period("2024-01", "M")

def make_features(months):
    months = pd.PeriodIndex(months, freq="M")
    X = pd.DataFrame({"t": [(p - ORIGIN).n for p in months]})
    for k in range(1, 13):
        X[f"m{k}"] = (months.month == k).astype(int)
    return X
```

### 실습 3-2. 시간 기준 검증과 예측 `evaluate_forecast()`, `forecast()`

1. `evaluate_forecast(series, split="2025-09")`
   - `series`는 `monthly_revenue(df)`의 결과(월 → 매출)입니다.
   - `split` 이하의 월로 `Ridge(alpha=1.0)`를 학습하고, 그 이후 월을 예측합니다.
   - 다음 dict를 반환합니다.
     - `mae`
     - `mape`(%)
     - `baseline_mae`: 각 검증 월의 **12개월 전 실제값**을 예측값으로 쓴 결과
     - `predictions`: 검증 월을 인덱스로 하는 예측 Series
2. `forecast(df, months_ahead=3)`
   - `months_ahead`가 1~12가 아니면 `ValueError`를 발생시킵니다.
   - **전체 24개월**로 `Ridge(alpha=1.0)`를 학습해 마지막 월 다음부터 `months_ahead`개월을 예측합니다.
   - 반환값은 컬럼이 `["month", "forecast"]`인 DataFrame입니다. `month`는 `"2026-01"` 같은 문자열, `forecast`는 반올림한 `int`입니다.

```hint id=p1-s3b
train = series[series.index <= pd.Period(split, "M")], test는 그 반대입니다. model = Ridge(alpha=1.0).fit(make_features(train.index), train.values). 기준 예측은 [series[p - 12] for p in test.index]. 미래 월은 pd.period_range(series.index[-1] + 1, periods=months_ahead, freq="M")로 만듭니다.
```

```python starter id=p1-s3b
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

def evaluate_forecast(series, split="2025-09"):
    # TODO: 시간 기준 분할 → Ridge 학습 → 예측 → MAE, MAPE, 기준 모델 MAE
    pass

def forecast(df, months_ahead=3):
    # TODO: 인자 검증 → 전체 월별 매출로 학습 → 미래 months_ahead개월 예측 → DataFrame
    pass

# df = load_sales()
# print(evaluate_forecast(monthly_revenue(df)))
# print(forecast(df, 3))
```

```python test id=p1-s3b
import pandas as pd
df = load_sales()
r = evaluate_forecast(monthly_revenue(df))
assert isinstance(r, dict), "dict를 반환하세요"
for k in ["mae", "mape", "baseline_mae", "predictions"]:
    assert k in r, f"결과에 '{k}' 키가 없습니다"
assert len(r["predictions"]) == 3, "검증 구간(2025-10~12) 3개월을 예측해야 합니다"
assert abs(r["mae"] - 11870834.44) < 1000, f"MAE가 예상과 다릅니다: {r['mae']:,.0f} (Ridge(alpha=1.0), make_features 사용 확인)"
assert abs(r["mape"] - 8.795) < 0.01, f"MAPE(%)가 다릅니다: {r['mape']:.3f}"
assert abs(r["baseline_mae"] - 12678216.67) < 1, f"기준 모델 MAE가 다릅니다: {r['baseline_mae']:,.0f} (12개월 전 실제값 사용)"
assert r["mae"] < r["baseline_mae"], "모델이 기준 모델보다 좋아야 합니다"

f = forecast(df, 3)
assert list(f.columns) == ["month", "forecast"], f"컬럼은 ['month', 'forecast']여야 합니다: {list(f.columns)}"
assert list(f["month"]) == ["2026-01", "2026-02", "2026-03"], f"예측 월이 다릅니다: {list(f['month'])}"
expected = [140083180, 141532559, 162079937]
assert all(abs(int(a) - b) <= 2 for a, b in zip(f["forecast"], expected)), f"예측값이 다릅니다: {list(f['forecast'])}"
assert all(type(v) is int for v in f["forecast"].tolist()), "forecast 값은 정수로 반올림하세요"
assert len(forecast(df, 1)) == 1, "months_ahead=1이면 1개월만 예측합니다"
for bad in [0, 13]:
    try:
        forecast(df, bad)
    except ValueError:
        pass
    else:
        raise AssertionError(f"months_ahead={bad}이면 ValueError를 발생시켜야 합니다")
print(f"MAE {r['mae']:,.0f}원 (MAPE {r['mape']:.2f}%) vs 기준 모델 MAE {r['baseline_mae']:,.0f}원")
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s3b
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge

def evaluate_forecast(series, split="2025-09"):
    cut = pd.Period(split, "M")
    train = series[series.index <= cut]
    test = series[series.index > cut]
    model = Ridge(alpha=1.0).fit(make_features(train.index), train.values)
    pred = model.predict(make_features(test.index))
    err = np.abs(pred - test.values)
    baseline = np.array([series[p - 12] for p in test.index])
    return {
        "mae": float(err.mean()),
        "mape": float((err / test.values).mean() * 100),
        "baseline_mae": float(np.abs(baseline - test.values).mean()),
        "predictions": pd.Series(pred, index=test.index),
    }

def forecast(df, months_ahead=3):
    if not 1 <= int(months_ahead) <= 12:
        raise ValueError("months_ahead는 1~12 사이여야 합니다")
    series = monthly_revenue(df)
    model = Ridge(alpha=1.0).fit(make_features(series.index), series.values)
    future = pd.period_range(series.index[-1] + 1, periods=int(months_ahead), freq="M")
    pred = model.predict(make_features(future))
    return pd.DataFrame({"month": [str(p) for p in future], "forecast": [int(round(v)) for v in pred]})
```

### 결과 들여다보기: 모델 비교와 예측 차트

추세만 쓰는 모델, 계절성까지 쓰는 Ridge, 계절 단순 예측을 비교하고 미래 예측을 그려 봅니다.

```python run id=p1-s3d
import numpy as np
import matplotlib.pyplot as plt
from sklearn.linear_model import LinearRegression
from agentlab import show_plot

df = load_sales()
series = monthly_revenue(df)
r = evaluate_forecast(series)

# 비교용: 추세(t)만 쓰는 선형 회귀
cut = pd.Period("2025-09", "M")
tr, te = series[series.index <= cut], series[series.index > cut]
trend_only = LinearRegression().fit(make_features(tr.index)[["t"]], tr.values)
trend_mae = np.abs(trend_only.predict(make_features(te.index)[["t"]]) - te.values).mean()

print(f"{'모델':<22}{'MAE(원)':>16}")
print(f"{'추세만 (선형회귀)':<20}{trend_mae:>16,.0f}")
print(f"{'계절 단순 예측':<21}{r['baseline_mae']:>16,.0f}")
print(f"{'추세+계절 (Ridge)':<20}{r['mae']:>16,.0f}   MAPE {r['mape']:.2f}%")

fc = forecast(df, 6)
fig, ax = plt.subplots(figsize=(10, 3.6))
ax.plot(series.index.astype(str), series.values / 1e8, marker="o", label="실제")
ax.plot(r["predictions"].index.astype(str), r["predictions"].values / 1e8, marker="s", label="검증 예측")
ax.plot(fc["month"], fc["forecast"] / 1e8, marker="^", linestyle="--", label="미래 예측")
ax.set_title("월별 매출과 예측 (억 원)"); ax.legend(); ax.tick_params(axis="x", rotation=90, labelsize=7)
show_plot(fig)
print(fc.assign(억원=(fc["forecast"] / 1e8).round(2)))
```

> 📌 **해석 포인트**: 추세만 쓰는 모델은 11월 급증을 전혀 못 따라갑니다. Ridge는 기준 모델보다 약 6% 덜 틀립니다. 다만 데이터가 2년뿐이라 **월별 계절 효과를 각각 두 번씩만 관측**했다는 한계가 있습니다. 실무라면 프로모션 일정, 휴일 수, 재고 같은 **외부 변수**를 특징으로 추가하고, 여러 시점에서 반복 검증(rolling origin)해 성능의 안정성을 확인합니다.

```quiz id=p1-q2
{"q": "월별 매출 예측 모델을 검증할 때 학습/검증 데이터를 나누는 방법으로 올바른 것은?", "options": ["모든 월을 무작위로 섞어 80:20으로 나눈다", "앞쪽 기간으로 학습하고 마지막 몇 개월로 검증한다", "전체 데이터로 학습하고 같은 데이터로 성능을 잰다", "짝수 달은 학습, 홀수 달은 검증에 쓴다"], "answer": 1, "explain": "시계열은 미래 정보가 학습에 섞이면(누수) 성능이 부풀려집니다. 실제 사용 상황과 같도록 과거로 학습하고 이후 기간으로 검증해야 합니다."}
```

## Step 4. 분석 기능을 도구로 감싸기

### 좋은 도구 = 좋은 설명 + 좁은 입력 + 작은 출력

이제 Step 2~3의 함수를 LLM이 호출할 수 있는 **도구**로 만듭니다. 모델은 도구의 **이름, 설명, 입력 스키마만 보고** 언제 어떻게 쓸지 정합니다. 그래서 도구 설명은 사람용 문서보다 더 친절하게 씁니다.

- **설명에 쓸 것**: 무엇을 계산하는지, 단위(원/개), 데이터 기간, 언제 쓰면 좋은지
- **`enum`으로 선택지를 고정**: `by`처럼 정해진 값만 허용되는 인자는 `enum`으로 알려 주면 모델이 엉뚱한 컬럼명을 지어내지 않습니다.
- **출력은 압축된 JSON**: DataFrame을 그대로 문자열로 바꾸면 공백과 줄바꿈이 많아 토큰이 낭비됩니다. `to_dict("records")`나 `{월: 매출}` dict로 바꿔 `json.dumps(..., ensure_ascii=False)`로 보냅니다.
- **오류는 예외 대신 결과로**: 잘못된 인자로 도구가 실패해도 에이전트 루프가 죽으면 안 됩니다. `{"error": "..."}`와 `is_error=True`를 돌려주면 모델이 오류 메시지를 읽고 **인자를 고쳐 다시 시도**합니다 (모듈 03).

~~~text
LLM: tool_use summarize_sales {"by": "지역"}          ← enum에 없는 값
도구: {"error": "ValueError: by는 ['region', ...] 중 하나여야 합니다"}  (is_error=True)
LLM: tool_use summarize_sales {"by": "region"}        ← 스스로 수정
~~~

### 실습 4. 도구 스키마와 실행기 `execute_tool()`

1. `TOOLS` 리스트에 네 번째 도구 **`forecast_revenue`** 의 스키마를 추가하세요.
   - 인자는 `months_ahead` 하나이고, 타입은 `"integer"`이며 필수(`required`)입니다.
   - 설명에는 예측 대상(월 매출, 원)과 범위(1~12개월)를 적습니다.
2. `execute_tool(df, name, args)`를 완성하세요. 반환값은 **`(결과 문자열, is_error)` 튜플**입니다.
   - `summarize_sales` → `summarize(df, args["by"], args.get("metric", "revenue"))`를 `to_dict("records")`로 바꿉니다.
   - `top_products` → `top_products(df, int(args.get("n", 5)), args.get("region"))`
   - `monthly_revenue` → `{"2024-01": 매출, ...}` dict
   - `forecast_revenue` → `forecast(df, int(args.get("months_ahead", 3)))`를 `to_dict("records")`로 바꿉니다.
   - 결과는 `_to_json()`으로 직렬화하고, 정상이면 `is_error`는 `False`입니다.
   - 알 수 없는 도구이거나 **어떤 예외든** 발생하면 `_to_json({"error": "..."})`와 `True`를 반환합니다.

```hint id=p1-s4
전체를 try/except Exception as e로 감싸고, except에서 return _to_json({"error": f"{type(e).__name__}: {e}"}), True 를 반환하세요. monthly_revenue 결과는 {str(k): int(v) for k, v in s.items()} 로 바꿉니다. forecast_revenue 스키마: {"name": "forecast_revenue", "description": "...", "input_schema": {"type": "object", "properties": {"months_ahead": {"type": "integer", "description": "..."}}, "required": ["months_ahead"]}}
```

```python starter id=p1-s4
import json

REGIONS = ["서울", "부산", "대구", "광주", "대전"]

TOOLS = [
    {
        "name": "summarize_sales",
        "description": "전체 기간(2024-01~2025-12) 매출(원) 또는 판매 수량을 지역·카테고리·상품·채널별로 합계 내어 내림차순으로 돌려줍니다. 각 항목의 비중(share_pct, %)도 포함합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "by": {"type": "string", "enum": ALLOWED_DIMS, "description": "묶을 기준 (region=지역, category=카테고리, product=상품, channel=채널)"},
                "metric": {"type": "string", "enum": ALLOWED_METRICS, "description": "revenue=매출(원), units=판매 수량. 기본값 revenue"},
            },
            "required": ["by"],
        },
    },
    {
        "name": "top_products",
        "description": "매출(원) 기준 상위 상품 목록을 돌려줍니다. 지역을 지정하면 그 지역만 집계합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {"type": "integer", "description": "몇 개를 볼지 (기본 5)"},
                "region": {"type": "string", "enum": REGIONS, "description": "지역 (생략하면 전체)"},
            },
        },
    },
    {
        "name": "monthly_revenue",
        "description": "월별 매출(원) 추이를 {\"YYYY-MM\": 매출} 형태로 돌려줍니다. 추세, 계절성, 전월·전년 대비 비교에 사용합니다. 지역을 지정하면 그 지역만 집계합니다.",
        "input_schema": {
            "type": "object",
            "properties": {"region": {"type": "string", "enum": REGIONS, "description": "지역 (생략하면 전체)"}},
        },
    },
    # TODO: forecast_revenue 도구 스키마를 추가하세요
]

def _to_json(obj):
    # numpy 숫자 타입도 JSON으로 바꿀 수 있게 합니다.
    return json.dumps(obj, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))

def execute_tool(df, name, args):
    # TODO: name에 따라 분석 함수를 호출하고 (결과 JSON 문자열, is_error) 를 반환
    pass

# df = load_sales()
# print(execute_tool(df, "top_products", {"n": 3, "region": "부산"}))
```

```python test id=p1-s4
import json
df = load_sales()

names = [t["name"] for t in TOOLS]
assert names == ["summarize_sales", "top_products", "monthly_revenue", "forecast_revenue"], f"도구 목록이 다릅니다: {names}"
fc_tool = TOOLS[3]
assert len(fc_tool.get("description", "")) >= 10, "forecast_revenue에 충분한 설명(description)을 쓰세요"
props = fc_tool["input_schema"]["properties"]
assert props.get("months_ahead", {}).get("type") == "integer", "months_ahead는 integer 타입이어야 합니다"
assert "months_ahead" in fc_tool["input_schema"].get("required", []), "months_ahead를 required에 넣으세요"

res = execute_tool(df, "summarize_sales", {"by": "region"})
assert isinstance(res, tuple) and len(res) == 2, "(결과 문자열, is_error) 튜플을 반환하세요"
text, err = res
assert isinstance(text, str) and err is False, "정상 결과는 (문자열, False)여야 합니다"
data = json.loads(text)
assert data[0]["region"] == "서울" and data[0]["revenue"] == 1117279500, f"summarize_sales 결과가 다릅니다: {data[0]}"
assert "서울" in text, "ensure_ascii=False로 한글이 그대로 보이게 하세요"

text, err = execute_tool(df, "top_products", {"n": 2, "region": "부산"})
assert not err and [x["product"] for x in json.loads(text)] == ["노트북", "에어컨"], f"top_products 결과가 다릅니다: {text}"
text, err = execute_tool(df, "monthly_revenue", {})
mr = json.loads(text)
assert not err and len(mr) == 24 and mr["2025-11"] == 167806550, "monthly_revenue는 {'YYYY-MM': 매출} dict여야 합니다"
text, err = execute_tool(df, "forecast_revenue", {"months_ahead": 2})
fr = json.loads(text)
assert not err and [x["month"] for x in fr] == ["2026-01", "2026-02"], f"forecast_revenue 결과가 다릅니다: {text}"

for bad_name, bad_args in [("delete_all", {}), ("summarize_sales", {"by": "color"}), ("summarize_sales", {}), ("forecast_revenue", {"months_ahead": 99})]:
    text, err = execute_tool(df, bad_name, bad_args)
    assert err is True and "error" in json.loads(text), f"{bad_name}{bad_args}는 ({{'error': ...}}, True)를 반환해야 합니다 (예외를 밖으로 던지지 마세요)"
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s4
import json

REGIONS = ["서울", "부산", "대구", "광주", "대전"]

TOOLS = [
    {
        "name": "summarize_sales",
        "description": "전체 기간(2024-01~2025-12) 매출(원) 또는 판매 수량을 지역·카테고리·상품·채널별로 합계 내어 내림차순으로 돌려줍니다. 각 항목의 비중(share_pct, %)도 포함합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "by": {"type": "string", "enum": ALLOWED_DIMS, "description": "묶을 기준 (region=지역, category=카테고리, product=상품, channel=채널)"},
                "metric": {"type": "string", "enum": ALLOWED_METRICS, "description": "revenue=매출(원), units=판매 수량. 기본값 revenue"},
            },
            "required": ["by"],
        },
    },
    {
        "name": "top_products",
        "description": "매출(원) 기준 상위 상품 목록을 돌려줍니다. 지역을 지정하면 그 지역만 집계합니다.",
        "input_schema": {
            "type": "object",
            "properties": {
                "n": {"type": "integer", "description": "몇 개를 볼지 (기본 5)"},
                "region": {"type": "string", "enum": REGIONS, "description": "지역 (생략하면 전체)"},
            },
        },
    },
    {
        "name": "monthly_revenue",
        "description": "월별 매출(원) 추이를 {\"YYYY-MM\": 매출} 형태로 돌려줍니다. 추세, 계절성, 전월·전년 대비 비교에 사용합니다. 지역을 지정하면 그 지역만 집계합니다.",
        "input_schema": {
            "type": "object",
            "properties": {"region": {"type": "string", "enum": REGIONS, "description": "지역 (생략하면 전체)"}},
        },
    },
    {
        "name": "forecast_revenue",
        "description": "추세와 월별 계절성을 학습한 Ridge 회귀 모델로 2026-01부터 향후 월 매출(원)을 예측합니다. 결과는 모델 추정치입니다 (검증 MAPE 약 8.8%).",
        "input_schema": {
            "type": "object",
            "properties": {"months_ahead": {"type": "integer", "description": "예측할 개월 수 (1~12)"}},
            "required": ["months_ahead"],
        },
    },
]

def _to_json(obj):
    return json.dumps(obj, ensure_ascii=False, default=lambda o: o.item() if hasattr(o, "item") else str(o))

def execute_tool(df, name, args):
    try:
        if name == "summarize_sales":
            result = summarize(df, args["by"], args.get("metric", "revenue")).to_dict("records")
        elif name == "top_products":
            result = top_products(df, int(args.get("n", 5)), args.get("region"))
        elif name == "monthly_revenue":
            result = {str(k): int(v) for k, v in monthly_revenue(df, args.get("region")).items()}
        elif name == "forecast_revenue":
            result = forecast(df, int(args.get("months_ahead", 3))).to_dict("records")
        else:
            return _to_json({"error": f"알 수 없는 도구입니다: {name}"}), True
        return _to_json(result), False
    except Exception as e:
        return _to_json({"error": f"{type(e).__name__}: {e}"}), True
```

LLM 없이 도구 실행기만 먼저 시험해 봅니다. 모델이 보낼 법한 정상 호출과 잘못된 호출을 섞었습니다.

```python run id=p1-s4d
df = load_sales()
for name, args in [
    ("top_products", {"n": 3, "region": "부산"}),
    ("summarize_sales", {"by": "channel"}),
    ("forecast_revenue", {"months_ahead": 3}),
    ("summarize_sales", {"by": "지역"}),       # enum에 없는 값 → 오류 결과
]:
    text, is_error = execute_tool(df, name, args)
    print(f"{'❌' if is_error else '✅'} {name}({args})\n   → {text[:160]}")
```

```quiz id=p1-q3
{"q": "도구 실행 중 예외가 발생했을 때 에이전트 설계로 가장 바람직한 것은?", "options": ["예외를 그대로 던져 에이전트 루프를 중단한다", "오류 내용을 tool_result(is_error=True)로 모델에게 돌려줘 스스로 수정하게 한다", "오류를 숨기고 빈 결과 \"[]\"를 돌려준다", "같은 인자로 성공할 때까지 무한 재시도한다"], "answer": 1, "explain": "오류 메시지를 결과로 돌려주면 모델이 인자를 고쳐 다시 시도하거나 다른 도구를 고를 수 있습니다. 빈 결과로 숨기면 모델이 '데이터가 없다'고 잘못 결론 내립니다."}
```

## Step 5. 분석 에이전트 루프

### 에이전트에게 "분석가의 규칙"을 가르치기

도구가 준비되었으니 모듈 04의 에이전트 루프에 연결합니다. 분석 에이전트에서 특히 중요한 것은 **system 프롬프트로 정하는 행동 규칙**입니다.

| 규칙 | 막으려는 문제 |
|---|---|
| 숫자는 도구로 조회한 값만 쓴다 | 그럴듯하게 지어낸 숫자(환각) |
| 예측값은 "모델 추정치"라고 밝힌다 | 예측을 확정된 사실처럼 전달하는 것 |
| 필요하면 여러 도구를 조합한다 | "부산의 성장 원인"처럼 한 번의 조회로 답할 수 없는 질문에 대충 답하는 것 |
| 마지막에 근거(사용한 도구)를 적는다 | 검증할 수 없는 답변 |

실제 Claude는 "2025년 부산 매출이 왜 늘었어?"라는 질문에 대략 다음과 같이 움직입니다.

1. `monthly_revenue(region="부산")`로 추이를 확인합니다.
2. `top_products(region="부산")`로 어떤 상품이 성장을 이끌었는지 봅니다.
3. 두 결과를 종합해 답합니다.

이렇게 **몇 단계가 필요할지 미리 알 수 없는 질문**이 바로 에이전트가 필요한 상황입니다.

### 실습 5. `analyst_agent()` 구현

`analyst_agent(question, df, max_steps=6, verbose=False)`를 완성하세요.

- `messages`를 `[{"role": "user", "content": question}]`로 시작합니다.
- 최대 `max_steps`번 `chat(messages, system=SYSTEM_PROMPT, tools=TOOLS)`를 호출합니다.
  - 응답 `content` 전체를 assistant 메시지로 추가합니다.
  - `stop_reason`이 `"tool_use"`가 아니면 `text_of(resp)`를 반환합니다.
  - 그렇지 않으면 모든 tool_use를 `execute_tool(df, name, input)`으로 실행합니다. 결과를 `tool_result(id, text, is_error=is_error)`로 만들어 **하나의 user 메시지**로 추가합니다.
  - `verbose`가 참이면 호출한 도구와 결과 앞부분을 출력합니다(채점과 무관).
- 끝나지 않으면 `"최대 단계 초과"`로 **시작하는** 문자열을 반환합니다.

```hint id=p1-s5
모듈 04의 run_agent와 같은 구조입니다. text, is_err = execute_tool(df, c["name"], c["input"]) 결과를 tool_result(c["id"], text, is_error=is_err)로 감싸세요. for 루프가 끝나면 return "최대 단계 초과: ..." 입니다.
```

```python starter id=p1-s5
from agentlab import chat, text_of, tool_calls, tool_result

SYSTEM_PROMPT = """너는 유통사의 매출 데이터 분석가다. 데이터 기간은 2024-01 ~ 2025-12이다.
규칙:
- 숫자는 반드시 도구로 조회한 값만 사용하고, 추측하거나 지어내지 않는다.
- 질문에 답하는 데 필요하면 여러 도구를 차례로 호출해 근거를 모은다.
- 금액은 천 단위 쉼표를 붙인 원 단위로 쓰고, 1억 원 이상이면 'N.N억 원'도 함께 쓴다.
- 예측 값은 '모델 추정치'라고 밝힌다.
- 답변은 핵심 결론 → 근거 숫자 → 시사점 순서로 5문장 이내로 쓰고, 마지막 줄에 '근거: 사용한 도구 이름'을 적는다."""

async def analyst_agent(question, df, max_steps=6, verbose=False):
    messages = [{"role": "user", "content": question}]
    # TODO: 에이전트 루프
    pass

# df = load_sales()
# print(await analyst_agent("부산에서 가장 많이 팔린 상품 3개는?", df, verbose=True))
```

```python test id=p1-s5
import json
import agentlab
df = load_sales()

agentlab.scripted([
    {"tool": "summarize_sales", "input": {"by": "region"}, "id": "a1", "text": "지역별 매출을 조회하겠습니다."},
    [{"tool": "top_products", "input": {"n": 1, "region": "부산"}, "id": "b1"},
     {"tool": "drop_table", "input": {}, "id": "b2"}],
    "서울이 1위이며, 부산 1위 상품은 노트북입니다.\n근거: summarize_sales, top_products",
])
answer = await analyst_agent("지역별 매출과 부산 1위 상품은?", df)
assert answer == "서울이 1위이며, 부산 1위 상품은 노트북입니다.\n근거: summarize_sales, top_products", f"최종 텍스트를 반환하세요: {answer!r}"
assert len(agentlab.calls) == 3, f"chat은 3번 호출되어야 합니다 (현재 {len(agentlab.calls)}번)"
first = agentlab.calls[0]
assert first.get("system") == SYSTEM_PROMPT, "system=SYSTEM_PROMPT를 전달하세요"
assert first.get("tools") == TOOLS, "tools=TOOLS를 전달하세요"
msgs = agentlab.calls[2]["messages"]
assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant", "user"], "assistant 응답과 tool_result가 순서대로 쌓여야 합니다"
assert isinstance(msgs[1]["content"], list) and msgs[1]["content"][0]["type"] == "text", "assistant 메시지에는 resp['content'] 전체를 넣으세요"
r1 = msgs[2]["content"][0]
assert r1["type"] == "tool_result" and r1["tool_use_id"] == "a1", "tool_result의 tool_use_id를 맞추세요"
assert json.loads(r1["content"])[0]["region"] == "서울", "도구 실행 결과(JSON)를 tool_result content에 넣으세요"
assert not r1.get("is_error"), "정상 결과에는 is_error를 붙이지 마세요"
pair = msgs[4]["content"]
assert len(pair) == 2 and {b["tool_use_id"] for b in pair} == {"b1", "b2"}, "병렬 호출 결과 2개를 하나의 user 메시지에 담으세요"
bad = [b for b in pair if b["tool_use_id"] == "b2"][0]
assert bad.get("is_error") is True, "알 수 없는 도구 결과에는 is_error=True를 붙이세요"

agentlab._reset()
agentlab.scripted([{"tool": "monthly_revenue", "input": {}}] * 10)
answer = await analyst_agent("끝나지 않는 질문", df, max_steps=2)
assert len(agentlab.calls) == 2, "max_steps=2이면 chat은 2번만 호출되어야 합니다"
assert isinstance(answer, str) and answer.startswith("최대 단계 초과"), f"단계 초과 시 '최대 단계 초과'로 시작하는 문자열을 반환하세요: {answer!r}"
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s5
from agentlab import chat, text_of, tool_calls, tool_result

SYSTEM_PROMPT = """너는 유통사의 매출 데이터 분석가다. 데이터 기간은 2024-01 ~ 2025-12이다.
규칙:
- 숫자는 반드시 도구로 조회한 값만 사용하고, 추측하거나 지어내지 않는다.
- 질문에 답하는 데 필요하면 여러 도구를 차례로 호출해 근거를 모은다.
- 금액은 천 단위 쉼표를 붙인 원 단위로 쓰고, 1억 원 이상이면 'N.N억 원'도 함께 쓴다.
- 예측 값은 '모델 추정치'라고 밝힌다.
- 답변은 핵심 결론 → 근거 숫자 → 시사점 순서로 5문장 이내로 쓰고, 마지막 줄에 '근거: 사용한 도구 이름'을 적는다."""

async def analyst_agent(question, df, max_steps=6, verbose=False):
    messages = [{"role": "user", "content": question}]
    for step in range(max_steps):
        resp = await chat(messages, system=SYSTEM_PROMPT, tools=TOOLS)
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":
            return text_of(resp)
        results = []
        for c in tool_calls(resp):
            text, is_err = execute_tool(df, c["name"], c["input"])
            if verbose:
                print(f"[step {step}] 🔧 {c['name']}({c['input']}) → {text[:120]}")
            results.append(tool_result(c["id"], text, is_error=is_err))
        messages.append({"role": "user", "content": results})
    return "최대 단계 초과: 질문을 더 구체적으로 나눠서 물어봐 주세요."
```

### 에이전트에게 질문해 보기

아래 질문들을 바꿔 가며 실행해 보세요. Mock LLM은 질문과 도구 설명의 단어가 겹치는 도구를 **하나만** 고르는 단순한 규칙으로 동작합니다. [설정](#/settings)에서 Claude를 연결하면 여러 도구를 조합하고 숫자를 해석하는 진짜 분석가처럼 답합니다.

```python run id=p1-s5d
df = load_sales()

questions = [
    "지역별 매출을 요약해줘",
    # Claude를 연결했다면 아래 질문도 시도해 보세요.
    # "2025년에 부산 매출이 왜 늘었는지 원인을 분석해줘",
    # "다음 3개월 매출 전망과 작년 같은 기간 대비 증감을 알려줘",
    # "11월 온라인 매출이 다른 달보다 높은 이유가 뭘까?",
]
for q in questions:
    print("🙋", q)
    answer = await analyst_agent(q, df, verbose=True)
    print("🤖", answer, "\n" + "-" * 60)
```

> 🔍 **실무 팁**: 에이전트가 이상한 답을 하면 먼저 `verbose=True`로 **어떤 도구를 어떤 인자로 불렀는지** 확인하세요. 대부분의 문제는 모델이 아니라 **도구 설명이 모호하거나 도구 결과가 이해하기 어려운 형태**인 데서 생깁니다.

## Step 6. 월간 리포트 자동화

### 계산은 코드가, 해설은 LLM이

매달 반복되는 보고서에는 에이전트보다 **정해진 순서의 워크플로**(모듈 07)가 더 적합합니다. 무엇을 계산할지 이미 알고 있기 때문입니다. 핵심 설계 원칙은 다음과 같습니다.

~~~text
 compute_kpis(df, "2025-11")          ← 결정적(deterministic): 항상 같은 정확한 숫자
        │  {"revenue": 167806550, "mom_pct": 17.4, ...}
        ▼
 LLM: KPI JSON만 보고 3~5문장 해설    ← 숫자를 새로 만들지 말라고 지시
        │
        ▼
 마크다운 조립: KPI 표(코드가 작성) + 해설(LLM) + 차트
~~~

KPI 표의 숫자는 **코드가 직접 적습니다.** LLM이 쓴 해설에 숫자 실수가 있더라도 표는 항상 정확합니다. 이처럼 **"LLM이 틀려도 치명적이지 않은 위치"에 LLM을 두는 것**이 안정적인 자동화의 요령입니다.

### 실습 6-1. KPI 계산 `compute_kpis()`

`compute_kpis(df, month)`를 완성하세요. `month`는 `"2025-11"` 같은 문자열입니다.

- 해당 월 데이터가 없으면 `ValueError`를 발생시킵니다.
- 다음 키를 가진 dict를 반환합니다. 숫자는 파이썬 `int`나 `float` 또는 `None`이어야 합니다.

| 키 | 의미 |
|---|---|
| `month` | 입력 월 문자열 |
| `revenue`, `orders`, `units` | 해당 월 매출 합계, 주문 수(행 수), 수량 합계 |
| `mom_pct` | 전월 대비 매출 증감률(%). 소수 첫째 자리 반올림. 전월 데이터가 없으면 `None` |
| `yoy_pct` | 전년 동월 대비 증감률(%). 같은 방식. 없으면 `None` |
| `top_region`, `top_category`, `top_product` | 해당 월 매출 1위 |
| `online_share_pct` | 해당 월 매출 중 온라인 비중(%). 소수 첫째 자리 반올림 |

```hint id=p1-s6a
p = pd.Period(month, "M") 로 바꾸면 p - 1 이 전월, p - 12 가 전년 동월입니다. 월별 합계는 monthly_revenue(df)를 재사용하고, 증감률은 round((cur / prev - 1) * 100, 1) 입니다. 1위는 cur.groupby("region")["revenue"].sum().idxmax() 로 구합니다.
```

```python starter id=p1-s6a
import pandas as pd

def compute_kpis(df, month):
    # TODO: 해당 월 필터 → 합계·주문 수·수량 → 전월/전년 대비 → 1위 항목 → 온라인 비중
    pass

# df = load_sales()
# print(compute_kpis(df, "2025-11"))
```

```python test id=p1-s6a
df = load_sales()
k = compute_kpis(df, "2025-11")
assert isinstance(k, dict), "dict를 반환하세요"
expected = {"month": "2025-11", "revenue": 167806550, "orders": 239, "units": 1248, "mom_pct": 17.4, "yoy_pct": -3.4,
            "top_region": "서울", "top_category": "가전", "top_product": "태블릿", "online_share_pct": 71.3}
for key, val in expected.items():
    assert key in k, f"'{key}' 키가 없습니다"
    assert k[key] == val, f"{key} 값이 다릅니다: 기대 {val!r}, 받은 값 {k[key]!r}"
assert type(k["revenue"]) is int and type(k["orders"]) is int, "revenue, orders는 파이썬 int로 변환하세요"
first = compute_kpis(df, "2024-01")
assert first["mom_pct"] is None and first["yoy_pct"] is None, "비교할 이전 데이터가 없으면 None이어야 합니다"
assert first["revenue"] == 86866000, "2024-01 매출이 다릅니다"
try:
    compute_kpis(df, "2030-01")
except ValueError:
    pass
else:
    raise AssertionError("데이터가 없는 월은 ValueError를 발생시켜야 합니다")
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s6a
import pandas as pd

def compute_kpis(df, month):
    p = pd.Period(month, "M")
    cur = df[df["month"] == p]
    if cur.empty:
        raise ValueError(f"{month} 데이터가 없습니다")
    monthly = monthly_revenue(df)
    revenue = int(cur["revenue"].sum())

    def change(base_period):
        if base_period not in monthly.index:
            return None
        return round((revenue / monthly[base_period] - 1) * 100, 1)

    online = cur.loc[cur["channel"] == "online", "revenue"].sum()
    return {
        "month": month,
        "revenue": revenue,
        "orders": int(len(cur)),
        "units": int(cur["units"].sum()),
        "mom_pct": change(p - 1),
        "yoy_pct": change(p - 12),
        "top_region": cur.groupby("region")["revenue"].sum().idxmax(),
        "top_category": cur.groupby("category")["revenue"].sum().idxmax(),
        "top_product": cur.groupby("product")["revenue"].sum().idxmax(),
        "online_share_pct": round(float(online / revenue * 100), 1),
    }
```

### 실습 6-2. 리포트 생성 `build_report()`

`async def build_report(df, month)`를 완성하세요.

1. `kpis = compute_kpis(df, month)`로 숫자를 계산합니다.
2. `chat()`을 **한 번** 호출해 해설을 받습니다.
   - `system=REPORT_SYSTEM`을 씁니다.
   - user 메시지에는 `json.dumps(kpis, ensure_ascii=False)`를 `<kpi>...</kpi>` 태그로 감싸 넣습니다.
3. 아래 형식의 마크다운 문자열을 반환합니다.
   - 금액은 `f"{v:,}원"` 형식으로 씁니다.
   - 증감률은 `_fmt_pct()`로 씁니다. 값이 `None`이면 `N/A`가 됩니다.

~~~text
# 2025-11 월간 매출 리포트

| 지표 | 값 |
|---|---|
| 매출 | 167,806,550원 |
| 주문 수 | 239건 |
| 판매 수량 | 1,248개 |
| 전월 대비 | +17.4% |
| 전년 동월 대비 | -3.4% |
| 1위 지역 / 카테고리 / 상품 | 서울 / 가전 / 태블릿 |
| 온라인 비중 | 71.3% |

## 분석 코멘트

(LLM이 쓴 해설)
~~~

```hint id=p1-s6b
resp = await chat([{"role": "user", "content": f"<kpi>{facts}</kpi>\n{month} 월간 매출 코멘트를 작성해 주세요."}], system=REPORT_SYSTEM) 후 text_of(resp).strip()을 해설로 씁니다. 표의 각 줄은 f"| 매출 | {k['revenue']:,}원 |" 처럼 만듭니다.
```

```python starter id=p1-s6b
import json
from agentlab import chat, text_of

REPORT_SYSTEM = """너는 리테일 경영진에게 월간 매출을 보고하는 시니어 애널리스트다.
<kpi> 태그 안의 JSON 숫자만 근거로 3~5문장의 한국어 코멘트를 쓴다.
- JSON에 없는 숫자를 새로 만들거나 계산하지 않는다.
- 좋은 점, 우려되는 점, 다음 달에 확인할 점을 각각 한 번 이상 언급한다.
- mom_pct, yoy_pct가 null이면 비교 데이터가 없다고 말한다."""

def _fmt_pct(v):
    return "N/A" if v is None else f"{v:+.1f}%"

async def build_report(df, month):
    # TODO: compute_kpis → chat 한 번 → 마크다운 조립
    pass

# df = load_sales()
# print(await build_report(df, "2025-11"))
```

```python test id=p1-s6b
import agentlab
df = load_sales()
agentlab.scripted(["11월 매출은 프로모션 효과로 전월 대비 크게 늘었습니다."])
report = await build_report(df, "2025-11")
assert isinstance(report, str), "마크다운 문자열을 반환하세요"
for piece in ["# 2025-11 월간 매출 리포트", "| 매출 | 167,806,550원 |", "| 주문 수 | 239건 |", "| 판매 수량 | 1,248개 |",
              "| 전월 대비 | +17.4% |", "| 전년 동월 대비 | -3.4% |", "| 1위 지역 / 카테고리 / 상품 | 서울 / 가전 / 태블릿 |",
              "| 온라인 비중 | 71.3% |", "## 분석 코멘트", "11월 매출은 프로모션 효과로 전월 대비 크게 늘었습니다."]:
    assert piece in report, f"리포트에 다음 내용이 없습니다: {piece}"
assert len(agentlab.calls) == 1, f"chat은 한 번만 호출해야 합니다 (현재 {len(agentlab.calls)}번)"
call = agentlab.calls[0]
assert call.get("system") == REPORT_SYSTEM, "system=REPORT_SYSTEM을 전달하세요"
user_text = call["messages"][0]["content"]
assert "<kpi>" in user_text and "167806550" in user_text and "태블릿" in user_text, "user 메시지에 KPI JSON을 <kpi> 태그로 넣으세요 (ensure_ascii=False)"
assert not call.get("tools"), "리포트 작성에는 도구가 필요 없습니다"

agentlab.scripted(["첫 달이라 비교 데이터가 없습니다."])
first = await build_report(df, "2024-01")
assert "| 전월 대비 | N/A |" in first and "| 전년 동월 대비 | N/A |" in first, "비교 데이터가 없으면 N/A로 표시하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=p1-s6b
import json
from agentlab import chat, text_of

REPORT_SYSTEM = """너는 리테일 경영진에게 월간 매출을 보고하는 시니어 애널리스트다.
<kpi> 태그 안의 JSON 숫자만 근거로 3~5문장의 한국어 코멘트를 쓴다.
- JSON에 없는 숫자를 새로 만들거나 계산하지 않는다.
- 좋은 점, 우려되는 점, 다음 달에 확인할 점을 각각 한 번 이상 언급한다.
- mom_pct, yoy_pct가 null이면 비교 데이터가 없다고 말한다."""

def _fmt_pct(v):
    return "N/A" if v is None else f"{v:+.1f}%"

async def build_report(df, month):
    k = compute_kpis(df, month)
    facts = json.dumps(k, ensure_ascii=False)
    resp = await chat(
        [{"role": "user", "content": f"<kpi>{facts}</kpi>\n{month} 월간 매출 코멘트를 작성해 주세요."}],
        system=REPORT_SYSTEM,
    )
    narrative = text_of(resp).strip()
    lines = [
        f"# {month} 월간 매출 리포트",
        "",
        "| 지표 | 값 |",
        "|---|---|",
        f"| 매출 | {k['revenue']:,}원 |",
        f"| 주문 수 | {k['orders']:,}건 |",
        f"| 판매 수량 | {k['units']:,}개 |",
        f"| 전월 대비 | {_fmt_pct(k['mom_pct'])} |",
        f"| 전년 동월 대비 | {_fmt_pct(k['yoy_pct'])} |",
        f"| 1위 지역 / 카테고리 / 상품 | {k['top_region']} / {k['top_category']} / {k['top_product']} |",
        f"| 온라인 비중 | {k['online_share_pct']}% |",
        "",
        "## 분석 코멘트",
        "",
        narrative,
    ]
    return "\n".join(lines)
```

### 자동화 완성: 여러 달 리포트를 한 번에

마지막으로, 실무에서 이 워크플로를 어떻게 돌리는지 흉내 내 봅니다. 최근 3개월 리포트를 차례로 만들고, 리포트에 붙일 차트도 그립니다.

```python run id=p1-s6d
import matplotlib.pyplot as plt
from agentlab import show_plot

df = load_sales()
for month in ["2025-10", "2025-11", "2025-12"]:
    report = await build_report(df, month)
    print(report, "\n" + "=" * 60)

# 리포트용 차트: 최근 13개월 매출, 보고 월 강조
m = monthly_revenue(df).iloc[-13:] / 1e8
colors = ["tab:red" if str(p) == "2025-12" else "tab:blue" for p in m.index]
fig, ax = plt.subplots(figsize=(9, 3.2))
ax.bar(m.index.astype(str), m.values, color=colors)
ax.set_title("최근 13개월 매출 (억 원) — 2025-12 강조")
ax.tick_params(axis="x", rotation=45, labelsize=8)
show_plot(fig)
```

### 실무 배포는 이렇게 합니다

| 구성 요소 | 이 실습에서 | 실무에서 |
|---|---|---|
| 실행 시점 | 버튼을 눌러 실행 | 매월 1일 오전 7시에 스케줄러(cron, Windows 작업 스케줄러, GitHub Actions, Airflow 등)가 자동 실행 |
| 데이터 | CSV 파일 | 데이터 웨어하우스 SQL 조회. 조회 결과 행 수·결측률 검사를 먼저 수행 |
| 결과 전달 | 화면 출력 | 메일·메신저 발송, 사내 위키 게시. 처음 몇 달은 **사람 검토 후 발송** |
| 품질 관리 | 채점 테스트 | 해설에 KPI JSON에 없는 숫자가 나오면 경고하는 검사기, 프롬프트 변경 시 회귀 평가(모듈 09) |
| 비용 | — | 리포트 1건 = LLM 호출 1번. 에이전트(Step 5)보다 훨씬 싸고 예측 가능 |

```quiz id=p1-q4
{"q": "월간 리포트에서 매출·증감률 같은 KPI를 LLM이 아니라 코드(compute_kpis)로 계산하는 가장 큰 이유는?", "options": ["LLM API는 숫자를 입력으로 받을 수 없어서", "숫자는 항상 정확하고 재현 가능해야 하며, LLM은 계산 실수를 할 수 있어서", "코드가 LLM보다 더 좋은 문장을 써서", "LLM에게 표 형식을 만들게 할 수 없어서"], "answer": 1, "explain": "정확성과 재현성이 필요한 부분은 결정적인 코드로, 해석과 문장 작성처럼 유연성이 필요한 부분만 LLM에 맡기는 것이 신뢰할 수 있는 자동화의 기본 설계입니다."}
```

## 🎉 프로젝트 완료

축하합니다! 이번 프로젝트에서 만든 흐름을 정리하면 다음과 같습니다.

1. **정제**: 데이터 품질 문제 3가지를 찾아 고쳤습니다 (5,875 → 5,830행).
2. **분석 함수**: 검증된 입력만 받고 작은 결과를 돌려주는 함수를 만들었습니다.
3. **예측 모델**: 추세와 계절성을 특징으로 만든 Ridge 회귀 모델입니다. 시간 기준 검증에서 MAE 약 1,187만 원(MAPE 8.8%)으로 기준 모델(약 1,268만 원)보다 좋았습니다.
4. **도구화**: enum, 압축 JSON, 오류를 결과로 돌려주는 실행기를 만들었습니다.
5. **에이전트**: 규칙을 가진 system 프롬프트와 다단계 도구 호출 루프를 구현했습니다.
6. **자동화**: "계산은 코드, 해설은 LLM" 원칙으로 월간 리포트를 자동으로 만들었습니다.

## 확장 과제

- **도구 추가**: `compare_periods(start1, end1, start2, end2, by)` 도구를 만들어 "올해 상반기와 작년 상반기를 지역별로 비교해줘"에 답하게 해 보세요.
- **예측 개선**: 11월 프로모션 여부를 특징(`is_promo`)으로 추가하고, `split`을 2025-06, 2025-07, 2025-08로 바꿔 가며 반복 검증(rolling origin)해 MAE 평균을 비교해 보세요.
- **카테고리별 예측**: `forecast()`에 `category` 인자를 추가해 가전 수요를 따로 예측하고, 7~8월 에어컨 재고 계획에 활용하는 질문에 답하게 해 보세요.
- **답변 검증기**: 에이전트 답변 속 숫자가 도구 결과 JSON에 실제로 있는지 정규식으로 검사하는 `verify_numbers(answer, tool_results)`를 만들어 환각을 잡아 보세요 (모듈 09).
- **차트 도구**: `plot_monthly(region)` 도구가 그래프를 그리고 "차트를 표시했습니다"라고 돌려주게 해 보세요.

## 더 읽어보기

- [pandas 사용자 가이드: Group by](https://pandas.pydata.org/docs/user_guide/groupby.html)
- [pandas 사용자 가이드: 시계열과 Period](https://pandas.pydata.org/docs/user_guide/timeseries.html)
- [scikit-learn: Ridge 회귀와 선형 모델](https://scikit-learn.org/stable/modules/linear_model.html#ridge-regression-and-classification)
- [scikit-learn: 시계열 교차 검증 TimeSeriesSplit](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
- [Forecasting: Principles and Practice (Hyndman & Athanasopoulos)](https://otexts.com/fpp3/)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Writing effective tools for agents (Anthropic)](https://www.anthropic.com/engineering/writing-tools-for-agents)

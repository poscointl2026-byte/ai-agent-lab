# 프로젝트 2. 설비 예지보전 에이전트

> **한 줄 요약**: 설비 20대의 센서 로그로 **이상을 탐지**하고, **7일 안에 고장 날 설비를 예측**하는 모델을 만든 뒤, 이 모델을 도구로 쓰는 **정비 에이전트**와 **사람 승인이 있는 작업지시 자동화**까지 완성합니다.

## 왜 예지보전인가

설비 정비 방식은 크게 세 가지입니다.

| 방식 | 언제 정비하나 | 장점 | 단점 |
|---|---|---|---|
| **사후 정비** (Breakdown) | 고장 난 뒤 | 계획이 필요 없음 | 라인 정지, 긴급 부품 조달, 2차 손상으로 **비용이 가장 큼** |
| **예방 정비** (Time-based) | 정해진 주기마다 | 단순하고 예측 가능 | 멀쩡한 부품도 교체, 주기 사이에 나는 고장은 못 막음 |
| **예지 정비** (Predictive) | 데이터가 "곧 고장"을 알릴 때 | 필요한 설비만, 필요한 때 정비 | 데이터·모델·운영 체계가 필요함 |

현장에서는 보통 "계획 정비 1시간 비용이 돌발 정지 1시간 비용의 몇 분의 1"이라고 말합니다. 고장 며칠 전에 징후를 잡아 **계획 정비로 바꾸는 것**이 예지보전의 핵심 가치입니다.

다만 모델이 확률을 알려 줘도 실제로는 사람이 "어느 설비부터, 왜, 언제" 정비할지 정리하고 작업지시를 내려야 합니다. 이 부분을 **LLM 에이전트**가 돕습니다. 에이전트는 모델과 데이터를 도구로 조회해 근거를 정리하고 작업지시 초안을 씁니다. **최종 발행은 사람이 승인**합니다.

## 최종 결과물

~~~text
 sensors.csv ─▶ [Step 1] 로드·탐색 ─▶ [Step 2] 이상 탐지 (rolling z-score)
                        │
                        ▼
                [Step 3] 특징 공학 (7일 이동 평균·변동성·기울기·기준 대비 편차)
                        │
                        ▼
                [Step 4] 고장 예측 모델 (RandomForest) ─▶ 설비별 위험도 순위
                        │
                        ▼
   ┌──────────── [Step 5] 정비 에이전트 ─────────────┐
   │  도구: get_risk_ranking / get_machine_history /  │ ◀── "지금 제일 위험한 설비와 근거는?"
   │        get_anomalies                             │
   └──────────────────────────────────────────────────┘
                        │
                        ▼
                [Step 6] 작업지시 자동화: 제안(규칙) → 사유 작성(LLM) → 사람 승인 → 발행 + 감사 로그
~~~

## 데이터 소개: `data/sensors.csv`

설비 20대(M01~M20)가 3개 라인(A/B/C)에 나뉘어 있고, 2025-04-01부터 180일 동안 하루 한 번 기록했습니다. 모두 3,600행입니다.

| 컬럼 | 의미 | 비고 |
|---|---|---|
| `date` | 측정일 | |
| `machine_id` | 설비 번호 (M01~M20) | |
| `line` | 생산 라인 (A/B/C) | |
| `temperature` | 베어링 온도 (℃) | 고장 전 상승 |
| `vibration` | 진동 (mm/s) | 고장 전 급격히 상승 |
| `pressure` | 유압 (bar) | 고장 전 약간 하락 |
| `current` | 모터 전류 (A) | 고장 전 상승 |
| `runtime_hours` | 누적 가동 시간 | 정비(고장) 후 0 근처로 리셋 |
| `failure` | 그날 고장이 났으면 1 | 180일 동안 10건 |
| `failure_within_7d` | **예측 목표**: 오늘부터 7일 안에 고장이 나면 1 | 마지막 7일은 미래를 모르므로 비어 있음 |

> 실습용 합성 데이터이지만, 실제 설비 데이터의 특징을 담았습니다. 고장 전 수일에 걸친 **점진적 열화(drift)**, 고장과 무관한 하루짜리 **센서 튐(spike)**, 그리고 **아직 고장 나지 않았지만 열화가 진행 중인 설비**가 있습니다. 이 설비를 찾아내는 것이 최종 목표입니다.

**이 프로젝트에서 쓰는 기술**: pandas `groupby`와 `rolling`, 이상 탐지(z-score), 시계열 특징 공학과 데이터 누수 방지, scikit-learn 분류 모델과 불균형 데이터 평가, Tool Use 에이전트, Human-in-the-loop 승인 흐름.

> 💡 **진행 방법**: 각 Step의 실습을 **채점 통과**하면 다음 Step이 열립니다. 다음 Step에서는 **이전 Step들의 정답 코드가 자동으로 먼저 실행**되므로 앞에서 만든 `load_sensors()` 같은 함수를 그대로 부를 수 있습니다. 처음 실행할 때 pandas와 scikit-learn을 내려받느라 10~30초 걸릴 수 있습니다.

## Step 1. 센서 데이터 탐색

모델을 만들기 전에 **데이터를 눈으로 보는 것**이 가장 중요합니다. 무엇이 정상이고 고장 전에는 무엇이 변하는지 감을 잡아야 이상 탐지 기준과 특징을 설계할 수 있습니다.

### 1-1. 시계열 데이터를 다룰 때의 기본 습관

1. **날짜는 문자열이 아니라 날짜형으로** 읽습니다(`parse_dates`). 그래야 날짜 비교, 기간 필터링, 리샘플링이 됩니다.
2. **설비별, 시간순으로 정렬**합니다. 뒤에서 쓸 `rolling`(이동 창)과 `diff`(차분)는 **행 순서**를 기준으로 계산하므로, 정렬이 틀리면 결과가 조용히 틀립니다.
3. 여러 설비가 섞인 데이터는 반드시 **`groupby("machine_id")` 안에서** 이동 계산을 합니다. 그러지 않으면 M01의 마지막 날과 M02의 첫날이 한 창에 섞입니다.

### 1-2. 먼저 데이터를 훑어보기

아래 예제는 원본 CSV를 바로 읽어 고장 기록을 확인하고, 고장이 두 번 난 M02의 진동 그래프를 그립니다.

```python run id=p2-d1
import pandas as pd
import matplotlib.pyplot as plt
from agentlab import show_plot

raw = pd.read_csv("data/sensors.csv", parse_dates=["date"])
print(raw.shape)
print(raw.head(3).to_string())
print("\n고장 기록:")
print(raw[raw["failure"] == 1][["date", "machine_id", "line"]].to_string(index=False))

m = raw[raw["machine_id"] == "M02"]
fig, ax = plt.subplots(figsize=(9, 3))
ax.plot(m["date"], m["vibration"], label="진동 (mm/s)")
for d in m[m["failure"] == 1]["date"]:
    ax.axvline(d, color="red", linestyle="--", alpha=.7)
ax.set_title("M02 진동 추이 (빨간 점선 = 고장)")
ax.legend()
show_plot(fig)
```

그래프를 보면 고장(빨간 선) **10일 정도 전부터 진동이 서서히 올라가는** 패턴이 보입니다. 이것이 우리가 잡아야 할 신호입니다. 중간에 한 번 툭 튀었다가 바로 돌아오는 점이 있다면 그것은 **센서 튐**이며 고장과는 무관합니다.

### 실습 2-1. 로드 함수와 설비별 요약표 만들기

두 함수를 완성하세요.

- `load_sensors(path="data/sensors.csv")`
  - `date` 컬럼을 날짜형으로 읽습니다.
  - `machine_id`, `date` 순으로 정렬하고 인덱스를 0부터 다시 매깁니다(`reset_index(drop=True)`).
- `machine_summary(df)`: 설비별(인덱스 = `machine_id`) 요약 DataFrame을 반환합니다. 컬럼은 다음과 같습니다.
  - `line`: 설비의 라인 (첫 값)
  - `days`: 기록 일수
  - `failures`: 고장 횟수 (`failure` 합계)
  - `vib_mean`: 진동 평균
  - `temp_max`: 최고 온도

```hint id=p2-e1
pd.read_csv(path, parse_dates=["date"])로 읽고 .sort_values(["machine_id", "date"]).reset_index(drop=True)로 정렬하세요. 요약은 df.groupby("machine_id").agg(line=("line", "first"), days=("date", "count"), failures=("failure", "sum"), vib_mean=("vibration", "mean"), temp_max=("temperature", "max")) 형태의 named aggregation을 쓰면 한 번에 만들 수 있습니다.
```

```python starter id=p2-e1
import pandas as pd

def load_sensors(path="data/sensors.csv"):
    # TODO: date를 날짜형으로 읽고, machine_id → date 순으로 정렬한 뒤 인덱스를 다시 매기세요
    pass

def machine_summary(df):
    # TODO: 설비별 line, days, failures, vib_mean, temp_max 컬럼을 가진 DataFrame을 반환하세요
    pass

# 직접 실행해 보기:
# df = load_sensors()
# print(machine_summary(df).sort_values("failures", ascending=False).head())
```

```python test id=p2-e1
import pandas as pd
df = load_sensors()
assert df is not None, "load_sensors()가 DataFrame을 반환해야 합니다"
assert df.shape == (3600, 10), f"3600행 10열이어야 합니다 (현재 {df.shape})"
assert pd.api.types.is_datetime64_any_dtype(df["date"]), "date 컬럼을 날짜형으로 읽으세요 (parse_dates)"
assert list(df.index) == list(range(3600)), "reset_index(drop=True)로 인덱스를 0부터 다시 매기세요"
assert df.iloc[0]["machine_id"] == "M01" and df.iloc[179]["machine_id"] == "M01" and df.iloc[180]["machine_id"] == "M02", "machine_id 순으로 정렬하세요"
assert df[df.machine_id == "M05"]["date"].is_monotonic_increasing, "설비 안에서는 date 순으로 정렬되어야 합니다"

s = machine_summary(df)
assert s is not None, "machine_summary()가 DataFrame을 반환해야 합니다"
assert s.index.name == "machine_id" and len(s) == 20, "인덱스는 machine_id, 20개 설비여야 합니다"
for col in ["line", "days", "failures", "vib_mean", "temp_max"]:
    assert col in s.columns, f"요약표에 '{col}' 컬럼이 필요합니다"
assert int(s.loc["M02", "failures"]) == 2 and int(s["failures"].sum()) == 10, "failures는 failure 컬럼의 합계여야 합니다"
assert int(s.loc["M01", "days"]) == 180, "days는 기록 일수여야 합니다"
assert s.loc["M01", "line"] == "A" and s.loc["M02", "line"] == "B", "line은 설비의 라인이어야 합니다"
assert abs(s.loc["M03", "vib_mean"] - df[df.machine_id == "M03"]["vibration"].mean()) < 1e-9, "vib_mean은 진동 평균이어야 합니다"
assert s.loc["M04", "temp_max"] == df[df.machine_id == "M04"]["temperature"].max(), "temp_max는 최고 온도여야 합니다"
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e1
import pandas as pd

def load_sensors(path="data/sensors.csv"):
    df = pd.read_csv(path, parse_dates=["date"])
    return df.sort_values(["machine_id", "date"]).reset_index(drop=True)

def machine_summary(df):
    return df.groupby("machine_id").agg(
        line=("line", "first"),
        days=("date", "count"),
        failures=("failure", "sum"),
        vib_mean=("vibration", "mean"),
        temp_max=("temperature", "max"),
    )
```

```quiz id=p2-q1
{"q": "여러 설비의 데이터가 한 표에 섞여 있을 때 7일 이동 평균을 올바르게 구하는 방법은?", "options": ["df['vibration'].rolling(7).mean()을 그대로 쓴다", "설비·날짜 순으로 정렬한 뒤 groupby('machine_id') 안에서 rolling을 계산한다", "날짜 순으로만 정렬하고 rolling을 계산한다", "평균은 순서와 무관하므로 정렬할 필요가 없다"], "answer": 1, "explain": "rolling은 행 순서 기준입니다. 설비별로 묶지 않으면 서로 다른 설비의 값이 한 창에 섞여 엉뚱한 값이 나옵니다."}
```

## Step 2. 이상 탐지: rolling z-score

라벨(고장 기록)이 없어도 할 수 있는 첫 단계는 **"평소와 다른 값"을 찾는 것**입니다. 가장 널리 쓰이는 방법이 **z-score**입니다.

~~~text
z = (오늘 값 − 최근 평균) / 최근 표준편차
~~~

|z| ≥ 3이면 "최근 기준으로 3 표준편차 이상 벗어났다"는 뜻이고, 이상으로 표시합니다.

### 2-1. 설계 포인트

- **설비마다 기준이 다릅니다**: M01의 정상 진동이 2.2, M10은 2.9일 수 있습니다. 그래서 기준(평균·표준편차)을 **설비별로** 구합니다.
- **최근 기준(rolling)**: 계절이나 운전 조건이 바뀌므로 전체 기간 평균 대신 **직전 N일**을 기준으로 씁니다.
- **오늘 값은 기준에서 빼기(`shift(1)`)**: 오늘 튄 값이 기준 평균에 섞이면 z가 작아져 이상을 놓칩니다. "직전 14일(오늘 제외)"로 기준을 만드세요.
- **기준이 충분할 때만**: 처음 14일은 기준이 부족하므로 판정하지 않습니다(`min_periods=window`).

### 2-2. 이상 탐지의 한계: 점 이상 vs 추세 이상

| 유형 | 모양 | z-score가 잘 잡나? | 의미 |
|---|---|---|---|
| **점 이상 (spike)** | 하루만 툭 튀고 복귀 | ✅ 아주 잘 잡음 | 센서 노이즈, 일시적 충격 → **오경보가 많음** |
| **추세 이상 (drift)** | 며칠에 걸쳐 서서히 상승 | ⚠️ 늦게 잡거나 놓침 (기준도 같이 올라감) | 실제 열화 → **진짜 고장 징후** |

그래서 z-score만으로 정비를 결정하면 오경보에 시달리고 정작 서서히 진행되는 고장은 늦게 알게 됩니다. 이 한계 때문에 Step 3~4에서 **추세를 특징으로 만들어 학습하는 모델**로 넘어갑니다. 이상 탐지 결과는 에이전트가 근거를 설명할 때 보조 자료로 씁니다.

### 실습 2-2. `detect_anomalies` 구현하기

`detect_anomalies(df, window=14, z=3.0, cols=("temperature", "vibration"))`를 완성하세요.

- `cols`의 각 센서에 대해 설비별로 **직전 `window`일(당일 제외)**의 평균과 표준편차를 구합니다.
  - `groupby("machine_id")[col].transform(lambda s: s.shift(1).rolling(window, min_periods=window).mean())`
  - 표준편차도 같은 방식으로 구합니다.
- `zscore = (값 - 평균) / 표준편차`를 계산하고, `|zscore| >= z`인 행을 이상으로 표시합니다.
- 반환값: 컬럼이 `date, machine_id, sensor, value, zscore`인 DataFrame입니다.
  - `sensor`는 센서 이름, `value`는 그날 값입니다.
  - `zscore`는 소수 둘째 자리로 반올림합니다.
  - `date`, `machine_id`, `sensor` 순으로 정렬하고 인덱스를 다시 매깁니다.

```hint id=p2-e2
센서마다 hit = df[score.abs() >= z][["date", "machine_id"]].copy()를 만들고 hit["sensor"] = col, hit["value"] = df.loc[hit.index, col], hit["zscore"] = score[hit.index].round(2)를 채운 뒤 리스트에 모으세요. 마지막에 pd.concat(리스트).sort_values(["date", "machine_id", "sensor"]).reset_index(drop=True)로 합칩니다.
```

```python starter id=p2-e2
import pandas as pd

def detect_anomalies(df, window=14, z=3.0, cols=("temperature", "vibration")):
    # TODO: 센서별·설비별로 직전 window일(당일 제외) 평균/표준편차 → z-score → |z| >= z 인 행 모으기
    pass

# 직접 실행해 보기:
# an = detect_anomalies(load_sensors())
# print(len(an)); print(an.head())
```

```python test id=p2-e2
import pandas as pd
df = load_sensors()
an = detect_anomalies(df)
assert an is not None, "detect_anomalies()가 DataFrame을 반환해야 합니다"
assert list(an.columns) == ["date", "machine_id", "sensor", "value", "zscore"], f"컬럼 순서가 다릅니다: {list(an.columns)}"

# 참조 구현과 비교
ref = []
for col in ("temperature", "vibration"):
    g = df.groupby("machine_id")[col]
    mu = g.transform(lambda s: s.shift(1).rolling(14, min_periods=14).mean())
    sd = g.transform(lambda s: s.shift(1).rolling(14, min_periods=14).std())
    sc = (df[col] - mu) / sd
    for i in df.index[sc.abs() >= 3.0]:
        ref.append((df.at[i, "date"], df.at[i, "machine_id"], col))
got = list(zip(an["date"], an["machine_id"], an["sensor"]))
assert len(got) == len(ref), f"이상 개수가 다릅니다: 기대 {len(ref)}개, 현재 {len(got)}개 (당일 제외 shift(1), min_periods=window를 확인하세요)"
assert set(got) == set(ref), "탐지된 (날짜, 설비, 센서) 조합이 기대와 다릅니다"
assert (an["zscore"].abs() >= 3.0).all(), "zscore 절댓값이 3 이상인 행만 남겨야 합니다"
assert an["date"].is_monotonic_increasing, "date 순으로 정렬하세요"
assert an["date"].min() >= df["date"].min() + pd.Timedelta(days=14), "처음 window일은 기준이 부족하므로 판정하지 않아야 합니다"
row = an.iloc[0]
orig = df[(df.date == row["date"]) & (df.machine_id == row["machine_id"])][row["sensor"]].iloc[0]
assert row["value"] == orig, "value에는 그날의 센서 값을 넣으세요"

small = detect_anomalies(df, window=7, z=4.0, cols=("vibration",))
assert set(small["sensor"]) <= {"vibration"} and len(small) < len(an), "window, z, cols 인자를 실제로 사용하세요"
print(f"이상 {len(an)}건 탐지")
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e2
import pandas as pd

def detect_anomalies(df, window=14, z=3.0, cols=("temperature", "vibration")):
    found = []
    for col in cols:
        g = df.groupby("machine_id")[col]
        mean = g.transform(lambda s: s.shift(1).rolling(window, min_periods=window).mean())
        std = g.transform(lambda s: s.shift(1).rolling(window, min_periods=window).std())
        score = (df[col] - mean) / std
        hit = df[score.abs() >= z][["date", "machine_id"]].copy()
        hit["sensor"] = col
        hit["value"] = df.loc[hit.index, col]
        hit["zscore"] = score[hit.index].round(2)
        found.append(hit)
    return pd.concat(found).sort_values(["date", "machine_id", "sensor"]).reset_index(drop=True)
```

### 2-3. 이상 탐지 결과가 고장을 얼마나 예고했을까?

아래 예제는 탐지된 이상 가운데 **고장 12일 전 이내**에 나온 것(진짜 징후)과 나머지(오경보)의 비율을 셉니다. 아직 고장 나지 않은 M07과 M14의 최근 이상도 확인합니다.

```python run id=p2-d2
df = load_sensors()
an = detect_anomalies(df)
fails = df[df.failure == 1][["machine_id", "date"]].rename(columns={"date": "fail_date"})
m = an.merge(fails, on="machine_id", how="left")
m["days_before"] = (m["fail_date"] - m["date"]).dt.days
true_signal = m[(m["days_before"] >= 0) & (m["days_before"] <= 12)][["date", "machine_id", "sensor"]].drop_duplicates()
print(f"전체 이상 {len(an)}건 중 고장 12일 전 이내: {len(true_signal)}건 ({len(true_signal)/len(an):.0%})")
print("→ 나머지는 센서 튐이나 정상 변동에서 나온 '오경보'입니다.\n")
print("최근 30일 M07·M14 이상:")
recent = an[(an.date > df.date.max() - pd.Timedelta(days=30)) & an.machine_id.isin(["M07", "M14"])]
print(recent.to_string(index=False))
```

> **정리**: z-score는 설명하기 쉽고 라벨이 필요 없다는 장점이 있지만, 오경보가 많고 서서히 진행되는 열화에는 둔합니다. 실무에서는 이상 탐지를 **알람의 1차 필터**로 쓰고, 정비 의사결정은 고장 이력으로 학습한 **예측 모델**과 함께 내립니다.

## Step 3. 특징 공학: 추세를 숫자로 만들기

머신러닝 모델은 "어제보다 진동이 꾸준히 오르고 있다" 같은 **맥락을 스스로 보지 못합니다**. 한 행(하루)의 값만 보면 오늘 진동 3.5가 높은지 낮은지 알 수 없습니다. 그래서 **추세를 숫자 특징으로 만들어** 각 행에 붙여 줍니다.

### 3-1. 만들 특징 (센서 4개 × 4종 = 16개)

| 특징 | 계산 | 잡아내는 것 |
|---|---|---|
| `{센서}_mean7` | 최근 7일 이동 평균 | 노이즈를 걸러낸 현재 수준 |
| `{센서}_std7` | 최근 7일 이동 표준편차 | 불안정성 (흔들림) |
| `{센서}_slope7` | (오늘 값 − 6일 전 값) / 6 | **상승·하락 추세** |
| `{센서}_dev` | `mean7` − 설비 기준값 | 그 설비의 평소보다 얼마나 벗어났나 |

설비 기준값은 **설비별 초기 30일의 중앙값**으로 정합니다. 초기 구간은 "정상 운전 기준 기간"이라고 가정합니다(실무에서는 정비 직후 구간을 기준으로 잡기도 합니다).

### 3-2. ⚠️ 데이터 누수(Data Leakage) 주의

예측 모델이 쓰는 특징에는 **예측 시점에 알 수 있는 정보만** 들어가야 합니다.

- ❌ 중앙 정렬 이동 평균(`rolling(7, center=True)`)은 미래 3일을 씁니다.
- ❌ 전체 기간 평균이나 표준화도 미래 정보를 씁니다.
- ❌ `failure`, `failure_within_7d`를 특징으로 쓰면 정답을 미리 보는 셈입니다.
- ✅ `rolling(7)`(과거 7일), `diff(6)`(과거와 비교), 고정된 기준 기간 값은 안전합니다.

누수가 있으면 검증 점수는 아주 높게 나오는데 **실제 현장에서는 전혀 맞지 않는** 모델이 됩니다. 이 실습의 채점에는 **미래 데이터를 지워도 오늘 특징값이 그대로인지** 확인하는 누수 검사가 들어 있습니다.

### 실습 2-3. `make_features` 구현하기

`make_features(df, window=7)`을 완성하세요.

- 결과 DataFrame은 `date, machine_id, line, runtime_hours, failure_within_7d` 컬럼으로 시작하고, 위 표의 특징 16개를 추가합니다. 컬럼 이름은 `FEATURES` 상수와 같아야 합니다.
- 모든 계산은 `groupby("machine_id")` 안에서 합니다.
  - `mean7`: `rolling(window, min_periods=1).mean()`
  - `std7`: `rolling(window, min_periods=2).std()`, 결측은 0
  - `slope7`: `diff(window - 1) / (window - 1)`, 결측은 0
  - `dev`: `mean7 − (설비별 처음 30행의 중앙값)`
- 특징 컬럼에 NaN이 없어야 합니다.

```hint id=p2-e3
g = df.groupby("machine_id")로 묶고, 센서마다 feat[f"{col}_mean7"] = g[col].transform(lambda s: s.rolling(window, min_periods=1).mean()) 같은 식으로 만드세요. 기준값은 base = g[col].transform(lambda s: s.iloc[:30].median())이고, std7과 slope7의 앞부분 NaN은 .fillna(0)으로 채웁니다.
```

```python starter id=p2-e3
import pandas as pd

SENSORS = ["temperature", "vibration", "pressure", "current"]
FEATURES = [f"{c}_{k}" for c in SENSORS for k in ("mean7", "std7", "slope7", "dev")]

def make_features(df, window=7):
    feat = df[["date", "machine_id", "line", "runtime_hours", "failure_within_7d"]].copy()
    g = df.groupby("machine_id")
    for col in SENSORS:
        # TODO: mean7, std7, slope7, dev 4개 특징을 만드세요
        pass
    return feat
```

```python test id=p2-e3
import numpy as np
import pandas as pd
df = load_sensors()
feat = make_features(df)
assert len(feat) == 3600, "행 수가 원본과 같아야 합니다"
for c in FEATURES:
    assert c in feat.columns, f"특징 '{c}'가 없습니다"
assert not feat[FEATURES].isna().any().any(), "특징 컬럼에 NaN이 없어야 합니다 (std7, slope7은 fillna(0))"

m = df[df.machine_id == "M03"].reset_index(drop=True)
f = feat[feat.machine_id == "M03"].reset_index(drop=True)
assert abs(f.loc[10, "vibration_mean7"] - m.loc[4:10, "vibration"].mean()) < 1e-9, "mean7은 설비별 최근 7일 평균이어야 합니다"
assert abs(f.loc[10, "temperature_std7"] - m.loc[4:10, "temperature"].std()) < 1e-9, "std7은 설비별 최근 7일 표준편차여야 합니다"
assert abs(f.loc[10, "current_slope7"] - (m.loc[10, "current"] - m.loc[4, "current"]) / 6) < 1e-9, "slope7 = (오늘 - 6일 전) / 6 이어야 합니다"
base = m.loc[:29, "pressure"].median()
assert abs(f.loc[50, "pressure_dev"] - (f.loc[50, "pressure_mean7"] - base)) < 1e-9, "dev = mean7 - 설비별 처음 30행 중앙값이어야 합니다"
f0 = feat[feat.machine_id == "M02"].iloc[0]
assert f0["vibration_mean7"] == df[df.machine_id == "M02"].iloc[0]["vibration"], "groupby('machine_id') 안에서 계산해 설비 간 값이 섞이지 않게 하세요"

# 누수 검사: 미래 데이터를 지워도 오늘 특징값이 같아야 합니다
cut = pd.Timestamp("2025-07-15")
feat_cut = make_features(df[df.date <= cut].reset_index(drop=True))
a = feat[feat.date == cut].set_index("machine_id")[FEATURES]
b = feat_cut[feat_cut.date == cut].set_index("machine_id")[FEATURES]
assert np.allclose(a.values, b.values), "미래 데이터에 따라 과거 특징값이 바뀝니다. 데이터 누수가 있습니다 (center=True나 전체 기간 통계를 쓰지 마세요)"
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e3
import pandas as pd

SENSORS = ["temperature", "vibration", "pressure", "current"]
FEATURES = [f"{c}_{k}" for c in SENSORS for k in ("mean7", "std7", "slope7", "dev")]

def make_features(df, window=7):
    feat = df[["date", "machine_id", "line", "runtime_hours", "failure_within_7d"]].copy()
    g = df.groupby("machine_id")
    for col in SENSORS:
        base = g[col].transform(lambda s: s.iloc[:30].median())
        feat[f"{col}_mean7"] = g[col].transform(lambda s: s.rolling(window, min_periods=1).mean())
        feat[f"{col}_std7"] = g[col].transform(lambda s: s.rolling(window, min_periods=2).std()).fillna(0)
        feat[f"{col}_slope7"] = g[col].transform(lambda s: s.diff(window - 1) / (window - 1)).fillna(0)
        feat[f"{col}_dev"] = feat[f"{col}_mean7"] - base
    return feat
```

```quiz id=p2-q2
{"q": "다음 중 '7일 안에 고장' 예측 모델의 특징으로 쓰면 데이터 누수가 되는 것은?", "options": ["최근 7일 진동 이동 평균", "오늘 진동 − 6일 전 진동", "앞뒤 3일을 포함한 중앙 정렬 이동 평균(center=True)", "설비별 초기 30일 기준값과의 차이"], "answer": 2, "explain": "중앙 정렬 이동 평균은 미래 3일의 값을 씁니다. 예측 시점에는 알 수 없는 정보이므로 누수입니다."}
```

## Step 4. 고장 예측 모델과 위험도 순위

이제 "오늘 특징 → 7일 안에 고장(1) 여부"를 맞히는 **분류 모델**을 학습합니다.

### 4-1. 시간 기준 분할 (Time-based split)

일반적인 `train_test_split`(무작위 분할)을 쓰면 **같은 고장 직전의 하루는 학습에, 바로 다음 날은 시험에** 들어갑니다. 모델은 사실상 답을 본 셈이 되고 점수가 부풀려집니다. 시계열은 반드시 **과거로 학습하고 미래로 평가**합니다.

~~~text
2025-04-01 ─────────── 학습(train) ─────────── 2025-08-01 ──── 평가(test) ──── 2025-09-20 │ 라벨 없음(최근 7일)
~~~

라벨이 비어 있는 마지막 7일은 학습과 평가에서 빼고, **실제 예측(위험도 순위)**에만 씁니다.

### 4-2. 불균형 데이터에서 정확도(accuracy)의 함정

전체 행 가운데 "7일 안에 고장" 행은 **약 2%**뿐입니다. 모든 날을 "정상"으로 찍어도 정확도는 98%입니다. 그래서 다음 지표를 봅니다.

| 지표 | 의미 | 정비 관점 |
|---|---|---|
| **재현율 (Recall)** | 실제 고장 전 구간 중 모델이 잡은 비율 | 낮으면 **고장을 놓침** → 돌발 정지 |
| **정밀도 (Precision)** | 모델이 위험하다고 한 것 중 실제 고장 전이었던 비율 | 낮으면 **헛출동** → 정비 인력 낭비 |
| **F1** | 정밀도와 재현율의 조화 평균 | 둘의 균형 |

`class_weight="balanced"`는 드문 클래스(고장)에 더 큰 가중치를 줘서 모델이 고장을 무시하지 않게 합니다. **판정 임계값**(기본 0.5)을 낮추면 재현율이 오르고 정밀도가 내려갑니다. 돌발 정지 비용과 헛출동 비용을 비교해 현장에 맞게 정합니다.

### 실습 2-4. `train_model`과 `risk_ranking` 구현하기

- `train_model(feat, split_date="2025-08-01")` → `(model, metrics)`
  1. `failure_within_7d`가 비어 있지 않은 행만 씁니다.
  2. `date < split_date`는 학습용, 나머지는 평가용으로 나눕니다.
  3. `RandomForestClassifier(n_estimators=80, max_depth=6, class_weight="balanced", random_state=42)`를 `FEATURES`로 학습합니다.
  4. 평가 데이터에서 확률 ≥ 0.5를 1로 보고 `metrics` dict를 만듭니다. 키는 `precision`, `recall`, `f1`, `accuracy`, `n_train`, `n_test`입니다.
- `risk_ranking(model, feat, date=None)`
  - `date`가 없으면 `feat`의 가장 마지막 날짜를 씁니다.
  - 그날 각 설비의 고장 확률을 `risk` 컬럼(소수 셋째 자리 반올림)에 담습니다.
  - 반환값은 `machine_id, line, risk` 컬럼의 DataFrame입니다. **위험도 내림차순**으로 정렬하고 인덱스를 다시 매깁니다.

```hint id=p2-e4
lab = feat.dropna(subset=["failure_within_7d"]); train = lab[lab["date"] < split_date]; test = lab[lab["date"] >= split_date]. y는 .astype(int)로 바꾸세요. 지표는 sklearn.metrics의 precision_score, recall_score, f1_score를 쓰고 accuracy는 (pred == y).mean()입니다. 순위는 model.predict_proba(day[FEATURES])[:, 1]이 1일 확률입니다.
```

```python starter id=p2-e4
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_score, recall_score, f1_score

def train_model(feat, split_date="2025-08-01"):
    # TODO: 라벨 있는 행만 → 시간 기준 분할 → RandomForest 학습 → 평가 지표 계산
    model, metrics = None, {}
    return model, metrics

def risk_ranking(model, feat, date=None):
    # TODO: 지정한 날짜(기본: 마지막 날)의 설비별 고장 확률을 내림차순으로
    pass
```

```python test id=p2-e4
import pandas as pd
feat = make_features(load_sensors())
model, metrics = train_model(feat)
assert model is not None, "학습된 모델을 반환하세요"
for k in ["precision", "recall", "f1", "accuracy", "n_train", "n_test"]:
    assert k in metrics, f"metrics에 '{k}'가 필요합니다"
assert metrics["n_train"] == 2440 and metrics["n_test"] == 1020, f"라벨 있는 행을 2025-08-01 기준으로 나눠야 합니다 (현재 train={metrics['n_train']}, test={metrics['n_test']})"
assert metrics["recall"] >= 0.8 and metrics["precision"] >= 0.8, f"재현율·정밀도가 너무 낮습니다: {metrics}"
assert getattr(model, "random_state", None) == 42, "재현성을 위해 random_state=42를 지정하세요"

rank = risk_ranking(model, feat)
assert rank is not None and list(rank.columns) == ["machine_id", "line", "risk"], "machine_id, line, risk 컬럼을 반환하세요"
assert len(rank) == 20, "마지막 날 설비 20대의 위험도가 있어야 합니다"
assert rank["risk"].is_monotonic_decreasing, "위험도 내림차순으로 정렬하세요"
assert rank["risk"].between(0, 1).all(), "risk는 0~1 확률이어야 합니다"
assert set(rank.head(2)["machine_id"]) == {"M07", "M14"}, f"마지막 날 최상위 위험 설비는 M07, M14여야 합니다 (현재 {rank.head(3).to_dict('records')})"
early = risk_ranking(model, feat, "2025-09-10")
assert early["risk"].max() < rank["risk"].max(), "date 인자를 사용해 그날의 위험도를 계산하세요"
print(f"precision={metrics['precision']:.2f} recall={metrics['recall']:.2f} f1={metrics['f1']:.2f}")
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e4
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import precision_score, recall_score, f1_score

def train_model(feat, split_date="2025-08-01"):
    lab = feat.dropna(subset=["failure_within_7d"])
    train = lab[lab["date"] < split_date]
    test = lab[lab["date"] >= split_date]
    model = RandomForestClassifier(n_estimators=80, max_depth=6, class_weight="balanced", random_state=42, n_jobs=1)
    model.fit(train[FEATURES], train["failure_within_7d"].astype(int))
    y = test["failure_within_7d"].astype(int)
    pred = (model.predict_proba(test[FEATURES])[:, 1] >= 0.5).astype(int)
    metrics = {
        "precision": precision_score(y, pred, zero_division=0),
        "recall": recall_score(y, pred, zero_division=0),
        "f1": f1_score(y, pred, zero_division=0),
        "accuracy": float((pred == y).mean()),
        "n_train": len(train),
        "n_test": len(test),
    }
    return model, metrics

def risk_ranking(model, feat, date=None):
    date = pd.Timestamp(date) if date is not None else feat["date"].max()
    day = feat[feat["date"] == date]
    rank = day[["machine_id", "line"]].copy()
    rank["risk"] = model.predict_proba(day[FEATURES])[:, 1].round(3)
    return rank.sort_values("risk", ascending=False).reset_index(drop=True)
```

### 4-3. 모델 들여다보기: 중요 특징과 임계값

모델이 무엇을 보고 판단하는지, 임계값을 바꾸면 지표가 어떻게 변하는지 확인해 봅니다. 현장 설명용 자료로도 쓸 수 있습니다.

```python run id=p2-d4
import pandas as pd
import matplotlib.pyplot as plt
from sklearn.metrics import precision_score, recall_score
from agentlab import show_plot

feat = make_features(load_sensors())
model, metrics = train_model(feat)
print({k: round(v, 3) if isinstance(v, float) else v for k, v in metrics.items()})

imp = pd.Series(model.feature_importances_, index=FEATURES).sort_values().tail(8)
imp.plot.barh(figsize=(7, 3.5), title="중요 특징 Top 8")
show_plot()

lab = feat.dropna(subset=["failure_within_7d"])
test = lab[lab.date >= "2025-08-01"]
proba = model.predict_proba(test[FEATURES])[:, 1]
y = test["failure_within_7d"].astype(int)
print("\n임계값  정밀도  재현율")
for th in [0.2, 0.35, 0.5, 0.7, 0.9]:
    p = (proba >= th).astype(int)
    print(f"  {th:.2f}   {precision_score(y, p, zero_division=0):.2f}    {recall_score(y, p, zero_division=0):.2f}")

print("\n현재(마지막 날) 위험도 Top 5:")
print(risk_ranking(model, feat).head(5).to_string(index=False))
```

> 진동의 기울기와 기준 대비 편차가 상위에 오르면 정상입니다. "고장 전 진동이 서서히 오른다"는 물리적 직관과 맞기 때문입니다. 반대로 `runtime_hours`처럼 고장과 인과가 약한 특징이 압도적이면 데이터나 특징에 문제가 있는지 의심해야 합니다.

## Step 5. 정비 에이전트: 모델을 도구로 쓰기

이제 정비 담당자가 **자연어로 질문**하면 에이전트가 모델과 데이터를 조회해 답하게 만듭니다. 예를 들면 다음과 같은 질문입니다.

- "지금 제일 위험한 설비 3대와 근거를 알려줘"
- "M14 최근 1주일 센서 추이는 어때?"
- "최근 한 달 이상 알람이 많았던 설비는?"

### 5-1. 도구 설계 원칙 (모듈 03 복습)

| 원칙 | 이 프로젝트에서의 적용 |
|---|---|
| **LLM이 계산하게 하지 말 것** | 확률 계산, 순위, 이상 탐지는 모두 **파이썬 함수**가 합니다. LLM은 결과를 해석하고 설명합니다 |
| **결과는 작고 구조적으로** | 3,600행 전체가 아니라 필요한 몇 행만 JSON으로 돌려줍니다 (컨텍스트 절약) |
| **입력을 관대하게 받기** | `"M7"`, `"m07 설비"`처럼 와도 `M07`로 정규화합니다 |
| **오류는 문자열로 돌려주기** | 예외로 루프를 죽이지 말고 `"Error: ..."`를 돌려줘 모델이 스스로 고치게 합니다 |
| **비싼 계산은 캐시** | 모델 학습은 한 번만 하고 `_PIPE` 딕셔너리에 저장해 재사용합니다 |

### 실습 2-5. 도구 실행기 `execute_tool` 구현하기

도구 정의(`TOOLS`), 캐시를 쓰는 `get_pipeline()`, 설비 번호 정규화 함수 `normalize_machine()`은 미리 작성되어 있습니다. 도구 세 개를 실행하는 `execute_tool(name, args)`를 완성하세요. 반환값은 항상 **문자열**입니다.

- `get_risk_ranking`: 마지막 날 위험도 순위 상위 `top_n`(기본 5)개를 레코드 리스트 JSON으로 반환합니다.
- `get_machine_history`: 해당 설비의 최근 `days`(기본 7)일 행을 반환합니다.
  - 컬럼은 `date, temperature, vibration, pressure, current`입니다.
  - 날짜는 `"YYYY-MM-DD"` 문자열로 바꿔 JSON으로 반환합니다.
- `get_anomalies`: 데이터 마지막 날 기준 최근 `days`(기본 30)일 안의 이상 탐지 결과를 반환합니다.
  - `machine_id`를 주면 그 설비만 남깁니다.
  - 날짜는 문자열로 바꾸고 JSON으로 반환합니다.
- 다음 경우에는 `"Error: ..."` 문자열을 반환합니다.
  - 모르는 도구 이름
  - 존재하지 않는 설비
  - 실행 중 발생한 예외

JSON은 `json.dumps(..., ensure_ascii=False, default=str)`로 만듭니다.

```hint id=p2-e5
pipe = get_pipeline()로 df, feat, model, anomalies를 꺼내 쓰세요. 순위는 risk_ranking(pipe["model"], pipe["feat"]).head(top_n).to_dict("records")입니다. 날짜 문자열은 h["date"] = h["date"].dt.strftime("%Y-%m-%d")로 바꿉니다. 함수 전체를 try/except Exception as e로 감싸 f"Error: {e}"를 반환하세요.
```

```python starter id=p2-e5
import json
import re

_PIPE = {}

def get_pipeline():
    """데이터 로드 → 특징 → 모델 학습 → 이상 탐지를 한 번만 하고 캐시합니다."""
    if not _PIPE:
        df = load_sensors()
        feat = make_features(df)
        model, metrics = train_model(feat)
        _PIPE.update(df=df, feat=feat, model=model, metrics=metrics, anomalies=detect_anomalies(df))
    return _PIPE

def normalize_machine(text):
    """'M7', 'm07 설비' 같은 입력을 'M07'로 바꿉니다. 찾지 못하면 None."""
    m = re.search(r"[Mm]\s*0?(\d{1,2})", str(text))
    return f"M{int(m.group(1)):02d}" if m else None

TOOLS = [
    {"name": "get_risk_ranking",
     "description": "예측 모델로 계산한 설비별 7일 내 고장 위험도 순위를 조회합니다. 가장 위험한 설비를 찾을 때 사용합니다.",
     "input_schema": {"type": "object", "properties": {
         "top_n": {"type": "integer", "description": "상위 몇 대를 볼지 (기본 5)"}}}},
    {"name": "get_machine_history",
     "description": "특정 설비의 최근 센서 측정값(온도, 진동, 압력, 전류) 추이를 조회합니다.",
     "input_schema": {"type": "object", "properties": {
         "machine_id": {"type": "string", "description": "설비 번호 (예: M07)"},
         "days": {"type": "integer", "description": "최근 며칠 (기본 7)"}}, "required": ["machine_id"]}},
    {"name": "get_anomalies",
     "description": "z-score로 탐지한 센서 이상 알람 기록을 조회합니다. machine_id를 생략하면 전체 설비입니다.",
     "input_schema": {"type": "object", "properties": {
         "machine_id": {"type": "string", "description": "설비 번호 (선택)"},
         "days": {"type": "integer", "description": "최근 며칠 (기본 30)"}}}},
]

def execute_tool(name, args):
    # TODO: 세 도구를 실행해 JSON 문자열을 반환하고, 오류는 "Error: ..." 문자열로 반환하세요
    pass
```

```python test id=p2-e5
import json
r = execute_tool("get_risk_ranking", {"top_n": 3})
assert isinstance(r, str), "execute_tool은 문자열을 반환해야 합니다"
data = json.loads(r)
assert len(data) == 3 and {d["machine_id"] for d in data[:2]} == {"M07", "M14"}, f"위험도 상위 3개를 반환하세요: {data}"
assert "risk" in data[0], "각 레코드에 risk가 있어야 합니다"
assert len(json.loads(execute_tool("get_risk_ranking", {}))) == 5, "top_n 기본값은 5입니다"

h = json.loads(execute_tool("get_machine_history", {"machine_id": "m7 설비", "days": 5}))
assert len(h) == 5, "최근 days일 행을 반환하세요"
assert h[-1]["date"] == "2025-09-27" and set(h[0]) == {"date", "temperature", "vibration", "pressure", "current"}, f"컬럼/날짜 형식을 확인하세요: {h[-1]}"
assert len(json.loads(execute_tool("get_machine_history", {"machine_id": "M14"}))) == 7, "days 기본값은 7입니다"

a = json.loads(execute_tool("get_anomalies", {"machine_id": "M14", "days": 30}))
assert all(x["machine_id"] == "M14" for x in a) and all(x["date"] >= "2025-08-28" for x in a), "machine_id와 최근 days일로 필터링하세요"
allx = json.loads(execute_tool("get_anomalies", {}))
assert len(allx) >= len(a), "machine_id가 없으면 전체 설비를 반환하세요"

assert execute_tool("get_machine_history", {"machine_id": "M99"}).startswith("Error"), "존재하지 않는 설비는 'Error: ...'를 반환하세요"
assert execute_tool("delete_all", {}).startswith("Error"), "모르는 도구는 'Error: ...'를 반환하세요"
assert execute_tool("get_risk_ranking", {"top_n": "많이"}).startswith("Error"), "실행 중 예외는 'Error: ...' 문자열로 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e5
import json
import re

_PIPE = {}

def get_pipeline():
    """데이터 로드 → 특징 → 모델 학습 → 이상 탐지를 한 번만 하고 캐시합니다."""
    if not _PIPE:
        df = load_sensors()
        feat = make_features(df)
        model, metrics = train_model(feat)
        _PIPE.update(df=df, feat=feat, model=model, metrics=metrics, anomalies=detect_anomalies(df))
    return _PIPE

def normalize_machine(text):
    """'M7', 'm07 설비' 같은 입력을 'M07'로 바꿉니다. 찾지 못하면 None."""
    m = re.search(r"[Mm]\s*0?(\d{1,2})", str(text))
    return f"M{int(m.group(1)):02d}" if m else None

TOOLS = [
    {"name": "get_risk_ranking",
     "description": "예측 모델로 계산한 설비별 7일 내 고장 위험도 순위를 조회합니다. 가장 위험한 설비를 찾을 때 사용합니다.",
     "input_schema": {"type": "object", "properties": {
         "top_n": {"type": "integer", "description": "상위 몇 대를 볼지 (기본 5)"}}}},
    {"name": "get_machine_history",
     "description": "특정 설비의 최근 센서 측정값(온도, 진동, 압력, 전류) 추이를 조회합니다.",
     "input_schema": {"type": "object", "properties": {
         "machine_id": {"type": "string", "description": "설비 번호 (예: M07)"},
         "days": {"type": "integer", "description": "최근 며칠 (기본 7)"}}, "required": ["machine_id"]}},
    {"name": "get_anomalies",
     "description": "z-score로 탐지한 센서 이상 알람 기록을 조회합니다. machine_id를 생략하면 전체 설비입니다.",
     "input_schema": {"type": "object", "properties": {
         "machine_id": {"type": "string", "description": "설비 번호 (선택)"},
         "days": {"type": "integer", "description": "최근 며칠 (기본 30)"}}}},
]

def _dumps(obj):
    return json.dumps(obj, ensure_ascii=False, default=str)

def execute_tool(name, args):
    try:
        pipe = get_pipeline()
        df = pipe["df"]
        if name == "get_risk_ranking":
            top_n = int(args.get("top_n", 5))
            return _dumps(risk_ranking(pipe["model"], pipe["feat"]).head(top_n).to_dict("records"))
        if name == "get_machine_history":
            mid = normalize_machine(args.get("machine_id", ""))
            if mid not in set(df["machine_id"]):
                return f"Error: 설비를 찾을 수 없습니다: {args.get('machine_id')}"
            days = int(args.get("days", 7))
            h = df[df["machine_id"] == mid].tail(days)[["date", "temperature", "vibration", "pressure", "current"]].copy()
            h["date"] = h["date"].dt.strftime("%Y-%m-%d")
            return _dumps(h.to_dict("records"))
        if name == "get_anomalies":
            days = int(args.get("days", 30))
            an = pipe["anomalies"]
            an = an[an["date"] > df["date"].max() - pd.Timedelta(days=days)].copy()
            if args.get("machine_id"):
                mid = normalize_machine(args["machine_id"])
                if mid not in set(df["machine_id"]):
                    return f"Error: 설비를 찾을 수 없습니다: {args['machine_id']}"
                an = an[an["machine_id"] == mid]
            an["date"] = an["date"].dt.strftime("%Y-%m-%d")
            return _dumps(an.to_dict("records"))
        return f"Error: 알 수 없는 도구입니다: {name}"
    except Exception as e:
        return f"Error: {e}"
```

### 5-2. 에이전트 루프

도구 실행기가 준비되었으니 모듈 04에서 만든 루프에 붙입니다. **system 프롬프트**에서 에이전트의 역할과 답변 형식을 정합니다. 확률을 지어내지 말고 도구 결과로만 답하게 하고, 결론·근거·권장 조치 순서로 쓰게 합니다.

### 실습 2-6. `maintenance_agent` 구현하기

`maintenance_agent(question, max_steps=6)`을 완성하세요.

- `messages`를 `[{"role": "user", "content": question}]`로 시작합니다.
- 최대 `max_steps`번 반복하며 `chat(messages, system=SYSTEM, tools=TOOLS)`를 호출합니다.
- assistant 응답(content 전체)을 기록에 추가합니다.
- `stop_reason`이 `"tool_use"`가 아니면 `text_of(resp)`를 반환합니다.
- 그렇지 않으면 모든 도구 호출을 `execute_tool`로 실행하고, tool_result들을 **하나의 user 메시지**로 추가합니다.
  - 결과가 `"Error"`로 시작하면 `is_error=True`로 표시합니다.
- 단계를 초과하면 `"최대 단계 초과"`를 반환합니다.

```hint id=p2-e6
모듈 04의 run_agent와 거의 같습니다. results = [tool_result(c["id"], out, is_error=out.startswith("Error")) for c in tool_calls(resp) for out in [execute_tool(c["name"], c["input"])]]처럼 만들 수 있습니다. 읽기 어렵다면 for 문으로 풀어 써도 됩니다.
```

```python starter id=p2-e6
from agentlab import chat, text_of, tool_calls, tool_result

SYSTEM = """너는 제철소 설비 정비팀을 돕는 예지보전 에이전트야.
- 위험도, 센서값, 이상 기록은 반드시 도구로 조회한 결과만 사용하고 숫자를 지어내지 마.
- 답변 형식: ① 결론(어느 설비가 왜 위험한지) ② 근거(위험도, 센서 추이) ③ 권장 조치(점검 항목, 시급성)
- 정비 작업지시 발행은 네가 하지 않는다. 사람의 승인이 필요하다고 안내해."""

async def maintenance_agent(question, max_steps=6):
    messages = [{"role": "user", "content": question}]
    # TODO: 에이전트 루프를 구현하세요
    pass
```

```python test id=p2-e6
import agentlab
agentlab.scripted([
    {"tool": "get_risk_ranking", "input": {"top_n": 2}, "id": "r1", "text": "위험도부터 보겠습니다."},
    [{"tool": "get_machine_history", "input": {"machine_id": "M07", "days": 3}, "id": "h1"},
     {"tool": "get_machine_history", "input": {"machine_id": "M99"}, "id": "h2"}],
    "① 결론: M07, M14 즉시 점검 필요",
])
ans = await maintenance_agent("지금 제일 위험한 설비는?")
assert ans == "① 결론: M07, M14 즉시 점검 필요", f"최종 텍스트를 반환하세요 (받은 값: {ans!r})"
assert len(agentlab.calls) == 3, f"chat은 3번 호출되어야 합니다 (현재 {len(agentlab.calls)})"
c0 = agentlab.calls[0]
assert c0.get("system") == SYSTEM and c0.get("tools") == TOOLS, "chat에 system=SYSTEM, tools=TOOLS를 전달하세요"
msgs = agentlab.calls[2]["messages"]
assert [m["role"] for m in msgs] == ["user", "assistant", "user", "assistant", "user"], "assistant 응답과 tool_result를 순서대로 쌓으세요"
first = msgs[2]["content"][0]
assert first["type"] == "tool_result" and first["tool_use_id"] == "r1" and "M07" in first["content"], "도구 실행 결과를 tool_result로 전달하세요"
par = msgs[4]["content"]
assert len(par) == 2, "병렬 도구 호출 결과 2개를 하나의 user 메시지에 담으세요"
bad = [b for b in par if b["tool_use_id"] == "h2"][0]
good = [b for b in par if b["tool_use_id"] == "h1"][0]
assert bad.get("is_error") is True and not good.get("is_error"), "'Error'로 시작하는 결과만 is_error=True로 표시하세요"

agentlab._reset()
agentlab.scripted([{"tool": "get_risk_ranking", "input": {}}] * 10)
ans = await maintenance_agent("무한 루프", max_steps=2)
assert ans == "최대 단계 초과" and len(agentlab.calls) == 2, "max_steps를 넘으면 '최대 단계 초과'를 반환하세요"
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e6
from agentlab import chat, text_of, tool_calls, tool_result

SYSTEM = """너는 제철소 설비 정비팀을 돕는 예지보전 에이전트야.
- 위험도, 센서값, 이상 기록은 반드시 도구로 조회한 결과만 사용하고 숫자를 지어내지 마.
- 답변 형식: ① 결론(어느 설비가 왜 위험한지) ② 근거(위험도, 센서 추이) ③ 권장 조치(점검 항목, 시급성)
- 정비 작업지시 발행은 네가 하지 않는다. 사람의 승인이 필요하다고 안내해."""

async def maintenance_agent(question, max_steps=6):
    messages = [{"role": "user", "content": question}]
    for _ in range(max_steps):
        resp = await chat(messages, system=SYSTEM, tools=TOOLS)
        messages.append({"role": "assistant", "content": resp["content"]})
        if resp["stop_reason"] != "tool_use":
            return text_of(resp)
        results = []
        for c in tool_calls(resp):
            out = execute_tool(c["name"], c["input"])
            results.append(tool_result(c["id"], out, is_error=out.startswith("Error")))
        messages.append({"role": "user", "content": results})
    return "최대 단계 초과"
```

### 5-3. 에이전트에게 질문해 보기

Mock LLM은 질문의 단어와 도구 설명을 비교해 도구 하나를 고르고, 결과를 그대로 요약합니다. ⚙️ 설정에서 **Claude**를 연결하면 진짜 에이전트 동작을 볼 수 있습니다. 순위를 조회한 뒤 상위 설비의 이력과 이상 기록을 이어서 조회하고, 결론·근거·권장 조치 형식으로 정리합니다.

```python run id=p2-d5
for q in ["고장 위험도 순위 상위 3대를 알려줘", "M14 설비 최근 센서 추이는 어때?"]:
    print("🙋", q)
    print("🤖", await maintenance_agent(q))
    print("-" * 60)
```

## Step 6. 작업지시 자동화와 사람 승인 (Human-in-the-loop)

마지막으로 **"위험 설비 → 정비 작업지시"** 흐름을 자동화합니다. 작업지시는 인력을 배치하고 라인을 세우는 **되돌리기 어려운 행동**입니다. 그래서 역할을 다음처럼 나눕니다.

| 단계 | 누가 | 이유 |
|---|---|---|
| ① 대상 선정 | **규칙(코드)**: 위험도 ≥ 임계값 | 기준이 명확하고 감사 가능해야 함 |
| ② 우선순위 | **규칙(코드)**: 위험도 ≥ 0.8이면 "긴급", 아니면 "계획" | 일관성 |
| ③ 작업 사유·점검 항목 작성 | **LLM** | 센서 근거를 읽기 좋은 문장으로 정리 |
| ④ 발행 승인 | **사람** | 책임과 현장 판단 (부품 재고, 생산 일정) |
| ⑤ 기록 | **코드** | 누가 무엇을 언제 결정했는지 감사 로그 |

> 💡 이것이 모듈 07의 **워크플로**와 모듈 10의 **사람 승인 게이트**를 합친 형태입니다. 결정 경로는 코드가 쥐고, LLM은 쓰기를 돕고, 사람은 최종 결정을 내립니다. 위험도가 낮은 설비에는 **LLM을 호출하지 않아** 비용도 아낍니다.

### 실습 2-7. 작업지시 제안과 승인 흐름 구현하기

두 함수를 완성하세요.

1. `propose_work_orders(ranking, threshold=0.5)`는 LLM 없이 결정적으로 동작합니다.
   - `ranking`(Step 4의 순위 DataFrame)에서 `risk >= threshold`인 행만, 순위 순서대로 작업지시 dict 리스트를 만듭니다.
   - 각 dict의 키는 `order_id`, `machine_id`, `line`, `risk`, `priority`, `status`입니다.
     - `order_id`: `"WO-001"`부터 시작합니다.
     - `priority`: risk ≥ 0.8이면 `"긴급"`, 아니면 `"계획"`입니다.
     - `status`: `"proposed"`입니다.
2. `async run_work_order_flow(ranking, approve, threshold=0.5)`
   - 제안된 각 작업지시마다 `chat()`을 **한 번** 호출해 작업 사유를 받습니다.
     - user 메시지에 설비 번호, 라인, 위험도, 우선순위를 담습니다.
     - 응답 텍스트는 `order["reason"]`에 넣습니다.
   - `approve(order)`(사람 승인 함수, True/False)를 호출합니다.
     - True면 `status = "issued"`, False면 `status = "rejected"`로 바꿉니다.
   - 감사 로그(`audit`)에 다음 두 문자열을 남깁니다.
     - `f"{order_id} {machine_id} 제안"`
     - `f"{order_id} {machine_id} {status}"`
   - 반환값은 `{"issued": [...], "rejected": [...], "audit": [...]}`입니다.

```hint id=p2-e7
propose_work_orders에서는 for i, row in enumerate(ranking[ranking["risk"] >= threshold].itertuples(), start=1)로 돌며 f"WO-{i:03d}"를 만드세요. risk는 float(row.risk)로 바꿔 두면 JSON 직렬화가 편합니다. run_work_order_flow에서는 resp = await chat([{"role": "user", "content": prompt}], system=WO_SYSTEM)로 사유를 받고, approve(order)의 결과에 따라 issued 또는 rejected 리스트에 넣습니다.
```

```python starter id=p2-e7
from agentlab import chat, text_of

WO_SYSTEM = "너는 설비 정비 작업지시서 작성 도우미야. 주어진 설비 정보로 작업 사유와 점검 항목을 3줄 이내로 써."

def propose_work_orders(ranking, threshold=0.5):
    # TODO: risk >= threshold 인 설비마다 작업지시 dict를 만드세요 (LLM 사용 금지)
    pass

async def run_work_order_flow(ranking, approve, threshold=0.5):
    issued, rejected, audit = [], [], []
    # TODO: 제안 → LLM 사유 작성 → approve(order)로 사람 승인 → 상태 변경 + 감사 로그
    return {"issued": issued, "rejected": rejected, "audit": audit}
```

```python test id=p2-e7
import pandas as pd
import agentlab
ranking = pd.DataFrame({
    "machine_id": ["M07", "M14", "M03", "M01"],
    "line": ["A", "B", "A", "A"],
    "risk": [0.95, 0.62, 0.41, 0.02],
})
orders = propose_work_orders(ranking)
assert orders is not None and [o["machine_id"] for o in orders] == ["M07", "M14"], "risk >= 0.5 인 설비만 순서대로 제안하세요"
assert orders[0]["order_id"] == "WO-001" and orders[1]["order_id"] == "WO-002", "order_id는 WO-001부터 매기세요"
assert orders[0]["priority"] == "긴급" and orders[1]["priority"] == "계획", "risk >= 0.8 이면 '긴급', 아니면 '계획'입니다"
assert orders[0]["status"] == "proposed" and orders[0]["line"] == "A" and abs(orders[0]["risk"] - 0.95) < 1e-9, "작업지시 dict의 키와 값을 확인하세요"
assert len(propose_work_orders(ranking, threshold=0.3)) == 3, "threshold 인자를 사용하세요"
assert len(agentlab.calls) == 0, "propose_work_orders는 LLM을 호출하지 않아야 합니다"

seen = []
def approve(order):
    seen.append(order["order_id"])
    assert order.get("reason"), "승인 요청 전에 LLM이 작성한 reason을 채워야 합니다"
    return order["machine_id"] == "M07"

agentlab.scripted(["진동 급상승, 베어링 점검 필요", "온도 상승 추세, 윤활 점검"])
res = await run_work_order_flow(ranking, approve)
assert [o["machine_id"] for o in res["issued"]] == ["M07"], "승인된 작업지시만 issued에 들어가야 합니다"
assert [o["machine_id"] for o in res["rejected"]] == ["M14"], "반려된 작업지시는 rejected에 들어가야 합니다"
assert res["issued"][0]["status"] == "issued" and res["rejected"][0]["status"] == "rejected", "status를 issued/rejected로 바꾸세요"
assert res["issued"][0]["reason"] == "진동 급상승, 베어링 점검 필요", "LLM 응답 텍스트를 reason에 넣으세요"
assert seen == ["WO-001", "WO-002"], "모든 제안 작업지시에 대해 approve()를 호출하세요"
assert len(agentlab.calls) == 2, f"위험 설비 2대에 대해서만 LLM을 호출해야 합니다 (현재 {len(agentlab.calls)}번)"
prompt = agentlab.calls[0]["messages"][-1]["content"]
assert "M07" in prompt and "0.95" in prompt and "긴급" in prompt, "LLM 요청에 설비 번호, 위험도, 우선순위를 담으세요"
assert agentlab.calls[0].get("system") == WO_SYSTEM, "system=WO_SYSTEM을 전달하세요"
assert res["audit"] == ["WO-001 M07 제안", "WO-001 M07 issued", "WO-002 M14 제안", "WO-002 M14 rejected"], f"감사 로그 형식을 확인하세요: {res['audit']}"
print("✅ 모든 테스트 통과!")
```

```python solution id=p2-e7
from agentlab import chat, text_of

WO_SYSTEM = "너는 설비 정비 작업지시서 작성 도우미야. 주어진 설비 정보로 작업 사유와 점검 항목을 3줄 이내로 써."

def propose_work_orders(ranking, threshold=0.5):
    orders = []
    for i, row in enumerate(ranking[ranking["risk"] >= threshold].itertuples(), start=1):
        orders.append({
            "order_id": f"WO-{i:03d}",
            "machine_id": row.machine_id,
            "line": row.line,
            "risk": float(row.risk),
            "priority": "긴급" if row.risk >= 0.8 else "계획",
            "status": "proposed",
        })
    return orders

async def run_work_order_flow(ranking, approve, threshold=0.5):
    issued, rejected, audit = [], [], []
    for order in propose_work_orders(ranking, threshold):
        audit.append(f"{order['order_id']} {order['machine_id']} 제안")
        prompt = (f"설비 {order['machine_id']} (라인 {order['line']}), 7일 내 고장 위험도 {order['risk']}, "
                  f"우선순위 {order['priority']}. 작업 사유와 점검 항목을 작성해 줘.")
        resp = await chat([{"role": "user", "content": prompt}], system=WO_SYSTEM)
        order["reason"] = text_of(resp)
        order["status"] = "issued" if approve(order) else "rejected"
        (issued if order["status"] == "issued" else rejected).append(order)
        audit.append(f"{order['order_id']} {order['machine_id']} {order['status']}")
    return {"issued": issued, "rejected": rejected, "audit": audit}
```

### 6-1. 전체 파이프라인 실행

실제 모델의 위험도 순위로 전체 흐름을 돌려 봅니다. 여기서는 승인 함수가 "긴급만 자동 승인"하는 규칙을 흉내 냅니다. 실제 시스템에서는 메신저 승인 버튼이나 MES 결재 화면이 이 자리에 들어갑니다.

```python run id=p2-d6
pipe = get_pipeline()
ranking = risk_ranking(pipe["model"], pipe["feat"])
print("오늘 기준 위험도 Top 5")
print(ranking.head(5).to_string(index=False), "\n")

def approve(order):
    ok = order["priority"] == "긴급"
    print(f"  🧑‍🔧 승인 요청 {order['order_id']} {order['machine_id']} (위험도 {order['risk']:.2f}, {order['priority']}) → {'승인' if ok else '보류'}")
    return ok

result = await run_work_order_flow(ranking, approve, threshold=0.3)
print("\n📋 발행된 작업지시")
for o in result["issued"]:
    print(f"- {o['order_id']} | {o['machine_id']} (라인 {o['line']}) | {o['priority']}\n  사유: {o['reason']}")
print("\n🗂 감사 로그:", *result["audit"], sep="\n  ")
```

```quiz id=p2-q3
{"q": "이 프로젝트의 작업지시 흐름에서 LLM에게 맡기기에 가장 적절한 일은?", "options": ["위험도 임계값을 넘는 설비를 고르는 일", "작업지시를 최종 발행(승인)하는 일", "센서 근거를 바탕으로 작업 사유와 점검 항목을 문장으로 정리하는 일", "고장 확률을 계산하는 일"], "answer": 2, "explain": "대상 선정과 확률 계산은 코드와 모델이, 최종 승인은 사람이 맡습니다. LLM은 근거를 읽기 좋은 문서로 정리하는 데 강점이 있습니다."}
```

## 🎉 완성! 다음은?

여기까지 오면 다음 흐름을 갖춘 **예지보전 시스템의 뼈대**가 완성됩니다.

~~~text
센서 로그 → 이상 탐지 → 특징 → 고장 예측 → 에이전트 질의응답 → 작업지시 제안 → 사람 승인 → 감사 로그
~~~

### 확장 과제

1. **임계값 비용 최적화**: 돌발 정지 1건 비용(예: 5,000만 원)과 헛출동 1건 비용(예: 50만 원)을 가정하고, 평가 데이터에서 총비용이 최소가 되는 임계값을 찾아보세요.
2. **설명 가능성**: `get_machine_history` 결과와 함께 "어떤 특징이 기준보다 얼마나 벗어났는지"(`*_dev`)를 돌려주는 `explain_risk(machine_id)` 도구를 추가해 보세요.
3. **라인 단위 판단**: 같은 라인의 설비 두 대를 동시에 세우면 생산이 멈춥니다. 같은 라인의 긴급 작업지시가 겹치면 하나는 "계획"으로 미루는 규칙을 추가해 보세요.
4. **다른 모델 비교**: `GradientBoostingClassifier`나 `LogisticRegression`으로 바꿔 정밀도와 재현율을 비교해 보세요.
5. **에이전트 평가(모듈 09)**: "가장 위험한 설비는?" 같은 질문 10개와 기대 답(M07, M14 포함 여부)으로 평가셋을 만들어 Claude 모델별 정확도를 측정해 보세요.

### 더 읽어보기

- [pandas: Windowing operations (rolling)](https://pandas.pydata.org/docs/user_guide/window.html)
- [pandas: Group by: split-apply-combine](https://pandas.pydata.org/docs/user_guide/groupby.html)
- [scikit-learn: RandomForestClassifier](https://scikit-learn.org/stable/modules/generated/sklearn.ensemble.RandomForestClassifier.html)
- [scikit-learn: Precision, recall and F-measures](https://scikit-learn.org/stable/modules/model_evaluation.html#precision-recall-f-measure-metrics)
- [scikit-learn: TimeSeriesSplit (시계열 교차 검증)](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.TimeSeriesSplit.html)
- [Building Effective Agents (Anthropic)](https://www.anthropic.com/engineering/building-effective-agents)
- [Writing effective tools for agents (Anthropic)](https://www.anthropic.com/engineering/writing-tools-for-agents)

"""실전 프로젝트용 합성 데이터셋을 만듭니다. (순수 Python, 시드 고정 → 항상 같은 결과)

    python tools/make_data.py

생성 파일 (assets/data/):
  sales.csv    : 2024-01 ~ 2025-12 주문 데이터. 일부러 중복·결측·공백 오류를 섞었습니다.
  sensors.csv  : 설비 20대 × 180일 센서 로그와 고장 라벨
  tickets.csv  : 고객 문의 40건과 정답 라벨(평가용)
  faq.json     : 고객 문의 처리용 FAQ·정책 지식베이스
  index.json   : 워커가 Pyodide 파일시스템(data/)에 미리 올릴 파일 목록
"""
import csv
import json
import math
import random
from datetime import date, timedelta
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets" / "data"
OUT.mkdir(parents=True, exist_ok=True)


# ---------------------------------------------------------------- sales.csv
def make_sales():
    rng = random.Random(42)
    regions = {"서울": 1.6, "부산": 1.0, "대구": 0.7, "광주": 0.55, "대전": 0.6}
    products = {
        "가전": [("에어컨", 890000), ("공기청정기", 320000), ("냉장고", 1250000), ("전자레인지", 150000)],
        "전자": [("노트북", 1390000), ("태블릿", 690000), ("이어폰", 189000), ("모니터", 290000)],
        "생활": [("텀블러", 25000), ("수건세트", 32000), ("디퓨저", 41000), ("수납박스", 18000)],
        "식품": [("커피원두", 22000), ("견과류", 19000), ("생수", 9000), ("올리브유", 27000)],
    }
    cat_weight = {"가전": 0.18, "전자": 0.22, "생활": 0.28, "식품": 0.32}
    rows = []
    start = date(2024, 1, 1)
    oid = 100000
    for d in range(731):
        day = start + timedelta(days=d)
        t = d / 365  # 연 단위 경과
        season = 1 + 0.12 * math.sin(2 * math.pi * (day.month - 3) / 12)
        n_orders = max(1, int(rng.gauss(7.5 * (1 + 0.12 * t) * season, 1.5)))
        for _ in range(n_orders):
            region = rng.choices(list(regions), weights=list(regions.values()))[0]
            category = rng.choices(list(cat_weight), weights=list(cat_weight.values()))[0]
            product, base_price = rng.choice(products[category])
            channel = "online" if rng.random() < 0.55 + 0.05 * t else "offline"
            units = rng.choice([1, 1, 1, 2, 2, 3]) if category in ("가전", "전자") else rng.randint(1, 8)
            # 숨겨 둔 패턴 ①: 여름(7~8월) 에어컨 수요 급증
            if product == "에어컨" and day.month in (7, 8):
                units += rng.randint(2, 5)
            # 숨겨 둔 패턴 ②: 11월 온라인 프로모션 (할인 + 수량 증가)
            price = base_price
            if day.month == 11 and channel == "online":
                price = int(base_price * 0.85)
                units += rng.randint(1, 3)
            # 숨겨 둔 패턴 ③: 2025년 부산 매출 성장
            if region == "부산" and day.year == 2025 and rng.random() < 0.35:
                units += rng.randint(1, 3)
            oid += 1
            rows.append([oid, day.isoformat(), region, category, product, channel, units, price, units * price])

    # 일부러 넣는 데이터 품질 문제
    dup = rng.sample(rows, 30)                      # 완전 중복 30건
    for r in rng.sample(rows, 15):                  # units 결측 15건 (revenue도 비움)
        r[6] = ""
        r[8] = ""
    for r in rng.sample(rows, 12):                  # 지역명 앞뒤 공백 12건
        r[2] = f" {r[2]} "
    rows.extend([list(r) for r in dup])
    rng.shuffle(rows)

    with open(OUT / "sales.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["order_id", "date", "region", "category", "product", "channel", "units", "unit_price", "revenue"])
        w.writerows(rows)
    return len(rows)


# -------------------------------------------------------------- sensors.csv
def make_sensors():
    rng = random.Random(7)
    start = date(2025, 4, 1)
    days = 180
    machines = [f"M{i:02d}" for i in range(1, 21)]
    lines = {m: "ABC"[(i) % 3] for i, m in enumerate(machines)}
    # 고장 일정 (기계, 고장일 index). 고장 전 약 12일 동안 서서히 나빠집니다.
    failures = {
        "M02": [40, 150], "M05": [95], "M07": [], "M09": [60], "M11": [120],
        "M13": [30, 135], "M14": [], "M16": [80], "M18": [110], "M20": [55],
    }
    # 현재(마지막 날) 열화가 진행 중인 기계: 아직 고장은 나지 않았지만 위험
    degrading_now = {"M07": 168, "M14": 171}   # 열화 시작 index
    ramp = 12
    rows = []
    for m in machines:
        base_t = rng.uniform(58, 66)
        base_v = rng.uniform(2.0, 3.0)
        base_p = rng.uniform(4.5, 5.5)
        base_c = rng.uniform(38, 46)
        runtime = rng.uniform(1000, 9000)
        fail_days = failures.get(m, [])
        for d in range(days):
            day = start + timedelta(days=d)
            # 고장까지 남은 일수 → 열화 정도(0~1)
            deg = 0.0
            for fd in fail_days:
                if fd - ramp <= d <= fd:
                    deg = max(deg, (d - (fd - ramp)) / ramp)
            if m in degrading_now and d >= degrading_now[m]:
                deg = min(1.0, (d - degrading_now[m]) / ramp * 0.9)
            temp = base_t + rng.gauss(0, 1.2) + 9 * deg ** 1.5
            vib = base_v + rng.gauss(0, 0.18) + 2.6 * deg ** 2
            pres = base_p + rng.gauss(0, 0.12) - 0.4 * deg
            cur = base_c + rng.gauss(0, 1.0) + 5 * deg
            # 센서 튐(노이즈 이상치): 고장과 무관한 하루짜리 스파이크
            if rng.random() < 0.006:
                vib += rng.uniform(2.0, 3.0)
            if rng.random() < 0.004:
                temp += rng.uniform(8, 12)
            runtime += rng.uniform(18, 23)
            failure = 1 if d in fail_days else 0
            if failure:
                runtime = rng.uniform(0, 50)   # 정비 후 가동시간 리셋
            # 라벨: 7일 이내(당일 포함) 고장 여부. 마지막 7일은 미래를 모르므로 비워 둡니다.
            if d >= days - 7:
                label = ""
            else:
                label = int(any(0 <= fd - d <= 7 for fd in fail_days))
            rows.append([day.isoformat(), m, lines[m], round(temp, 2), round(vib, 3), round(pres, 3),
                         round(cur, 2), round(runtime, 1), failure, label])
    with open(OUT / "sensors.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["date", "machine_id", "line", "temperature", "vibration", "pressure", "current",
                    "runtime_hours", "failure", "failure_within_7d"])
        w.writerows(rows)
    return len(rows)


# -------------------------------------------------------------- tickets.csv
TICKETS = [
    # (채널, 고객등급, 본문, category, priority)
    ("email", "vip", "지난달 요금이 두 번 결제되었습니다. 카드 명세서에 같은 금액이 2건 찍혀 있어요. 빨리 환불해 주세요.", "billing", "high"),
    ("chat", "normal", "이번 달 청구서에 모르는 부가서비스 요금 3,300원이 붙어 있는데 무슨 요금인가요?", "billing", "normal"),
    ("email", "normal", "세금계산서를 회사 이메일로 다시 발행받을 수 있을까요?", "billing", "low"),
    ("phone", "normal", "결제 수단을 신용카드에서 계좌이체로 바꾸고 싶습니다.", "billing", "low"),
    ("chat", "vip", "연간 플랜으로 바꾸면 남은 월 요금은 어떻게 정산되나요? 오늘 안에 결정해야 해요.", "billing", "normal"),
    ("email", "normal", "해지했는데도 이번 달 요금이 빠져나갔습니다. 환불 요청합니다.", "billing", "high"),
    ("chat", "normal", "쿠폰을 적용했는데 결제 금액에 할인이 반영되지 않았어요.", "billing", "normal"),
    ("email", "normal", "영수증 출력은 어디서 하나요?", "billing", "low"),
    ("chat", "vip", "앱이 실행하자마자 꺼집니다. 업데이트 후부터 계속 그래요. 업무에 지장이 큽니다.", "technical", "high"),
    ("email", "normal", "로그인할 때 '서버 오류 500'이 뜨면서 들어가지지 않습니다.", "technical", "high"),
    ("chat", "normal", "대시보드 그래프가 가끔 늦게 로딩됩니다. 10초 정도 걸려요.", "technical", "normal"),
    ("email", "normal", "엑셀 내보내기를 하면 한글이 깨져서 나옵니다.", "technical", "normal"),
    ("chat", "normal", "다크 모드는 언제 지원되나요?", "technical", "low"),
    ("phone", "vip", "전체 직원이 동시에 접속이 안 됩니다. 지금 서비스 장애인가요?", "technical", "high"),
    ("email", "normal", "API 호출 시 가끔 타임아웃이 발생합니다. 재시도 권장 방식이 있나요?", "technical", "normal"),
    ("chat", "normal", "알림 이메일이 스팸함으로 들어갑니다.", "technical", "low"),
    ("chat", "normal", "주문한 지 5일이 지났는데 아직 배송 준비 중으로 나옵니다.", "delivery", "normal"),
    ("email", "vip", "받은 상품이 파손되어 있습니다. 사진 첨부합니다. 교환 원합니다.", "delivery", "high"),
    ("chat", "normal", "배송지를 회사 주소로 바꾸고 싶은데 아직 가능할까요?", "delivery", "normal"),
    ("phone", "normal", "택배 송장번호를 조회해도 정보가 없다고 나옵니다.", "delivery", "normal"),
    ("email", "normal", "다른 사람의 상품이 잘못 배송되었습니다.", "delivery", "high"),
    ("chat", "normal", "제주도도 무료 배송인가요?", "delivery", "low"),
    ("email", "normal", "주문한 수량보다 1개 적게 왔어요.", "delivery", "normal"),
    ("chat", "normal", "비밀번호를 잊어버렸어요. 재설정 메일이 오지 않습니다.", "account", "normal"),
    ("email", "vip", "제 계정에서 모르는 기기로 로그인한 기록이 있습니다. 해킹이 의심됩니다.", "account", "high"),
    ("chat", "normal", "회원 탈퇴는 어떻게 하나요?", "account", "low"),
    ("email", "normal", "회사 담당자가 바뀌어서 계정 소유자를 변경하고 싶습니다.", "account", "normal"),
    ("chat", "normal", "이메일 주소를 변경하고 싶어요.", "account", "low"),
    ("phone", "normal", "2단계 인증 휴대폰을 분실해서 로그인을 못 하고 있어요.", "account", "high"),
    ("email", "normal", "팀원 초대 링크가 만료되었다고 나옵니다.", "account", "normal"),
    ("chat", "normal", "상담원 연결 가능한 시간이 언제인가요?", "other", "low"),
    ("email", "normal", "귀사와 제휴 제안을 드리고 싶습니다. 담당 부서를 알려주세요.", "other", "low"),
    ("chat", "normal", "서비스 정말 잘 쓰고 있어요. 감사합니다!", "other", "low"),
    ("email", "vip", "다음 분기 대규모 도입을 검토 중입니다. 견적 상담을 요청합니다.", "other", "normal"),
    ("chat", "normal", "채용 공고는 어디서 볼 수 있나요?", "other", "low"),
    ("email", "normal", "개인정보 처리방침 최신 버전을 받아볼 수 있을까요?", "other", "low"),
    ("chat", "vip", "결제가 실패했다고 나오는데 돈은 빠져나갔어요. 앱도 계속 멈춥니다.", "billing", "high"),
    ("email", "normal", "배송 조회 페이지가 열리지 않고 오류가 납니다.", "technical", "normal"),
    ("chat", "normal", "환불 받은 금액이 카드에 언제 반영되나요?", "billing", "normal"),
    ("phone", "normal", "주문 취소하고 싶은데 이미 출고되었다고 하네요.", "delivery", "normal"),
]


def make_tickets():
    with open(OUT / "tickets.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["ticket_id", "channel", "tier", "text", "label_category", "label_priority"])
        for i, (ch, tier, text, cat, pri) in enumerate(TICKETS, start=1):
            w.writerow([f"T{i:03d}", ch, tier, text, cat, pri])
    return len(TICKETS)


FAQ = [
    {"id": "F01", "category": "billing", "keywords": ["환불", "이중", "중복", "두 번"], "answer": "중복 결제가 확인되면 영업일 기준 3일 이내에 결제 수단으로 환불됩니다. 카드사 반영까지 최대 7일이 걸릴 수 있습니다."},
    {"id": "F02", "category": "billing", "keywords": ["세금계산서", "영수증", "청구서"], "answer": "세금계산서와 영수증은 [설정 > 결제 내역]에서 재발행·출력할 수 있습니다."},
    {"id": "F03", "category": "billing", "keywords": ["결제 수단", "카드", "계좌"], "answer": "결제 수단은 [설정 > 결제 수단]에서 언제든 변경할 수 있으며 다음 결제일부터 적용됩니다."},
    {"id": "F04", "category": "billing", "keywords": ["연간", "플랜", "정산"], "answer": "연간 플랜으로 전환하면 남은 월 요금은 일할 계산되어 첫 연간 결제에서 차감됩니다."},
    {"id": "F05", "category": "billing", "keywords": ["쿠폰", "할인"], "answer": "쿠폰은 결제 직전 단계에서 적용해야 하며, 이미 결제된 건은 상담원이 차액을 환불해 드립니다."},
    {"id": "F06", "category": "technical", "keywords": ["로그인", "오류", "500", "꺼", "멈"], "answer": "앱을 최신 버전으로 업데이트하고 캐시를 삭제한 뒤 다시 시도해 주세요. 문제가 계속되면 기술지원팀이 로그를 확인합니다."},
    {"id": "F07", "category": "technical", "keywords": ["엑셀", "한글", "깨"], "answer": "엑셀 내보내기 시 [CSV(UTF-8)] 형식을 선택하면 한글이 깨지지 않습니다."},
    {"id": "F08", "category": "technical", "keywords": ["API", "타임아웃", "재시도"], "answer": "API 타임아웃 시 지수 백오프(1초, 2초, 4초…)로 최대 5회 재시도를 권장합니다."},
    {"id": "F09", "category": "technical", "keywords": ["스팸", "알림", "이메일"], "answer": "noreply@example.com을 주소록에 추가하면 알림 메일이 스팸함으로 가지 않습니다."},
    {"id": "F10", "category": "delivery", "keywords": ["배송", "준비", "지연", "송장"], "answer": "주문 후 영업일 기준 2~3일 내 출고됩니다. 5일 이상 지연되면 물류팀이 직접 확인해 연락드립니다."},
    {"id": "F11", "category": "delivery", "keywords": ["파손", "교환", "잘못", "적게"], "answer": "파손·오배송·수량 누락은 사진과 함께 접수해 주시면 무상으로 교환·재발송해 드립니다."},
    {"id": "F12", "category": "delivery", "keywords": ["배송지", "주소"], "answer": "출고 전이라면 [주문 상세]에서 배송지를 변경할 수 있습니다."},
    {"id": "F13", "category": "delivery", "keywords": ["제주", "무료"], "answer": "제주 및 도서산간 지역은 추가 배송비 3,000원이 부과됩니다."},
    {"id": "F14", "category": "account", "keywords": ["비밀번호", "재설정"], "answer": "재설정 메일이 오지 않으면 스팸함을 확인하고, 그래도 없으면 고객센터에서 본인 확인 후 재설정해 드립니다."},
    {"id": "F15", "category": "account", "keywords": ["탈퇴", "해지"], "answer": "회원 탈퇴는 [설정 > 계정 > 탈퇴]에서 가능하며, 탈퇴 후 데이터는 30일 뒤 삭제됩니다."},
    {"id": "F16", "category": "account", "keywords": ["이메일 변경", "소유자", "담당자"], "answer": "계정 정보 변경은 [설정 > 계정]에서 가능하며, 소유자 변경은 기존 소유자의 승인이 필요합니다."},
    {"id": "F17", "category": "account", "keywords": ["해킹", "모르는 기기", "2단계", "분실"], "answer": "보안 문제는 즉시 보안팀이 처리합니다. 모든 세션을 로그아웃시키고 본인 확인 후 계정을 복구해 드립니다."},
    {"id": "F18", "category": "other", "keywords": ["상담", "시간"], "answer": "상담원 연결은 평일 09:00~18:00에 가능합니다."},
    {"id": "F19", "category": "other", "keywords": ["제휴", "견적", "도입"], "answer": "제휴·도입 문의는 영업팀(sales@example.com)이 1영업일 내 연락드립니다."},
]

POLICY = {
    "refund_auto_approve_limit": 50000,
    "escalation_categories": ["account"],
    "sla_hours": {"high": 4, "normal": 24, "low": 72},
}


def main():
    n_sales = make_sales()
    n_sensors = make_sensors()
    n_tickets = make_tickets()
    with open(OUT / "faq.json", "w", encoding="utf-8") as f:
        json.dump({"faq": FAQ, "policy": POLICY}, f, ensure_ascii=False, indent=1)
    files = ["sales.csv", "sensors.csv", "tickets.csv", "faq.json"]
    with open(OUT / "index.json", "w", encoding="utf-8") as f:
        json.dump(files, f)
    print(f"sales={n_sales} sensors={n_sensors} tickets={n_tickets} → {OUT}")


if __name__ == "__main__":
    main()

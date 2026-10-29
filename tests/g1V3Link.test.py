# -*- coding: utf-8 -*-
"""docs/g1_v3_link.py 시험 (수집기·시트 없이 가짜로) — python3 tests/g1V3Link.test.py"""
import json, os, sys, tempfile, time, types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
tmp = tempfile.mkdtemp()
out_dir = os.path.join(tmp, "수집")
os.makedirs(out_dir)

# ── 가짜 수집기 본체 ──
G = types.ModuleType("g1_cs_collector")
G.BASE = tmp
G.VER = "9.1 (test)"
G.DEFAULT_CFG = {"vendors": {"스마트스토어": True, "지그재그": True, "에이블리": True, "메이크샵": True}}
G.E1_DIR = os.path.join(tmp, "no_e1")
G.enc_secret = lambda s: "enc:" + s
G.dec_secret = lambda s: s[4:]
calls = []


def write_result(name, data):
    fn = os.path.join(out_dir, name)
    json.dump(data, open(fn, "w", encoding="utf-8"), ensure_ascii=False)
    old = time.time() - 60
    os.utime(fn, (old, old))
    return fn


def run_collect(cfg, say):
    calls.append(("collect", cfg))
    name = "수집_{}261029_1300.json".format("테스트_" if cfg.get("test") else "")
    return write_result(name, {"수집시각": "2026-10-29 13:00", "기간(일)": 7, "모드": "테스트(가상)" if cfg.get("test") else "실제",
                               "업체결과": {"지그재그": {"상태": "ok", "건수": 1}, "에이블리": {"상태": "로그인 필요", "건수": 0}},
                               "rows": [{"업체": "지그재그", "게시판": "주문문의", "id": "z9", "문의": "질문"}]})


def run_reviews(cfg, say):
    calls.append(("reviews", cfg))
    return write_result("리뷰_261029_1310.json", {"수집시각": "2026-10-29 13:10", "기간(일)": 14, "종류": "리뷰", "모드": "실제",
                                                 "리뷰결과": {"지그재그": {"상태": "ok", "건수": 1}}, "rows": [],
                                                 "리뷰": [{"업체": "지그재그", "게시판": "리뷰", "id": "r1", "내용": "좋아요"}]})


G.run_collect = run_collect
G.run_reviews = run_reviews


class FakeApi:
    pass


G.SSApi = lambda cid, secret: FakeApi()
sys.modules["g1_cs_collector"] = G

# ── 가짜 등록 모듈 (수집기 g1_register 와 같은 모양) ──
RG = types.ModuleType("g1_register")
store = {}
RG.result_path = lambda approved: os.path.splitext(approved)[0] + "_등록결과.json"
RG.load_results = lambda approved: dict(store.get(approved, {}))


def preview(items, done, api=None):
    rows = []
    for it in items:
        key = f"{it['업체']}_{it['게시판']}_{it['id']}"
        it = dict(it, key=key)
        it["판정"] = "이미 등록함" if done.get(key, {}).get("상태") == "등록완료" else ("등록 대상" if it["id"] != "answered" else "이미 답변 있음 → 건너뜀")
        rows.append(it)
    return rows


def register(approved, rows, api, say):
    res = store.setdefault(approved, {})
    ok = bad = 0
    for r in rows:
        if r["판정"] != "등록 대상":
            continue
        if r["id"] == "fail":
            res[r["key"]] = {"상태": "확인 필요", "응답": "HTTP 500 boom"}; bad += 1
        else:
            res[r["key"]] = {"상태": "등록완료", "시각": "2026-10-29 14:00", "문안": r["문안"]}; ok += 1
    return ok, bad


RG.preview, RG.register = preview, register
sys.modules["g1_register"] = RG

sys.path.insert(0, os.path.join(ROOT, "docs"))
import g1_v3_link as L  # noqa: E402


class FakeLink:
    def __init__(self):
        self.sent = []

    def call(self, action, **body):
        self.sent.append((action, body))
        return {"ok": True, "added": len(body.get("rows") or []), "updated": 0, "closed": 0, "suggested": 0}


say = lambda m: None

# 1) 결과 파일 → 문의·리뷰 스냅숏 (테스트 파일은 제외)
f1 = write_result("수집_261029_1000.json", {"수집시각": "2026-10-29 10:00", "기간(일)": 7, "모드": "실제", "업체결과": {"지그재그": {"상태": "ok"}},
                                            "rows": [{"업체": "지그재그", "게시판": "주문문의", "id": "1"}], "리뷰결과": {"지그재그": {"상태": "ok"}},
                                            "리뷰": [{"업체": "지그재그", "게시판": "리뷰", "id": "r0"}]})
write_result("수집_테스트_261029_1001.json", {"모드": "테스트(가상)", "rows": []})
snaps = L.snapshots(f1)
assert [s[0] for s in snaps] == ["문의", "리뷰"]
assert snaps[0][2]["vendors"] == {"지그재그": {"상태": "ok"}} and snaps[0][2]["days"] == 7 and snaps[0][2]["test"] is False
assert [os.path.basename(f) for f in L.result_files(out_dir)] == ["수집_261029_1000.json"], "test files never pushed"

# 2) 처음 켤 때는 최신 파일만, 그다음부터는 새 파일만
older = write_result("수집_261028_0900.json", {"수집시각": "2026-10-28 09:00", "기간(일)": 7, "모드": "실제", "업체결과": {}, "rows": [{"id": "old"}]})
os.utime(older, (time.time() - 3600, time.time() - 3600))
link = FakeLink()
state = {}
assert L.push_new_files(link, out_dir, state, say) == 1
assert [a for a, _ in link.sent] == ["ingest", "ingest"], link.sent
assert link.sent[0][1]["snapshot"]["file"] == "수집_261029_1000.json"
assert "수집_261028_0900.json" in state["pushed"], "older files marked, not pushed on first run"
link.sent.clear()
assert L.push_new_files(link, out_dir, state, say) == 0 and not link.sent, "nothing new"

# 3) 많은 줄은 나눠서 올리고 스냅숏(자동 종료 기준)은 마지막 조각에만
many = write_result("수집_261029_1100.json", {"수집시각": "2026-10-29 11:00", "기간(일)": 7, "모드": "실제", "업체결과": {"지그재그": {"상태": "ok"}},
                                               "rows": [{"업체": "지그재그", "게시판": "주문문의", "id": str(i)} for i in range(320)]})
link.sent.clear()
L.push_new_files(link, out_dir, state, say)
sizes = [len(b["rows"]) for a, b in link.sent]
assert sizes == [150, 150, 20], sizes
assert [b["snapshot"] is None for a, b in link.sent] == [True, True, False]

# 4) 웹 수집 요청: 업체 선택 반영, 게시판만, 테스트는 테스트 모드
cfg = {"out_dir": out_dir, "vendors": dict(G.DEFAULT_CFG["vendors"]), "review_vendors": {"지그재그": True, "에이블리": True, "메이크샵": True}}
ok, msg, n = L.run_collect_job({"kind": "collect", "body": {"vendors": ["지그재그"]}}, cfg, say)
c = calls[-1][1]
assert ok and n == 1 and c["no_reviews"] is True and c["vendors"] == {"스마트스토어": False, "지그재그": True, "에이블리": False, "메이크샵": False}
assert "에이블리: 로그인 필요" in msg, msg
assert cfg["vendors"]["에이블리"] is True, "collector settings are not changed"
L.run_collect_job({"kind": "test", "body": {}}, cfg, say)
assert calls[-1][1]["test"] is True and calls[-1][1]["test_limit"] == 3
ok, msg, n = L.run_collect_job({"kind": "reviews", "body": {"vendors": ["지그재그"], "reviewDays": 14}}, cfg, say)
c = calls[-1][1]
assert calls[-1][0] == "reviews" and c["review_days"] == 14 and c["review_vendors"]["에이블리"] is False and n == 1
L.run_collect_job({"kind": "testReviews", "body": {}}, cfg, say)
assert calls[-1][0] == "reviews" and calls[-1][1]["test"] is True

# 5) 등록: 수집기 등록 함수 그대로, 결과를 키별로 돌려줌. 같은 요청이 다시 와도 두 번 안 올림
cfg["ss_client_id"], cfg["ss_secret_enc"] = "cid", "enc:secret"
job = {"id": "J1", "kind": "register", "body": {"items": [
    {"key": "스마트스토어_상품문의_a1", "vendor": "스마트스토어", "board": "상품문의", "id": "a1", "date": "2026-10-29 09:00", "text": "답 1"},
    {"key": "스마트스토어_고객문의_fail", "vendor": "스마트스토어", "board": "고객문의", "id": "fail", "date": "2026-10-29", "text": "답 2"},
    {"key": "스마트스토어_상품문의_answered", "vendor": "스마트스토어", "board": "상품문의", "id": "answered", "date": "", "text": "답 3"},
]}}
ok, msg, results = L.run_register_job(job, cfg, say)
assert ok and msg == "등록 1건 · 확인 필요 1건 · 건너뜀 1건", msg
assert [(r["key"].split("_")[-1], r["state"]) for r in results] == [("a1", "등록완료"), ("fail", "확인 필요"), ("answered", "건너뜀")]
approved = os.path.join(tmp, "답변안", "승인", "V3_등록요청_J1.json")
assert os.path.exists(approved), "request recorded next to the approval files"
ok, msg, results = L.run_register_job(job, cfg, say)
assert results[0]["state"] == "등록완료", "the sheet still sees it as registered"
assert msg.startswith("등록 0건"), "already registered items are not posted again: " + msg

# API 연결이 안 되면 아무것도 올리지 않음
cfg.pop("ss_client_id"); cfg.pop("ss_secret_enc")
ok, msg, results = L.run_register_job(dict(job, id="J2"), cfg, say)
assert not ok and all(r["state"] == "확인 필요" for r in results)

# 6) handle: 실행 후 finish 보고 (오류도 실패로 보고)
link = FakeLink()
L.handle(link, {"id": "J3", "kind": "collect", "body": {}}, cfg, say)
assert link.sent[-1][0] == "finish" and link.sent[-1][1]["ok"] is True and link.sent[-1][1]["count"] == 1
G.run_collect = lambda cfg, say: (_ for _ in ()).throw(RuntimeError("브라우저 겹침"))
L.handle(link, {"id": "J4", "kind": "collect", "body": {}}, cfg, say)
assert link.sent[-1][1]["ok"] is False and "브라우저 겹침" in link.sent[-1][1]["message"]

# 7) 설정 파일은 수집기 폴더(%APPDATA%\\G1CS)에 암호화 저장
L.save_link({"endpoint": "https://script.google.com/macros/s/X/exec", "token_enc": G.enc_secret("collector-token")})
assert L.load_link()["token_enc"] == "enc:collector-token"
assert os.path.dirname(L.link_path()) == tmp

# 8) 한 PC에 하나만
g1 = L.single_instance()
assert g1 is not None and L.single_instance() is None
g1.close()

# 9) 비밀번호 붙여넣기 정리
assert L.clean_token('  "abcd1234efgh"  ') == "abcd1234efgh"
assert L.clean_token("COLLECTOR_TOKEN = 0123456789abcdef01234567") == "0123456789abcdef01234567"
assert L.clean_token("") == ""

print("g1V3Link.test: OK")

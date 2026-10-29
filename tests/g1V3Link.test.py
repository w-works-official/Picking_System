# -*- coding: utf-8 -*-
"""docs/g1_v3_link.py 시험 (수집기·시트 없이 가짜로) — python3 tests/g1V3Link.test.py"""
import datetime, json, os, sys, tempfile, time, types

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

# 10) 상태 신호 파일 (트레이 아이콘이 읽음)
b = L.Beat()
b.set("busy", "J9", "게시판 수집")
bj = json.load(open(L.beat_path(), encoding="utf-8"))
assert bj["state"] == "busy" and bj["job"] == "게시판 수집" and bj["dir"] == L.HERE and abs(bj["ts"] - time.time()) < 5
b.stop("중지됨")
assert json.load(open(L.beat_path(), encoding="utf-8"))["state"] == "off"

# 11) 창 없이: 설정이 없으면 입력을 기다리지 않고 상태만 알림, 중지 표시가 있으면 끝냄
L.STOP_FLAG = os.path.join(tmp, "stop.flag")
os.remove(L.link_path())
open(L.STOP_FLAG, "w").close()
b = L.Beat()
logs = []
L._loop(G, logs.append, b, once=False, bg=True)
assert json.load(open(L.beat_path(), encoding="utf-8"))["state"] == "error" and "처음 설정" in logs[0]
assert L.wait_or_stop(5) is True
os.remove(L.STOP_FLAG)
assert L.wait_or_stop(0) is False

# 12) 한 번 돌기: 시트 연결 실패 → error, 성공 → idle
L.save_link({"endpoint": "https://script.google.com/macros/s/X/exec", "token_enc": G.enc_secret("collector-token")})
G.load_cfg = lambda: cfg
G.run_collect = run_collect


class BadLink(FakeLink):
    def call(self, action, **body):
        raise RuntimeError("시트 응답 HTTP 500")


orig = L.Link
L.Link = lambda ep, tok, say=print: BadLink()
L._loop(G, logs.append, b, once=True, bg=True)
assert json.load(open(L.beat_path(), encoding="utf-8"))["state"] == "error"
L.Link = lambda ep, tok, say=print: FakeLink()
L._loop(G, logs.append, b, once=True, bg=True)
assert json.load(open(L.beat_path(), encoding="utf-8"))["state"] == "idle"
L.Link = orig

# 13) 처음 설정 상태 요약 — 비밀값은 안 보냄
seen = []


class SpyLink(FakeLink):
    def call(self, action, **body):
        seen.append((action, body)); return {"ok": True}


L.Link = lambda ep, tok, say=print: SpyLink()
cfg["ss_client_id"], cfg["ss_secret_enc"], cfg["claude_key"], cfg["login_ok"] = "cid", "enc:secret", "enc:key", True
L._SETUP_CACHE["info"] = None
L._loop(G, logs.append, b, once=True, bg=True)
L.Link = orig
poll = [b2 for a, b2 in seen if a == "poll"][0]
su = poll["setup"]
assert poll["version"].endswith("· 창 없이") and su["bg"] is True and su["api"] == "own" and su["claude"] is True and su["login_ok"] is True
assert su["vendors"] == ["스마트스토어", "지그재그", "에이블리", "메이크샵"] and su["dir"] == L.HERE
assert "secret" not in json.dumps(poll, ensure_ascii=False) and "enc:key" not in json.dumps(poll, ensure_ascii=False)

# 14) 잠금(RSA-OAEP SHA-256): 웹 브라우저(crypto.subtle)로 잠근 값을 이 PC가 풂 — node 로 확인
import subprocess
d14 = {}
L._RSA.clear()
key = L.rsa_key(d14)
assert d14["rsa_enc"].startswith("enc:") and key["n"].bit_length() == 2048
pub = L.rsa_public(key)
js = """
const [n, text] = process.argv.slice(1);
const k = await crypto.subtle.importKey("jwk", { kty: "RSA", n, e: "AQAB", alg: "RSA-OAEP-256", ext: true }, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
const c = new Uint8Array(await crypto.subtle.encrypt({ name: "RSA-OAEP" }, k, new TextEncoder().encode(text)));
console.log(Buffer.from(c).toString("base64url"));
"""
secret_text = "핑크로켓!pw#2026"
token = subprocess.run(["node", "--input-type=module", "-e", js, pub, secret_text], capture_output=True, text=True, check=True).stdout.strip()
assert L.rsa_decrypt(key, token) == secret_text
L._RSA.clear()
assert L.rsa_decrypt(L.rsa_key(d14), token) == secret_text, "key comes back from v3link.json"
try:
    L.rsa_decrypt(key, token[:-4] + "AAAA"); raise AssertionError("tampered value must fail")
except ValueError:
    pass


def lock(text):
    return subprocess.run(["node", "--input-type=module", "-e", js, pub, text], capture_output=True, text=True, check=True).stdout.strip()


# 15) 로그인: 이미 로그인 / 웹 비밀번호로 로그인→이 PC에 저장 / 저장 비번 없음 / 2단계 인증 대기 안내
import threading as _th


class FakePage:
    def __init__(self, vendor):
        self.vendor = vendor; self.closed = False
    def goto(self, url, **kw):
        self.url = url
    def wait_for_timeout(self, ms):
        time.sleep(0.01)
    def close(self):
        self.closed = True


state15 = {"logged": {"메이크샵": True}, "typed": [], "after_fill": {}}


class FakeBrowser:
    def __init__(self, show=False):
        assert show is True, "login window is visible on the PC"
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False
    def page(self):
        return FakePage(state15.setdefault("order", []).append(1) or len(state15["order"]))


G.Browser = FakeBrowser
G.RUN_LOCK = _th.Lock()
pages = {}
cur = {}


def fake_logged_in(pg):
    v = cur["v"]
    return state15["logged"].get(v, False)


def fake_fill(pg, uid, pw):
    state15["typed"].append((cur["v"], uid, pw))
    if pw == "good":
        state15["logged"][cur["v"]] = True


L.page_logged_in = fake_logged_in
L.fill_login = fake_fill
L.page_captcha = lambda pg: False
G.ably_autologin = lambda pg: "아이디/비번이 채워져 있지 않음"
L.LOGIN_WAIT_SEC = 0.4
orig_goto = FakePage.goto


def goto(self, url, **kw):
    cur["v"] = [v for v, u in L.LOGIN_URL.items() if u == url][0]
    self.url = url


FakePage.goto = goto
G.save_cfg = lambda c: None
prog = []
job = {"id": "JL", "kind": "login", "body": {"vendors": ["메이크샵", "지그재그", "에이블리"], "creds": {"지그재그": {"id": lock("pinkrocket"), "pw": lock("good")}}}}
ok, msg, data = L.run_login_job(job, cfg, say, prog.append, d14)
st = data["login"]
assert st["메이크샵"]["state"] == "ok" and st["지그재그"]["state"] == "ok" and st["에이블리"]["state"] == "need_password", st
assert ("지그재그", "pinkrocket", "good") in state15["typed"]
assert L.saved_logins(d14) == ["지그재그"] and L.load_cred(d14, "지그재그") == {"id": "pinkrocket", "pw": "good"}, "saved on this PC only after success"
assert d14["logins"]["지그재그"].startswith("enc:"), "password goes through DPAPI (enc_secret)"
assert not ok and "에이블리 비밀번호 필요" in msg, msg
# 다음 로그인은 이 PC에 저장된 비밀번호로
state15["logged"]["지그재그"] = False
state15["typed"].clear()
ok, msg, data = L.run_login_job({"id": "JL2", "kind": "login", "body": {"vendors": ["지그재그"]}}, cfg, say, prog.append, d14)
assert ok and state15["typed"] == [("지그재그", "pinkrocket", "good")]
# 틀린 비밀번호 → 2단계 인증 안내 후 실패, 저장 안 함
state15["logged"]["에이블리"] = False
prog.clear()
L.LOGIN_WAIT_SEC = 7.5
ok, msg, data = L.run_login_job({"id": "JL3", "kind": "login", "body": {"vendors": ["에이블리"], "creds": {"에이블리": {"id": lock("a"), "pw": lock("bad")}}}}, cfg, say, prog.append, d14)
assert not ok and data["login"]["에이블리"]["state"] == "fail" and "에이블리" not in L.saved_logins(d14)
assert any("휴대폰에서 [확인]" in m for m in prog), prog
L.LOGIN_WAIT_SEC = 0.4
# 수집 중이면 로그인 창을 열지 않음
G.RUN_LOCK.acquire()
ok, msg, data = L.run_login_job({"id": "JL4", "kind": "login", "body": {"vendors": ["지그재그"]}}, cfg, say, prog.append, d14)
assert not ok and "수집 중" in msg
G.RUN_LOCK.release()

# 16) 설정 저장: 아는 칸만, 업체는 합침
saved = {}
G.load_cfg = lambda: json.loads(json.dumps({**cfg, "days": 7, "vendors": {"스마트스토어": True, "지그재그": True, "에이블리": True, "메이크샵": True}}))
G.save_cfg = lambda c: saved.update(c)
ok, msg, data = L.run_settings_job({"body": {"settings": {"days": 14, "auto_on": True, "auto_start": "10:00", "interval": 30, "vendors": {"메이크샵": False, "없는업체": True}, "ss_secret_enc": "x"}}}, say)
assert ok and saved["days"] == 14 and saved["auto_on"] is True and saved["vendors"]["메이크샵"] is False and "없는업체" not in saved["vendors"]
assert saved.get("ss_secret_enc") != "x", "only known settings"
assert "수집 기간" in msg and "자동 수집" in msg

# 17) 자동 수집 시각
G.next_run = lambda now, hhmm, iv: now.replace(hour=int(hhmm[:2]), minute=int(hhmm[3:]), second=0, microsecond=0)
assert L.next_auto({"auto_on": False}) is None
assert L.next_auto({"auto_on": True, "auto_start": "10:00", "interval": 30}).hour == 10

# 18) API 키 저장(잠겨 옴) → 테스트, IP, 파일 목록
calls18 = []


class FakeSS:
    def __init__(self, cid, sec):
        calls18.append((cid, sec))
    def token(self):
        pass
    def get(self, path, **params):
        calls18.append(path)


G.SmartStore = FakeSS
G.load_cfg = lambda: dict(cfg)
ok, msg, data = L.run_api_key_job({"body": {"clientId": lock("my-client"), "secret": lock("$2a$04$secret")}}, cfg, say, d14)
assert ok and saved["ss_client_id"] == "my-client" and saved["ss_secret_enc"] == "enc:$2a$04$secret" and calls18[0] == ("my-client", "$2a$04$secret")
assert "/v1/contents/qnas" in calls18 and data["api"]["ok"] is True
G.SmartStore = lambda cid, sec: (_ for _ in ()).throw(RuntimeError("HTTP 403 IP not allowed"))
ok, msg, data = L.run_api_test({"ss_client_id": "c", "ss_secret_enc": "enc:s"})
assert not ok and "공인 IP" in msg
ok, msg, data = L.run_files_job({"out_dir": out_dir})
assert ok and data["files"] and all(set(f) == {"name", "size", "at"} for f in data["files"])

# 19) handle 이 종류별로 나눠 실행하고 data 를 함께 보고
link = FakeLink()
L.handle(link, {"id": "JF", "kind": "files", "body": {}}, {"out_dir": out_dir}, say, d14)
assert link.sent[-1][0] == "finish" and link.sent[-1][1]["data"]["files"]
L.public_ip = lambda: "1.2.3.4"
L.handle(link, {"id": "JI", "kind": "ip", "body": {}}, cfg, say, d14)
assert link.sent[-1][1]["data"] == {"ip": "1.2.3.4"}

# 20) 처음 설정 상태에 공개키·저장된 로그인·자동 수집 (비밀값 없음)
L._SETUP_CACHE["info"] = None
su = L.setup_info({**cfg, "auto_on": True}, True, d14, datetime.datetime(2026, 10, 29, 10, 0))
assert su["pub_key"] == pub and su["saved_logins"] == ["지그재그"] and su["auto_on"] is True and su["next_auto"] == "10-29 10:00"
assert "good" not in json.dumps(su, ensure_ascii=False) and "rsa" not in json.dumps(su)

print("g1V3Link.test: OK")

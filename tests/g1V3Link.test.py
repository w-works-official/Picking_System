# -*- coding: utf-8 -*-
"""docs/g1_v3_link.py 시험 (수집기·시트 없이 가짜로) — python3 tests/g1V3Link.test.py"""
import datetime, json, os, re, sys, tempfile, time, types

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
L.autologin_saved = lambda pg: "아이디/비번이 채워져 있지 않음"
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

# 21) 웹연결 업데이트: 저장소 커밋 파일만 · 해시 확인 · 문법 확인 · 백업 후 같은 자리 교체 · 다시 켜기 신호
import hashlib, shutil
up = os.path.join(tmp, "upd")
os.makedirs(os.path.join(up, "_patch"))
me = os.path.join(up, "g1_v3_link.py")
shutil.copy2(os.path.join(ROOT, "docs", "g1_v3_link.py"), me)
L.__file__, L.HERE = me, up
URL = "https://raw.githubusercontent.com/w-works-official/Picking_System/" + "a" * 40 + "/docs/g1_v3_link.py"
newsrc = open(me, encoding="utf-8").read().replace(L.LINK_VER, "9.9 (2099-01-01)").encode("utf-8")
sha = hashlib.sha256(newsrc).hexdigest()
job = lambda **b: {"id": "JU", "kind": "update", "body": dict(url=URL, sha256=sha, **b)}
ok, msg, data = L.run_update_job({"body": {"url": URL.replace("w-works-official", "evil"), "sha256": sha}}, say, fetch=lambda u: newsrc)
assert not ok and "받지 않았습니다" in msg, "only this repository"
ok, msg, data = L.run_update_job(job(), say, fetch=lambda u: newsrc + b"#")
assert not ok and "확인값" in msg and open(me, "rb").read() != newsrc, "hash mismatch keeps the old file"
broken = b"def x(:\n"
try:
    L.run_update_job({"body": {"url": URL, "sha256": hashlib.sha256(broken).hexdigest()}}, say, fetch=lambda u: broken)
    raise AssertionError("syntax errors must stop the update")
except SyntaxError:
    pass
assert b"9.9 (2099" not in open(me, "rb").read()
ok, msg, data = L.run_update_job(job(), say, fetch=lambda u: newsrc)
assert ok and data["update"]["to"] == "9.9 (2099-01-01)" and open(me, "rb").read() == newsrc
baks = os.listdir(os.path.join(up, "_patch"))
assert len(baks) == 1 and baks[0].startswith("g1_v3_link_") and baks[0].endswith(".py.bak"), baks
assert not os.path.exists(me + ".new")
# handle 가 다시 켜기 신호를 돌려줌
link = FakeLink()
open(me, "wb").write(open(os.path.join(ROOT, "docs", "g1_v3_link.py"), "rb").read())
L.fetch_bytes = lambda u: newsrc
assert L.handle(link, job(), cfg, say, d14) is True and link.sent[-1][1]["ok"] is True
assert L.handle(link, job(), cfg, say, d14) is False, "already the same file → no restart"
assert "이미 최신" in link.sent[-1][1]["message"]


# ── 1.6 리뷰 보강: 지그재그 리뷰는 숨김 브라우저면 화면 밖 창에서, 리뷰 기간으로 다시 조회 ──
class FakeReq:
    def __init__(self, url, body): self.url, self.post_data, self.method = url, body, "POST"
class FakeResp:
    def __init__(self, req, js): self.url, self.request, self._js = req.url, req, js
    def json(self): return self._js
class FakePage:
    def __init__(self, owner): self.owner, self.h, self.url, self.closed = owner, {}, "about:blank", False
    def on(self, ev, fn): self.h.setdefault(ev, []).append(fn)
    def goto(self, url, **kw):
        self.url = url; self.owner.gotos.append(url)
        if self.owner.login: self.url = "https://partners.kakaostyle.com/login"; return
        req = FakeReq("https://partners.kakaostyle.com/api/provider/pink-rocket/graphql/GetProductReviewList", json.dumps({"query": "q", "variables": {"input": {"rating_list": None}}}))
        for f in self.h.get("request", []): f(req)
        for f in self.h.get("response", []): f(FakeResp(req, self.owner.page_js))
    def wait_for_timeout(self, ms): pass
    def evaluate(self, js, arg): self.owner.evals.append(arg); return self.owner.replay
    def close(self): self.closed = True
    def bring_to_front(self): self.owner.front = True
class FakeCtx:
    def __init__(self, owner): self.owner, self.added = owner, []
    def cookies(self): return [{"name": "s", "value": "1", "domain": ".kakaostyle.com", "path": "/"}, {"name": "o", "value": "2", "domain": ".other.com", "path": "/"}]
    def add_cookies(self, ck): self.added += ck
    def new_page(self): return FakePage(self.owner)
class FakeBrowserProc:
    def __init__(self, owner): self.owner = owner
    def new_context(self, **kw): self.owner.ctx2 = FakeCtx(self.owner); return self.owner.ctx2
    def close(self): self.owner.closed2 = True
class FakeChromium:
    def __init__(self, owner): self.owner = owner
    def launch(self, **kw): self.owner.launch = kw; return FakeBrowserProc(self.owner)
class FakeBr:
    def __init__(self, show=False, login=False, page_js=None, replay=None):
        self.show, self.login, self.gotos, self.evals, self.front = show, login, [], [], False
        self.page_js = page_js if page_js is not None else {"data": {"internal_product_review_list": {"total_count": 1, "item_list": [{"id": 7, "reply_list": []}]}}}
        self.replay = replay if replay is not None else {"rows": [], "total": 0, "errors": []}
        self.ctx = FakeCtx(self); self.pw = types.SimpleNamespace(chromium=FakeChromium(self))
    def page(self): return FakePage(self)

G2 = types.ModuleType("g2")
G2.kst = lambda v: f"T{v}"
G2.dbgs = []
G2._dbg = lambda cfg, name, data: G2.dbgs.append((name, data))
G2.collect_reviews_zigzag = lambda br, cfg: ("old", [], "")
G2.collect_reviews_smartstore = lambda br, cfg: ("ok", [{"via": "show" if br.show else "hidden"}], "")
L.patch_review_collectors(G2)
assert G2._v3_review_patch and G2.collect_reviews_zigzag is not G2._v3_orig_zz_reviews
rcfg = {"zz_slug": "pink-rocket", "review_days": 30}
items = [{"id": 1, "date_created": 5, "rating": 5, "contents": "좋아요", "reply_list": [], "purchased_product": {"name": "피어싱", "item": {"attributes": [{"name": "색", "value": "실버"}]}}, "product_id": 9},
         {"id": 2, "reply_list": [{"contents": "감사"}]}]
br = FakeBr(replay={"rows": items, "total": 2, "errors": []})
st, rows, note = G2.collect_reviews_zigzag(br, rcfg)
assert st == "ok" and [r["id"] for r in rows] == ["1"] and rows[0]["옵션"] == "색:실버" and rows[0]["날짜"] == "T5", (st, rows)
assert "30일" in note and "전체 2건" in note
assert br.launch["headless"] is False and "--window-position=-32000,-32000" in br.launch["args"], "hidden browser → off-screen window"
assert {c["name"] for c in br.ctx2.added} == {"s", "o"} and [c["name"] for c in br.ctx.added] == ["s"], "cookies copied in, only login cookies copied back"
a = br.evals[-1]; assert a["lt"] - a["gte"] == 30 * 86400000 and a["lim"] == 50 and a["url"].endswith("GetProductReviewList")
# 보이는 브라우저면 새 창 없이 그대로
br = FakeBr(show=True, replay={"rows": items[:1], "total": 1, "errors": []})
st, rows, _ = G2.collect_reviews_zigzag(br, rcfg)
assert st == "ok" and len(rows) == 1 and not hasattr(br, "launch")
# 다시 조회 실패 → 화면이 받은 것(1주일)이라도
br = FakeBr(replay={"rows": [], "total": "", "errors": ["boom"]})
st, rows, note = G2.collect_reviews_zigzag(br, rcfg)
assert st == "ok" and [r["id"] for r in rows] == ["7"] and "1주일" in note
# 둘 다 거절 → 오류 + 진단(개인정보 없이)
deny = {"errors": [{"message": "잘못된 접근입니다.", "extensions": {"code": "invalid_access"}}], "data": None}
br = FakeBr(page_js=deny, replay={"rows": [], "total": "", "errors": ["x"]})
st, rows, note = G2.collect_reviews_zigzag(br, rcfg)
assert st == "오류" and "invalid_access" in note and G2.dbgs[-1][0] == "지그재그_리뷰_요청" and "응답" not in G2.dbgs[-1][1]
# 로그인 화면
st, rows, note = G2.collect_reviews_zigzag(FakeBr(login=True), rcfg)
assert st == "로그인 필요"
# 테스트 모드: 답글 있어도 n건
st, rows, _ = G2.collect_reviews_zigzag(FakeBr(replay={"rows": items, "total": 2, "errors": []}), {**rcfg, "test": True, "test_limit": 1})
assert len(rows) == 1
# 스마트스토어 리뷰: 크롬이 없으면 화면 밖 자동화 창에서 (1.6) — 1.9 부터 리뷰 기간 전체(ss_reviews_core)
_find = L.find_chrome
_ssc = L.ss_reviews_core
L.ss_reviews_core = lambda G_, b, cfg: ("ok", [{"via": "show" if b.show else "hidden"}], "")
L.find_chrome = lambda: None
assert G2.collect_reviews_smartstore(FakeBr(), {})[1][0]["via"] == "show"
assert G2.collect_reviews_smartstore(FakeBr(show=True), {})[1][0]["via"] == "show"
# 1.8: 크롬이 있으면 일반 크롬(네이버 전용 프로필, 화면 밖)으로 — 수집기 Playwright 를 그대로 써서 원격 연결
L.find_chrome = lambda: "C:/chrome.exe"
made = []
class FakeNative:
    def __init__(self, G_, pw=None, offscreen=False, **kw): made.append((pw, offscreen)); self.show = True
    def __enter__(self): return self
    def __exit__(self, *a): return False
_NC = L.NativeChrome
L.NativeChrome = FakeNative
fb = FakeBr()
assert G2.collect_reviews_smartstore(fb, {})[1][0]["via"] == "show" and made == [(fb.pw, True)] and not hasattr(fb, "launch")
L.NativeChrome, L.find_chrome = _NC, _find
L.ss_reviews_core = _ssc

# 1.9 스마트스토어 리뷰 30일치: 화면이 보낸 검색 요청을 날짜만 바꿔 쪽마다 다시 조회
import datetime as _dt
f_, t_ = L.ss_dates(30, _dt.datetime(2026, 11, 4, 15, 30, tzinfo=_dt.timezone(_dt.timedelta(hours=9))))
assert (f_, t_) == ("2026-10-05T00:00:00.000+09:00", "2026-11-04T23:59:59.999+09:00"), (f_, t_)
class SSReq:
    def __init__(self, url, body, headers): self.url, self.post_data, self.headers, self.method = url, body, headers, "POST"
class SSResp:
    def __init__(self, req, js): self.url, self.request, self._js = req.url, req, js
    def json(self): return self._js
class SSPage:
    def __init__(self, br): self.br, self.h, self.url, self.frames = br, {}, "about:blank", []
    def on(self, ev, fn): self.h.setdefault(ev, []).append(fn)
    def goto(self, url, **kw):
        self.url = url
        if self.br.login: self.url = "https://nid.naver.com/nidlogin.login"; return
        body = json.dumps({"fromDate": "2026-10-29T00:00:00.000+09:00", "toDate": "2026-11-04T23:59:59.999+09:00", "page": 0, "size": 500})
        req = SSReq("https://sell.smartstore.naver.com/api/v3/contents/reviews/search", body, {"content-type": "application/json", "cookie": "x", "x-current-state": "s", "sec-ch-ua": "y"})
        for f in self.h.get("request", []): f(req)
        for f in self.h.get("response", []): f(SSResp(req, {"contents": self.br.week}))
    def wait_for_timeout(self, ms): pass
    def evaluate(self, js, arg): self.br.evals.append(arg); return self.br.replay
    def close(self): pass
class SSBr:
    def __init__(self, replay=None, week=None, login=False): self.replay, self.week, self.login, self.evals, self.show = replay, week or [], login, [], True
    def page(self): return SSPage(self)
G4 = types.SimpleNamespace(kst=lambda v: str(v)[:16].replace("T", " "), _dbg=lambda *a: None)
recent = (_dt.datetime.now() - _dt.timedelta(days=2)).strftime("%Y-%m-%dT10:00:00")
old = (_dt.datetime.now() - _dt.timedelta(days=40)).strftime("%Y-%m-%dT10:00:00")
items = [{"id": 1, "reviewContent": "좋아요", "reviewScore": 5, "createDate": recent, "productNo": 77, "productName": "피어싱", "hasComment": False,
          "reviewAttaches": [{"attachUrl": "https://img/1.jpg"}], "maskedWriterId": "ab***"},
         {"id": 2, "reviewContent": "답글 있음", "createDate": recent, "hasComment": True},
         {"id": 3, "reviewContent": "오래됨", "createDate": old}]
br = SSBr(replay={"rows": items, "errors": [], "pages": 2})
st, rows, note = L.ss_reviews_core(G4, br, {"review_days": 30}, now=_dt.datetime(2026, 11, 4, 15, 30, tzinfo=_dt.timezone(_dt.timedelta(hours=9))))
assert st == "ok" and [r["id"] for r in rows] == ["1"], (st, rows)
r0 = rows[0]
assert r0["업체"] == "스마트스토어" and r0["상품링크"].endswith("/77") and r0["사진URL"] == ["https://img/1.jpg"] and r0["별점"] == 5
assert "30일 3건 (2쪽)" in note, note
a = br.evals[-1]
assert a["from"] == "2026-10-05T00:00:00.000+09:00" and a["size"] == 500 and a["url"].endswith("/reviews/search")
assert a["headers"] == {"content-type": "application/json", "x-current-state": "s"}, "쿠키·sec- 헤더는 빼고 화면 헤더 그대로"
# 다시 조회 실패 → 화면이 받은 1주일치라도
br = SSBr(replay={"rows": [], "errors": ["403"], "pages": 0}, week=items[:1])
st, rows, note = L.ss_reviews_core(G4, br, {"review_days": 30})
assert st == "ok" and len(rows) == 1 and "1주일" in note
br = SSBr(replay={"rows": [], "errors": ["403"], "pages": 0}, week=[])
assert L.ss_reviews_core(G4, br, {"review_days": 30})[0] == "오류"
assert L.ss_reviews_core(G4, SSBr(login=True), {"review_days": 30})[0] == "로그인 필요"
# 테스트 모드: 답글 있어도 n건
st, rows, _ = L.ss_reviews_core(G4, SSBr(replay={"rows": items, "errors": [], "pages": 1}), {"review_days": 30, "test": True, "test_limit": 2})
assert len(rows) == 2

# 수집기에 함수가 없으면 아무것도 안 바꿈
G3 = types.ModuleType("g3"); L.patch_review_collectors(G3); assert not hasattr(G3, "collect_reviews_zigzag")

# ── 1.6 직접 로그인: 채우지 않고 창을 앞으로, 사람이 끝낼 때까지 기다림 ──
assert "스마트스토어" in L.MANUAL_LOGIN and L.LOGIN_MANUAL_SEC >= 300
pb = FakeBr(); pg = pb.page(); seen = []; n = {"i": 0}
orig_pli = L.page_logged_in
def fake_pli(p):
    n["i"] += 1; return n["i"] >= 3
L.page_logged_in = fake_pli
r = L.manual_login(pg, "스마트스토어", seen.append, say, wait_sec=60, step_ms=0)
assert r["state"] == "ok" and pb.front and "직접 로그인" in seen[0] and "퀴즈" in seen[0]
L.page_logged_in = lambda p: False
r = L.manual_login(pg, "스마트스토어", seen.append, say, wait_sec=0.01, step_ms=0)
assert r["state"] == "manual_fail" and "다시" in r["note"]
L.page_logged_in = orig_pli


# ── 1.8 로그인: 자동 한 번 → 막히면 사람 → 되면 자동으로 닫기 (스마트스토어 = 일반 크롬 + 원격 연결) ──
class NPage:
    def __init__(self, owner): self.owner, self.url = owner, "about:blank"
    def goto(self, url, **kw): self.url = url; self.owner.gotos.append(url)
    def wait_for_timeout(self, ms): pass
    def bring_to_front(self): self.owner.front = True
class NCtx:
    def __init__(self, owner): self.owner, self.pages, self.added = owner, [], []
    def new_page(self): p = NPage(self.owner); self.pages.append(p); return p
    def cookies(self): return [{"name": "NID_SES", "domain": ".naver.com", "value": "x"}, {"name": "other", "domain": ".a.com"}]
    def add_cookies(self, ck): self.added += ck
class NBrowser:
    def __init__(self, owner): self.owner, self.contexts, self.closed = owner, [NCtx(owner)], False
    def new_browser_cdp_session(self):
        owner = self.owner
        return types.SimpleNamespace(send=lambda m: owner.sent.append(m))
    def close(self): self.closed = True
class NChromium:
    def __init__(self, owner): self.owner = owner
    def connect_over_cdp(self, url): self.owner.cdp = url; self.owner.browser = NBrowser(self.owner); return self.owner.browser
class NProc:
    def wait(self, timeout=None): pass
    def terminate(self): pass
class Owner:
    def __init__(self): self.gotos, self.sent, self.front, self.args = [], [], False, None
own = Owner()
G.BASE = tmp
nb = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own)), chrome="C:/chrome.exe", popen=lambda a: setattr(own, "args", a) or NProc())
# 단계별로 로그인 상태를 바꾸는 가짜 판정
phase = {"logged_after": None, "calls": 0}
def logged_fake(p):
    phase["calls"] += 1
    return phase["logged_after"] is not None and phase["calls"] >= phase["logged_after"]
L.page_logged_in = logged_fake
fills, msgs = [], []
L.fill_login = lambda pg, u, pw: fills.append((u, pw))
L.autologin_saved = lambda pg: "아이디/비번이 채워져 있지 않음"
# (a) 자동으로 되는 경우: 저장된 아이디·비번으로 → 몇 번 뒤 로그인됨 → 쿠키 보관 + 창 닫기
d18 = {}
L.save_cred(d18, "스마트스토어", "pinkrocket", "pw1")
phase.update(logged_after=3, calls=0)
r = L.native_login(G, "스마트스토어", msgs.append, say, creds={}, d=d18, wait_sec=5, auto_sec=5, nb=nb, sleep=lambda s: None)
assert r["state"] == "ok" and "자동" in r["note"], r
assert fills == [("pinkrocket", "pw1")]
a = own.args
assert a[0] == "C:/chrome.exe" and f"--user-data-dir={os.path.join(tmp, 'native_profile')}" in a and any(x.startswith("--remote-debugging-port=") for x in a), a
assert not any("automation" in x for x in a) and own.cdp.startswith("http://127.0.0.1:")
# 1.18: 로그인 창 = V3 왼쪽 메뉴 보드를 가리지 않게 살짝 오른쪽 (모니터 왼쪽 끝 아님)
assert "--window-position=560,100" in a and "--window-size=1000,1000" in a and not any("-32000" in x for x in a), a
assert L.login_window_bounds((1920, 1080)) == (560, 100, 1000, 920)
assert L.login_window_bounds((1366, 768)) == (346, 100, 1000, 608), "작은 화면이면 안으로 당김"
assert L.login_window_bounds(None) == L.LOGIN_WINDOW
assert any("-32000" in x for x in L.OFFSCREEN_ARGS), "화면 밖 수집 창은 그대로"
# 1.18: 칸이 비어 있으면 저장된 아이디·비밀번호를 얹어 둠 ([로그인]은 안 누름)
class PBox:
    def __init__(self, v=""): self.v, self.vis = v, True
    def is_visible(self): return self.vis
    def input_value(self): return self.v
    def fill(self, t): self.v = t
    def click(self, **k): raise AssertionError("로그인 버튼 누르면 안 됨")
class PLoc:
    def __init__(self, items): self.items = items
    def count(self): return len(self.items)
    def nth(self, i): return self.items[i]
class PPage:
    def __init__(self, idv="", pwv=""): self.idb, self.pwb = PBox(idv), PBox(pwv)
    def locator(self, sel): return PLoc([self.pwb]) if sel == "input[type=password]" else PLoc([self.idb])
pp = PPage()
assert L.prefill_login(pp, "pinkrocket", "pw1") is True and (pp.idb.v, pp.pwb.v) == ("pinkrocket", "pw1")
pp2 = PPage(idv="사람이 치는 중")
assert L.prefill_login(pp2, "pinkrocket", "pw1") is False and pp2.pwb.v == "", "사람이 입력 중이면 건드리지 않음"
assert L.prefill_login(PPage(), "", "pw1") is False
assert L.prefill_login(object(), "a", "b") is False, "칸 못 찾으면 그냥 넘어감"
# 1.19 원격 로그인: 화면을 웹에 올리고(바뀌었을 때만) 웹에서 넣은 정답·클릭을 대신 넣음
class RPage:
    def __init__(self):
        self.shots, self.clicks, self.cap, self.pw, self.submitted = 0, [], PBox(), PBox(), 0
        self.mouse = types.SimpleNamespace(click=lambda x, y: self.clicks.append((x, y)))
        self.viewport_size = {"width": 1000, "height": 900}
        self.img = b"\xff\xd8frame1"
    def screenshot(self, **kw):
        self.shots += 1; return self.img
    def locator(self, sel):
        return PLoc([self.pw]) if sel == "input[type=password]" else PLoc([self.cap]) if sel == L.CAPTCHA_SEL else PLoc([])
sent, answers = [], []
def relay(**kw):
    sent.append(kw); return {"answer": answers.pop(0) if answers else None}
clk = {"t": 0.0}
rp = RPage(); rl = L.RemoteLogin(relay, "스마트스토어", ("pinkrocket", "pw1"), msgs.append, clock=lambda: clk["t"])
_sub = L.submit_login
L.submit_login = lambda pg: (setattr(pg, "submitted", pg.submitted + 1) or "[로그인] 누름")
rl.step(rp)
assert sent[-1]["image"].startswith("data:image/jpeg;base64,") and sent[-1]["w"] == 1000, "처음엔 화면 그림"
clk["t"] = 1; rl.step(rp); assert len(sent) == 1, "4초 안엔 안 보냄"
clk["t"] = 5; rl.step(rp); assert sent[-1]["image"] == "", "같은 화면이면 그림 빼고 정답만 확인"
answers.append({"answer": "1234", "submit": True})
clk["t"] = 10; msg = rl.step(rp)
assert (rp.cap.v, rp.pw.v, rp.submitted) == ("1234", "pw1", 1) and "정답 넣고" in msg, msg
assert any("원격 로그인" in m for m in msgs)
clk["t"] = 13; rl.step(rp); assert sent[-1]["image"].startswith("data:"), "넣은 뒤엔 화면을 곧 다시 보냄"
answers.append({"click": [120, 340]})
clk["t"] = 18; assert "누름" in rl.step(rp) and rp.clicks == [(120.0, 340.0)]
rl.done(); assert sent[-1].get("done") is True, "끝나면 그림 지우기"
assert L.RemoteLogin(None, "x").step(rp) is None, "시트 연결 없으면 아무것도 안 함"
def bad_relay(**kw): raise RuntimeError("알 수 없는 요청입니다.")
assert L.RemoteLogin(bad_relay, "x", clock=lambda: 99).step(RPage()) is None, "옛 시트(v10)여도 멈추지 않음"
nocap = RPage(); nocap.locator = lambda sel: PLoc([])
assert "찾지 못함" in L.apply_remote(nocap, {"answer": "1"})
L.submit_login = _sub
assert own.sent == ["Browser.close"], "로그인되면 창을 자동으로 닫음"
assert [c["name"] for c in L.load_native_cookies(G)] == ["NID_SES"], "세션 쿠키까지 보관 (네이버 것만)"
assert any("자동 로그인 한 번 시도" in m for m in msgs)
# (b) 막히는 경우: 자동 시도 시간 안에 안 됨 → 창 앞으로 + "직접 로그인" 안내 → 사람이 로그인 → 자동으로 닫힘
own2 = Owner(); msgs.clear(); fills.clear()
nb2 = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own2)), chrome="c", popen=lambda a: NProc())
clock = {"t": 0.0}
real_time = L.time.time
L.time.time = lambda: clock["t"]
def tick(s): clock["t"] += s
phase.update(logged_after=40, calls=0)
r = L.native_login(G, "스마트스토어", msgs.append, say, creds={}, d={}, wait_sec=300, auto_sec=40, nb=nb2, sleep=tick)
assert r["state"] == "ok" and "직접" in r["note"], r
assert own2.front and any("자동 로그인이 막혔습니다" in m and "자동으로 닫힙니다" in m for m in msgs), msgs
assert own2.sent == ["Browser.close"]
# (c) 시간 안에 사람도 못 함 → 실패, 창은 닫힘
own3 = Owner(); clock["t"] = 0
nb3 = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own3)), chrome="c", popen=lambda a: NProc())
phase.update(logged_after=None, calls=0)
r = L.native_login(G, "스마트스토어", msgs.append, say, creds={}, d={}, wait_sec=20, auto_sec=10, nb=nb3, sleep=tick)
assert r["state"] == "manual_fail" and own3.sent == ["Browser.close"], r
# (d) 이미 로그인 · 웹에서 받은 비밀번호는 성공했을 때만 저장
own4 = Owner(); clock["t"] = 0
phase.update(logged_after=1, calls=0)
nb4 = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own4)), chrome="c", popen=lambda a: NProc())
assert L.native_login(G, "스마트스토어", msgs.append, say, nb=nb4, sleep=tick)["note"] == "이미 로그인됨"
own5 = Owner(); clock["t"] = 0; d19 = {}
phase.update(logged_after=2, calls=0)
nb5 = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own5)), chrome="c", popen=lambda a: NProc())
r = L.native_login(G, "스마트스토어", msgs.append, say, creds={"스마트스토어": ("newid", "newpw")}, d=d19, nb=nb5, sleep=tick)
assert r["state"] == "ok" and L.load_cred(d19, "스마트스토어") == {"id": "newid", "pw": "newpw"} and "저장" in r["note"]
L.time.time = real_time
# (d2) 1.8.1: 기다릴 때 창 소식을 받도록 wait_for_timeout 으로 (time.sleep 금지) · 처음부터 로그인 주소 탭 하나
class PumpPage:
    def __init__(self): self.waits = []
    def is_closed(self): return False
    def wait_for_timeout(self, ms): self.waits.append(ms)
pp = PumpPage()
L.pump_wait(types.SimpleNamespace(ctx=types.SimpleNamespace(pages=[pp])), 2)
assert pp.waits == [2000]
own6 = Owner()
nb6 = L.NativeChrome(G, pw=types.SimpleNamespace(chromium=NChromium(own6)), chrome="c", popen=lambda a: setattr(own6, "args", a) or NProc(), start_url=L.LOGIN_URL["스마트스토어"])
assert own6.args is None
with nb6 as b6:
    pass
assert own6.args[-1] == L.LOGIN_URL["스마트스토어"], "빈 탭 대신 로그인 주소로 바로"
# (e) 크롬이 없으면 None (1.6 방식으로)
orig_find = L.find_chrome
L.find_chrome = lambda: None
assert L.native_login(G, "스마트스토어", msgs.append, say) is None
# (f) run_login_job: 스마트스토어만이면 자동화 브라우저를 열지 않음
L.find_chrome = lambda: "C:/chrome.exe"
orig_native = L.native_login
L.native_login = lambda G_, v, progress, say_, creds=None, d=None: dict(state="ok", note="로그인됨 (직접)")
def no_browser(show=False):
    raise AssertionError("스마트스토어만일 때는 자동화 브라우저를 열지 않음")
G.Browser, keepB = no_browser, G.Browser
ok, msg, data = L.run_login_job({"id": "JN", "kind": "login", "body": {"vendors": ["스마트스토어"]}}, cfg, say, prog.append, d14)
assert ok and data["login"]["스마트스토어"]["state"] == "ok", (msg, data)
# (g) 자동화 창 업체: 30초 지나면 "직접 로그인" 안내, 되면 성공
class SimplePg:
    url = ""
    def goto(self, url, **kw): cur["v"] = [v for v, u in L.LOGIN_URL.items() if u == url][0]; self.url = url
    def wait_for_timeout(self, ms): clock["t"] += ms / 1000
    def close(self): pass
    def bring_to_front(self): pass
class SimpleBr:
    def __init__(self, show=False): assert show is True
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def page(self): return SimplePg()
G.Browser = SimpleBr
L.time.time = lambda: clock["t"]
clock["t"] = 0
n = {"i": 0}
def zz_logged(pg):
    n["i"] += 1
    return cur.get("v") == "지그재그" and n["i"] > 25    # 처음 확인 + 2초씩 → 약 48초 뒤 로그인
L.page_logged_in = zz_logged
L.LOGIN_WAIT_SEC = 300
prog.clear()
ok, msg, data = L.run_login_job({"id": "JN2", "kind": "login", "body": {"vendors": ["스마트스토어", "지그재그"]}}, cfg, say, prog.append, d14)
assert data["login"]["스마트스토어"]["state"] == "ok" and data["login"]["지그재그"]["state"] == "ok", data
assert any("지그재그: 자동 로그인이 막혔습니다" in m for m in prog), prog
L.time.time = real_time
L.native_login, L.find_chrome = orig_native, orig_find
G.Browser = keepB
L.LOGIN_WAIT_SEC = 0.4

# 2026-11-04: [로그인되면 바로 게시판 + 리뷰 수집] → 로그인 성공 뒤 게시판 수집, 이어서 리뷰 수집 (같은 업체)
keep_login, keep_collect, keep_G = L.run_login_job, L.run_collect_job, L._G
calls = []
L.run_login_job = lambda job, cfg, say, progress, d: (True, "지그재그 ✓", {"login": {"지그재그": {"state": "ok"}}})
L.run_collect_job = lambda job, cfg, say: (calls.append((job["kind"], job["body"].get("vendors"))) or (True, f"{job['kind']} 끝", 2 if job["kind"] == "collect" else 3))
L._G = lambda: types.SimpleNamespace(load_cfg=lambda: {})
link = FakeLink()
L.handle(link, {"id": "JCA", "kind": "login", "body": {"vendors": ["지그재그"], "collectAfter": True}}, {}, say, {})
fin = [b for a, b in link.sent if a == "finish"][-1]
assert calls == [("collect", ["지그재그"]), ("reviews", ["지그재그"])], calls
assert fin["ok"] and "게시판: collect 끝" in fin["message"] and "리뷰: reviews 끝" in fin["message"] and fin["count"] == 5
assert [b["message"] for a, b in link.sent if a == "progress"] == ["로그인 완료 — 게시판 수집 중", "게시판 수집 끝 — 리뷰 수집 중"]
calls.clear()
L.handle(link, {"id": "JCB", "kind": "login", "body": {"vendors": ["지그재그"]}}, {}, say, {})
assert calls == [], "체크 안 하면 로그인만"
L.run_login_job, L.run_collect_job, L._G = keep_login, keep_collect, keep_G

# 2026-11-05 (1.10): 메신저 창 도우미 — 끌어 가까이 놓으면 슬롯에 딱 맞춤 · 항상 위 · 일괄 정렬 · 127.0.0.1 + System V3 화면만
assert L.msn_origin_ok("https://w-works-official.github.io") and L.msn_origin_ok("http://127.0.0.1:5173")
assert not L.msn_origin_ok("https://evil.example") and not L.msn_origin_ok("")
assert L.msn_is_messenger("KakaoTalk.exe", "고객 A") and L.msn_is_messenger("NateOn.exe", "거래처 김대리"), "카톡·네이트온 대화창"
assert not L.msn_is_messenger("NateOn.exe", "네이트온") and not L.msn_is_messenger("KakaoTalk.exe", "카카오톡"), "본 창(친구 목록)은 제외"
assert not L.msn_is_messenger("chrome.exe", "고객 A") and not L.msn_is_messenger("nateon.exe", "  ")
assert L.msn_is_messenger("NateOnMain.exe", "김대리") and L.msn_is_messenger("nateonmsg.exe", "대화"), "1.11: 네이트온 여러 프로그램 이름"
assert L.msn_clean_slots([{"x": 10, "y": 20, "w": 400, "h": 560}, {"x": "a"}, {"x": 0, "y": 0, "w": 50, "h": 50}]) == [(10, 20, 400, 560)]
S3 = [(100, 200, 400, 560), (520, 200, 400, 560), (940, 200, 400, 560)]
assert L.msn_snap_target((560, 240, 900, 700), S3) == 1, "왼쪽 위 모서리가 가까우면 그 슬롯"
assert L.msn_snap_target((950, 300, 1300, 800), S3) == 2, "창 가운데가 슬롯 안이면 그 슬롯"
assert L.msn_snap_target((2000, 2000, 2400, 2500), S3) is None
assert L.msn_outer_rect((100, 200, 400, 560), (7, 0, 7, 7)) == (93, 200, 414, 567), "보이지 않는 테두리만큼 넓혀서 보이는 테두리가 슬롯에 맞게"


class FakeMsnApi:
    def __init__(self):
        self.wins = {}      # hwnd → (title, rect)
        self.order = []     # 위에 있는 창부터
        self.down = False
        self.top = {}
        self.placed = []

    def windows(self):
        return [(h, self.wins[h][0], self.wins[h][1]) for h in self.order if h in self.wins]

    def mouse_down(self):
        return self.down

    def place(self, h, slot):
        x, y, w, hh = slot
        self.wins[h] = (self.wins[h][0], (x, y, x + w, y + hh))
        self.top[h] = True
        self.placed.append((h, slot))

    def topmost(self, h, on):
        self.top[h] = on

    def send(self, h, enter=True):
        self.sent = (h, enter)

    def capture(self, h):
        return 2, 1, L.msn_png(2, 1, bytes([0, 0, 255, 255, 0, 255, 0, 255]))

    def scan(self):
        return [{"exe": "nateonmain.exe", "title": "김대리", "w": 400, "h": 600, "tool": True, "min": False, "ok": True}]

    def hide(self, h):
        self.hidden = getattr(self, "hidden", set()) | {h}
        self.order = [x for x in self.order if x != h]      # 최소화된 창은 windows() 에 안 나옴

    def show(self, h):
        self.hidden = getattr(self, "hidden", set()) - {h}
        if h in self.wins and h not in self.order:
            self.order.append(h)

    def alive(self, h):
        return h in self.wins


fa = FakeMsnApi()
logs = []
mh = L.MsnHelper(fa, logs.append)
fa.wins = {11: ("고객 A", (50, 50, 450, 650)), 22: ("고객 B", (1500, 100, 1900, 700))}
fa.order = [11, 22]
mh.tick()                                                      # 처음 위치 기억
assert mh.set_slots(S3)["slots"] == 3
fa.down = True; fa.wins[11] = ("고객 A", (130, 210, 530, 810)); mh.tick()   # 끄는 중 — 아직 안 붙임
assert 11 not in mh.managed and not fa.placed
fa.down = False; mh.tick()                                     # 마우스 뗌 → 슬롯 1 에 딱 맞춤 + 항상 위
assert mh.managed == {11: 0} and fa.wins[11][1] == (100, 200, 500, 760) and fa.top[11] is True
assert any("슬롯 1" in m for m in logs)
mh.tick(); mh.tick()
assert fa.placed.count((11, S3[0])) == 1, "가만히 있으면 다시 안 건드림"
# 창 최소 크기 때문에 슬롯보다 크게 남아도 계속 다시 붙이지 않음
fa_place = fa.place
fa.place = lambda h, slot: (fa_place(h, slot), fa.wins.__setitem__(h, (fa.wins[h][0], (slot[0], slot[1], slot[0] + 450, slot[1] + 600))))
fa.down = True; fa.wins[11] = ("고객 A", (110, 205, 510, 805)); mh.tick(); fa.down = False; mh.tick()
n0 = len(fa.placed); mh.tick(); mh.tick(); mh.tick()
assert len(fa.placed) == n0, "붙인 뒤 크기가 조금 달라도 반복해서 옮기지 않음"
fa.place = fa_place
fa.down = True; fa.wins[11] = ("고객 A", (2000, 2000, 2400, 2600)); mh.tick(); fa.down = False; mh.tick()
assert 11 not in mh.managed and fa.top[11] is False, "슬롯 밖으로 끌어내면 항상 위 풀림"
r = mh.arrange()                                               # 일괄 정렬: 위에 있는 창부터 빈 슬롯에, 같은 크기
assert r["placed"] == 2 and mh.managed == {11: 0, 22: 1} and fa.wins[22][1] == (520, 200, 920, 760)
assert mh.status()["used"] == [0, 1], "1.13: 대화창이 붙은 슬롯 번호"
S3b = [(x + 30, y, w, h) for x, y, w, h in S3]
mh.set_slots(S3b)                                              # 브라우저를 옮기면 붙은 창도 따라감
assert fa.wins[11][1][0] == 130 and fa.wins[22][1][0] == 550
mh.tick()                                                      # (실제로는 끄는 동안 여러 번 확인함)
fa.down = True; fa.wins[22] = ("고객 B", (140, 210, 540, 770)); mh.tick(); fa.down = False; mh.tick()
assert mh.managed == {22: 0} and fa.top[11] is False, "같은 슬롯에 새 창을 붙이면 원래 창은 항상 위만 풀림"
del fa.wins[22]; mh.tick()
assert mh.managed == {}, "닫힌 창은 잊음"
assert mh.release_all()["ok"]
assert L.MsnHelper(fa).arrange()["ok"] is False, "슬롯 위치를 못 받았으면 정렬 안 함"
assert L.msn_helper_start(print) is None or os.name == "nt", "Windows 가 아니면 켜지 않음"

# 1.15 거래처 메신저: 메모 이름 ↔ 창 제목으로 일괄 붙이기 · 탭(슬롯 묶음)을 바꾸면 내려두고 돌아오면 다시 붙임 · 최대 30칸
assert L.msn_norm_name("0-세븐피어싱 [ 1 ]") == "세븐피어싱" and L.msn_norm_name(" 헤세드 ") == "헤세드"
assert L.msn_name_slot("0-헤세드 >아트", ["", "헤세드", "아트"]) == 1, "더 긴 이름 먼저"
assert L.msn_name_slot("0-아트피어스", ["아트", "아트피어스"]) == 1
assert L.msn_name_slot("고객 A", ["헤세드"]) is None and L.msn_name_slot("가", ["가"]) is None, "한 글자 메모는 안 맞춤"
assert len(L.msn_clean_slots([{"x": 0, "y": 0, "w": 300, "h": 300}] * 40)) == 30
fv = FakeMsnApi()
fv.wins = {1: ("고객 A", (0, 0, 400, 600)), 2: ("0-세븐피어싱", (0, 0, 400, 600)), 3: ("0-헤세드 >아트", (0, 0, 400, 600)), 4: ("기타방", (0, 0, 400, 600))}
fv.order = [1, 2, 3, 4]
mv = L.MsnHelper(fv)
S2 = [(100, 200, 400, 560), (520, 200, 400, 560)]
mv.set_slots(S2, "reply")
mv.arrange()
assert mv.managed == {1: 0, 2: 1}, "메신저 답변 탭: 위에 있는 창부터 빈 슬롯에 (예전과 같음)"
SV = [(100, 200, 400, 560), (520, 200, 400, 560), (940, 200, 400, 560)]
r = mv.set_slots(SV, "vendor", ["헤세드", "세븐피어싱", "없는업체"])
assert r["group"] == "vendor" and mv.managed == {} and fv.hidden == {1, 2}, "탭을 바꾸면 메신저 답변 창은 내려둠"
r = mv.arrange()
assert mv.managed == {3: 0} and r["named"] == 1 and 4 not in mv.managed, "메모 이름이 맞는 창만 · 메모 있는 빈 슬롯엔 다른 창 안 붙임"
fv.show(2)                                                   # (사람이 세븐피어싱 창을 다시 띄움)
mv.arrange()
assert mv.managed == {3: 0, 2: 1}
r = mv.set_slots(S2, "reply", ["", ""])
assert mv.group == "reply" and mv.managed == {1: 0} and 3 in fv.hidden and 2 in fv.hidden and fv.top[1] is True, "돌아오면 다시 띄워 붙임 (거래처로 옮긴 창은 거래처 쪽에만)"
assert mv.status()["group"] == "reply"
mv.set_slots(SV, "vendor", ["헤세드", "세븐피어싱", ""])
assert mv.managed == {3: 0, 2: 1}, "거래처 탭 창도 그대로 돌아옴"
mv.arrange()
assert 4 not in mv.managed, "1.16: 거래처는 메모 이름이 맞는 창만 (메모 없는 슬롯에도 다른 창 안 붙임)"

# 1.20 거래처 일괄 붙이기: 대화창이 없으면 카톡 검색으로 열기 → 업체별 결과(못 찾음·여러 개·이름 다름)
fk = FakeMsnApi()
fk.wins = {1: ("세븐피어싱", (0, 0, 400, 600)), 2: ("아트피어스", (0, 0, 400, 600)), 3: ("아트", (0, 0, 400, 600))}
fk.order = [1, 2, 3]
kakao_rooms = {"수진사": ("수진사 (남대문)", 10), "헤세드": ("헤세드", 11), "더피어싱": ("더피어싱", 12)}
opened = []
def open_chat(name):
    opened.append(name)
    if name in kakao_rooms:
        t, h = kakao_rooms[name]; fk.wins[h] = (t, (0, 0, 400, 600)); fk.order.append(h)
    return True
fk.open_chat = open_chat
fk.wins[13] = ("더피어싱", (0, 0, 400, 600)); fk.order.append(13)          # 같은 이름 방이 이미 하나 열려 있음
mk = L.MsnHelper(fk)
names = ["세븐피어싱", "수진사", "헤세드", "없는업체", "아트", "아트피어스", "더피어싱", ""]
mk.set_slots([(i * 420, 0, 400, 560) for i in range(8)], "vendor", names)
notes = mk.open_named(search=True, sleep=lambda s: None)
assert opened == ["수진사", "헤세드", "없는업체"], f"열린 창이 없는 업체만 카톡에서 검색 {opened}"
assert notes[0] == {"state": "ok", "title": "세븐피어싱"} and notes[2]["state"] == "ok"
assert notes[1] == {"state": "similar", "title": "수진사 (남대문)"}, "이름이 조금 다른 방 → 확인 안내"
assert notes[3] == {"state": "missing"}
assert notes[4]["state"] == "ok" and notes[5]["state"] == "ok", "'아트'와 '아트피어스'는 각자 (더 긴 이름 먼저)"
assert 7 not in notes, "메모 없는 슬롯은 건너뜀"
fk.wins[14] = ("더피어싱", (0, 0, 400, 600)); fk.order.append(14)
assert mk.open_named(search=False)[6] == {"state": "dup", "titles": ["더피어싱", "더피어싱"]}, "같은 이름 방 여러 개"
r = mk.arrange()
assert mk.managed.get(1) == 0 and mk.managed.get(10) == 1 and mk.managed.get(11) == 2
del fk.open_chat
fk2 = FakeMsnApi(); fk2.open_chat = lambda name: None
mk2 = L.MsnHelper(fk2); mk2.set_slots([(0, 0, 400, 560), (420, 0, 400, 560)], "vendor", ["가나다", "라마바"])
assert mk2.open_named(search=True, sleep=lambda s: None) == {0: {"state": "nokakao"}, 1: {"state": "nokakao"}}, "카톡 본 창 없음 → 업체마다 안내"
# 일괄 보내기: 붙은 창의 미리보기 창에서 Enter
fk.confirm = lambda h: h == 1
assert mk.confirm(0) == {"ok": True, "slot": 0, "popup": True}
assert mk.confirm(7)["ok"] is False, "붙은 창 없는 슬롯"
# 1.22 붙은 대화창이 움직이면 딸린 이미지 전송 창도 같은 만큼
assert L.msn_follow((100, 200, 500, 800), (130, 150, 530, 750), (180, 300, 480, 600)) == (210, 250)
assert L.msn_follow((1, 2, 3, 4), (1, 2, 9, 9), (5, 5, 6, 6)) is None, "크기만 바뀌면 안 옮김"
# 1.21 일괄 비우기: 붙은 창 닫고 잊음
closed = []
fk.close = lambda h: closed.append(h)
n_before = len(mk.managed)
r = mk.reset()
assert r == {"ok": True, "closed": n_before} and sorted(closed) == sorted(closed) and n_before == len(closed) and mk.managed == {}

# 로컬 HTTP: System V3 화면 Origin 만 POST 허용 · 미리 확인(OPTIONS) 에 사설망 허용 머리말
import socket as _sock, urllib.request as _ur, urllib.error as _ue
_s = _sock.socket(); _s.bind(("127.0.0.1", 0)); _port = _s.getsockname()[1]; _s.close()
fa2 = FakeMsnApi(); fa2.wins = {7: ("고객 C", (0, 0, 500, 600))}; fa2.order = [7]
started = L.msn_helper_start(lambda m: None, api=fa2, port=_port)
assert started, "가짜 api 로는 어디서나 켜짐"
_srv = started[1]
_base = f"http://127.0.0.1:{_port}/msn"
ORI = "https://w-works-official.github.io"


def _req(path, method="GET", body=None, origin=ORI):
    rq = _ur.Request(_base + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    if origin:
        rq.add_header("Origin", origin)
    if body is not None:
        rq.add_header("Content-Type", "text/plain;charset=utf-8")
    try:
        with _ur.urlopen(rq, timeout=5) as rs:
            return rs.status, dict(rs.headers), json.loads(rs.read() or b"{}")
    except _ue.HTTPError as e:
        return e.code, dict(e.headers), json.loads(e.read() or b"{}")


st_, hd, js = _req("/ping")
assert st_ == 200 and js["ok"] and js["ver"] == L.LINK_VER and js["windows"] == 1 and hd.get("Access-Control-Allow-Origin") == ORI
st_, hd, _ = _req("/slots", "OPTIONS")
assert st_ == 204 and hd.get("Access-Control-Allow-Private-Network") == "true"
assert _req("/slots", "POST", {"slots": [{"x": 10, "y": 10, "w": 400, "h": 560}]}, origin="https://evil.example")[0] == 403, "다른 사이트는 거절"
assert _req("/slots", "POST", {"slots": [{"x": 10, "y": 10, "w": 400, "h": 560}]})[2]["slots"] == 1
st_, _, js = _req("/arrange", "POST", {})
assert js["placed"] == 1 and fa2.wins[7][1] == (10, 10, 410, 570)
st_, _, js = _req("/capture", "POST", {"slot": 0})
import base64 as _b64, zlib as _z
_png = _b64.b64decode(js["data"])
assert js["ok"] and js["mime"] == "image/png" and _png.startswith(b"\x89PNG") and (js["w"], js["h"]) == (2, 1)
_idat = _png[_png.index(b"IDAT") + 4:_png.index(b"IEND") - 8]
assert _z.decompress(_idat) == bytes([0, 255, 0, 0, 0, 255, 0]), "BGRA → RGB (빨강·초록 점 2개)"
assert _req("/capture", "POST", {"slot": 2})[2]["ok"] is False, "붙은 창 없는 슬롯은 그림 없음"
st_, _, js = _req("/send", "POST", {"slot": 0})
assert js["ok"] and fa2.sent == (7, True), "1.11: 슬롯 1 창에 붙여넣기 + Enter"
assert _req("/send", "POST", {"slot": 2})[2]["ok"] is False, "붙은 창 없는 슬롯은 안 보냄"
assert _req("/windows")[2]["windows"][0]["exe"] == "nateonmain.exe", "진단 목록"
assert _req("/windows", origin="https://evil.example")[0] == 403
assert _req("/release", "POST", {})[2]["released"] == 1 and fa2.top[7] is False
assert _req("/send", "POST", {"slot": 0})[2]["ok"] is False, "놓아주면 보내기 안 함"
_srv.shutdown()


# ── 1.14 메이크샵 리뷰 답글 + 적립금 ──
assert L.ms_point_amount("4,277", 2.6) == 110 and L.ms_point_amount("4,277", 2) == 80 and L.ms_point_amount("15,000", 1) == 150
assert L.ms_point_amount("0", 5) == 0 and L.ms_point_amount("4,277", 0) == 0 and L.ms_point_amount("4,277", 31) == 0, "0원·0%·30% 넘으면 0"
assert L.ms_point_amount("999", 1, 10) == 0 and L.ms_point_amount("1,000", 1, 10) == 10, "10원 미만 버림"


class MsPage:
    def __init__(self, rows):
        self.rows = rows                       # num1 → 목록 항목
        self.url = ""
        self.calls = []
        self.handlers = {}
        self.context = types.SimpleNamespace(cookies=lambda: [{"domain": ".www.makeshop.co.kr"}, {"domain": "special346.makeshop.co.kr"}])
    def on(self, ev, fn): self.handlers[ev] = fn
    def goto(self, url, **kw): self.url = url; self.calls.append(("goto", url))
    def wait_for_timeout(self, ms): pass
    def evaluate(self, js, arg=None):
        if js == L.MS_READY_JS:
            return "special346.makeshop.co.kr" in self.url
        if js == L.MS_FIND_JS:
            self.calls.append(("find", tuple(arg["nums"])))
            return {"out": {n: dict(self.rows[n]) for n in arg["nums"] if n in self.rows}, "pages": 1}
        if js == L.MS_COMMENT_JS:
            self.calls.append(("comment", arg["num1"], arg["text"], arg["hname"], arg["code"]))
            self.rows[arg["num1"]]["comments"] += 1
            return {"ok": True, "msg": "등록되었습니다."}
        if js == L.MS_RESERVE_JS:
            self.calls.append(("reserve", arg["num1"], arg["member"], arg["amount"], arg["msg"], arg["branduid"]))
            if "dialog" in self.handlers:
                self.handlers["dialog"](types.SimpleNamespace(message="적립금이 지급되었습니다.", accept=lambda: None))
            if arg["member"] != "noreserve":
                self.rows[arg["num1"]]["reserved"] = "1"
            return {"ok": True, "step": "send", "msg": ""}
        raise AssertionError("unexpected js")


def _row(num1, member="sangah1013", price="4,277", reserved="0", comments=0):
    return {"num1": num1, "num2": "00000", "code": "curiouswiz_board3", "member": member, "brandname": "리본피어싱", "branduid": "2085727",
            "price": price, "reserved": reserved, "comments": comments, "commentText": "[]"}


ms_rows = {"817322": _row("817322"), "817300": _row("817300", comments=1), "817200": _row("817200", member="", price="0"),
           "817100": _row("817100", reserved="1"), "817050": _row("817050", member="noreserve")}
ms_page = MsPage(ms_rows)


class MsBrowser:
    def __init__(self, show=False): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def page(self): return ms_page


keepB = G.Browser
G.Browser = MsBrowser
pt = {"pct": 2.6, "unit": 10, "msg": "[PRODUCT_NAME] 리뷰 적립금"}
mk = lambda n, text="감사합니다 :)": {"key": f"메이크샵_리뷰_{n}", "vendor": "메이크샵", "board": "리뷰", "id": n, "date": "", "text": text, "point": pt}
items = [mk("817322"), mk("817300"), mk("817200"), mk("817100"), mk("817050"), mk("999999")]
ok, msg, results = L.run_register_job({"id": "JM1", "kind": "register", "body": {"items": items}}, {"out_dir": out_dir}, say)
by = {r["key"].split("_")[-1]: (r["state"], r["note"]) for r in results}
assert ok and msg == "등록 3건 · 확인 필요 2건 · 건너뜀 1건", msg
assert by["817322"] == ("등록완료", "답글 ✓ · 적립금 110원 ✓ (실구매 4,277원 × 2.6%)"), by["817322"]
assert by["817300"][0] == "건너뜀" and "이미 답글" in by["817300"][1]
assert by["817200"] == ("등록완료", "답글 ✓ · 적립금 없음(쇼핑몰 회원 아님 — 네이버페이 등)")
assert by["817100"] == ("등록완료", "답글 ✓ · 적립금 이미 지급됨")
assert by["817050"][0] == "확인 필요" and "110원 확인 안 됨" in by["817050"][1] and "적립금이 지급되었습니다" in by["817050"][1]
assert by["999999"][0] == "확인 필요" and "찾지 못함" in by["999999"][1]
coms = [c for c in ms_page.calls if c[0] == "comment"]
assert [c[1] for c in coms] == ["817322", "817200", "817100", "817050"], "이미 답글 있는 리뷰·못 찾은 리뷰는 답글 안 씀"
assert coms[0][2:] == ("감사합니다 :)", "핑크로켓", "curiouswiz_board3")
res = [c for c in ms_page.calls if c[0] == "reserve"]
assert res[0] == ("reserve", "817322", "sangah1013", 110, "[PRODUCT_NAME] 리뷰 적립금", "2085727") and len(res) == 2, res
assert ms_page.calls[0] == ("goto", "https://special346.makeshop.co.kr/makeshop/newmanager/power_review_list.html"), "쿠키에서 관리자 주소"
# 0% = 답글만
ms_rows["817400"] = _row("817400")
ok, msg, results = L.run_register_job({"id": "JM2", "kind": "register", "body": {"items": [dict(mk("817400"), point={"pct": 0})]}}, {"out_dir": out_dir}, say)
assert results[0]["state"] == "등록완료" and results[0]["note"] == "답글 ✓" and ms_rows["817400"]["reserved"] == "0"
# 관리자 화면을 못 열면 아무것도 안 함
ms_page.context = types.SimpleNamespace(cookies=lambda: [])
ok, msg, results = L.run_register_job({"id": "JM3", "kind": "register", "body": {"items": [mk("817500")]}}, {"out_dir": out_dir}, say)
assert not ok and results[0]["state"] == "확인 필요" and "로그인" in results[0]["note"]
G.Browser = keepB

# ── 1.26 메이크샵 게시판(Q&A) 답변 — 간편답변 창 · 이미 답변 있으면 건너뜀 · [입력] 뒤 다시 확인 ──
class MsBoardPage:
    def __init__(self, threads):
        self.threads = threads                 # num1 → 답변 수
        self.url = ""
        self.calls = []
        self.handlers = {}
        self.filled = {}
        self.fail_fill = set()
        self.no_save = set()
        self.context = types.SimpleNamespace(cookies=lambda: [{"domain": "special346.makeshop.co.kr"}])
    def on(self, ev, fn): self.handlers[ev] = fn
    def goto(self, url, **kw): self.url = url; self.calls.append(("goto", url))
    def wait_for_timeout(self, ms): pass
    def _num1(self):
        m = re.search(r"num1=([0-9]+)", self.url)
        return m.group(1) if m else ""
    def evaluate(self, js, arg=None):
        if js == L.MS_BOARD_CODES_JS:
            return [["mym2mboard", "1:1 고객 게시판"], ["curiouswiz", "Q&A"], ["curiouswiz_board7", "도매 문의"]] if "board_all_list" in self.url else []
        if js == L.MS_THREAD_JS:
            n = self._num1()
            if n not in self.threads:
                return {"form": False}
            return {"form": True, "num1": n, "thread": 1 + self.threads[n], "replies": self.threads[n], "button": True, "box": True}
        if js == L.MS_FILL_JS:
            n = self._num1()
            if n in self.fail_fill:
                return False
            self.filled[n] = arg
            return True
        raise AssertionError("unexpected js")
    def click(self, sel):
        assert sel == "#reply_insert"
        n = self._num1()
        self.calls.append(("insert", n, self.filled.get(n)))
        if "dialog" in self.handlers:
            self.handlers["dialog"](types.SimpleNamespace(message="답변이 등록되었습니다.", accept=lambda: None))
        if n not in self.no_save:
            self.threads[n] += 1


mb_page = MsBoardPage({"913777": 0, "913776": 1, "913800": 0, "913801": 0, "913802": 0})
mb_page.fail_fill.add("913801")
mb_page.no_save.add("913802")


class MsBoardBrowser(MsBrowser):
    def page(self): return mb_page


G.Browser = MsBoardBrowser
qa = lambda n, board="Q&A", text="안녕하세요 고객님 :) 확인 후 안내드리겠습니다.": {"key": f"메이크샵_{board}_{n}", "vendor": "메이크샵", "board": board, "id": n, "date": "", "text": text}
assert L.ms_board_code([["a", "Q&A"], ["b", "도매 문의"]], "Q&A") == "a" and L.ms_board_code([["b", "도매 문의"]], "도매") == "b" and L.ms_board_code([], "Q&A") == ""
ok, msg, results = L.run_register_job({"id": "JB1", "kind": "register", "body": {"items": [qa("913777"), qa("913776"), qa("913800", board="도매 문의"), qa("913801"), qa("913802"), qa("913999"), qa("913803", board="없는 게시판")]}}, {"out_dir": out_dir}, say)
by = {r["key"].split("_")[-1]: (r["state"], r["note"]) for r in results}
assert ok and msg == "등록 2건 · 확인 필요 4건 · 건너뜀 1건", msg
assert by["913777"][0] == "등록완료" and "답변 ✓" in by["913777"][1] and "답변이 등록되었습니다" in by["913777"][1]
assert by["913776"] == ("건너뜀", "이미 답변 있음 — 덮어쓰지 않음"), "이미 답변 있는 글은 안 씀"
assert by["913800"][0] == "등록완료", "도매 문의 게시판도 이름으로 코드 찾음"
assert by["913801"][0] == "확인 필요" and "문안을 넣지 못함" in by["913801"][1]
assert by["913802"][0] == "확인 필요" and "답변이 안 보임" in by["913802"][1], "[입력] 뒤 다시 확인"
assert by["913999"][0] == "확인 필요" and "찾지 못함" in by["913999"][1]
assert by["913803"][0] == "확인 필요" and "게시판 코드" in by["913803"][1]
ins = [c for c in mb_page.calls if c[0] == "insert"]
assert [c[1] for c in ins] == ["913777", "913800", "913802"], "답변 있는 글·문안 못 넣은 글·없는 글은 [입력] 안 누름"
assert ins[0][2] == "안녕하세요 고객님 :) 확인 후 안내드리겠습니다."
assert mb_page.calls[0] == ("goto", "https://special346.makeshop.co.kr/makeshop/newmanager/board_all_list.html"), "게시판 목록에서 코드"
assert ("goto", "https://special346.makeshop.co.kr/makeshop/newmanager/board_simple_reply.html?code=curiouswiz&type=&num1=913777&num2=00000&brandname=") in mb_page.calls
# 리뷰 + 게시판 + 스마트스토어가 섞여도 나눠서
_keep_ss = L.run_ss_register
L.run_ss_register = lambda job, items, cfg, say: (True, f"등록 {len(items)}건", [dict(key=x["key"], state="등록완료", note="") for x in items])
mb_page.threads["913900"] = 0
ok, msg, results = L.run_register_job({"id": "JB2", "kind": "register", "body": {"items": [qa("913900"), {"key": "스마트스토어_상품문의_1", "vendor": "스마트스토어", "board": "상품문의", "id": "1", "text": "네"}]}}, {"out_dir": out_dir}, say)
assert ok and msg == "메이크샵 게시판: 등록 1건 · 확인 필요 0건 · 건너뜀 0건 / 스마트스토어: 등록 1건", msg
assert sorted(r["key"] for r in results) == ["메이크샵_Q&A_913900", "스마트스토어_상품문의_1"]
L.run_ss_register = _keep_ss
assert L.LINK_NOTE
print("g1V3Link ms board reply (1.26): OK")

# 1.17 메신저 전용 모드: 도우미만 켜고 시트는 안 부름
_ms_logs = []
_keep_start = L.msn_helper_start
L.msn_helper_start = lambda say: ("helper", "srv")
_ticks = iter([False, False, True])
assert L.msn_only(_ms_logs.append, stop=lambda: next(_ticks)) is True and any("메신저 전용 모드" in m for m in _ms_logs)
L.msn_helper_start = lambda say: None
assert L.msn_only(_ms_logs.append, stop=lambda: True) is False
L.msn_helper_start = _keep_start

print("g1V3Link.test: OK")

# 1.24 (11-09): 메신저 전용 PC(수집기 파일 없음)에서 검은 창 없이(--bg) 켜도 바로 죽지 않아야 함
_keepG = L._G
L._G = lambda: (_ for _ in ()).throw(ModuleNotFoundError("No module named 'g1_cs_collector'"))
assert L.log_file() == os.path.join(L.HERE, "v3link_log.txt"), "수집기 파일이 없으면 이 파일 폴더에 기록"
L._G = _keepG
with tempfile.TemporaryDirectory() as _d:
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(L.__file__)), "g1_v3_link.py"), _d)
    _r = subprocess.run([sys.executable, "-I", os.path.join(_d, "g1_v3_link.py"), "--msn", "--bg"], capture_output=True, text=True, timeout=60, cwd=_d)
    assert "ModuleNotFoundError" not in (_r.stderr or ""), _r.stderr[-400:]
    _log = open(os.path.join(_d, "v3link_log.txt"), encoding="utf-8").read()
    assert "메신저 창 도우미" in _log, _log[-300:]   # (리눅스에선 '켜지 못했습니다' — 윈도우 전용) 기록까지 갔으면 시작 단계 통과
print("g1V3Link msn-only bg start (1.24): OK")

# 1.25 (11-09): 메신저 전용 PC 창 도우미 스스로 업데이트 (/msn/update)
assert L.ver_tuple("1.25 (2026-11-09)") == (1, 25) and L.ver_tuple("1.9") < L.ver_tuple("1.25")
L.MSN_ONLY = False
assert "마스터" in L.msn_self_update(print, fetch=lambda u: b"")["error"], "수집기 PC 는 기존 업데이트만"
L.MSN_ONLY = True
with tempfile.TemporaryDirectory() as _d:
    _me = os.path.join(_d, "g1_v3_link.py")
    open(_me, "w", encoding="utf-8").write("# old\n")
    _restarts = []
    _same = L.msn_self_update(print, fetch=lambda u: f'LINK_VER = "{L.LINK_VER}"\n'.encode(), restart=lambda: _restarts.append(1), me=_me)
    assert _same.get("same") and not _restarts and open(_me, encoding="utf-8").read() == "# old\n", "같은 버전이면 그대로"
    _bad = None
    try:
        L.msn_self_update(print, fetch=lambda u: b'LINK_VER = "9.99 (x)"\nif (:\n', restart=lambda: _restarts.append(1), me=_me)
    except SyntaxError:
        _bad = True
    assert _bad and open(_me, encoding="utf-8").read() == "# old\n", "문법 오류 파일은 바꾸지 않음"
    _r = L.msn_self_update(print, fetch=lambda u: b'LINK_VER = "9.99 (2099-01-01)"\nX = 1\n', restart=lambda: _restarts.append(1), me=_me)
    assert _r["restarting"] and _r["to"].startswith("9.99") and _restarts == [1]
    assert "9.99" in open(_me, encoding="utf-8").read() and os.path.exists(_me + "." + L.LINK_VER.split(" ")[0] + ".bak"), "새 파일 + 전 버전 .bak"
L.MSN_ONLY = False
print("g1V3Link msn self-update (1.25): OK")


# ── 1.27 메이크샵 글자 깨짐: 수집 JS 의 EUC-KR 고정 풀기 → UTF-8 먼저 · 안 되면 EUC-KR ──
_G127 = types.SimpleNamespace(
    MS_JS="async () => {\n  " + L.MS_DEC_OLD + "\n  return 1; }",
    MS_BOARDS_JS="async () => {\n  " + L.MS_DEC_OLD + "\n}",
    ZZ_JS="x")
assert L.patch_makeshop_charset(_G127) == ["MS_JS", "MS_BOARDS_JS"]
assert L.MS_DEC_OLD not in _G127.MS_JS and "TextDecoder('utf-8', {fatal: true})" in _G127.MS_JS and "TextDecoder('euc-kr')" in _G127.MS_JS
assert L.patch_makeshop_charset(_G127) == [], "두 번 바꾸지 않음"
assert L.LINK_VER.startswith("1.27") and "깨짐" in L.LINK_NOTE
# 수집기 원본(11/12 드라이브 g1_cs_collector.py)의 줄과 글자 하나 다르지 않게 맞춰 둔 것
assert L.MS_DEC_OLD == "const dec = async u => new TextDecoder('euc-kr').decode(await (await fetch(u, {credentials:'include'})).arrayBuffer());"
print("g1V3Link makeshop charset (1.27): OK")

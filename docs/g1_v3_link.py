# -*- coding: utf-8 -*-
"""G1 CS 수집기 ↔ System V3 CS 관리(웹) 연결 프로그램 (2026-10-29)

수집기 PC에서 켜 두면:
  · 웹(System V3 > CS 관리)에서 누른 [수집 시작]·[리뷰 수집]·[테스트 수집]·[📤 등록] 요청을 가져와 이 PC에서 실행
  · 수집 결과(수집_*.json · 리뷰_*.json)를 CS 시트로 올림 — 수집기 창에서 직접 수집한 것도 자동으로 올라감
  · 15초마다 "살아 있음"을 알려 웹에 수집기 PC 상태가 보이게 함

수집·등록은 수집기(g1_cs_collector.py · g1_register.py)의 함수를 그대로 부릅니다. 수집기 파일은 고치지 않습니다.
안전장치
  · 등록은 수집기와 같은 순서: 등록 직전 다시 조회 → 이미 답변이 있으면 건너뜀 → 등록 후 다시 조회해서 확인
  · 등록 결과는 답변안\\승인\\V3_등록요청_<요청ID>_등록결과.json 에도 기록 → 같은 요청이 다시 와도 이미 등록된 건은 다시 안 올림
  · 테스트 수집 결과는 시트에 올리지 않음
  · 수집기 창에서 수집 중일 때 웹 수집 요청이 오면 브라우저가 겹쳐 실패할 수 있음 → 실패로 표시하고 끝냄(재시도는 웹에서)

처음 한 번: ▶G1수집기_5_웹연결.bat 실행 → 웹앱 주소와 수집기 비밀번호(COLLECTOR_TOKEN) 붙여넣기 (이 PC에만 암호화 저장)

창 없이(백그라운드) 돌리기 (1.2, 2026-10-29)
  · G1웹연결_백그라운드_등록.bat → Windows 로그인 때 자동 시작 (pythonw g1_v3_link.py --bg, 죽으면 30초 뒤 다시)
  · 상태는 %APPDATA%\\G1CS\\v3link_beat.json 에 10초마다 기록 → 원격보드 러너 트레이 아이콘 오른쪽 반쪽 색으로 보임
  · 기록은 %APPDATA%\\G1CS\\v3link_log.txt · 중지: G1웹연결_중지.bat (%TEMP%\\G1_weblink_stop.flag)

웹에서 다 하기 (1.3, 2026-10-29) — 수집기 창은 열지 않아도 됨
  · 🔑 로그인: 이 PC 브라우저(수집기 프로필)에서 로그인 창을 열고, 저장된 아이디·비밀번호로 자동 로그인.
    휴대폰 2단계 인증은 3분 기다림(웹에 "휴대폰에서 [확인]" 안내). 웹에서 넣은 비밀번호는 이 PC 공개키로 잠겨 오고,
    로그인에 성공하면 이 PC에만 Windows 암호화(DPAPI)로 저장 — 시트·웹에는 남지 않음
  · 설정 저장(기간·업체·지그재그 주소명·브라우저 보이기·자동 수집), 자동 수집(시작 시각·간격 — 이 프로그램이 직접 실행)
  · 스마트스토어 API 키 저장(잠겨 옴)·연결 테스트·이 PC 공인 IP 확인·수집 파일 목록
  · 잠금: 이 PC에서 만든 RSA-2048 키(개인키는 DPAPI 로 v3link.json 에). 순수 파이썬 RSA-OAEP(SHA-256) — 추가 설치 없음
"""
import os, sys, json, time, glob, socket, datetime, traceback, threading, base64, hashlib, secrets

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

LINK_VER = "1.3 (2026-10-29)"
POLL_SEC = 15
CHUNK = 150
URL_RE = "https://script.google.com/macros/s/"
BEAT_SEC = 10
STOP_FLAG = os.path.join(os.environ.get("TEMP") or os.environ.get("TMP") or HERE, "G1_weblink_stop.flag")
LOG_MAX = 1_000_000


def _G():
    import g1_cs_collector as G          # 수집기 본체 (불러오기만 — 창은 안 뜸)
    return G


def link_path():
    return os.path.join(_G().BASE, "v3link.json")


def load_link():
    try:
        return json.load(open(link_path(), encoding="utf-8"))
    except Exception:
        return {}


def save_link(d):
    tmp = link_path() + ".tmp"
    json.dump(d, open(tmp, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    os.replace(tmp, link_path())


def setup():
    G = _G()
    d = load_link()
    print("=== System V3 CS 관리 연결 설정 ===")
    url = input("웹앱 주소 (https://script.google.com/macros/s/.../exec): ").strip()
    if not (url.startswith(URL_RE) and url.endswith("/exec")):
        print("주소 모양이 다릅니다. 다시 실행해 주세요."); return False
    # 숨김 입력(getpass)은 창에 따라 붙여넣기가 안 되는 경우가 있어 보이는 입력으로 받음 (이 PC에만 암호화 저장)
    print("수집기 비밀번호 COLLECTOR_TOKEN 을 붙여넣고 Enter (마우스 오른쪽 클릭 또는 Ctrl+V)")
    tok = clean_token(input("COLLECTOR_TOKEN: "))
    if len(tok) < 8:
        print(f"비밀번호가 너무 짧습니다 (받은 글자 {len(tok)}자). 실행 로그의 COLLECTOR_TOKEN = 뒤의 값을 다시 붙여넣어 주세요."); return False
    os.system("cls" if os.name == "nt" else "clear")   # 입력한 비밀번호가 화면에 남지 않게
    d.update(endpoint=url, token_enc=G.enc_secret(tok))
    save_link(d)
    print("저장했습니다 (이 PC에만 암호화 저장).")
    return True


def clean_token(raw):
    """붙여넣은 값 정리: 앞뒤 공백·따옴표, 'COLLECTOR_TOKEN = ' 같은 머리말까지 붙여넣은 경우도 값만"""
    t = str(raw or "").strip().strip('"').strip("'").strip()
    if "=" in t:
        t = t.split("=")[-1].strip().strip('"').strip("'").strip()
    return "".join(t.split())


class Link:
    def __init__(self, endpoint, token, say=print):
        self.endpoint, self.token, self.say = endpoint, token, say

    def call(self, action, **body):
        import requests
        body.update(action=action, token=self.token)
        r = requests.post(self.endpoint, data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                          headers={"Content-Type": "text/plain;charset=utf-8"}, timeout=120)
        if r.status_code != 200:
            raise RuntimeError(f"시트 응답 HTTP {r.status_code}")
        js = r.json()
        if not js.get("ok"):
            raise RuntimeError(js.get("error") or "시트가 거절했습니다")
        return js


# ───────── 수집 결과 → 시트 ─────────
def result_files(out_dir):
    fs = glob.glob(os.path.join(out_dir, "수집_*.json")) + glob.glob(os.path.join(out_dir, "리뷰_*.json"))
    return sorted([f for f in fs if "_테스트_" not in os.path.basename(f)], key=os.path.getmtime)


def snapshots(path):
    """결과 파일 1개 → [(종류, rows, snapshot)] (문의·리뷰 따로)"""
    d = json.load(open(path, encoding="utf-8"))
    test = "테스트" in str(d.get("모드", ""))
    base = dict(collectedAt=d.get("수집시각", ""), days=d.get("기간(일)", 0), test=test, file=os.path.basename(path))
    out = []
    is_review_file = d.get("종류") == "리뷰" or os.path.basename(path).startswith("리뷰_")
    if not is_review_file:
        out.append(("문의", d.get("rows") or [], dict(base, kind="문의", vendors=d.get("업체결과") or {})))
    if d.get("리뷰결과") or d.get("리뷰"):
        out.append(("리뷰", d.get("리뷰") or [], dict(base, kind="리뷰", vendors=d.get("리뷰결과") or {})))
    return out


def push_new_files(link, out_dir, state, say=print):
    """아직 안 올린 결과 파일을 오래된 것부터 올림. 올린 파일은 state['pushed'] 에 기록"""
    first = "pushed" not in state
    pushed = state.setdefault("pushed", {})
    files = result_files(out_dir)
    if first:                               # 처음 켤 때는 최신 수집 1개·리뷰 1개만 올림 (예전 파일까지 AI 추천 돌리지 않게)
        keep = set()
        for prefix in ("수집_", "리뷰_"):
            same = [f for f in files if os.path.basename(f).startswith(prefix)]
            if same:
                keep.add(same[-1])
        for f in files:
            if f not in keep:
                pushed[os.path.basename(f)] = int(os.path.getmtime(f))
    n = 0
    for f in files:
        name = os.path.basename(f)
        mt = int(os.path.getmtime(f))
        if pushed.get(name) == mt:
            continue
        if time.time() - mt < 5:            # 아직 쓰는 중일 수 있음
            continue
        try:
            for kind, rows, snap in snapshots(f):
                for i in range(0, max(1, len(rows)), CHUNK):
                    part = rows[i:i + CHUNK]
                    last = i + CHUNK >= len(rows)
                    js = link.call("ingest", rows=part, snapshot=(snap if last else None))
                    say(f"  ↑ {name} {kind} {len(part)}건 올림 (새 {js.get('added', 0)} · 갱신 {js.get('updated', 0)} · 종료 {js.get('closed', 0)} · AI {js.get('suggested', 0)})")
            pushed[name] = mt
            n += 1
        except Exception as e:
            say(f"  ⚠ {name} 올리기 실패: {e}")
            break
    # 오래된 기록 정리 (최근 200개만)
    if len(pushed) > 200:
        for k in sorted(pushed, key=pushed.get)[:-200]:
            pushed.pop(k, None)
    return n


# ───────── 요청 실행 ─────────
def run_collect_job(job, cfg, say):
    G = _G()
    kind = job.get("kind")
    body = job.get("body") or {}
    c = dict(cfg)
    vendors = body.get("vendors") or []
    review = kind in ("reviews", "testReviews")
    if review:
        base = {**cfg.get("vendors", {}), **cfg.get("review_vendors", {})}
        if vendors:
            base = {v: (v in vendors) for v in base}
        c["review_vendors"] = base
        if body.get("reviewDays"):
            c["review_days"] = int(body["reviewDays"])
        if kind == "testReviews":
            c["test"] = True; c["test_limit"] = 3
        fn = G.run_reviews(c, say)
    else:
        if vendors:
            c["vendors"] = {v: (v in vendors) for v in G.DEFAULT_CFG["vendors"]}
        c["no_reviews"] = True              # 웹 [게시판 수집] = 게시판만 (수집기 게시판 탭과 같음)
        if kind == "test":
            c["test"] = True; c["test_limit"] = 3
        fn = G.run_collect(c, say)
    if not fn:
        return False, "수집기가 이미 수집 중이라 건너뜀", 0
    d = json.load(open(fn, encoding="utf-8"))
    rows = d.get("리뷰") if review else d.get("rows")
    res = d.get("리뷰결과") if review else d.get("업체결과")
    bad = [f"{v}: {x.get('상태')}" for v, x in (res or {}).items() if x.get("상태") not in ("ok", "미지원")]
    msg = f"{os.path.basename(fn)} · {len(rows or [])}건" + (f" · 확인 필요 {', '.join(bad)}" if bad else "")
    return True, msg, len(rows or [])


def ss_api(cfg, say):
    G = _G()
    try:
        if cfg.get("ss_client_id") and cfg.get("ss_secret_enc"):
            return G.SSApi(cfg["ss_client_id"], G.dec_secret(cfg["ss_secret_enc"]))
        if G.E1_DIR not in sys.path:
            sys.path.insert(0, G.E1_DIR)
        from api_common import Api
        return Api()
    except BaseException as e:
        say(f"⚠ 스마트스토어 API 연결 실패 — 등록하지 않습니다: {e!r}")
        return None


def run_register_job(job, cfg, say):
    import g1_register as RG
    items = (job.get("body") or {}).get("items") or []
    ans = os.path.join(os.path.dirname(cfg["out_dir"].rstrip("\\/")), "답변안", "승인")
    os.makedirs(ans, exist_ok=True)
    approved = os.path.join(ans, f"V3_등록요청_{job['id']}.json")
    json.dump({"요청": job["id"], "항목": items}, open(approved, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    its = [dict(no=str(i + 1), 업체=x["vendor"], 게시판=x["board"], id=str(x["id"]), 날짜=str(x.get("date", "")), 문안=x["text"]) for i, x in enumerate(items)]
    api = ss_api(cfg, say)
    results = []
    if api is None:
        for x in items:
            results.append(dict(key=x["key"], state="확인 필요", note="스마트스토어 API 연결 실패 — 등록 안 함"))
        return False, "스마트스토어 API 연결 실패", results
    rows = RG.preview(its, RG.load_results(approved), api)
    say(f"📤 등록 점검 {len(rows)}건: " + ", ".join(f"{r['id']}={r['판정']}" for r in rows))
    n_ok, n_bad = RG.register(approved, rows, api, say)
    done = RG.load_results(approved)
    for r in rows:
        got = done.get(r["key"]) or {}
        if got.get("상태") == "등록완료":
            results.append(dict(key=r["key"], state="등록완료", note=got.get("시각", "")))
        elif got.get("상태") == "확인 필요":
            results.append(dict(key=r["key"], state="확인 필요", note=str(got.get("응답", ""))[:200]))
        else:
            results.append(dict(key=r["key"], state="건너뜀", note=r.get("판정", "")))
    return True, f"등록 {n_ok}건 · 확인 필요 {n_bad}건 · 건너뜀 {len(rows) - n_ok - n_bad}건", results


# ───────── 잠금(RSA-OAEP) — 웹에서 비밀번호·API 키를 잠가 보내고 이 PC만 풂 ─────────
def _b64u(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _unb64u(t):
    t = str(t or "")
    return base64.urlsafe_b64decode(t + "=" * (-len(t) % 4))


def _is_prime(n, rounds=40):
    if n < 2:
        return False
    for p in (2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37):
        if n % p == 0:
            return n == p
    d, r = n - 1, 0
    while d % 2 == 0:
        d //= 2; r += 1
    for _ in range(rounds):
        x = pow(secrets.randbelow(n - 3) + 2, d, n)
        if x in (1, n - 1):
            continue
        for _ in range(r - 1):
            x = pow(x, 2, n)
            if x == n - 1:
                break
        else:
            return False
    return True


def _prime(bits, e):
    while True:
        c = secrets.randbits(bits) | (1 << (bits - 1)) | (1 << (bits - 2)) | 1
        if c % e != 1 and _is_prime(c):
            return c


def rsa_new(bits=2048, e=65537):
    while True:
        p, q = _prime(bits // 2, e), _prime(bits // 2, e)
        if p == q:
            continue
        n = p * q
        if n.bit_length() != bits:
            continue
        d = pow(e, -1, (p - 1) * (q - 1))
        return dict(n=n, e=e, d=d, p=p, q=q)


def _mgf1(seed, length):
    out = b""
    for i in range((length + 31) // 32):
        out += hashlib.sha256(seed + i.to_bytes(4, "big")).digest()
    return out[:length]


def rsa_decrypt(key, token):
    """RSA-OAEP(SHA-256, 라벨 없음) — 웹 브라우저 crypto.subtle 의 RSA-OAEP 와 같은 방식"""
    n, d, p, q = key["n"], key["d"], key["p"], key["q"]
    k = (n.bit_length() + 7) // 8
    c = int.from_bytes(_unb64u(token), "big")
    if len(_unb64u(token)) != k or c >= n:
        raise ValueError("잠긴 값 모양이 다릅니다")
    m1, m2 = pow(c, d % (p - 1), p), pow(c, d % (q - 1), q)      # CRT 로 빠르게
    m = m2 + q * ((pow(q, -1, p) * (m1 - m2)) % p)
    em = m.to_bytes(k, "big")
    h = 32
    if em[0] != 0:
        raise ValueError("풀기 실패")
    seed = bytes(a ^ b for a, b in zip(em[1:1 + h], _mgf1(em[1 + h:], h)))
    db = bytes(a ^ b for a, b in zip(em[1 + h:], _mgf1(seed, k - h - 1)))
    if db[:h] != hashlib.sha256(b"").digest():
        raise ValueError("풀기 실패")
    i = h
    while i < len(db) and db[i] == 0:
        i += 1
    if i >= len(db) or db[i] != 1:
        raise ValueError("풀기 실패")
    return db[i + 1:].decode("utf-8")


_RSA = {}


def rsa_key(d):
    """이 PC 의 잠금 키 (처음이면 만들어서 v3link.json 에 DPAPI 로 저장). d = load_link() 결과"""
    if _RSA.get("key"):
        return _RSA["key"]
    G = _G()
    if d.get("rsa_enc"):
        try:
            raw = json.loads(G.dec_secret(d["rsa_enc"]))
            _RSA["key"] = {k: int(v) for k, v in raw.items()}
            return _RSA["key"]
        except Exception:
            pass
    key = rsa_new()
    d["rsa_enc"] = G.enc_secret(json.dumps({k: str(v) for k, v in key.items()}))
    save_link(d)
    _RSA["key"] = key
    return key


def rsa_public(key):
    return _b64u(key["n"].to_bytes((key["n"].bit_length() + 7) // 8, "big"))


# ───────── 판매자센터 로그인 (수집기 [🔑 로그인] 과 같은 주소·판정) ─────────
LOGIN_URL = {
    "스마트스토어": "https://sell.smartstore.naver.com/#/review/search",
    "지그재그": "https://partners.kakaostyle.com/",
    "메이크샵": "https://www.makeshop.co.kr/newmakeshop/home/admin_link.html",
    "에이블리": "https://my.a-bly.com/inquiry",
}
LOGIN_WAIT_SEC = 180


def page_logged_in(pg):
    """로그인 화면이 아니면 True — 주소에 login/nid.naver 등이 없고 비밀번호 칸이 안 보일 때 (수집기와 같은 판정)"""
    try:
        if pg.is_closed():
            return True
        u = (pg.url or "").lower()
        if any(k in u for k in ("login", "nid.naver", "accounts.", "signin")) or u.startswith("about:"):
            return False
        pw = pg.locator("input[type=password]")
        return not any(pw.nth(i).is_visible() for i in range(min(pw.count(), 3)))
    except Exception:
        return False


def page_captcha(pg):
    try:
        txt = pg.locator("body").inner_text(timeout=2000)
        return ("자동입력 방지" in txt) or ("보안문자" in txt) or pg.locator("#captcha, img[alt*='캡차'], iframe[src*='captcha']").count() > 0
    except Exception:
        return False


def fill_login(pg, uid, pw):
    """아이디·비밀번호 칸에 사람처럼 한 글자씩 입력하고 [로그인]"""
    pg.wait_for_selector("input[type=password]", timeout=15000)
    ids = pg.locator("input#id, input[name=id], input[type=email], input[type=text]:not([readonly]), input:not([type])")
    box = None
    for i in range(min(ids.count(), 6)):
        if ids.nth(i).is_visible():
            box = ids.nth(i); break
    if box is None:
        raise RuntimeError("아이디 칸을 찾지 못했습니다")
    def typed(el, text):
        el.click(); el.fill("")
        try:
            el.press_sequentially(text, delay=60)
        except AttributeError:                  # 예전 playwright
            el.type(text, delay=60)
    typed(box, uid)
    typed(pg.locator("input[type=password]").first, pw)
    pg.wait_for_timeout(300)
    pg.locator("button:has-text('로그인'), button[type=submit], input[type=submit]").first.click(timeout=5000)


def saved_logins(d):
    return sorted((d.get("logins") or {}).keys())


def load_cred(d, vendor):
    try:
        return json.loads(_G().dec_secret(d["logins"][vendor]))
    except Exception:
        return None


def save_cred(d, vendor, uid, pw):
    d.setdefault("logins", {})[vendor] = _G().enc_secret(json.dumps({"id": uid, "pw": pw}, ensure_ascii=False))
    save_link(d)


def run_login_job(job, cfg, say, progress, d):
    G = _G()
    body = job.get("body") or {}
    vendors = [v for v in (body.get("vendors") or []) if v in LOGIN_URL]
    creds = {}
    for v, c in (body.get("creds") or {}).items():
        if isinstance(c, dict) and v in vendors:
            try:
                key = rsa_key(d)
                creds[v] = (rsa_decrypt(key, c["id"]), rsa_decrypt(key, c["pw"]))
            except Exception as e:
                say(f"⚠ {v} 잠긴 비밀번호를 풀지 못했습니다: {e}")
    if not vendors:
        return False, "로그인할 업체가 없습니다", {}
    if not G.RUN_LOCK.acquire(blocking=False):
        return False, "수집 중이라 로그인 창을 열 수 없습니다 — 끝난 뒤 다시", {}
    out = {}
    try:
        with G.Browser(show=True) as br:
            for v in vendors:
                progress(f"{v} 로그인 창 여는 중…")
                pg = br.page()
                try:
                    pg.goto(LOGIN_URL[v], wait_until="domcontentloaded", timeout=60000)
                    pg.wait_for_timeout(2500)
                    if page_logged_in(pg):
                        out[v] = dict(state="ok", note="이미 로그인됨"); say(f"🔑 {v}: 이미 로그인됨"); continue
                    given = creds.get(v)
                    use = given or (lambda c: (c["id"], c["pw"]) if c else None)(load_cred(d, v))
                    if use:
                        fill_login(pg, use[0], use[1]); how = "웹에서 받은 비밀번호" if given else "이 PC에 저장된 비밀번호"
                    else:
                        how = G.ably_autologin(pg)            # 브라우저가 채워 둔 경우 [로그인]만 누름
                    say(f"🔑 {v}: {how}")
                    if not use and "채워져 있지 않음" in str(how):
                        out[v] = dict(state="need_password", note="저장된 비밀번호 없음 — 웹에서 아이디·비밀번호를 한 번 넣어 주세요"); continue
                    t0, told = time.time(), False
                    while time.time() - t0 < LOGIN_WAIT_SEC:
                        pg.wait_for_timeout(2000)
                        if page_logged_in(pg):
                            break
                        if page_captcha(pg):
                            out[v] = dict(state="captcha", note="자동입력 방지 문자 — 수집기 PC 앞에서 입력 필요"); break
                        if not told and time.time() - t0 > 6:
                            progress(f"{v}: 휴대폰 2단계 인증이면 휴대폰에서 [확인]을 눌러 주세요 (최대 3분 기다림)"); told = True
                    if v in out:
                        continue
                    if page_logged_in(pg):
                        out[v] = dict(state="ok", note="로그인됨")
                        if given:
                            save_cred(d, v, given[0], given[1]); out[v]["note"] = "로그인됨 · 비밀번호를 이 PC에 저장"
                    else:
                        out[v] = dict(state="fail", note="3분 안에 로그인되지 않음 — 아이디·비밀번호 또는 2단계 인증 확인")
                except Exception as e:
                    out[v] = dict(state="fail", note=f"오류: {str(e)[:150]}")
                finally:
                    say(f"🔑 {v}: {out.get(v, {}).get('note', '')}")
                    try:
                        pg.close()
                    except Exception:
                        pass
    finally:
        G.RUN_LOCK.release()
    ok_all = all(x["state"] == "ok" for x in out.values())
    if ok_all:
        c = G.load_cfg(); c["login_ok"] = True; G.save_cfg(c)
    label = {"ok": "✓", "captcha": "PC 앞 입력 필요", "need_password": "비밀번호 필요", "fail": "실패"}
    msg = " · ".join(f"{v} {label.get(x['state'], x['state'])}" for v, x in out.items())
    return ok_all, msg, {"login": out}


# ───────── 설정·자동 수집·API·IP·파일 ─────────
SETTING_KEYS = ("days", "review_days", "zz_slug", "show_browser", "auto_on", "auto_start", "interval")


def run_settings_job(job, say):
    G = _G()
    new = (job.get("body") or {}).get("settings") or {}
    c = G.load_cfg()
    changed = []
    for k in SETTING_KEYS:
        if k in new and c.get(k) != new[k]:
            c[k] = new[k]; changed.append(k)
    for k in ("vendors", "review_vendors"):
        if isinstance(new.get(k), dict):
            merged = {**(c.get(k) or {}), **{v: bool(on) for v, on in new[k].items() if v in (c.get(k) or {})}}
            if merged != c.get(k):
                c[k] = merged; changed.append(k)
    if changed:
        G.save_cfg(c)
    _SETUP_CACHE["info"] = None
    names = {"days": "수집 기간", "review_days": "리뷰 기간", "zz_slug": "지그재그 주소명", "show_browser": "브라우저 보이기", "auto_on": "자동 수집",
             "auto_start": "자동 시작 시각", "interval": "간격", "vendors": "게시판 업체", "review_vendors": "리뷰 업체"}
    return True, ("저장: " + ", ".join(names.get(k, k) for k in changed)) if changed else "바뀐 설정 없음", {"settings": {k: c.get(k) for k in SETTING_KEYS}}


def next_auto(cfg, now=None):
    if not cfg.get("auto_on"):
        return None
    try:
        return _G().next_run(now or datetime.datetime.now(), cfg.get("auto_start") or "09:30", int(cfg.get("interval") or 60))
    except Exception:
        return None


def smartstore_check(cfg):
    G = _G()
    d = datetime.date.today()
    params = dict(page=1, size=1, fromDate=d.strftime("%Y-%m-%dT00:00:00.000+09:00"), toDate=d.strftime("%Y-%m-%dT23:59:59.999+09:00"))
    if cfg.get("ss_client_id") and cfg.get("ss_secret_enc"):
        s = G.SmartStore(cfg["ss_client_id"], G.dec_secret(cfg["ss_secret_enc"])); s.token()
        s.get("/v1/contents/qnas", **params)
        return "수집기 API 키"
    g = G.legacy_getter()
    if not g:
        raise RuntimeError(G.LEGACY_ERR.get("msg") or "API 키 없음")
    g("/v1/contents/qnas", **params)
    return "E_1 API 설정"


def public_ip():
    import requests
    return requests.get("https://api.ipify.org", timeout=10).text.strip()


def run_api_test(cfg):
    try:
        src = smartstore_check(cfg)
        return True, f"✅ 연결 성공 ({src}) — 이 PC에서 스마트스토어 문의 조회가 됩니다", {"api": {"ok": True, "source": src}}
    except Exception as e:
        hint = " — 이 PC 공인 IP가 커머스API센터에 등록됐는지 확인" if "403" in str(e) or "IP" in str(e).upper() else ""
        return False, f"❌ 실패: {str(e)[:200]}{hint}", {"api": {"ok": False}}


def run_api_key_job(job, cfg, say, d):
    G = _G()
    body = job.get("body") or {}
    key = rsa_key(d)
    cid, sec = rsa_decrypt(key, body["clientId"]).strip(), rsa_decrypt(key, body["secret"]).strip()
    if not cid or not sec:
        return False, "Client ID·Secret 이 비어 있습니다", {}
    c = G.load_cfg(); c["ss_client_id"] = cid; c["ss_secret_enc"] = G.enc_secret(sec); G.save_cfg(c)
    _SETUP_CACHE["info"] = None
    ok, msg, data = run_api_test(c)
    return ok, "API 키 저장 · " + msg, data


def run_files_job(cfg):
    out_dir = cfg.get("out_dir") or ""
    fs = []
    for pat in ("수집_*.json", "리뷰_*.json", "*.xlsx", "*.csv"):
        fs += glob.glob(os.path.join(out_dir, pat))
    fs = sorted(set(fs), key=os.path.getmtime, reverse=True)[:40]
    files = [dict(name=os.path.basename(f), size=os.path.getsize(f), at=f"{datetime.datetime.fromtimestamp(os.path.getmtime(f)):%Y-%m-%d %H:%M}") for f in fs]
    return True, f"{out_dir} · 최근 {len(files)}개", {"files": files, "dir": out_dir}


def handle(link, job, cfg, say, d=None):
    say(f"▶ 요청 {job['id']} ({job['kind']}) 시작")
    results, count, data = [], 0, {}
    d = d if d is not None else load_link()

    def progress(msg):
        say(f"  … {msg}")
        try:
            link.call("progress", id=job["id"], message=msg)
        except Exception:
            pass
    try:
        kind = job["kind"]
        if kind == "register":
            ok, msg, results = run_register_job(job, cfg, say)
        elif kind == "login":
            ok, msg, data = run_login_job(job, cfg, say, progress, d)
            if ok and (job.get("body") or {}).get("collectAfter"):
                progress("로그인 완료 — 바로 수집합니다")
                ok2, msg2, count = run_collect_job({"kind": "collect", "body": {"vendors": (job.get("body") or {}).get("vendors") or []}}, _G().load_cfg(), say)
                msg += f" · 수집: {msg2}"
        elif kind == "settings":
            ok, msg, data = run_settings_job(job, say)
        elif kind == "apiTest":
            ok, msg, data = run_api_test(cfg)
        elif kind == "apiKey":
            ok, msg, data = run_api_key_job(job, cfg, say, d)
        elif kind == "ip":
            ip = public_ip(); ok, msg, data = True, f"이 PC 공인 IP: {ip} — 커머스API센터 > 애플리케이션 > API 호출 IP 에 추가", {"ip": ip}
        elif kind == "files":
            ok, msg, data = run_files_job(cfg)
        else:
            ok, msg, count = run_collect_job(job, cfg, say)
    except Exception as e:
        ok, msg = False, f"오류: {e}"
        say(traceback.format_exc())
    link.call("finish", id=job["id"], ok=ok, message=msg, results=results, count=count, data=data)
    say(f"■ 요청 {job['id']} {'완료' if ok else '실패'} — {msg}")


def run_auto(link, cfg, say, pc):
    """자동 수집 (수집기 창의 [자동 수집 켜기] 대신 — 이 프로그램이 시각에 맞춰 직접)"""
    vendors = [v for v, on in (cfg.get("vendors") or {}).items() if on]
    js = link.call("selfJob", kind="auto", vendors=vendors, pc=pc)
    job = js.get("job") or {}
    say(f"⏰ 자동 수집 시작 ({job.get('id', '')})")
    count = 0
    try:
        fn = _G().run_collect(dict(cfg), say)
        if not fn:
            ok, msg = False, "이미 수집 중이라 건너뜀"
        else:
            dd = json.load(open(fn, encoding="utf-8"))
            count = len(dd.get("rows") or []) + len(dd.get("리뷰") or [])
            bad = [f"{v}: {x.get('상태')}" for v, x in {**(dd.get('업체결과') or {}), **(dd.get('리뷰결과') or {})}.items() if x.get("상태") not in ("ok", "미지원")]
            ok, msg = True, f"{os.path.basename(fn)} · {count}건" + (f" · 확인 필요 {', '.join(bad)}" if bad else "")
    except Exception as e:
        ok, msg = False, f"오류: {e}"
        say(traceback.format_exc())
    link.call("finish", id=job.get("id", ""), ok=ok, message=msg, count=count)
    say(f"■ 자동 수집 {'완료' if ok else '실패'} — {msg}")


# ───────── 처음 설정 상태 (웹 [설정] 탭 안내창의 ✅/⬜ 용) ─────────
STARTUP_VBS = os.path.join(os.environ.get("APPDATA") or "", "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "G1웹연결_백그라운드.vbs")
_SETUP_CACHE = {"at": 0, "info": None, "lnk": None}


def setup_info(cfg, bg=False, d=None, nxt=None):
    """수집기 PC 준비 상태 요약 (비밀값은 보내지 않음 — 있다/없다만). 1분에 한 번만 다시 계산"""
    extra = dict(bg=bool(bg), auto_on=bool(cfg.get("auto_on")), next_auto=(f"{nxt:%m-%d %H:%M}" if nxt else ""),
                 saved_logins=saved_logins(d or {}), pub_key=(rsa_public(_RSA["key"]) if _RSA.get("key") else ""))
    if _SETUP_CACHE["info"] is not None and time.time() - _SETUP_CACHE["at"] < 60:
        return dict(_SETUP_CACHE["info"], **extra)
    G = _G()
    parts, icon = None, None
    try:
        import g1_setup as SU
        parts = not SU.missing_parts() and SU.has_pw_browser()
        if _SETUP_CACHE["lnk"] is None:
            _SETUP_CACHE["lnk"] = SU.desktop_lnk()
        icon = os.path.exists(_SETUP_CACHE["lnk"])
    except Exception:
        pass
    api = "own" if (cfg.get("ss_client_id") and cfg.get("ss_secret_enc")) else (
        "e1" if os.path.exists(os.path.join(getattr(G, "E1_DIR", ""), "api_common.py")) else "")
    info = dict(
        dir=HERE, out_dir=str(cfg.get("out_dir") or "")[:160], days=int(cfg.get("days") or 0),
        review_days=int(cfg.get("review_days") or 0), zz_slug=str(cfg.get("zz_slug") or "")[:40],
        show_browser=bool(cfg.get("show_browser")), auto_start=str(cfg.get("auto_start") or ""), interval=int(cfg.get("interval") or 0),
        vendors=[v for v, on in (cfg.get("vendors") or {}).items() if on],
        review_vendors=[v for v, on in (cfg.get("review_vendors") or {}).items() if on],
        login_ok=bool(cfg.get("login_ok")), api=api, claude=bool(cfg.get("claude_key")),
        parts=parts, icon=icon, autostart=os.path.exists(STARTUP_VBS), collector=str(G.VER), link=LINK_VER,
    )
    _SETUP_CACHE.update(at=time.time(), info=info)
    return dict(info, **extra)


# ───────── 상태 신호 (트레이 아이콘용) ─────────
def beat_path():
    return os.path.join(_G().BASE, "v3link_beat.json")


def pid_path():
    return os.path.join(_G().BASE, "v3link.pid")


def log_file():
    return os.path.join(_G().BASE, "v3link_log.txt")


class Beat:
    """상태(idle 대기 · busy 요청 실행 중 · error 시트 연결 안 됨/설정 필요 · off 꺼짐)를 파일로 남김.
    요청 실행이 몇 분 걸려도 신호가 끊기지 않게 별도 스레드가 10초마다 다시 적음"""

    def __init__(self, path=None):
        self.path = path or beat_path()
        self.info = dict(state="idle", note="", job="", ver=LINK_VER, pc=socket.gethostname(), dir=HERE, pid=os.getpid())
        self.lock = threading.Lock()
        self._stop = threading.Event()

    def set(self, state, note="", job=""):
        with self.lock:
            self.info.update(state=state, note=str(note)[:120], job=job)
        self.write()

    def write(self):
        with self.lock:
            d = dict(self.info, ts=time.time(), time=f"{datetime.datetime.now():%H:%M:%S}")
        try:
            tmp = self.path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump(d, f, ensure_ascii=False)
            os.replace(tmp, self.path)
        except Exception:
            pass

    def start(self):
        def run():
            while not self._stop.wait(BEAT_SEC):
                self.write()
        threading.Thread(target=run, daemon=True).start()
        return self

    def stop(self, note="종료"):
        self._stop.set()
        self.set("off", note)


def stop_requested():
    return os.path.exists(STOP_FLAG)


def wait_or_stop(sec):
    """sec 초 기다림. 중지 표시(G1_weblink_stop.flag)가 생기면 바로 True"""
    end = time.time() + sec
    while time.time() < end:
        if stop_requested():
            return True
        time.sleep(1)
    return stop_requested()


def to_log_file():
    """창 없이 돌 때 print 를 기록 파일로 (1MB 넘으면 _old 로 넘김)"""
    p = log_file()
    try:
        if os.path.exists(p) and os.path.getsize(p) > LOG_MAX:
            os.replace(p, p.replace(".txt", "_old.txt"))
    except Exception:
        pass
    f = open(p, "a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stderr = f
    return f


def single_instance():
    """한 PC에서 연결 프로그램은 하나만 (두 개면 수집이 겹침)"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47851))
        return s
    except OSError:
        return None


def main_loop(once=False, bg=False):
    G = _G()
    guard = single_instance()
    if guard is None:
        if bg:                                  # 감시 루프가 30초마다 다시 띄우므로 기록을 남기지 않고 조용히 끝냄
            return
        print("이미 이 PC에서 연결 프로그램이 실행 중입니다 (창 없이 도는 중일 수 있음 — 시계 옆 트레이 아이콘 확인). 이 창은 닫아도 됩니다."); return
    say = lambda m: print(f"{datetime.datetime.now():%m-%d %H:%M:%S} {m}", flush=True)
    beat = Beat().start()
    try:
        with open(pid_path(), "w") as f:
            f.write(str(os.getpid()))
    except Exception:
        pass
    try:
        _loop(G, say, beat, once, bg)
    except BaseException as e:
        say(f"⚠ 연결 프로그램 종료: {e!r}")
        if not isinstance(e, (KeyboardInterrupt, SystemExit)):
            say(traceback.format_exc())
        raise
    finally:
        beat.stop("중지됨" if stop_requested() else "종료")
        try:
            os.remove(pid_path())
        except Exception:
            pass


def _loop(G, say, beat, once, bg):
    d = load_link()
    while not d.get("endpoint") or not d.get("token_enc"):
        if not bg:
            if not setup():
                return
        else:                                   # 창이 없으니 입력을 받을 수 없음 → 상태만 알리고 기다림
            beat.set("error", "처음 설정 필요 — ▶G1수집기_5_웹연결.bat 을 한 번 실행하세요")
            say("처음 설정이 없습니다 — ▶G1수집기_5_웹연결.bat 을 한 번 실행하세요. 60초마다 다시 확인합니다.")
            if wait_or_stop(60):
                return
        d = load_link()
    link = Link(d["endpoint"], G.dec_secret(d["token_enc"]))
    pc = socket.gethostname()
    try:
        rsa_key(d)                              # 처음이면 잠금 키 만들기 (몇 초)
    except Exception as e:
        say(f"⚠ 잠금 키를 만들지 못했습니다 (웹 비밀번호 입력만 안 됨): {e}")
    say(f"System V3 연결 시작 — {pc} · 연결 {LINK_VER} · 수집기 {G.VER}" + (" · 창 없이(백그라운드)" if bg else ""))
    if not bg:
        say("이 창을 켜 두면 웹(System V3 > CS 관리)의 수집·등록 요청을 이 PC에서 실행합니다. 끄려면 창을 닫으세요.")
    if stop_requested() and not bg:
        try:
            os.remove(STOP_FLAG)                # 창으로 직접 켠 경우: 예전 중지 표시는 지우고 시작
        except Exception:
            pass
    fails = 0
    nxt = None
    while True:
        if stop_requested():
            say("중지 요청(G1_weblink_stop.flag) — 끝냅니다")
            return
        cfg = G.load_cfg()
        try:
            want = next_auto(cfg)
            if not want:
                nxt = None
            elif nxt is None or want < nxt or not cfg.get("auto_on"):
                nxt = want
            if nxt and datetime.datetime.now() >= nxt:
                nxt = next_auto(cfg, datetime.datetime.now() + datetime.timedelta(seconds=61))
                beat.set("busy", "자동", "자동 수집")
                try:
                    run_auto(link, cfg, say, pc)
                finally:
                    beat.set("idle", "웹 요청 기다리는 중")
            push_new_files(link, cfg["out_dir"], d, say)
            save_link(d)
            js = link.call("poll", pc=pc, version=f"{G.VER} / 연결 {LINK_VER}{' · 창 없이' if bg else ''}", busy=False,
                           setup=setup_info(cfg, bg, d, nxt))
            if fails:
                say("✓ 시트 연결 다시 됨")
            fails = 0
            beat.set("idle", "웹 요청 기다리는 중")
            job = js.get("job")
            if job:
                beat.set("busy", job.get("id", ""), JOB_LABEL.get(job.get("kind"), job.get("kind", "")))
                try:
                    handle(link, job, cfg, say, d)
                    if job.get("kind") in ("settings", "apiKey"):
                        nxt = None                      # 자동 수집 시각 다시 계산
                finally:
                    beat.set("idle", "웹 요청 기다리는 중")
                push_new_files(link, cfg["out_dir"], d, say)
                save_link(d)
        except Exception as e:
            fails += 1
            beat.set("error", f"시트 연결 안 됨: {e}")
            if fails == 1 or fails % 20 == 0:   # 같은 오류로 기록이 넘치지 않게
                say(f"⚠ {e}")
        if once:
            return
        if wait_or_stop(POLL_SEC):
            say("중지 요청(G1_weblink_stop.flag) — 끝냅니다")
            return


JOB_LABEL = {"collect": "게시판 수집", "test": "테스트 수집", "reviews": "리뷰 수집", "testReviews": "리뷰 테스트", "register": "📤 등록",
             "login": "🔑 로그인", "settings": "설정 저장", "apiTest": "API 테스트", "apiKey": "API 키 저장", "ip": "공인 IP", "files": "파일 목록"}


if __name__ == "__main__":
    BG = "--bg" in sys.argv or sys.stdout is None      # pythonw 로 켜지면 창이 없음
    if BG:
        to_log_file()
    if "--setup" in sys.argv:
        setup()
    else:
        main_loop(once="--once" in sys.argv, bg=BG)

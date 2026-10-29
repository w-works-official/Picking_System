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

처음 한 번: ▶G1수집기_5_웹연결.bat 실행 → 웹앱 주소와 수집기 비밀번호(COLLECTOR_TOKEN) 입력 (이 PC에만 암호화 저장)
"""
import os, sys, json, time, glob, socket, datetime, traceback, getpass

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

LINK_VER = "1.0 (2026-10-29)"
POLL_SEC = 15
CHUNK = 150
URL_RE = "https://script.google.com/macros/s/"


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
    tok = getpass.getpass("수집기 비밀번호 COLLECTOR_TOKEN (입력해도 화면에 안 보입니다): ").strip()
    if len(tok) < 8:
        print("비밀번호가 너무 짧습니다."); return False
    d.update(endpoint=url, token_enc=G.enc_secret(tok))
    save_link(d)
    print("저장했습니다 (이 PC에만 암호화 저장).")
    return True


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


def handle(link, job, cfg, say):
    say(f"▶ 요청 {job['id']} ({job['kind']}) 시작")
    results, count = [], 0
    try:
        if job["kind"] == "register":
            ok, msg, results = run_register_job(job, cfg, say)
        else:
            ok, msg, count = run_collect_job(job, cfg, say)
    except Exception as e:
        ok, msg = False, f"오류: {e}"
        say(traceback.format_exc())
    link.call("finish", id=job["id"], ok=ok, message=msg, results=results, count=count)
    say(f"■ 요청 {job['id']} {'완료' if ok else '실패'} — {msg}")


def single_instance():
    """한 PC에서 연결 프로그램은 하나만 (두 개면 수집이 겹침)"""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        s.bind(("127.0.0.1", 47851))
        return s
    except OSError:
        return None


def main_loop(once=False):
    G = _G()
    guard = single_instance()
    if guard is None:
        print("이미 이 PC에서 연결 프로그램이 실행 중입니다. 이 창은 닫아도 됩니다."); return
    d = load_link()
    if not d.get("endpoint") or not d.get("token_enc"):
        if not setup():
            return
        d = load_link()
    link = Link(d["endpoint"], G.dec_secret(d["token_enc"]))
    pc = socket.gethostname()
    say = lambda m: print(f"{datetime.datetime.now():%H:%M:%S} {m}", flush=True)
    say(f"System V3 연결 시작 — {pc} · 연결 {LINK_VER} · 수집기 {G.VER}")
    say("이 창을 켜 두면 웹(System V3 > CS 관리)의 수집·등록 요청을 이 PC에서 실행합니다. 끄려면 창을 닫으세요.")
    while True:
        cfg = G.load_cfg()
        try:
            push_new_files(link, cfg["out_dir"], d, say)
            save_link(d)
            js = link.call("poll", pc=pc, version=f"{G.VER} / 연결 {LINK_VER}", busy=False)
            job = js.get("job")
            if job:
                handle(link, job, cfg, say)
                push_new_files(link, cfg["out_dir"], d, say)
                save_link(d)
        except Exception as e:
            say(f"⚠ {e}")
        if once:
            return
        time.sleep(POLL_SEC)


if __name__ == "__main__":
    if "--setup" in sys.argv:
        setup()
    else:
        main_loop(once="--once" in sys.argv)

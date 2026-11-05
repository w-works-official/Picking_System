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

웹연결 업데이트 (1.4, 2026-10-29) — V3 [설정] 탭 [웹연결 업데이트]
  · 저장소(w-works-official/Picking_System)의 정해진 커밋 파일만 받음 → 해시 확인 → 문법 확인 → 지금 파일은 _patch 폴더에 백업
    → 같은 자리에서 바꿔 씀(드라이브 이름 겹침 (1) 안 생김) → 이 프로그램 종료 → 감시 루프가 30초 뒤 새 버전으로 다시 켬

메이크샵 부운영자 로그인 (1.5, 2026-11-02)
  · 웹 로그인 창에서 [부운영자로 로그인] + 상점 URL 을 넣으면 아이디가 "부운영자|상점URL|아이디" 모양으로 잠겨 옴
  · 메이크샵 로그인 화면의 [부운영자] 탭을 누르고 상점 URL · 부운영자 아이디 · 비밀번호 3칸을 채워 로그인
  · 운영자(대표) 계정과 다른 계정이라 동시 로그인으로 서로 튕기지 않음

리뷰 수집 보강 · 직접 로그인 (1.6, 2026-11-03)
  · 지그재그는 창 없이 연 브라우저의 리뷰 조회를 거절(invalid_access) → [브라우저 보이기] 를 꺼 두어도 리뷰는 화면 밖에 띄운 창에서 조회
  · 지그재그 리뷰는 화면 기본(최근 1주일) 대신 설정의 리뷰 기간으로 다시 조회
  · 스마트스토어 리뷰도 같은 방식(숨김이면 화면 밖 창). 커머스 API 에는 리뷰가 없어 판매자센터 로그인 필요
  · 🔑 로그인 — 스마트스토어는 직접 로그인: 아무것도 자동으로 채우지 않고 창을 띄워 5분 기다림 (퀴즈·2단계 인증은 사람이)

스마트스토어 = 일반 크롬 창으로 로그인 (1.7, 2026-11-04)
  · 1.6 의 직접 로그인 창도 자동화 브라우저라 네이버가 퀴즈·2단계 인증을 막음 (11/3·11/4 두 번 실패)
  · 자동화가 아닌 일반 크롬을 수집기 프로필(browser_profile)로 띄움 → 사람이 평소처럼 로그인 → 창을 닫으면
    수집기가 숨김 브라우저로 판매자센터를 열어 로그인 확인. 예전에 저장해 둔 네이버 쿠키(cookies.enc)는 지워서 새 로그인을 덮지 않게
  · PC에 크롬이 없으면 1.6 방식(자동화 창에서 직접)으로

로그인 = 자동 한 번 → 막히면 사람 → 되면 자동으로 닫기 (1.8, 2026-11-04 대표님 지시)
  · 1.7 은 창을 닫은 뒤에 확인 → 네이버 세션 쿠키(로그인 상태 유지 안 함)가 창과 함께 사라져 "확인 안 됨" (15:11)
  · 스마트스토어: 일반 크롬(네이버 전용 프로필 native_profile)을 원격 연결(CDP)로 띄움 — 자동화 표시 없음
    저장된 아이디·비번(또는 크롬 자동완성)으로 한 번 로그인 시도 → 40초 안에 안 되면 창 그대로 사람에게 →
    로그인되는 순간 쿠키(세션 포함)를 native_cookies.enc 에 보관하고 창을 자동으로 닫음
  · 스마트스토어 리뷰 수집도 같은 일반 크롬(화면 밖)으로 — 보관한 쿠키를 넣어서
  · 다른 업체(자동화 창): 30초 안에 안 되거나 자동입력 방지 문자가 나오면 "직접 로그인" 안내, 최대 5분 기다림, 되면 창 닫힘
  · 1.8.1: 기다리는 동안 time.sleep 대신 창의 wait_for_timeout — sleep 중엔 주소 바뀜 소식을 못 받아
    판매자센터에 들어가도 로그인을 못 알아챘음 (11/4 15:23). 빈 탭 없이 처음부터 로그인 주소 탭 하나로 엶

1.9 (2026-11-04)
  · 스마트스토어 리뷰: 화면 기본 1주일 대신 리뷰 기간(30일) 전체 — 화면이 보낸 검색 요청(reviews/search)을 날짜만 바꿔 쪽마다 다시 조회
    (11/4 첫 수집은 1주일치 150건만 — 11/1~11/4)
  · 요청 빨리 가져가기: 시트 v8 이 "누가 CS 화면을 보고 있음(hot)"을 알려 주면 3초마다 요청 확인 (평소 15초 그대로)
  · 로그인 뒤 [게시판 + 리뷰 수집] 체크 = 로그인 → 게시판 → 리뷰 차례로

1.10 (2026-11-05) 메신저 창 도우미
  · 웹 💬 메신저 탭 슬롯에 카톡 대화창을 끌어 가까이 놓으면 슬롯에 딱 맞춰 붙임 + '항상 위'(브라우저 뒤로 안 숨음)
  · 웹 [📐 일괄 정렬] = 열린 대화창을 슬롯에 같은 크기로 한 번에 / [📌 놓아주기] = 항상 위 풀기
  · 127.0.0.1:47811 에서만 받고 System V3 화면에서 온 요청만 따름. 카톡 창 위치·크기만 바꿈 (Windows 에서만, 실패해도 연결은 그대로)
  · 1.10.1: 네이트온 대화창도 붙임 (NateOn.exe — 친구 목록 본 창은 제외)

1.11 (2026-11-05) 메신저 보내기
  · 웹 슬롯 [↵ 보내기]·Enter = 붙은 대화창에 붙여넣기(Ctrl+V) + Enter, 커서는 System V3 입력칸으로 되돌림
  · 네이트온: 프로그램 이름이 nateon 으로 시작하면 모두 (NateOnMain.exe 등), 도구 창 모양이어도 붙임
  · 진단 GET /msn/windows: 카톡·네이트온 프로그램 창 목록 (이 PC 화면에만)

1.12 (2026-11-05) 메신저 AI 추천
  · POST /msn/capture: 슬롯에 붙은 대화창이 보이는 자리를 그림(PNG)으로 → 웹 [🤖 추천]이 시트 v9(msnSuggest)로 AI 답장 후보를 받음
  · 슬롯 최대 10칸 (위 5 · 아래 5)

1.13 (2026-11-05) 메신저 빈 슬롯 알림
  · /msn/ping · /msn/slots 응답에 used = 대화창이 붙어 있는 슬롯 번호 → 웹은 빈 슬롯의 ★ 주목 표시를 저절로 끔

1.14 (2026-11-05) 메이크샵 리뷰 답글 + 적립금
  · 웹 ⭐ 리뷰 [📤 등록] (시트 v10) → 메이크샵 파워리뷰 관리 화면에서 답글 등록(CommentProc INSERT) → 적립금 지급
  · 적립금 = 파워리뷰 목록의 (상품 실구매 금액) × 시트 설정 % → 10원 미만 버림 · 사유 = 시트 설정 ([PRODUCT_NAME] = 상품명)
  · 등록 직전 다시 조회: 이미 답글 있으면 건너뜀(적립금도 안 줌) · 회원 아님(네이버페이)·이미 적립됨·실구매 0원이면 답글만
  · 적립금은 사람이 누르는 [적립금] 창(reserve_money.html)을 화면 밖 작은 틀에 열어 같은 순서로 채우고 [지급] → 다시 조회해 지급됨 확인

1.15 (2026-11-05) 거래처 메신저
  · 슬롯 묶음 2개: 메신저 답변(reply) · 거래처 메신저(vendor). 슬롯 최대 30칸
  · 다른 탭으로 바꾸면 그 탭 슬롯의 대화창은 내려두고(최소화), 돌아오면 다시 붙임
  · [📐 일괄 붙이기] = 창 제목에 슬롯 메모 이름이 들어 있으면 그 슬롯에 (예: 메모 '헤세드' ↔ 창 '0-헤세드 >아트'), 남은 창은 메모 없는 빈 슬롯에
"""
import os, sys, json, time, glob, socket, datetime, traceback, threading, base64, hashlib, secrets, re, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

LINK_VER = "1.15 (2026-11-05)"
POLL_SEC = 15
HOT_POLL_SEC = 3          # 1.9: CS 화면이 열려 있으면(시트 v8 이 hot 으로 알려 줌) 3초마다 — 요청한 창이 빨리 뜨게
CHUNK = 150
URL_RE = "https://script.google.com/macros/s/"
BEAT_SEC = 10
STOP_FLAG = os.path.join(os.environ.get("TEMP") or os.environ.get("TMP") or HERE, "G1_weblink_stop.flag")
LOG_MAX = 1_000_000


def _G():
    import g1_cs_collector as G          # 수집기 본체 (불러오기만 — 창은 안 뜸)
    if not getattr(G, "_v3_review_patch", False):
        patch_review_collectors(G)
    return G


# ───────── 리뷰 수집 보강 (1.6, 2026-11-03) — 수집기 파일은 그대로 두고 이 프로그램 안에서만 바꿔 끼움 ─────────
# 지그재그는 창 없이(헤드리스) 연 브라우저의 리뷰 조회를 "잘못된 접근(invalid_access)" 으로 거절함
#   (11/3 확인: 같은 계정·같은 요청이 [브라우저 보이기] 에서는 18건, 숨김에서는 거절)
# → 브라우저가 숨김이면 리뷰만 '화면 밖에 띄운 창'(보이지 않는 위치)에서 엶. 로그인은 수집기 프로필의 쿠키를 복사해 씀
# → 지그재그 리뷰 화면 기본값(최근 1주일) 대신 설정의 리뷰 기간(review_days)으로 다시 조회 (화면이 보낸 요청 그대로, 날짜만 바꿈)
OFFSCREEN_ARGS = ["--window-position=-32000,-32000", "--window-size=1400,1000"]
ZZ_REVIEW_MAX = 2000

ZZ_REVIEW_FETCH_JS = r"""
async ({url, body, gte, lt, lim, maxn}) => {
  const b = JSON.parse(body); const v = b.variables || {};
  v.input = Object.assign({}, v.input || {}, {date_created_gte: gte, date_created_lt: lt});
  const out = {rows: [], total: 0, errors: []}; let skip = 0;
  while (true) {
    v.pagination = Object.assign({}, v.pagination || {}, {skip_count: skip, limit_count: lim});
    let t = '', j = null;
    try {
      const r = await fetch(url, {method: 'POST', credentials: 'include', headers: {'accept': 'application/json', 'content-type': 'application/json'}, body: JSON.stringify(Object.assign({}, b, {variables: v}))});
      t = await r.text(); try { j = JSON.parse(t); } catch (e) {}
    } catch (e) { out.errors.push(String(e).slice(0, 300)); break; }
    const L = j && j.data && j.data.internal_product_review_list;
    if (!L) { out.errors.push(t.slice(0, 300)); break; }
    const items = L.item_list || [];
    out.total = L.total_count; out.rows.push(...items); skip += items.length;
    if (!items.length || skip >= L.total_count || skip >= maxn) break;
  }
  return out;
}
"""


class OffscreenBrowser:
    """수집기 Browser 와 같은 모양(.page() · .ctx · .show) — 창은 띄우되 화면 밖에 둠. 쿠키는 수집기 프로필에서 복사, 끝나면 되돌려 넣음"""
    def __init__(self, br):
        self.br, self.show, self.b, self.ctx = br, True, None, None

    def __enter__(self):
        kw = dict(headless=False, args=OFFSCREEN_ARGS)
        try:
            self.b = self.br.pw.chromium.launch(channel="chrome", **kw)      # PC에 설치된 크롬
        except Exception:
            self.b = self.br.pw.chromium.launch(**kw)                        # 없으면 내장 크로미움
        self.ctx = self.b.new_context(viewport={"width": 1400, "height": 1000})
        ck = self.br.ctx.cookies()
        try:
            self.ctx.add_cookies(ck)
        except Exception:
            for c in ck:
                try:
                    self.ctx.add_cookies([c])
                except Exception:
                    pass
        return self

    def page(self):
        return self.ctx.new_page()

    def __exit__(self, *a):
        try:                                   # 로그인 세션이 새로 고쳐졌으면 수집기 프로필에도 반영
            ck = [c for c in self.ctx.cookies() if any(k in (c.get("domain") or "") for k in ("kakaostyle", "naver.com"))]
            if ck:
                self.br.ctx.add_cookies(ck)
        except Exception:
            pass
        try:
            self.b.close()
        except Exception:
            pass


def zz_review_rows(G, items, test=False, limit=3):
    if not test:
        items = [v for v in items if not v.get("reply_list")]
    else:
        items = items[:int(limit)]
    rows = []
    for v in items:
        pp = v.get("purchased_product") or {}
        attrs = ", ".join(f"{a.get('name')}:{a.get('value')}" for a in ((pp.get("item") or {}).get("attributes") or []))
        pid = str(v.get("product_id") or "")
        rows.append(dict(업체="지그재그", 게시판="리뷰", id=str(v.get("id")), 날짜=G.kst(v.get("date_created")), 상품명=pp.get("name", ""), 옵션=attrs,
                         상품ID=pid, 상품링크=(f"https://zigzag.kr/catalog/products/{pid}" if pid else ""), 상품이미지=pp.get("main_image_url", ""),
                         별점=v.get("rating"), 내용=v.get("contents") or "", 주문상품번호=v.get("order_item_number") or "",
                         답글=" / ".join(x.get("contents", "") for x in (v.get("reply_list") or [])), 답글여부=bool(v.get("reply_list")),
                         사진URL=[x.get("original_url") or x.get("thumbnail_url") for x in (v.get("image_list") or []) if x.get("original_url") or x.get("thumbnail_url")],
                         영상URL=[x.get("url") for x in (v.get("video_list") or []) if x.get("url")]))
    return rows


def zz_reviews_core(G, br, cfg, now_ms=None):
    """지그재그 리뷰 화면을 열어 화면이 보내는 리뷰 조회 요청을 잡고, 같은 요청을 리뷰 기간으로 다시 보냄"""
    days = int(cfg.get("review_days", 30) or 30)
    pg = br.page()
    cap, got = {}, []

    def on_req(req):
        try:
            if req.method == "POST" and "GetProductReviewList" in req.url and "Counts" not in req.url and not cap:
                cap["url"] = req.url; cap["body"] = req.post_data
        except Exception:
            pass

    def on_resp(resp):
        try:
            if resp.request.method == "POST" and "GetProductReviewList" in resp.url and "Counts" not in resp.url:
                got.append(resp.json())
        except Exception:
            pass
    pg.on("request", on_req)
    pg.on("response", on_resp)
    try:
        pg.goto(f"https://partners.kakaostyle.com/shop/{cfg['zz_slug']}/product_review", wait_until="domcontentloaded", timeout=60000)
        for _ in range(30):
            if cap or "login" in (pg.url or ""):
                break
            pg.wait_for_timeout(500)
        if "login" in (pg.url or ""):
            return "로그인 필요", [], pg.url
        if not cap:
            return "오류", [], "리뷰 화면의 조회 요청을 찾지 못함"
        for _ in range(20):                    # 화면 자체의 첫 응답 기다림 (최대 10초)
            if got:
                break
            pg.wait_for_timeout(500)
        now_ms = int(now_ms if now_ms is not None else time.time() * 1000)
        try:
            res = pg.evaluate(ZZ_REVIEW_FETCH_JS, {"url": cap["url"], "body": cap["body"], "gte": now_ms - days * 86400000, "lt": now_ms, "lim": 50, "maxn": ZZ_REVIEW_MAX})
        except Exception as e:
            res = {"rows": [], "total": "", "errors": [f"{e}"[:300]]}
        items, note = list(res.get("rows") or []), f"최근 {days}일 전체 {res.get('total', '')}건"
        if res.get("errors") and not items:
            for js in got:                     # 다시 조회가 안 되면 화면이 받은 것(기본 1주일)이라도
                try:
                    items += js["data"]["internal_product_review_list"].get("item_list") or []
                except Exception:
                    pass
            if not items:
                err = str(res["errors"][0])
                for js in got:
                    for e in (js.get("errors") or [])[:1]:
                        err = f"{(e.get('extensions') or {}).get('code', '')} {e.get('message', '')}".strip()
                dbg = getattr(G, "_dbg", None)
                if dbg:
                    dbg(cfg, "지그재그_리뷰_요청", {"url": cap.get("url"), "오류": err, "창": "보임" if getattr(br, "show", False) else "숨김"})
                return "오류", [], "리뷰 조회 거절: " + err[:200]
            note = "기간 지정 조회 실패 → 화면 기본(최근 1주일)만"
        return "ok", zz_review_rows(G, items, bool(cfg.get("test")), cfg.get("test_limit", 3)), note
    finally:
        try:
            pg.close()
        except Exception:
            pass


def run_offscreen(br, fn):
    """숨김 브라우저면 화면 밖 창에서 fn(브라우저) 실행, 이미 보이는 브라우저면 그대로"""
    if getattr(br, "show", False) or not hasattr(br, "pw"):
        return fn(br)
    with OffscreenBrowser(br) as b2:
        return fn(b2)


# ───────── 스마트스토어 리뷰 30일치 (1.9, 2026-11-04) ─────────
# 판매자센터 리뷰 화면은 처음에 "1주일" 로 POST /api/v3/contents/reviews/search 를 보냄 (fromDate·toDate·page·size=500)
# → 화면이 보낸 요청을 그대로, 날짜만 리뷰 기간(review_days)으로 바꾸고 다음 쪽까지 다시 조회
SS_REVIEW_URL = "https://sell.smartstore.naver.com/#/review/search"
SS_REVIEW_SEARCH = "/api/v3/contents/reviews/search"
SS_REVIEW_MAX_PAGES = 20
SS_HEADER_SKIP = ("cookie", "host", "content-length", "origin", "referer", "user-agent", "accept-encoding", "connection")

SS_REVIEW_FETCH_JS = r"""
async ({url, body, headers, from, to, size, maxPages}) => {
  const b = JSON.parse(body || '{}'); const out = {rows: [], errors: [], pages: 0}; const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const q = Object.assign({}, b, {fromDate: from, toDate: to, page: page, size: size});
    let t = '', j = null, ok = false;
    try {
      const r = await fetch(url, {method: 'POST', credentials: 'include', headers: headers, body: JSON.stringify(q)});
      t = await r.text(); ok = r.ok; try { j = JSON.parse(t); } catch (e) {}
    } catch (e) { out.errors.push(String(e).slice(0, 200)); break; }
    const list = j && (Array.isArray(j.contents) ? j.contents : (j.data && Array.isArray(j.data.contents) ? j.data.contents : null));
    if (!ok || !list) { out.errors.push(t.slice(0, 200)); break; }
    let fresh = 0;
    for (const x of list) { const k = String(x && x.id); if (!seen.has(k)) { seen.add(k); out.rows.push(x); fresh += 1; } }
    out.pages = page + 1;
    if (list.length < size || !fresh) break;
  }
  return out;
}
"""


def ss_dates(days, now=None):
    """판매자센터 리뷰 검색 날짜 (한국 시간, 화면과 같은 모양)"""
    kst = datetime.timezone(datetime.timedelta(hours=9))
    now = now or datetime.datetime.now(kst)
    start = now - datetime.timedelta(days=int(days))
    return start.strftime("%Y-%m-%dT00:00:00.000+09:00"), now.strftime("%Y-%m-%dT23:59:59.999+09:00")


def ss_review_rows(G, items, cfg):
    """판매자센터 리뷰 → 수집기 리뷰 줄 (수집기 collect_reviews_smartstore 와 같은 칸)"""
    test = bool(cfg.get("test"))
    cutoff = (datetime.datetime.now() - datetime.timedelta(days=int(cfg.get("review_days", 30) or 30))).strftime("%Y-%m-%d")
    img_urls = getattr(G, "_img_urls", lambda d: [])
    rows, seen = [], set()
    for it in items:
        rid = str(it.get("id") or it.get("reviewId") or it.get("reviewNo") or "")
        if not rid or rid in seen:
            continue
        seen.add(rid)
        txt = it.get("reviewContent") or it.get("content") or it.get("contents") or ""
        reply = it.get("reviewComment") or it.get("commentContent") or it.get("replyContent") or it.get("sellerComment") or ""
        if isinstance(reply, dict):
            reply = reply.get("commentContent") or reply.get("content") or ""
        dt = G.kst(it.get("createDate") or it.get("reviewCreatedDate") or it.get("createdDate") or it.get("registerDate") or "")
        if it.get("hasComment"):
            reply = reply or "있음"
        if not test and (reply or (dt and dt[:10] < cutoff)):
            continue
        pid = str(it.get("productNo") or it.get("channelProductNo") or it.get("productId") or "")
        imgs = [x.get("attachUrl") or x.get("imageUrl") or x.get("url") for x in (it.get("reviewAttaches") or it.get("attaches") or it.get("images") or []) if isinstance(x, dict)]
        rows.append(dict(업체="스마트스토어", 게시판="리뷰", id=rid, 날짜=dt, 상품명=it.get("productName") or it.get("productNm") or "", 상품ID=pid,
                         상품링크=(f"https://smartstore.naver.com/main/products/{pid}" if pid else ""), 옵션=it.get("productOptionContent") or it.get("optionContent") or "",
                         별점=it.get("reviewScore") or it.get("score") or it.get("rating") or "", 내용=txt, 답글=reply, 답글여부=bool(reply),
                         작성자=it.get("maskedWriterId") or "", 주문번호=it.get("productOrderNo") or "",
                         사진URL=list(dict.fromkeys([u for u in imgs if u])) or list(dict.fromkeys(img_urls({k: v for k, v in it.items() if "image" in k.lower() or "attach" in k.lower()})))))
        if test and len(rows) >= int(cfg.get("test_limit", 3)):
            break
    return rows


def ss_reviews_core(G, br, cfg, now=None):
    """스마트스토어 리뷰: 판매자센터 리뷰 화면을 열어 화면이 보내는 검색 요청을 잡고, 같은 요청을 리뷰 기간으로 쪽마다 다시 보냄"""
    days = int(cfg.get("review_days", 30) or 30)
    pg = br.page()
    cap, got = {}, []

    def on_req(req):
        try:
            if req.method == "POST" and SS_REVIEW_SEARCH in req.url and not cap:
                cap["url"], cap["body"] = req.url, req.post_data
                cap["headers"] = {k: v for k, v in (req.headers or {}).items()
                                  if k.lower() not in SS_HEADER_SKIP and not k.lower().startswith("sec-") and not k.startswith(":")}
        except Exception:
            pass

    def on_resp(resp):
        try:
            if resp.request.method == "POST" and SS_REVIEW_SEARCH in resp.url:
                got.append(resp.json())
        except Exception:
            pass
    pg.on("request", on_req)
    pg.on("response", on_resp)
    try:
        pg.goto(cfg.get("ss_review_url") or SS_REVIEW_URL, wait_until="domcontentloaded", timeout=60000)
        for _ in range(20):
            if cap or "nid.naver.com" in (pg.url or ""):
                break
            pg.wait_for_timeout(500)
        if not cap and "nid.naver.com" not in (pg.url or ""):      # 목록이 저절로 안 뜨면 [검색] 눌러 보기 (수집기와 같음)
            for fr in pg.frames:
                try:
                    b = fr.locator("button:has-text('검색')").first
                    if b.count():
                        b.click(timeout=3000)
                        break
                except Exception:
                    pass
            for _ in range(20):
                if cap:
                    break
                pg.wait_for_timeout(500)
        if "nid.naver.com" in (pg.url or "") or ("login" in (pg.url or "") and not cap):
            return "로그인 필요", [], "판매자센터 로그인 필요 — [🔑 직접 로그인]"
        if not cap:
            dbg = getattr(G, "_dbg", None)
            if dbg:
                dbg(cfg, "스마트스토어_리뷰_요청", {"주소": pg.url, "창": "보임" if getattr(br, "show", False) else "숨김"})
            return "오류", [], "리뷰 화면의 검색 요청을 찾지 못함"
        f, t = ss_dates(days, now)
        try:
            body = json.loads(cap.get("body") or "{}")
        except Exception:
            body = {}
        size = int(body.get("size") or 500)
        try:
            res = pg.evaluate(SS_REVIEW_FETCH_JS, {"url": cap["url"], "body": cap.get("body") or "{}",
                                                    "headers": cap.get("headers") or {"content-type": "application/json"},
                                                    "from": f, "to": t, "size": size, "maxPages": SS_REVIEW_MAX_PAGES})
        except Exception as e:
            res = {"rows": [], "errors": [f"{e}"[:200]], "pages": 0}
        items = list(res.get("rows") or [])
        note = f"최근 {days}일 {len(items)}건 ({res.get('pages', 0)}쪽)"
        if res.get("errors") and not items:
            for js in got:                           # 다시 조회가 안 되면 화면이 받은 것(기본 1주일)이라도
                try:
                    items += (js.get("contents") or (js.get("data") or {}).get("contents") or [])
                except Exception:
                    pass
            if not items:
                return "오류", [], "리뷰 다시 조회 실패: " + str(res["errors"][0])[:200]
            note = "기간 지정 조회 실패 → 화면 기본(최근 1주일)만"
        return "ok", ss_review_rows(G, items, cfg), note
    finally:
        try:
            pg.close()
        except Exception:
            pass


def patch_review_collectors(G):
    G._v3_review_patch = True
    orig_ss = getattr(G, "collect_reviews_smartstore", None)
    if getattr(G, "collect_reviews_zigzag", None) and hasattr(G, "kst"):
        def collect_reviews_zigzag(br, cfg):
            try:
                return run_offscreen(br, lambda b: zz_reviews_core(G, b, cfg))
            except Exception as e:
                return "오류", [], f"지그재그 리뷰 창 실행 실패: {e}"[:300]
        G._v3_orig_zz_reviews = G.collect_reviews_zigzag
        G.collect_reviews_zigzag = collect_reviews_zigzag
    if orig_ss:
        def collect_reviews_smartstore(br, cfg):   # 1.8: 일반 크롬(네이버 전용 프로필, 화면 밖) · 1.9: 리뷰 기간(30일) 전체
            try:
                if find_chrome() and hasattr(br, "pw"):
                    with NativeChrome(G, pw=br.pw, offscreen=True) as nb:
                        return ss_reviews_core(G, nb, cfg)
                return run_offscreen(br, lambda b: ss_reviews_core(G, b, cfg))
            except Exception as e:
                return "오류", [], f"스마트스토어 리뷰 창 실행 실패: {e}"[:300]
        G._v3_orig_ss_reviews = orig_ss
        G.collect_reviews_smartstore = collect_reviews_smartstore


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


def run_register_job(job, cfg, say, d=None):
    items = (job.get("body") or {}).get("items") or []
    ms = [x for x in items if x.get("vendor") == "메이크샵" and x.get("board") == "리뷰"]
    rest = [x for x in items if not (x.get("vendor") == "메이크샵" and x.get("board") == "리뷰")]
    if not ms:
        return run_ss_register(job, rest, cfg, say)
    ok1, msg1, res1 = run_ms_review_register(ms, cfg, say, d)
    if not rest:
        return ok1, msg1, res1
    ok2, msg2, res2 = run_ss_register(job, rest, cfg, say)
    return ok1 and ok2, f"메이크샵 리뷰: {msg1} / 스마트스토어: {msg2}", res1 + res2


def run_ss_register(job, items, cfg, say):
    import g1_register as RG
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


# ───────── 메이크샵 파워리뷰 답글 + 적립금 (1.14) ─────────
MS_REVIEW_PATH = "/makeshop/newmanager/power_review_list.html"
MS_REVIEW_HNAME = "핑크로켓"               # 답글 작성자 이름 (설정 ms_review_hname 로 바꿀 수 있음, 한글 5자)
MS_POINT_MAX_PCT = 30


def ms_point_amount(price, pct, unit=10):
    """실구매금액 × pct % → unit 원 미만 버림 (웹 csPointAmount 와 같은 정수 계산)"""
    won = int(re.sub(r"[^0-9]", "", str(price or "")) or 0)
    try:
        p10 = int(round(float(pct or 0) * 10))
    except (TypeError, ValueError):
        p10 = 0
    if won <= 0 or p10 <= 0 or p10 > MS_POINT_MAX_PCT * 10:
        return 0
    unit = max(1, int(unit or 1))
    return (won * p10 // 1000) // unit * unit


def ms_admin_hosts(pg, cfg, d=None):
    """메이크샵 관리자 주소 후보: 설정 ms_admin_host → 부운영자 상점 URL → 브라우저 쿠키의 *.makeshop.co.kr"""
    out = []
    def add(h):
        h = re.sub(r"^https?://", "", str(h or "").strip()).split("/")[0].strip()
        if h and h not in out:
            out.append(h)
    add(cfg.get("ms_admin_host"))
    try:
        c = load_cred(d, "메이크샵") if d is not None else None
        sub = parse_sub(c["id"]) if c else None
        if sub:
            add(sub[0])
    except Exception:
        pass
    try:
        for ck in pg.context.cookies():
            dom = str(ck.get("domain") or "").lstrip(".")
            if dom.endswith("makeshop.co.kr") and dom.split(".")[0] not in ("www", "help", "makeshop", "image", "img"):
                add(dom)
    except Exception:
        pass
    return out


MS_READY_JS = "() => !!document.querySelector('#search_form') && typeof window.jQuery === 'function'"

# 리뷰 목록(관리자 화면이 부르는 GetRevewList)을 날짜 범위만 넓혀 쪽마다 조회 → 찾는 num1 만
MS_FIND_JS = r"""async (a) => {
  const $f = jQuery('#search_form');
  const set = (n, v) => { const el = $f.find('[name="' + n + '"]'); if (el.length) el.val(v); };
  const ymd = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const months = Number($f.find('[name="power_review_search_max_num"]').val()) || 3;
  const days = Math.min(a.days, months * 30 - 1);
  set('date_start', ymd(Date.now() - days * 86400000)); set('date_end', ymd(Date.now()));
  const lims = $f.find('[name="list_limit"] option').map((i, o) => Number(o.value) || 0).get();
  const lim = lims.length ? Math.max(...lims) : 30;
  if (lims.length) set('list_limit', String(lim));
  set('action_type', 'GetRevewList');
  const want = new Set(a.nums.map(String)), out = {};
  let pages = 0, seen = 0;
  for (let p = 1; p <= a.maxPages && Object.keys(out).length < want.size; p++) {
    set('page', String(p));
    const j = await jQuery.ajax({ url: 'power_review_list.action.html', type: 'POST', data: $f.serialize(), dataType: 'json' });
    if (!j || j.status === false) return { error: String((j && j.msg) || '목록 조회 실패'), out };
    const list = Array.isArray(j.data) ? j.data : [];
    pages = p; seen += list.length;
    for (const it of list) {
      const k = String(it.num1);
      if (!want.has(k) || out[k]) continue;
      out[k] = { num1: k, num2: String(it.num2 || '00000'), code: String(it.code || ''), member: String(it.id || ''), brandname: String(it.brandname2 || ''),
                 branduid: String(it.brand_uid || ''), price: String(it.sell_price || '0'), reserved: String(it.reserve_check || '0'), reserveDate: String(it.reserve_date || ''),
                 comments: Number(it.comment) || 0, commentText: JSON.stringify(it.comment_list || []).slice(0, 6000) };
    }
    if (list.length < lim) break;
  }
  return { out, pages, seen, days };
}"""

MS_COMMENT_JS = r"""async (a) => {
  const r = await jQuery.ajax({ url: 'power_review_list.action.html', type: 'POST', dataType: 'json',
    data: { action_type: 'CommentProc', comment_type: 'INSERT', board_code: a.code, num1: a.num1, num2: '00000', uid: '', comment: a.text, hname: a.hname, power_review: '' } });
  return { ok: !!(r && r.status === true), msg: String((r && r.msg) || '') };
}"""

# 사람이 [적립금] 을 누를 때와 같은 순서: reserve 양식 → reserve_money.html(작은 창 대신 화면 밖 틀) → 지급(+)·금액·사유 → send()
MS_RESERVE_JS = r"""async (a) => {
  const wait = (fr, ms) => new Promise((res) => { const t = setTimeout(() => res(false), ms); fr.addEventListener('load', () => { clearTimeout(t); res(true); }, { once: true }); });
  let fr = document.querySelector('iframe[name="v3reserve"]');
  if (!fr) { fr = document.createElement('iframe'); fr.name = 'v3reserve'; fr.style.cssText = 'position:absolute;left:-9999px;top:0;width:520px;height:320px'; document.body.appendChild(fr); }
  const f = document.forms.namedItem('reserve');
  if (!f) return { ok: false, step: 'form', msg: '관리자 화면에 적립금 양식(reserve)이 없습니다' };
  const put = (form, n, v) => { const el = form.elements.namedItem(n); if (el) el.value = v; };
  put(f, 'id', a.member); put(f, 'type', 'board'); put(f, 'num1', a.num1); put(f, 'num2', a.num2); put(f, 'brandname', a.brandname); put(f, 'branduid', a.branduid); put(f, 'date', a.num1);
  if (a.code) put(f, 'code', a.code);
  const oldTarget = f.target, oldAction = f.getAttribute('action');
  f.target = 'v3reserve'; f.action = 'reserve_money.html';
  let w = wait(fr, 20000); f.submit();
  f.target = oldTarget || ''; if (oldAction !== null) f.setAttribute('action', oldAction);
  if (!(await w)) return { ok: false, step: 'open', msg: '적립금 창이 열리지 않음' };
  const doc = fr.contentDocument, g = doc && (doc.forms.namedItem('form1') || [...doc.forms].find((x) => x.elements.namedItem('reserve')));
  const text = () => ((fr.contentDocument && fr.contentDocument.body && fr.contentDocument.body.textContent) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!g) return { ok: false, step: 'open', msg: '적립금 창을 읽지 못함: ' + text() };
  const gb = g.elements.namedItem('gubun');
  if (gb) gb.value = '+';
  put(g, 'reserve', String(a.amount)); put(g, 'content', a.msg);
  if (typeof fr.contentWindow.send !== 'function') return { ok: false, step: 'open', msg: '적립금 창의 [지급] 기능을 찾지 못함' };
  w = wait(fr, 20000); fr.contentWindow.send();
  const done = await w;
  return { ok: done, step: 'send', msg: text() };
}"""


def ms_open_review_page(pg, cfg, say, d=None):
    tried = []
    for host in ms_admin_hosts(pg, cfg, d):
        try:
            pg.goto(f"https://{host}{MS_REVIEW_PATH}", wait_until="domcontentloaded", timeout=60000)
            pg.wait_for_timeout(2500)
            if pg.evaluate(MS_READY_JS):
                return host
        except Exception as e:
            say(f"  메이크샵 {host}: {str(e)[:120]}")
        tried.append(host)
    say(f"⚠ 메이크샵 파워리뷰 관리 화면을 열지 못함 (시도: {', '.join(tried) or '주소 후보 없음'}) — 로그인 확인")
    return None


def ms_find(pg, nums, cfg):
    days = max(30, int(cfg.get("review_days") or 30) + 30)
    r = pg.evaluate(MS_FIND_JS, {"nums": [str(n) for n in nums], "days": days, "maxPages": 40}) or {}
    if r.get("error"):
        raise RuntimeError(r["error"])
    return r.get("out") or {}


def ms_review_one(pg, x, it, point, cfg, say, dialogs):
    """한 건: 답글 → (조건 맞으면) 적립금. 돌려주는 값 = (state, note)"""
    num = str(x.get("id") or "")
    if not it:
        return "확인 필요", "파워리뷰 목록에서 이 리뷰를 찾지 못함 (기간 밖·삭제?) — 등록 안 함"
    if it.get("comments", 0) > 0:
        return "건너뜀", "이미 답글 있음 — 덮어쓰지 않음 (적립금도 안 줌)"
    hname = str(cfg.get("ms_review_hname") or MS_REVIEW_HNAME)[:5]
    text = str(x.get("text") or "").strip()
    if not text:
        return "건너뜀", "답글 문안 없음"
    dialogs.clear()
    r = pg.evaluate(MS_COMMENT_JS, {"code": it["code"], "num1": num, "text": text, "hname": hname}) or {}
    if not r.get("ok"):
        return "확인 필요", f"답글 등록 실패: {r.get('msg') or '응답 없음'}"
    after = (ms_find(pg, [num], cfg) or {}).get(num) or {}
    if after.get("comments", 0) <= 0:
        return "확인 필요", f"답글 등록 응답은 성공({r.get('msg', '')}) — 다시 조회에서 안 보임"
    note = "답글 ✓"
    pct = float((point or {}).get("pct") or 0)
    unit = int((point or {}).get("unit") or 10)
    amount = ms_point_amount(it.get("price"), pct, unit)
    if pct <= 0:
        return "등록완료", note
    if not it.get("member"):
        return "등록완료", note + " · 적립금 없음(쇼핑몰 회원 아님 — 네이버페이 등)"
    if str(it.get("reserved")) == "1":
        return "등록완료", note + " · 적립금 이미 지급됨"
    if amount <= 0:
        return "등록완료", note + f" · 적립금 0원 (실구매 {it.get('price')}원 × {pct}%)"
    msg = str((point or {}).get("msg") or "[PRODUCT_NAME] 리뷰 적립금")
    dialogs.clear()
    rr = pg.evaluate(MS_RESERVE_JS, {"member": it["member"], "num1": num, "num2": it["num2"], "brandname": it["brandname"], "branduid": it["branduid"],
                                     "code": it["code"], "amount": amount, "msg": msg}) or {}
    said = " / ".join(dialogs)[:150]
    chk = (ms_find(pg, [num], cfg) or {}).get(num) or {}
    if str(chk.get("reserved")) == "1":
        return "등록완료", note + f" · 적립금 {amount:,}원 ✓ (실구매 {it.get('price')}원 × {pct}%)"
    return "확인 필요", note + f" · 적립금 {amount:,}원 확인 안 됨 — 관리자 화면에서 확인 ({rr.get('step', '')}: {rr.get('msg', '')[:80]}{' · ' + said if said else ''})"


def run_ms_review_register(items, cfg, say, d=None):
    G = _G()
    point = (items[0].get("point") if items else None) or {"pct": 0}
    if not G.RUN_LOCK.acquire(blocking=False):
        return False, "수집 중이라 지금 못 함 — 끝난 뒤 다시", [dict(key=x["key"], state="건너뜀", note="수집 중이라 못 함 — 다시 요청") for x in items]
    results = []
    try:
        with G.Browser(bool(cfg.get("show_browser"))) as br:
            pg = br.page()
            dialogs = []
            def on_dialog(dg):
                try:
                    dialogs.append(str(dg.message or "")[:120])
                    dg.accept()
                except Exception:
                    pass
            try:
                pg.on("dialog", on_dialog)
            except Exception:
                pass
            host = ms_open_review_page(pg, cfg, say, d)
            if not host:
                return False, "메이크샵 관리자 화면 접근 안 됨 (로그인 필요)", [dict(key=x["key"], state="확인 필요", note="메이크샵 관리자 화면 접근 안 됨 — 로그인 후 다시") for x in items]
            say(f"📤 메이크샵 리뷰 {len(items)}건 · 적립금 {point.get('pct', 0)}% ({host})")
            found = ms_find(pg, [x.get("id") for x in items], cfg)
            for x in items:
                try:
                    state, note = ms_review_one(pg, x, found.get(str(x.get("id"))), point, cfg, say, dialogs)
                except Exception as e:
                    state, note = "확인 필요", f"오류: {str(e)[:150]}"
                say(f"  {x.get('id')}: {state} — {note}")
                results.append(dict(key=x["key"], state=state, note=note))
    finally:
        G.RUN_LOCK.release()
    n = {k: sum(1 for r in results if r["state"] == k) for k in ("등록완료", "확인 필요", "건너뜀")}
    return True, f"등록 {n['등록완료']}건 · 확인 필요 {n['확인 필요']}건 · 건너뜀 {n['건너뜀']}건", results


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
LOGIN_WAIT_SEC = 300                     # 1.8: 3분 → 5분 (자동이 막히면 사람이 이어서 로그인할 시간)
LOGIN_MANUAL_SEC = 300                  # 직접 로그인: 사람이 수집기 PC 앞에서 아이디·비밀번호·퀴즈·2단계 인증까지 (1.6)
MANUAL_LOGIN = ("스마트스토어",)         # 네이버는 자동 입력하면 퀴즈(자동입력 방지)·2단계 인증에서 막힘 → 항상 직접 로그인
NATIVE_LOGIN = ("스마트스토어",)         # 1.7: 자동화 창이 아니라 일반 크롬 창으로 (네이버가 자동화 창을 막음)
NATIVE_AUTO_SEC = 40                     # 1.8: 자동 로그인을 이만큼 기다려 보고 안 되면 사람에게 넘김 (창은 그대로)
HUMAN_HINT_SEC = 30                      # 자동화 창 업체도 이만큼 안 되면 "사람이 직접" 안내


def find_chrome():
    """PC에 설치된 크롬 실행 파일 (없으면 None)"""
    cands = []
    for env in ("PROGRAMFILES", "PROGRAMFILES(X86)", "LOCALAPPDATA"):
        base = os.environ.get(env)
        if base:
            cands.append(os.path.join(base, "Google", "Chrome", "Application", "chrome.exe"))
    for c in cands:
        if os.path.isfile(c):
            return c
    return shutil.which("chrome") or shutil.which("google-chrome")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def native_profile(G):
    return os.path.join(G.BASE, "native_profile")          # 네이버 전용 일반 크롬 프로필 (수집기 자동화 프로필과 따로)


def native_cookie_path(G):
    return os.path.join(G.BASE, "native_cookies.enc")      # 창을 닫으면 사라지는 네이버 세션 쿠키 보관 (DPAPI)


def load_native_cookies(G):
    try:
        return json.loads(G.dec_secret(open(native_cookie_path(G), encoding="utf-8").read()))
    except Exception:
        return []


def save_native_cookies(G, cookies):
    ck = [c for c in (cookies or []) if "naver.com" in str(c.get("domain") or "")]
    if not ck:
        return 0
    try:
        os.makedirs(G.BASE, exist_ok=True)
        open(native_cookie_path(G), "w", encoding="utf-8").write(G.enc_secret(json.dumps(ck, ensure_ascii=False)))
    except Exception:
        return 0
    return len(ck)


class NativeChrome:
    """자동화 표시 없는 일반 크롬(네이버 전용 프로필)을 띄우고 원격 연결(CDP)로 읽음 (1.8)
       .page() · .ctx · .show 는 수집기 Browser 와 같은 모양. 끝나면 쿠키 보관 + 창 닫기"""
    def __init__(self, G, pw=None, offscreen=False, chrome=None, popen=None, connect_wait=15, start_url=None):
        self.G, self.pw, self.offscreen, self.show, self.start_url = G, pw, offscreen, True, start_url
        self.chrome, self.popen, self.connect_wait = chrome or find_chrome(), popen, connect_wait
        self.proc = self.browser = self.ctx = self._spw = None

    def __enter__(self):
        import subprocess
        if not self.chrome:
            raise RuntimeError("이 PC에서 크롬을 찾지 못했습니다")
        port = free_port()
        args = [self.chrome, f"--user-data-dir={native_profile(self.G)}", f"--remote-debugging-port={port}",
                "--no-first-run", "--no-default-browser-check"] + (OFFSCREEN_ARGS if self.offscreen else []) + [self.start_url or "about:blank"]
        self.proc = (self.popen or subprocess.Popen)(args)
        if self.pw is None:
            from playwright.sync_api import sync_playwright
            self._spw = sync_playwright().start()
            self.pw = self._spw
        t0, err = time.time(), None
        while time.time() - t0 < self.connect_wait:
            try:
                self.browser = self.pw.chromium.connect_over_cdp(f"http://127.0.0.1:{port}")
                break
            except Exception as e:
                err = e
                time.sleep(0.5)
        if self.browser is None:
            self._close()
            raise RuntimeError(f"크롬 창에 연결하지 못함 — 네이버용 크롬 창이 이미 열려 있으면 닫고 다시 ({str(err)[:80]})")
        self.ctx = self.browser.contexts[0] if self.browser.contexts else self.browser.new_context()
        ck = load_native_cookies(self.G)
        if ck:
            try:
                self.ctx.add_cookies(ck)
            except Exception:
                for c in ck:
                    try:
                        self.ctx.add_cookies([c])
                    except Exception:
                        pass
        return self

    def page(self):
        return self.ctx.new_page()

    def keep_cookies(self):
        try:
            return save_native_cookies(self.G, self.ctx.cookies())
        except Exception:
            return 0

    def _close(self):
        try:
            if self.browser is not None:
                try:
                    self.browser.new_browser_cdp_session().send("Browser.close")    # 일반 크롬 창 닫기
                except Exception:
                    pass
                self.browser.close()
        except Exception:
            pass
        try:
            if self.proc is not None:
                self.proc.wait(timeout=5)
        except Exception:
            try:
                self.proc.terminate()
            except Exception:
                pass
        try:
            if self._spw is not None:
                self._spw.stop()
        except Exception:
            pass

    def __exit__(self, *a):
        if self.ctx is not None:
            self.keep_cookies()
        self._close()
        return False


def logged_in_somewhere(nb, v):
    """그 창의 탭 중 하나라도 판매자센터에 로그인된 화면이면 True"""
    host = LOGIN_URL[v].split("/")[2]
    try:
        pages = list(nb.ctx.pages)
    except Exception:
        return False
    for p in pages:
        try:
            if host in (p.url or "") and page_logged_in(p):
                return True
        except Exception:
            continue
    return False


def pump_wait(br, sec):
    """기다리는 동안 Playwright 가 창 소식(주소 바뀜 등)을 받도록 — time.sleep 은 소식을 안 받아 주소가 옛날 그대로 보임 (1.8.1)"""
    try:
        pages = [p for p in br.ctx.pages if not p.is_closed()]
    except Exception:
        pages = []
    for p in pages:
        try:
            p.wait_for_timeout(int(sec * 1000))
            return
        except Exception:
            continue
    time.sleep(sec)


def native_login(G, v, progress, say, creds=None, d=None, wait_sec=None, auto_sec=None, nb=None, sleep=None):
    """스마트스토어 로그인 (1.8): 일반 크롬 창 → 자동으로 한 번 시도(저장된 아이디·비번 또는 크롬 자동완성 + Enter)
       → 막히면 창을 그대로 두고 사람이 로그인 → 로그인되는 순간 쿠키 보관하고 창을 자동으로 닫음.
       돌려줌: 결과 dict, 또는 None(크롬이 없어 이 방식을 못 씀)"""
    if nb is None and not find_chrome():
        return None
    wait_sec = LOGIN_MANUAL_SEC if wait_sec is None else wait_sec
    auto_sec = NATIVE_AUTO_SEC if auto_sec is None else auto_sec
    mins = max(1, round(wait_sec / 60))
    given = (creds or {}).get(v)
    with (nb or NativeChrome(G, start_url=LOGIN_URL[v])) as br:
        if sleep is None:
            sleep = lambda sec: pump_wait(br, sec)
        opened = [p for p in br.ctx.pages if LOGIN_URL[v].split("#")[0] in (p.url or "")]
        if opened:                                     # 처음부터 로그인 주소로 연 탭 하나만 씀 — 빈 탭이 하나 더 뜨지 않게 (1.8.1)
            pg = opened[0]
        else:
            pg = br.page()
            pg.goto(LOGIN_URL[v], wait_until="domcontentloaded", timeout=60000)
        pg.wait_for_timeout(1500)
        if logged_in_somewhere(br, v):
            br.keep_cookies()
            return dict(state="ok", note="이미 로그인됨")
        progress(f"{v}: 자동 로그인 한 번 시도 중… (막히면 그 창에서 직접 로그인하시면 됩니다)")
        use = given or (lambda c: (c["id"], c["pw"]) if c else None)(load_cred(d, v) if d is not None else None)
        try:
            how = (fill_login(pg, use[0], use[1]) or "아이디·비밀번호 입력 후 로그인") if use else autologin_saved(pg)
        except Exception as e:
            how = f"자동 입력 못 함 ({str(e)[:60]})"
        say(f"🔑 {v}: {how}")
        t0, auto = time.time(), True
        while time.time() - t0 < auto_sec and not logged_in_somewhere(br, v):
            sleep(2)
        if not logged_in_somewhere(br, v):
            auto = False
            try:
                pg.bring_to_front()
            except Exception:
                pass
            progress(f"{v}: 자동 로그인이 막혔습니다 — 수집기 PC에 열린 크롬 창에서 직접 로그인해 주세요 (퀴즈·2단계 인증 포함, 최대 {mins}분). 로그인되면 창은 자동으로 닫힙니다")
            say(f"🔑 {v}: 사람 로그인 기다림 (최대 {mins}분)")
            t1 = time.time()
            while time.time() - t1 < wait_sec and not logged_in_somewhere(br, v):
                sleep(2)
        if logged_in_somewhere(br, v):
            sleep(2)                                   # 로그인 직후 쿠키가 자리 잡게
            n = br.keep_cookies()
            if given and d is not None:
                save_cred(d, v, given[0], given[1])
            return dict(state="ok", note=("로그인됨 (자동)" if auto else "로그인됨 (직접)") + (" · 비밀번호를 이 PC에 저장" if given else "") + ("" if n else " · 쿠키 보관 실패"))
        return dict(state="manual_fail", note=f"{mins}분 안에 로그인되지 않음 — 수집기 PC 앞에서 다시 [🔑 로그인]")




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


SUB_PREFIX = "부운영자|"


def parse_sub(uid):
    """'부운영자|상점URL|아이디' → (상점URL, 아이디). 부운영자가 아니면 None"""
    uid = str(uid or "")
    if not uid.startswith(SUB_PREFIX):
        return None
    parts = uid.split("|", 2)
    if len(parts) != 3 or not parts[1].strip() or not parts[2].strip():
        raise RuntimeError("부운영자 상점 URL·아이디가 비어 있습니다")
    return parts[1].strip(), parts[2].strip()


def _typed(el, text):
    el.click(); el.fill("")
    try:
        el.press_sequentially(text, delay=60)
    except AttributeError:                      # 예전 playwright
        el.type(text, delay=60)


def fill_makeshop_sub(pg, shop, sid, pw):
    """메이크샵 로그인 화면 [부운영자] 탭 → 상점 URL · 부운영자 아이디 · 비밀번호 → [로그인] (1.5)"""
    tab = pg.locator("#register-login-sub-tab, button:has-text('부운영자')").first
    tab.wait_for(state="visible", timeout=15000)
    tab.click()
    pg.wait_for_timeout(400)
    url = pg.locator("#register-login-url, input[name=shopurl]").first
    url.wait_for(state="visible", timeout=10000)
    _typed(url, shop)
    _typed(pg.locator("#register-login-id, input[name=subid]").first, sid)
    _typed(pg.locator("input[type=password]").first, pw)
    pg.wait_for_timeout(300)
    btn = pg.locator("button.register-login__submit, form:has(#register-login-url) button[type=submit]").first
    try:
        if btn.count() and btn.is_visible():
            btn.click(timeout=3000)
            return "[로그인] 누름"
    except Exception:
        pass
    return submit_login(pg)


def fill_login(pg, uid, pw):
    """아이디·비밀번호 칸에 사람처럼 한 글자씩 입력하고 [로그인] (메이크샵 부운영자는 3칸)"""
    sub = parse_sub(uid)
    if sub:
        fill_makeshop_sub(pg, sub[0], sub[1], pw)
        return
    pg.wait_for_selector("input[type=password]", timeout=15000)
    ids = pg.locator("input#id, input[name=id], input[type=email], input[type=text]:not([readonly]), input:not([type])")
    box = None
    for i in range(min(ids.count(), 6)):
        if ids.nth(i).is_visible():
            box = ids.nth(i); break
    if box is None:
        raise RuntimeError("아이디 칸을 찾지 못했습니다")
    _typed(box, uid)
    _typed(pg.locator("input[type=password]").first, pw)
    pg.wait_for_timeout(300)
    submit_login(pg)


SUBMIT_SEL = ("button:has-text('로그인'), button[type=submit], input[type=submit], input[type=image], input[type=button][value*='로그인'], "
              "a:has-text('로그인'), [onclick*='login' i]")
NOT_SUBMIT = ("로그아웃", "찾기", "회원가입", "입점", "간편", "카카오", "네이버로", "QR", "운영자")


def submit_login(pg):
    """[로그인] 누르기 — 버튼 모양이 업체마다 달라서(메이크샵은 일반 버튼·링크형) 비밀번호 칸이 있는 양식 안에서 먼저 찾고,
    못 찾으면 비밀번호 칸에서 Enter (1.3.1)"""
    for scope in (pg.locator("form:has(input[type=password])").first, pg):
        try:
            cands = scope.locator(SUBMIT_SEL)
            for i in range(min(cands.count(), 10)):
                el = cands.nth(i)
                if not el.is_visible():
                    continue
                tag = el.evaluate("e => e.tagName")
                label = ((el.get_attribute("value") or el.get_attribute("alt") or "") if tag == "INPUT" else el.inner_text(timeout=500)).strip()
                if any(w in label for w in NOT_SUBMIT):
                    continue
                el.click(timeout=3000)
                return f"[{label or '로그인'}] 누름"
        except Exception:
            continue
    try:                                        # 글자 없는 그림 버튼 (양식 안에서만)
        img = pg.locator("form:has(input[type=password]) a:has(img), form:has(input[type=password]) img[onclick]")
        for i in range(min(img.count(), 4)):
            if img.nth(i).is_visible():
                img.nth(i).click(timeout=3000)
                return "[로그인 그림] 누름"
    except Exception:
        pass
    pg.locator("input[type=password]").first.press("Enter")
    return "Enter 로 로그인"


def autologin_saved(pg):
    """브라우저(수집기 프로필)가 아이디·비밀번호를 채워 둔 경우에만 [로그인] (값은 입력하지 않음) — 수집기 ably_autologin 과 같은 방식, 버튼 찾기만 넓힘"""
    try:
        pg.wait_for_selector("input[type=password]", timeout=6000)
    except Exception:
        return "로그인 화면 아님"
    pw = pg.locator("input[type=password]").first
    try:
        if not pw.input_value():
            ids = pg.locator("input[type=text], input[type=email], input:not([type])")
            if ids.count():
                ids.first.click()
            pw.click()
        for _ in range(20):
            if pw.input_value():
                break
            pg.wait_for_timeout(100)
        if not pw.input_value():
            return "아이디/비번이 채워져 있지 않음"
        return "저장된 비밀번호로 " + submit_login(pg)
    except Exception as e:
        return f"자동 로그인 실패: {str(e)[:120]}"


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


class _NoBrowser:
    def __enter__(self):
        return None

    def __exit__(self, *a):
        return False


def manual_login(pg, v, progress, say, wait_sec=None, step_ms=3000):
    """직접 로그인 (1.6): 아무것도 채우지 않고 창을 앞으로 띄운 뒤, 사람이 로그인을 마칠 때까지 기다림 (퀴즈에서 멈추지 않음)"""
    wait_sec = LOGIN_MANUAL_SEC if wait_sec is None else wait_sec
    try:
        pg.bring_to_front()
    except Exception:
        pass
    mins = max(1, round(wait_sec / 60))
    progress(f"{v}: 수집기 PC 화면에 뜬 창에서 직접 로그인해 주세요 (아이디·비밀번호·퀴즈·2단계 인증까지, 최대 {mins}분)")
    say(f"🔑 {v}: 직접 로그인 기다리는 중 (최대 {mins}분)")
    t0 = time.time()
    while time.time() - t0 < wait_sec:
        pg.wait_for_timeout(step_ms)
        if page_logged_in(pg):
            pg.wait_for_timeout(2000)          # 로그인 직후 이동이 끝나 쿠키가 자리 잡게
            return dict(state="ok", note="직접 로그인됨")
    return dict(state="manual_fail", note=f"{mins}분 안에 로그인이 끝나지 않음 — 수집기 PC 앞에서 다시 [🔑 로그인]")


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
    manual = {v for v in vendors if v in MANUAL_LOGIN or v in (body.get("manual") or [])}
    if not G.RUN_LOCK.acquire(blocking=False):
        return False, "수집 중이라 로그인 창을 열 수 없습니다 — 끝난 뒤 다시", {}
    out = {}
    try:
        for v in [x for x in vendors if x in NATIVE_LOGIN]:    # 1.8: 일반 크롬 창(네이버 전용 프로필) — 자동 한 번 → 막히면 사람 → 되면 자동으로 닫음
            try:
                r = native_login(G, v, progress, say, creds=creds, d=d)
            except Exception as e:
                r = dict(state="fail", note=f"오류: {str(e)[:150]}")
            if r is not None:
                out[v] = r
                say(f"🔑 {v}: {r.get('note', '')}")
        rest = [v for v in vendors if v not in out]
        with (G.Browser(show=True) if rest else _NoBrowser()) as br:
            for v in rest:
                progress(f"{v} 로그인 창 여는 중…")
                pg = br.page()
                try:
                    pg.goto(LOGIN_URL[v], wait_until="domcontentloaded", timeout=60000)
                    pg.wait_for_timeout(2500)
                    if page_logged_in(pg):
                        out[v] = dict(state="ok", note="이미 로그인됨"); say(f"🔑 {v}: 이미 로그인됨"); continue
                    if v in manual:
                        out[v] = manual_login(pg, v, progress, say)
                        continue
                    given = creds.get(v)
                    use = given or (lambda c: (c["id"], c["pw"]) if c else None)(load_cred(d, v))
                    if use:
                        fill_login(pg, use[0], use[1]); how = ("웹에서 받은 비밀번호" if given else "이 PC에 저장된 비밀번호") + (" (부운영자)" if parse_sub(use[0]) else "")
                    else:
                        how = autologin_saved(pg)             # 브라우저가 채워 둔 경우 [로그인]만 누름
                    say(f"🔑 {v}: {how}")
                    if not use and ("채워져 있지 않음" in str(how) or "자동 로그인 실패" in str(how)):
                        out[v] = dict(state="need_password", note="저장된 비밀번호 없음 — 웹에서 아이디·비밀번호를 한 번 넣어 주세요"); continue
                    t0, told, human = time.time(), False, False
                    while time.time() - t0 < LOGIN_WAIT_SEC:
                        pg.wait_for_timeout(2000)
                        if page_logged_in(pg):
                            break
                        if not told and time.time() - t0 > 6:
                            progress(f"{v}: 휴대폰 2단계 인증이면 휴대폰에서 [확인]을 눌러 주세요 (최대 {max(1, round(LOGIN_WAIT_SEC / 60))}분 기다림)"); told = True
                        if not human and (time.time() - t0 > HUMAN_HINT_SEC or page_captcha(pg)):
                            # 1.8: 자동으로 안 되면 창을 그대로 두고 사람에게 넘김 (퀴즈·자동입력 방지 문자도 사람이)
                            try:
                                pg.bring_to_front()
                            except Exception:
                                pass
                            progress(f"{v}: 자동 로그인이 막혔습니다 — 수집기 PC에 열린 창에서 직접 로그인해 주세요. 로그인되면 창은 자동으로 닫힙니다"); human = True
                    if page_logged_in(pg):
                        out[v] = dict(state="ok", note="로그인됨")
                        if given:
                            save_cred(d, v, given[0], given[1]); out[v]["note"] = "로그인됨 · 비밀번호를 이 PC에 저장"
                    else:
                        out[v] = dict(state="fail", note=f"{max(1, round(LOGIN_WAIT_SEC / 60))}분 안에 로그인되지 않음 — 아이디·비밀번호 또는 2단계 인증 확인")
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
    label = {"ok": "✓", "captcha": "PC 앞 입력 필요", "need_password": "비밀번호 필요", "fail": "실패", "manual_fail": "직접 로그인 안 됨"}
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


# ───────── 웹연결 업데이트 ─────────
UPDATE_URL_RE = re.compile(r"^https://raw\.githubusercontent\.com/w-works-official/Picking_System/[0-9a-f]{40}/docs/g1_v3_link\.py$")
UPDATE_BACKUP_DIR = "_patch"            # 수집기 폴더 안 (이미 있는 폴더)


def fetch_bytes(url):
    import requests
    r = requests.get(url, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"받기 실패 HTTP {r.status_code}")
    return r.content


def run_update_job(job, say, fetch=None):
    body = job.get("body") or {}
    url, want = str(body.get("url") or ""), str(body.get("sha256") or "").lower()
    if not UPDATE_URL_RE.match(url) or not re.fullmatch(r"[0-9a-f]{64}", want):
        return False, "업데이트 주소·확인값이 맞지 않아 받지 않았습니다", {}
    data = (fetch or fetch_bytes)(url)
    got = hashlib.sha256(data).hexdigest()
    if got != want:
        return False, "받은 파일 확인값이 다릅니다 — 바꾸지 않았습니다 (다시 시도)", {}
    src = data.decode("utf-8")
    compile(src, "g1_v3_link.py", "exec")                 # 문법 오류면 여기서 멈춤 (바꾸지 않음)
    m = re.search(r'LINK_VER = "([^"]+)"', src)
    if not m:
        return False, "웹연결 파일이 아닙니다 — 바꾸지 않았습니다", {}
    new_ver = m.group(1)
    me = os.path.abspath(__file__)
    old = open(me, "rb").read()
    if hashlib.sha256(old).hexdigest() == got:
        return True, f"이미 최신입니다 ({LINK_VER})", {"update": {"same": True}}
    bdir = os.path.join(HERE, UPDATE_BACKUP_DIR)
    if not os.path.isdir(bdir):
        bdir = HERE
    stamp = f"{datetime.datetime.now():%y%m%d_%H%M%S}"
    backup = os.path.join(bdir, f"g1_v3_link_{LINK_VER.split()[0]}_{stamp}.py.bak")
    shutil.copy2(me, backup)
    tmp = me + ".new"
    with open(tmp, "wb") as f:
        f.write(data)
    os.replace(tmp, me)                                    # 같은 파일을 바꿔 씀 (드라이브에 새 파일이 생기지 않음)
    say(f"⬆ 웹연결 {LINK_VER} → {new_ver} (백업: {os.path.basename(backup)})")
    return True, f"{LINK_VER.split()[0]} → {new_ver.split()[0]} 바꿈 · 30초 안에 새 버전으로 다시 켜짐", {"update": {"from": LINK_VER, "to": new_ver, "backup": os.path.basename(backup)}}


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
            ok, msg, results = run_register_job(job, cfg, say, d)
        elif kind == "login":
            ok, msg, data = run_login_job(job, cfg, say, progress, d)
            if ok and (job.get("body") or {}).get("collectAfter"):
                vs = (job.get("body") or {}).get("vendors") or []
                progress("로그인 완료 — 게시판 수집 중")
                ok2, msg2, count = run_collect_job({"kind": "collect", "body": {"vendors": vs}}, _G().load_cfg(), say)
                msg += f" · 게시판: {msg2}"
                progress("게시판 수집 끝 — 리뷰 수집 중")      # 1.9: [로그인되면 바로 게시판 + 리뷰 수집]
                ok3, msg3, count3 = run_collect_job({"kind": "reviews", "body": {"vendors": vs}}, _G().load_cfg(), say)
                msg += f" · 리뷰: {msg3}"
                count += count3
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
        elif kind == "update":
            ok, msg, data = run_update_job(job, say)
        else:
            ok, msg, count = run_collect_job(job, cfg, say)
    except Exception as e:
        ok, msg = False, f"오류: {e}"
        say(traceback.format_exc())
    link.call("finish", id=job["id"], ok=ok, message=msg, results=results, count=count, data=data)
    say(f"■ 요청 {job['id']} {'완료' if ok else '실패'} — {msg}")
    return bool(ok and (data.get("update") or {}).get("to"))   # True = 새 버전으로 바꿨으니 다시 켜야 함


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


# ───────── 메신저 창 도우미 (1.10, 2026-11-05) ─────────
# 웹 CS 관리 💬 메신저 탭의 슬롯(빈 틀)에 카톡 대화창을 붙여 쓰기 쉽게:
#  · 대화창을 끌어 슬롯 가까이 놓으면 → 슬롯 크기·위치에 딱 맞춰 붙임 (네 모서리 맞추기 필요 없음)
#  · 붙은 창은 '항상 위' — 브라우저를 눌러도 뒤로 숨지 않음 (슬롯 밖으로 끌어내면 풀림)
#  · 웹 [📐 일괄 정렬] → 열린 대화창을 슬롯 1·2·3… 에 같은 크기로 한 번에
# 이 PC 안(127.0.0.1)에서만 받고, System V3 화면(w-works-official.github.io)에서 온 요청만 따름. 카톡 창 위치·크기만 바꿈(내용은 안 봄)
MSN_PORT = 47811
MSN_ORIGINS = ("https://w-works-official.github.io",)
MSN_PROCS = ("kakaotalk", "nateon")                          # 프로그램 이름 앞부분 (1.11: NateOnMain.exe 등 네이트온 여러 이름)
MSN_SKIP_TITLES = ("카카오톡", "kakaotalk", "네이트온", "nateon")   # 친구 목록(본 창)은 붙이지 않음
MSN_SNAP_PX = 90          # 창 왼쪽 위 모서리가 슬롯 왼쪽 위에서 이만큼(px) 안이면 붙임 (창 가운데가 슬롯 안이어도 붙임)
MSN_TICK = 0.15


def msn_origin_ok(origin):
    o = str(origin or "")
    return o in MSN_ORIGINS or re.match(r"^http://(127\.0\.0\.1|localhost)(:\d+)?$", o) is not None


def msn_is_messenger(exe, title):
    """메신저 대화창인가 (카톡·네이트온, 본 창·제목 없는 창 제외)"""
    t = str(title or "").strip()
    e = str(exe or "").lower()
    return e.endswith(".exe") and e.startswith(MSN_PROCS) and bool(t) and t.lower() not in MSN_SKIP_TITLES


MSN_SLOTS_MAX = 30
MSN_GROUPS = ("reply", "vendor")


def msn_clean_slots(raw):
    """웹이 보낸 슬롯 화면 좌표(물리 px) → [(x, y, w, h)] (이상한 값은 버림, 최대 30칸)"""
    out = []
    for s in (raw if isinstance(raw, list) else [])[:MSN_SLOTS_MAX]:
        try:
            x, y, w, h = (int(round(float(s[k]))) for k in ("x", "y", "w", "h"))
        except Exception:
            continue
        if 120 <= w <= 5000 and 120 <= h <= 5000 and -30000 < x < 30000 and -30000 < y < 30000:
            out.append((x, y, w, h))
    return out


def msn_clean_names(raw):
    return [str(x or "").strip()[:40] for x in (raw if isinstance(raw, list) else [])[:MSN_SLOTS_MAX]]


def msn_norm_name(s):
    """메모·업체 이름 비교용: 앞 '0-' · 끝 '[ 1 ]' · 띄어쓰기 빼고 소문자"""
    s = re.sub(r"\[\s*\d+\s*\]\s*$", "", str(s or "").strip())
    s = re.sub(r"^\d+\s*-\s*", "", s)
    return re.sub(r"\s+", "", s).lower()


def msn_name_slot(title, names, skip=()):
    """창 제목에 메모 이름이 들어 있는 슬롯 번호 (긴 이름 먼저 — '아트'보다 '아트피어스'). 없으면 None"""
    t = re.sub(r"\s+", "", str(title or "")).lower()
    best = None
    for i, n in enumerate(names or []):
        k = msn_norm_name(n)
        if len(k) >= 2 and i not in skip and k in t and (best is None or len(k) > best[1]):
            best = (i, len(k))
    return best[0] if best else None


def msn_snap_target(rect, slots, snap=MSN_SNAP_PX):
    """창(보이는 테두리 l,t,r,b)이 가까이 온 슬롯 번호 — 왼쪽 위 모서리가 snap px 안이거나 창 가운데가 슬롯 안. 없으면 None"""
    l, t, r, b = rect
    cx, cy = (l + r) / 2, (t + b) / 2
    best, bd = None, None
    for i, (x, y, w, h) in enumerate(slots):
        d = max(abs(l - x), abs(t - y))
        if d <= snap or (x <= cx <= x + w and y <= cy <= y + h):
            if bd is None or d < bd:
                best, bd = i, d
    return best


def msn_outer_rect(slot, margins):
    """보이는 테두리가 슬롯에 딱 맞도록 창 바깥 크기 계산 (margins = 보이지 않는 테두리 왼·위·오·아래)"""
    x, y, w, h = slot
    ml, mt, mr, mb = margins
    return (x - ml, y - mt, w + ml + mr, h + mt + mb)


def msn_png(w, h, bgra, stride=None):
    """BGRA(위→아래) 픽셀 → PNG (추가 설치 없이, zlib 만)"""
    import zlib, struct
    stride = stride or w * 4
    raw = bytearray()
    for y in range(h):
        row = bgra[y * stride:y * stride + w * 4]
        rgb = bytearray(w * 3)
        rgb[0::3], rgb[1::3], rgb[2::3] = row[2::4], row[1::4], row[0::4]
        raw.append(0)
        raw += rgb

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(bytes(raw), 6)) + chunk(b"IEND", b""))


class MsnHelper:
    """창 붙이기 판단 (Windows 호출은 api 가 함 — 시험에서는 가짜 api)"""

    def __init__(self, api, say=print):
        self.api, self.say = api, say
        self.slots, self.managed, self.last, self.moving = [], {}, {}, set()
        self.lock = threading.Lock()
        self.seen = 0.0
        self.group, self.names, self.parked = "reply", [], {}   # 1.15: 슬롯 묶음(메신저 답변·거래처) · 메모 이름 · 내려둔 창

    def _switch(self, group):
        """다른 탭(슬롯 묶음)으로: 지금 붙은 창은 내려두고(최소화) 기억 → 그 탭에 붙어 있던 창은 다시 띄움"""
        parked = {}
        for h, i in list(self.managed.items()):
            self._release(h)
            try:
                self.api.hide(h)
            except Exception:
                pass
            parked[h] = i
        self.parked[self.group] = parked
        self.managed, self.last, self.moving = {}, {}, set()
        self.group = group
        back = {}
        for h, i in (self.parked.pop(group, {}) or {}).items():
            try:
                if self.api.alive(h):
                    self.api.show(h)
                    back[h] = i
            except Exception:
                pass
        return back

    def status(self):
        with self.lock:
            try:
                wins = len(self.api.windows())
            except Exception:
                wins = -1
            return {"ok": True, "ver": LINK_VER, "slots": len(self.slots), "windows": wins, "managed": len(self.managed), "used": sorted(set(self.managed.values())), "group": self.group}

    def _place(self, h, i):
        for other, j in list(self.managed.items()):
            if j == i and other != h:              # 같은 슬롯에 있던 창은 '항상 위'만 풀고 그대로 둠
                self._release(other)
        self.api.place(h, self.slots[i])
        self.managed[h] = i
        for kept in self.parked.values():          # 1.15: 한 창은 한 탭(슬롯 묶음)에만
            kept.pop(h, None)
        self.last.pop(h, None)                     # 실제 자리는 다음 확인 때 다시 기억 (창 최소 크기 때문에 슬롯과 조금 달라도 계속 다시 붙이지 않게)
        self.moving.discard(h)

    def _release(self, h):
        try:
            self.api.topmost(h, False)
        except Exception:
            pass
        self.managed.pop(h, None)

    def tick(self):
        with self.lock:
            wins = self.api.windows()
            alive = {h for h, _, _ in wins}
            for h in list(self.managed):
                if h not in alive:
                    self.managed.pop(h, None)
            for h in list(self.last):
                if h not in alive:
                    self.last.pop(h, None)
                    self.moving.discard(h)
            down = self.api.mouse_down()
            for h, title, rect in wins:
                prev = self.last.get(h)
                self.last[h] = rect
                if prev is not None and prev != rect:
                    self.moving.add(h)
                if down or h not in self.moving:
                    continue
                self.moving.discard(h)              # 끌기가 끝남 (마우스 뗌)
                if not self.slots:
                    continue
                i = msn_snap_target(rect, self.slots)
                if i is None:
                    if h in self.managed:
                        self._release(h)
                        self.say(f"💬 '{title}' 슬롯에서 뗌 (항상 위 풀림)")
                    continue
                self._place(h, i)
                self.say(f"💬 '{title}' → 슬롯 {i + 1} 에 붙임")

    def set_slots(self, slots, group="reply", names=None):
        with self.lock:
            self.seen = time.time()
            group = group if group in MSN_GROUPS else "reply"
            if names is not None:
                self.names = list(names)
            if group != self.group:
                back = self._switch(group)
                self.slots = slots
                for h, i in back.items():
                    if i < len(slots):
                        self.api.place(h, slots[i])
                        self.managed[h] = i
                    else:
                        self._release(h)
            elif slots != self.slots:
                self.slots = slots
                for h, i in list(self.managed.items()):  # 브라우저를 옮기거나 크기를 바꾸면 붙은 창도 따라감
                    if i < len(slots):
                        self.api.place(h, slots[i])
                        self.last.pop(h, None)
                        self.moving.discard(h)
                    else:
                        self._release(h)
            return {"ok": True, "slots": len(self.slots), "managed": len(self.managed), "used": sorted(set(self.managed.values())), "group": self.group}

    def arrange(self):
        """열린 대화창을 슬롯에 차례로 (이미 붙은 창은 그 자리, 나머지는 위에 있는 창부터 빈 슬롯에)"""
        with self.lock:
            if not self.slots:
                return {"ok": False, "error": "슬롯 위치를 아직 못 받음 — 메신저 탭을 연 채로 몇 초 뒤 다시"}
            wins = self.api.windows()
            n = len(self.slots)
            names = (self.names + [""] * n)[:n]
            used = set(self.managed.values())
            placed, named, rest = 0, 0, []
            for h, title, rect in wins:
                if h in self.managed:
                    self._place(h, self.managed[h])
                    placed += 1
                    continue
                i = msn_name_slot(title, names, skip=used)   # 1.15: 창 제목 ↔ 슬롯 메모 이름
                if i is not None:
                    self._place(h, i); used.add(i)
                    placed += 1; named += 1
                else:
                    rest.append(h)
            free = [i for i in range(n) if i not in used and (not msn_norm_name(names[i]) or self.group == "reply")]
            free.sort(key=lambda i: bool(msn_norm_name(names[i])))   # 메모 없는 슬롯 먼저
            for h in rest:
                if not free:
                    break
                self._place(h, free.pop(0))
                placed += 1
            return {"ok": True, "placed": placed, "named": named, "windows": len(wins), "slots": n, "group": self.group}

    def send(self, i, enter=True):
        """슬롯 i 에 붙은 창에 붙여넣기 + Enter"""
        with self.lock:
            h = next((h for h, j in self.managed.items() if j == i), None)
        if h is None:
            return {"ok": False, "error": f"슬롯 {i + 1} 에 붙은 대화창이 없음 — 창을 슬롯에 끌어다 놓거나 [📐 일괄 정렬]"}
        self.api.send(h, enter)
        return {"ok": True, "slot": i}

    def capture(self, i):
        """슬롯 i 에 붙은 대화창 그림 (PNG base64) — 웹이 AI 추천에 씀. 이 PC 안에서만 주고받음"""
        with self.lock:
            h = next((h for h, j in self.managed.items() if j == i), None)
        if h is None:
            return {"ok": False, "error": f"슬롯 {i + 1} 에 붙은 대화창이 없음"}
        w, hh, png = self.api.capture(h)
        return {"ok": True, "mime": "image/png", "data": base64.b64encode(png).decode("ascii"), "w": w, "h": hh}

    def scan(self):
        try:
            return {"ok": True, "windows": self.api.scan()}
        except Exception as e:
            return {"ok": False, "error": f"{e}"[:200]}

    def release_all(self):
        with self.lock:
            n = len(self.managed)
            for h in list(self.managed):
                self._release(h)
            return {"ok": True, "released": n}


class MsnWin:
    """Windows 창 다루기 (ctypes, 추가 설치 없음)"""

    def __init__(self):
        import ctypes
        from ctypes import wintypes as W
        self.c, self.W = ctypes, W
        self.u = ctypes.WinDLL("user32", use_last_error=True)
        self.k = ctypes.WinDLL("kernel32", use_last_error=True)
        try:
            self.dwm = ctypes.WinDLL("dwmapi")
        except Exception:
            self.dwm = None
        try:                                        # 화면 배율(125%·150%)에서도 실제 픽셀로
            self.u.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
        except Exception:
            try:
                self.u.SetProcessDPIAware()
            except Exception:
                pass
        H = W.HWND
        self.u.EnumWindows.argtypes = [ctypes.WINFUNCTYPE(W.BOOL, H, W.LPARAM), W.LPARAM]
        for name, args, res in (("IsWindowVisible", [H], W.BOOL), ("IsIconic", [H], W.BOOL), ("IsZoomed", [H], W.BOOL),
                                ("GetWindowTextLengthW", [H], ctypes.c_int), ("GetWindowTextW", [H, W.LPWSTR, ctypes.c_int], ctypes.c_int),
                                ("GetWindowRect", [H, ctypes.POINTER(W.RECT)], W.BOOL), ("GetWindowThreadProcessId", [H, ctypes.POINTER(W.DWORD)], W.DWORD),
                                ("GetWindowLongW", [H, ctypes.c_int], ctypes.c_long), ("ShowWindow", [H, ctypes.c_int], W.BOOL),
                                ("SetWindowPos", [H, H, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, W.UINT], W.BOOL),
                                ("GetAsyncKeyState", [ctypes.c_int], ctypes.c_short), ("GetForegroundWindow", [], H),
                                ("SetForegroundWindow", [H], W.BOOL), ("keybd_event", [ctypes.c_ubyte, ctypes.c_ubyte, W.DWORD, ctypes.c_void_p], None),
                                ("IsWindow", [H], W.BOOL)):
            f = getattr(self.u, name)
            f.argtypes, f.restype = args, res
        self.k.OpenProcess.argtypes, self.k.OpenProcess.restype = [W.DWORD, W.BOOL, W.DWORD], W.HANDLE
        self.k.QueryFullProcessImageNameW.argtypes = [W.HANDLE, W.DWORD, W.LPWSTR, ctypes.POINTER(W.DWORD)]
        self.k.CloseHandle.argtypes = [W.HANDLE]
        self._exe = {}

    def _exe_of(self, hwnd):
        pid = self.W.DWORD()
        self.u.GetWindowThreadProcessId(hwnd, self.c.byref(pid))
        p = pid.value
        if p in self._exe:
            return self._exe[p]
        name = ""
        h = self.k.OpenProcess(0x1000, False, p)       # PROCESS_QUERY_LIMITED_INFORMATION
        if h:
            try:
                buf = self.c.create_unicode_buffer(600)
                n = self.W.DWORD(600)
                if self.k.QueryFullProcessImageNameW(h, 0, buf, self.c.byref(n)):
                    name = os.path.basename(buf.value).lower()
            finally:
                self.k.CloseHandle(h)
        if len(self._exe) > 300:
            self._exe.clear()
        self._exe[p] = name
        return name

    def _rect(self, hwnd):
        r = self.W.RECT()
        self.u.GetWindowRect(hwnd, self.c.byref(r))
        return (r.left, r.top, r.right, r.bottom)

    def _visible(self, hwnd):
        """보이는 테두리 (Windows 10·11 창은 바깥에 보이지 않는 테두리가 있음)"""
        if self.dwm:
            r = self.W.RECT()
            if self.dwm.DwmGetWindowAttribute(hwnd, 9, self.c.byref(r), self.c.sizeof(r)) == 0:   # DWMWA_EXTENDED_FRAME_BOUNDS
                return (r.left, r.top, r.right, r.bottom)
        return self._rect(hwnd)

    def windows(self):
        """보이는 메신저 대화창 [(hwnd, 제목, 보이는 테두리)] — 위에 있는 창부터"""
        out = []

        def cb(hwnd, _):
            try:
                if not self.u.IsWindowVisible(hwnd) or self.u.IsIconic(hwnd):
                    return True
                n = self.u.GetWindowTextLengthW(hwnd)
                buf = self.c.create_unicode_buffer(n + 1)
                self.u.GetWindowTextW(hwnd, buf, n + 1)
                title = buf.value.strip()
                if not title or title.lower() in MSN_SKIP_TITLES:
                    return True
                exe = self._exe_of(hwnd)
                if not msn_is_messenger(exe, title):
                    return True
                if exe.startswith("kakaotalk") and self.u.GetWindowLongW(hwnd, -20) & 0x80:   # 카톡 도구 창(WS_EX_TOOLWINDOW) 제외
                    return True
                l, t, r, b = self._visible(hwnd)
                if r - l < 200 or b - t < 200:      # 알림 팝업 같은 작은 창 제외
                    return True
                out.append((int(hwnd), title, (l, t, r, b)))
            except Exception:
                pass
            return True
        self.u.EnumWindows(self.c.WINFUNCTYPE(self.W.BOOL, self.W.HWND, self.W.LPARAM)(cb), 0)
        return out

    def mouse_down(self):
        return bool(self.u.GetAsyncKeyState(0x01) & 0x8000)

    def scan(self):
        """진단: 보이는 창 중 카톡·네이트온 프로그램 창 목록 (이 PC 화면에만 보여 줌)"""
        out = []

        def cb(hwnd, _):
            try:
                if not self.u.IsWindowVisible(hwnd):
                    return True
                exe = self._exe_of(hwnd)
                if "kakao" not in exe and "nate" not in exe:
                    return True
                n = self.u.GetWindowTextLengthW(hwnd)
                buf = self.c.create_unicode_buffer(n + 1)
                self.u.GetWindowTextW(hwnd, buf, n + 1)
                l, t, r, b = self._visible(hwnd)
                out.append({"exe": exe, "title": buf.value.strip()[:40], "w": r - l, "h": b - t,
                            "tool": bool(self.u.GetWindowLongW(hwnd, -20) & 0x80), "min": bool(self.u.IsIconic(hwnd)),
                            "ok": msn_is_messenger(exe, buf.value) and r - l >= 200 and b - t >= 200})
            except Exception:
                pass
            return len(out) < 30
        self.u.EnumWindows(self.c.WINFUNCTYPE(self.W.BOOL, self.W.HWND, self.W.LPARAM)(cb), 0)
        return out

    def _key(self, vk, up=False):
        self.u.keybd_event(vk, 0, 2 if up else 0, 0)

    def _activate(self, hwnd):
        """다른 창을 앞으로 (Windows 가 막는 경우를 피하려고 Alt 를 한 번 눌렀다 뗌)"""
        if not hwnd:
            return False
        if self.u.IsIconic(hwnd):
            self.u.ShowWindow(hwnd, 9)
        self._key(0x12); self._key(0x12, True)
        return bool(self.u.SetForegroundWindow(hwnd))

    def capture(self, hwnd):
        """대화창이 보이는 자리를 화면에서 그대로 복사 (붙은 창은 항상 위라 가려지지 않음) → (가로, 세로, PNG)"""
        c, W = self.c, self.W
        g = c.WinDLL("gdi32")
        P = c.c_void_p
        for name, args, res in (("CreateCompatibleDC", [P], P), ("CreateCompatibleBitmap", [P, c.c_int, c.c_int], P), ("SelectObject", [P, P], P),
                                ("BitBlt", [P, c.c_int, c.c_int, c.c_int, c.c_int, P, c.c_int, c.c_int, W.DWORD], W.BOOL),
                                ("GetDIBits", [P, P, W.UINT, W.UINT, P, P, W.UINT], c.c_int), ("DeleteObject", [P], W.BOOL), ("DeleteDC", [P], W.BOOL)):
            f = getattr(g, name)
            f.argtypes, f.restype = args, res
        self.u.GetDC.argtypes, self.u.GetDC.restype = [P], P
        self.u.ReleaseDC.argtypes, self.u.ReleaseDC.restype = [P, P], c.c_int
        l, t, r, b = self._visible(hwnd)
        w, h = max(1, min(r - l, 2400)), max(1, min(b - t, 2400))
        sdc = self.u.GetDC(None)
        mdc = g.CreateCompatibleDC(sdc)
        bmp = g.CreateCompatibleBitmap(sdc, w, h)
        old = g.SelectObject(mdc, bmp)
        try:
            g.BitBlt(mdc, 0, 0, w, h, sdc, l, t, 0x00CC0020)   # SRCCOPY

            class BIH(c.Structure):
                _fields_ = [("biSize", W.DWORD), ("biWidth", c.c_long), ("biHeight", c.c_long), ("biPlanes", W.WORD), ("biBitCount", W.WORD),
                            ("biCompression", W.DWORD), ("biSizeImage", W.DWORD), ("biXPelsPerMeter", c.c_long), ("biYPelsPerMeter", c.c_long),
                            ("biClrUsed", W.DWORD), ("biClrImportant", W.DWORD)]
            bi = BIH(c.sizeof(BIH), w, -h, 1, 32, 0, 0, 0, 0, 0, 0)
            buf = c.create_string_buffer(w * h * 4)
            g.SelectObject(mdc, old)
            g.GetDIBits(mdc, bmp, 0, h, buf, c.byref(bi), 0)
        finally:
            g.DeleteObject(bmp)
            g.DeleteDC(mdc)
            self.u.ReleaseDC(None, sdc)
        return w, h, msn_png(w, h, buf.raw)

    def send(self, hwnd, enter=True):
        """메신저 창에 붙여넣기(Ctrl+V) + Enter → 원래 앞에 있던 창(System V3)으로 커서 되돌림. 클립보드는 웹이 미리 넣어 둠"""
        prev = self.u.GetForegroundWindow()
        self._activate(hwnd)
        time.sleep(0.18)
        self._key(0x11); self._key(0x56); self._key(0x56, True); self._key(0x11, True)   # Ctrl+V
        time.sleep(0.12)
        if enter:
            self._key(0x0D); self._key(0x0D, True)
            time.sleep(0.15)
        if prev and prev != hwnd:
            self._activate(prev)
        return True

    def place(self, hwnd, slot):
        if self.u.IsZoomed(hwnd) or self.u.IsIconic(hwnd):
            self.u.ShowWindow(hwnd, 9)                  # SW_RESTORE
        o, v = self._rect(hwnd), self._visible(hwnd)
        margins = (v[0] - o[0], v[1] - o[1], o[2] - v[2], o[3] - v[3])
        x, y, w, h = msn_outer_rect(slot, margins)
        self.u.SetWindowPos(hwnd, -1, x, y, w, h, 0x0010 | 0x0040)   # HWND_TOPMOST, SWP_NOACTIVATE | SWP_SHOWWINDOW

    def topmost(self, hwnd, on):
        self.u.SetWindowPos(hwnd, -1 if on else -2, 0, 0, 0, 0, 0x0001 | 0x0002 | 0x0010)

    def hide(self, hwnd):
        self.u.ShowWindow(hwnd, 6)                      # SW_MINIMIZE — 다른 탭 슬롯 창은 내려둠

    def show(self, hwnd):
        self.u.ShowWindow(hwnd, 9)                      # SW_RESTORE

    def alive(self, hwnd):
        return bool(self.u.IsWindow(hwnd))


def msn_server(helper, port=MSN_PORT):
    """127.0.0.1 전용 작은 HTTP — GET /msn/ping · POST /msn/slots · /msn/arrange · /msn/release"""
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _head(self, code):
            o = self.headers.get("Origin", "")
            self.send_response(code)
            if msn_origin_ok(o):
                self.send_header("Access-Control-Allow-Origin", o)
                self.send_header("Vary", "Origin")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "content-type")
                self.send_header("Access-Control-Allow-Private-Network", "true")

        def _json(self, obj, code=200):
            b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
            self._head(code)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)

        def do_OPTIONS(self):
            self._head(204)
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            o = self.headers.get("Origin")
            if o and not msn_origin_ok(o):
                return self._json({"ok": False, "error": "origin"}, 403)
            if self.path.split("?")[0] == "/msn/ping":
                return self._json(helper.status())
            if self.path.split("?")[0] == "/msn/windows" and msn_origin_ok(o or ""):
                return self._json(helper.scan())
            return self._json({"ok": False, "error": "not found"}, 404)

        def do_POST(self):
            if not msn_origin_ok(self.headers.get("Origin", "")):   # 다른 사이트가 이 PC 창을 건드리지 못하게
                return self._json({"ok": False, "error": "origin"}, 403)
            n = min(int(self.headers.get("Content-Length") or 0), 20000)
            try:
                body = json.loads(self.rfile.read(n) or b"{}")
            except Exception:
                body = {}
            p = self.path.split("?")[0]
            try:
                if p == "/msn/slots":
                    return self._json(helper.set_slots(msn_clean_slots(body.get("slots")), str(body.get("group") or "reply"),
                                                       msn_clean_names(body.get("names")) if "names" in body else None))
                if p == "/msn/arrange":
                    return self._json(helper.arrange())
                if p == "/msn/release":
                    return self._json(helper.release_all())
                if p == "/msn/capture":
                    return self._json(helper.capture(int(body.get("slot", -1))))
                if p == "/msn/send":
                    return self._json(helper.send(int(body.get("slot", -1)), body.get("enter", True) is not False))
            except Exception as e:
                return self._json({"ok": False, "error": f"{e}"[:200]}, 500)
            return self._json({"ok": False, "error": "not found"}, 404)

    return ThreadingHTTPServer(("127.0.0.1", port), H)


def msn_helper_start(say, api=None, port=MSN_PORT):
    """Windows 에서만 · 실패해도 연결 프로그램은 그대로 (메신저 도우미만 꺼짐)"""
    if api is None and os.name != "nt":
        return None
    try:
        api = api or MsnWin()
        helper = MsnHelper(api, say)
        srv = msn_server(helper, port)
    except Exception as e:
        say(f"⚠ 메신저 창 도우미를 켜지 못함 (연결 프로그램은 그대로): {e!r}")
        return None
    threading.Thread(target=srv.serve_forever, daemon=True).start()

    def loop():
        errs = 0
        while True:
            try:
                helper.tick()
                errs = 0
            except Exception as e:
                errs += 1
                if errs in (1, 50):
                    say(f"⚠ 메신저 창 도우미: {e!r}")
            time.sleep(MSN_TICK)
    threading.Thread(target=loop, daemon=True).start()
    say(f"💬 메신저 창 도우미 켜짐 (127.0.0.1:{port})")
    return helper, srv


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
    msn_helper_start(say)                      # 1.10: 메신저 창 도우미 (Windows 에서만, 실패해도 연결은 그대로)
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
    hot, fails = False, 0
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
            hot = bool(js.get("hot"))
            job = js.get("job")
            if job:
                beat.set("busy", job.get("id", ""), JOB_LABEL.get(job.get("kind"), job.get("kind", "")))
                restart = False
                try:
                    restart = handle(link, job, cfg, say, d)
                    if job.get("kind") in ("settings", "apiKey"):
                        nxt = None                      # 자동 수집 시각 다시 계산
                finally:
                    beat.set("idle", "웹 요청 기다리는 중")
                if restart:
                    save_link(d)
                    beat.set("busy", "업데이트", "다시 켜는 중")
                    say("새 버전으로 다시 켜려고 끝냅니다" + (" — 감시 루프가 30초 안에 다시 켭니다" if bg else " — 이 창을 닫고 다시 실행해 주세요"))
                    return
                push_new_files(link, cfg["out_dir"], d, say)
                save_link(d)
        except Exception as e:
            fails += 1
            beat.set("error", f"시트 연결 안 됨: {e}")
            if fails == 1 or fails % 20 == 0:   # 같은 오류로 기록이 넘치지 않게
                say(f"⚠ {e}")
        if once:
            return
        if wait_or_stop(HOT_POLL_SEC if hot else POLL_SEC):
            say("중지 요청(G1_weblink_stop.flag) — 끝냅니다")
            return


JOB_LABEL = {"collect": "게시판 수집", "test": "테스트 수집", "reviews": "리뷰 수집", "testReviews": "리뷰 테스트", "register": "📤 등록",
             "login": "🔑 로그인", "settings": "설정 저장", "apiTest": "API 테스트", "apiKey": "API 키 저장", "ip": "공인 IP", "files": "파일 목록",
             "update": "웹연결 업데이트"}


if __name__ == "__main__":
    BG = "--bg" in sys.argv or sys.stdout is None      # pythonw 로 켜지면 창이 없음
    if BG:
        to_log_file()
    if "--setup" in sys.argv:
        setup()
    else:
        main_loop(once="--once" in sys.argv, bg=BG)

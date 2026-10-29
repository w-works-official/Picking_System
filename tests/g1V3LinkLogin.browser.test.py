# -*- coding: utf-8 -*-
"""웹연결 [로그인] 버튼 찾기 시험 — 실제 크롬(playwright)으로 업체별 로그인 화면 모양을 흉내 내서 확인
python3 tests/g1V3LinkLogin.browser.test.py"""
import os, sys, types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.modules["g1_cs_collector"] = types.ModuleType("g1_cs_collector")
sys.path.insert(0, os.path.join(ROOT, "docs"))
import g1_v3_link as L  # noqa: E402
from playwright.sync_api import sync_playwright  # noqa: E402

PAGES = {
    # 메이크샵처럼: 양식 안 일반 버튼(input type=button) + 찾기·회원가입 링크
    "makeshop": """<form onsubmit="return false"><input name="id" type="text"><input name="passwd" type="password">
      <a href="#" onclick="window.__clicked='find';return false">아이디 찾기</a>
      <input type="button" value="로그인" onclick="window.__clicked='login:'+document.querySelector('[name=id]').value+'/'+document.querySelector('[name=passwd]').value">
      <a href="#" onclick="window.__clicked='join';return false">회원가입</a></form>""",
    # 지그재그처럼: 맨 앞 빈 버튼(눈 모양) + 로그인 submit + 비밀번호 찾기
    "zigzag": """<form onsubmit="window.__clicked='login:'+this.e.value+'/'+this.p.value;return false"><input name="e" type="text" placeholder="이메일 주소">
      <input name="p" type="password" placeholder="비밀번호"><button type="button" onclick="window.__clicked='eye'"></button>
      <button type="submit">로그인</button><button type="button" onclick="window.__clicked='find'">비밀번호 찾기</button></form>""",
    # 이미지 링크형 로그인 (글자 없음) → Enter 로
    "imagelink": """<form onsubmit="window.__clicked='login:'+this.u.value+'/'+this.w.value;return false"><input name="u"><input name="w" type="password">
      <a href="#" onclick="var f=this.closest('form');window.__clicked='login:'+f.u.value+'/'+f.w.value;return false"><img alt="" width="40" height="20" style="display:inline-block"></a></form>""",
    # 버튼이 아예 없고 Enter 로만 되는 화면 (자바스크립트가 Enter 를 받음)
    "enteronly": """<div><input id="u2"><input id="w2" type="password" onkeydown="if(event.key==='Enter')window.__clicked='login:'+u2.value+'/'+this.value"></div>""",
    # 카카오 간편 로그인이 먼저 나오는 화면 → 카카오 버튼은 건너뜀
    "kakao_first": """<div><button onclick="window.__clicked='kakao'">카카오 계정으로 로그인</button></div>
      <form onsubmit="window.__clicked='login:'+this.a.value+'/'+this.b.value;return false"><input name="a"><input name="b" type="password"><button>로그인</button></form>""",
}

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page()
    for name, html in PAGES.items():
        page.set_content(f"<html><body>{html}</body></html>")
        page.evaluate("window.__clicked = ''")
        L.fill_login(page, "shop_id", "pw!123")
        page.wait_for_timeout(100)
        got = page.evaluate("window.__clicked || ''")
        assert got == "login:shop_id/pw!123", (name, got)
    # 브라우저가 채워 둔 값이 없으면 누르지 않음
    page.set_content("<form><input name=i><input type=password name=p><input type=button value='로그인' onclick=\"window.__clicked='x'\"></form>")
    page.evaluate("window.__clicked = ''")
    assert L.autologin_saved(page) == "아이디/비번이 채워져 있지 않음"
    assert page.evaluate("window.__clicked || ''") == ""
    # 채워져 있으면 [로그인]
    page.set_content("<form><input name=i value=me><input type=password name=p value=secret><input type=button value='로그인' onclick=\"window.__clicked='ok'\"></form>")
    assert L.autologin_saved(page).startswith("저장된 비밀번호로 [로그인] 누름")
    assert page.evaluate("window.__clicked || ''") == "ok"
    browser.close()
print("g1V3LinkLogin.browser.test: OK")

# -*- coding: utf-8 -*-
"""
러너_트레이.pyw  —  원격 실행 러너 상태를 작업표시줄(시계 옆) 아이콘으로 보여 준다  (2026-10-19, A_1 총괄)

  🟢 초록  러너 켜짐 · 대기 중
  🔵 파랑  작업 실행 중 (툴팁에 작업 이름·경과)
  🟠 주황  러너는 살아 있지만 서버(구글)에 연결이 안 됨
  ⚫ 회색  러너 꺼짐 (40초 넘게 신호 없음)

판정 근거: runner.py 가 몇 초마다 적는 신호 파일 runner_<사용자명>.beat (같은 폴더).
오른쪽 클릭 메뉴: 러너 시작 / 러너 중지 / 로그 보기 / 보드 열기 / 아이콘 끄기

2026-10-29 · G1 웹연결(CS 수집기 ↔ System V3 CS 관리)도 같은 아이콘에 표시
  왼쪽 반 = 원격보드 러너,  오른쪽 반 = G1 웹연결  (색 뜻은 위와 같음, 둘 다 같으면 그냥 동그라미)
  G1 신호: %APPDATA%/G1CS/v3link_beat.json — 이 파일이 없는 PC(수집기 없는 PC)는 예전과 똑같이 러너만 표시
  메뉴에 G1 웹연결 시작 / 중지 / 기록 보기 / CS 관리 열기 추가 (프로그램은 따로 돈다 — 하나가 멈춰도 다른 하나는 계속)
창 없이 돈다(.pyw). 종료는 메뉴의 '아이콘 끄기'. 등록·자동시작은 러너_트레이_등록.bat 이 해 준다.
필요 패키지: pystray, Pillow  (등록 bat 이 설치)
"""
import os, sys, json, time, threading, subprocess, getpass, webbrowser, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
USER = os.environ.get('USERNAME') or getpass.getuser()
BEAT = os.path.join(HERE, f'runner_{USER}.beat')
LOG  = os.path.join(HERE, f'runner_{USER}.log')
PIDF = os.path.join(HERE, f'runner_{USER}.pid')
LOCK = os.path.join(HERE, f'tray_{USER}.pid')          # 아이콘 중복 실행 방지
OFF_AFTER = 40                                          # 초 — 이보다 오래 신호가 없으면 꺼짐
BOARD_URL = 'https://kakamail80-cell.github.io/remote-board/'
START_BAT = os.path.join(HERE, '러너_백그라운드_등록.bat')
STOP_BAT  = os.path.join(HERE, '러너_중지.bat')
G1_HOME  = os.path.join(os.environ.get('APPDATA') or os.path.expanduser('~'), 'G1CS')
G1_BEAT  = os.path.join(G1_HOME, 'v3link_beat.json')
G1_LOG   = os.path.join(G1_HOME, 'v3link_log.txt')
G1_DIR_DEFAULT = os.path.join(os.path.expanduser('~'), '내 드라이브', 'V_회계', '2_CS_게시판_정리', 'G1_CS수집기')
CS_URL   = 'https://w-works-official.github.io/Picking_System/cs/'

try:
    import pystray
    from PIL import Image, ImageDraw
except Exception as e:   # 패키지가 없으면 안내만 하고 끝 (등록 bat 이 설치해 준다)
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, f"pystray / Pillow 패키지가 없습니다.\n러너_트레이_등록.bat 을 실행해 주세요.\n(pyw 파일을 직접 더블클릭하지 말고 등록 bat 으로 띄우세요)\n\n{e}\n실행한 파이썬: {sys.executable}", "러너 트레이", 0x10)
    except Exception:
        pass
    sys.exit(1)

COLORS = {   # 상태 → (채움, 테두리)
    'idle':  ((34, 197, 94),  (21, 128, 61)),    # 초록
    'busy':  ((59, 130, 246), (29, 78, 216)),    # 파랑
    'error': ((249, 115, 22), (194, 65, 12)),    # 주황
    'off':   ((156, 163, 175), (107, 114, 128)), # 회색
}
LABEL = {'idle': '켜짐 · 대기 중', 'busy': '작업 실행 중', 'error': '켜짐 · 서버 연결 안 됨', 'off': '꺼짐'}
G1_LABEL = {'idle': '켜짐 · 대기 중', 'busy': '요청 실행 중', 'error': '켜짐 · 시트 연결 안 됨', 'off': '꺼짐'}

def make_icon(state, busy_tick=0):
    """64×64 동그라미. 작업 중이면 가운데 흰 점이 깜빡여 '돌고 있음' 느낌."""
    fill, line = COLORS.get(state, COLORS['off'])
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((6, 6, 58, 58), fill=fill, outline=line, width=4)
    if state == 'busy' and busy_tick % 2 == 0:
        d.ellipse((24, 24, 40, 40), fill=(255, 255, 255))
    if state == 'off':
        d.line((22, 22, 42, 42), fill=(255, 255, 255), width=6)
        d.line((42, 22, 22, 42), fill=(255, 255, 255), width=6)
    return im

def make_icon2(state, g1, busy_tick=0):
    """둘 다 표시: 왼쪽 반 러너, 오른쪽 반 G1. G1 이 없거나 둘이 같으면 예전 그림 그대로."""
    if g1 is None or (g1 == state and state != 'busy'):
        return make_icon(state, busy_tick)
    im = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    box = (6, 6, 58, 58)
    for st, a0, a1, cx in ((state, 90, 270, 21), (g1, 270, 450, 43)):
        fill, line = COLORS.get(st, COLORS['off'])
        d.pieslice(box, a0, a1, fill=fill)
        d.arc(box, a0, a1, fill=line, width=4)
        if st == 'busy' and busy_tick % 2 == 0:
            d.ellipse((cx - 7, 25, cx + 7, 39), fill=(255, 255, 255))
        if st == 'off':
            d.line((cx - 6, 26, cx + 6, 38), fill=(255, 255, 255), width=4)
            d.line((cx + 6, 26, cx - 6, 38), fill=(255, 255, 255), width=4)
    d.line((32, 7, 32, 57), fill=(255, 255, 255), width=3)     # 가운데 흰 줄 = 두 개라는 표시
    return im

def read_g1():
    """G1 웹연결 신호 → (state, 설명문, 폴더). 신호 파일이 한 번도 없었던 PC 는 (None, '', '')."""
    if not os.path.exists(G1_BEAT):
        return None, '', ''
    try:
        with open(G1_BEAT, encoding='utf-8') as f:
            b = json.load(f)
    except Exception:
        return 'off', '신호 파일 읽기 실패', ''
    folder = b.get('dir') or ''
    age = time.time() - float(b.get('ts', 0))
    state = b.get('state', 'off')
    if state == 'off':
        return 'off', f"종료됨 ({b.get('time','')} {b.get('note','')})".strip(), folder
    if age > OFF_AFTER:
        return 'off', f"마지막 신호 {b.get('time','')} ({int(age)}초 전) — 응답 없음", folder
    if state == 'busy':
        return state, f"실행 중: {b.get('job','')}", folder
    return state, (b.get('note') or f"마지막 신호 {b.get('time','')}"), folder

def g1_bat(name):
    _, _, folder = read_g1()
    for d in (folder, G1_DIR_DEFAULT):
        if d and os.path.exists(os.path.join(d, name)):
            return os.path.join(d, name)
    return ''

def read_beat():
    """신호 파일 → (state, 설명문). 파일이 없거나 오래됐으면 off."""
    try:
        with open(BEAT, encoding='utf-8') as f:
            b = json.load(f)
    except Exception:
        return 'off', '신호 없음 (러너가 켜진 적 없거나 구버전)'
    age = time.time() - float(b.get('ts', 0))
    state = b.get('state', 'off')
    if state == 'off':
        return 'off', f"종료됨 ({b.get('time','')} {b.get('note','')})".strip()
    if age > OFF_AFTER:
        return 'off', f"마지막 신호 {b.get('time','')} ({int(age)}초 전) — 응답 없음"
    desc = f"마지막 신호 {b.get('time','')}"
    if state == 'busy':
        desc = f"실행 중: {b.get('job','')}  ({b.get('note','')})\n{desc}"
    elif b.get('note'):
        desc = f"{b.get('note')}\n{desc}"
    return state, desc

def tip(s, d, g, gd):
    """툴팁 (윈도우 한도 127자). G1 이 없는 PC 는 예전과 같음."""
    if g is None:
        return f"원격 러너 [{USER}]: {LABEL[s]}\n{d}"[:127]
    first = d.split('\n')[0]
    return f"원격 러너: {LABEL[s]}\n{first[:40]}\nG1 웹연결: {G1_LABEL.get(g, g)}\n{gd[:40]}"[:127]

def run_bat(path):
    """bat 을 보이는 창으로 띄운다 (사장님이 메시지를 볼 수 있게)."""
    try:
        subprocess.Popen(['cmd', '/c', 'start', '', path], cwd=HERE, shell=False)
    except Exception as e:
        notify(f"실행 실패: {e}")

def open_log(path=None):
    path = path or LOG
    try:
        if os.path.exists(path): os.startfile(path)
        else: notify('로그 파일이 아직 없습니다')
    except Exception as e:
        notify(f"로그 열기 실패: {e}")

_icon = None
def notify(msg):
    try:
        if _icon: _icon.notify(msg, '러너 트레이')
    except Exception:
        pass

def already_running():
    """tray_<사용자>.pid 의 프로세스가 살아 있으면 True (중복 아이콘 방지)."""
    try:
        pid = int(open(LOCK).read().strip())
        if pid == os.getpid(): return False
        out = subprocess.run(['tasklist', '/FI', f'PID eq {pid}'], capture_output=True, text=True, timeout=10).stdout
        return str(pid) in out
    except Exception:
        return False

def main():
    global _icon
    if already_running():
        sys.exit(0)
    try:
        with open(LOCK, 'w') as f: f.write(str(os.getpid()))
    except Exception:
        pass
    state, desc = read_beat()
    g1, g1desc, _ = read_g1()
    icon = pystray.Icon('remote_runner', make_icon2(state, g1), tip(state, desc, g1, g1desc))
    _icon = icon

    def on_start(i, item): run_bat(START_BAT)
    def on_stop(i, item):  run_bat(STOP_BAT)
    def on_log(i, item):   open_log()
    def on_board(i, item): webbrowser.open(BOARD_URL)
    def on_cs(i, item):    webbrowser.open(CS_URL)
    def on_g1log(i, item): open_log(G1_LOG)
    def on_g1(name):
        def f(i, item):
            p = g1_bat(name)
            if p: run_bat(p)
            else: notify(f'{name} 를 찾지 못했습니다 (G1_CS수집기 폴더)')
        return f
    def on_quit(i, item):
        try: os.remove(LOCK)
        except Exception: pass
        i.stop()

    def status_text(item):
        s, _ = read_beat()
        return f"러너: {LABEL[s]}"

    def g1_text(item):
        g, d, _ = read_g1()
        return f"G1 웹연결: {G1_LABEL.get(g, '-')}"

    has_g1 = lambda item: read_g1()[0] is not None

    icon.menu = pystray.Menu(
        pystray.MenuItem(status_text, None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('러너 시작 (창 없이·자동시작 등록)', on_start),
        pystray.MenuItem('러너 중지', on_stop),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('로그 보기', on_log),
        pystray.MenuItem('보드 열기', on_board),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(g1_text, None, enabled=False, visible=has_g1),
        pystray.MenuItem('G1 웹연결 시작 (창 없이·자동시작 등록)', on_g1('G1웹연결_백그라운드_등록.bat'), visible=has_g1),
        pystray.MenuItem('G1 웹연결 중지', on_g1('G1웹연결_중지.bat'), visible=has_g1),
        pystray.MenuItem('G1 웹연결 기록 보기', on_g1log, visible=has_g1),
        pystray.MenuItem('CS 관리 열기 (System V3)', on_cs, visible=has_g1),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('아이콘 끄기', on_quit),
    )

    def watcher():
        last = None; last_g = None; tick = 0
        while True:
            try:
                s, d = read_beat()
                g, gd, _ = read_g1()
                tick += 1
                icon.title = tip(s, d, g, gd)   # 매번 갱신: 마지막 신호 시각
                if s != last or g != last_g or 'busy' in (s, g):
                    icon.icon = make_icon2(s, g, tick)
                    if last is not None and s != last:
                        if s == 'off':   notify('러너가 꺼졌습니다')
                        elif last == 'off': notify('러너가 켜졌습니다')
                    if last_g is not None and g is not None and g != last_g:
                        if g == 'off':   notify('G1 웹연결이 꺼졌습니다')
                        elif last_g == 'off': notify('G1 웹연결이 켜졌습니다')
                    if (last_g is None) != (g is None):
                        try: icon.update_menu()
                        except Exception: pass
                    last, last_g = s, g
            except Exception:
                pass
            time.sleep(3 if 'busy' in (last, last_g) else 5)

    threading.Thread(target=watcher, daemon=True).start()
    icon.run()

if __name__ == '__main__':
    main()

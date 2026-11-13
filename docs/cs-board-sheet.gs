/**
 * (v17 부터 'OnlyCurrentDoc' 표시 없음 — 신상품 등록이 '업데이트 list' 시트를 읽고 쓰기 때문. 다른 시트는 정해진 ID 하나만 엽니다)
 *
 * System V3 CS 게시판 답변 시트 (2026-11-13 v29: 💬 상담톡에 에이블리 문의(채팅방) — chatIngest · chatList platform ably · v28 2026-11-12: 메이크샵 글자 깨짐 정리 — 다시 수집되면 상품명도 갱신 · 깨진 글로 만든 AI 답변안은 비우고 다시 추천(채택·등록 전만) · AI 답이 잘려 와도 답변 하나하나로 나눔 · v27: 피킹시스템 맨 위 ★ 공지 메모장(noticeGet · noticeSave — '공지' 탭 한 칸, 먼저 고친 것은 덮어쓰지 않음) · v26: 배송기록 빈 메모 슬롯 선택 지우기(shipMemoDelete — '배송기록 메모_지움' 탭으로 옮김, 되살릴 수 있음) · v25: 메이크샵 Q&A 등 게시판 답변도 자동 등록 요청 받음(웹연결 1.26) · 반품기록 ID 겹침 막음 · v24: 배송기록 메모 칸 늘림(전화번호·매입처 · 상품명·옵션명·자사코드) · 빈 메모 슬롯 · 주문서 찾기용 송장 글자 힌트(shipHints) · v23: 배송기록 메모 기타를 줄마다 · v22: 배송기록 주문별 메모 — 송장 묶음마다 이름·상품코드·수량·기타 ('배송기록 메모' 탭, shipMemoList · shipMemoSave) · v21: 상담톡 보조내용에 상담 상품 카드(사진 주소 · 상품명 · 옵션 · 주문) · v20: 💬 상담톡 — 스마트스토어 톡톡 · 카카오 해피톡 대화를 수집기 PC 가 넣고(chatIngest) 화면이 읽음(chatList), 답변 후보 5개(chatSuggest) · 2026-11-10 v19: 반품기록 메모 — '반품기록' 탭에 카드 메모(retList · retSave, 먼저 고친 것은 덮어쓰지 않음, 삭제는 표시만) · 2026-11-10 v18: 배송기록 업로드 — 화면에서 송장 사진·동영상을 5_배송기록\_NAS로 폴더로 올림 → 사무실 PC 가 NAS [배송기록]으로 옮김(shipUpload: 시트는 드라이브 이어올리기 주소만 만들고 파일은 브라우저가 직접) · 신상품 등록 C열 사진 · 2026-11-10 v17: 신상품 등록 — '업데이트 list' 시트 '업데이트 순서' 탭 읽기·칸 수정·새 줄 추가(newList · newSave · newAdd, 스프레드시트 권한 필요) · 2026-11-10 v16: 배송사진 — 드라이브 '배송사진' 폴더의 송장 사진에서 수신자 이름을 읽어 파일명에 붙임(shipList · shipScan, 드라이브 권한 필요) · 2026-11-10 v15: 옵션 사진 짝짓기 — optionPhotoAi: 자사몰 사진 + 옵션 목록 → AI 가 옵션마다 사진·자리 · 2026-11-09 v14: XX 표시 · v13: 사진 색인 · 2026-11-06 v12: 상품 현황 단종 표시 — '단종' 탭에 셀피아 코드(옵션) 목록 · discList/discSet · 2026-11-06 v11: 원격 로그인 — 수집기 PC 로그인 창 화면을 웹에 보여 주고 웹에서 넣은 퀴즈 정답·클릭을 수집기 PC가 대신 넣음(화면은 10분 임시 보관, 시트에 안 남김) · 2026-11-05 v10: 메이크샵 리뷰 답글 자동 등록 + 리뷰 적립금(실구매금액 × %, 설정은 스크립트 속성 MS_POINT_PCT·MS_POINT_MSG) · 2026-11-05 v9: 메신저 대화창 그림을 AI 가 읽고 답변 후보 (msnSuggest — 그림은 저장 안 함) · 2026-11-04 v8: CS 화면이 열려 있으면 수집기 PC가 3초마다 요청 확인(평소 15초) · 2026-11-03 v7: 수집 결과 넣기를 몰아서 써서 빠르게(잠금 막힘 해소) · 2026-11-02 v6: 간단 비밀번호로 열기 · 2026-10-29 v5: 웹연결 업데이트 요청·상품명 요청 · v4: 로그인·설정·자동 수집·API·IP·파일 목록을 웹에서 · v3: 수집기 PC 처음 설정 상태 표시 · v2: 수집기 PC 연결 — 수집·등록 요청, 리뷰, AI 사용량)
 * G1 CS 수집기가 모은 문의·리뷰를 이 시트에 모으고, System V3 CS 관리 화면(브라우저)에서
 * 답변안 A~J 중에서 고르고·고치고·보류합니다. AI 추천(답변 후보 10개)도 여기서 대신 부릅니다.
 * 수집기 PC의 연결 프로그램(g1_v3_link.py)이 여기서 요청을 가져가 수집·등록하고 결과를 돌려줍니다.
 *
 * 설치(대표님이 한 번):
 *   1) 구글드라이브 A_총괄 폴더 시트 "System V3 CS문의" > 확장 프로그램 > Apps Script 에 이 파일 내용을 붙여넣고 저장
 *   2) 위 함수 선택에서 "처음설정" 을 골라 ▶ 실행 → 권한 허용 → 실행 로그에 나온 비밀번호 2개를 메모
 *      (BOARD_TOKEN = 화면용, COLLECTOR_TOKEN = 수집기 PC용. 이 저장소·채팅에는 적지 않습니다)
 *   3) 프로젝트 설정(톱니바퀴) > 스크립트 속성 > CLAUDE_KEY 에 Claude API 키 추가
 *      (선택) CLAUDE_MODEL 기본 claude-haiku-5-5 / AI_DAILY_LIMIT 하루 AI 추천 최대 횟수, 기본 300
 *   4) 배포 > 새 배포 > 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 웹앱 주소를 알려주세요
 *   5) (v6, 선택) 스크립트 속성 UNLOCK_PASSWORD 에 외우기 쉬운 간단 비밀번호(6자 이상)를 대표님이 직접 넣기
 *      → 화면 [설정] 탭에 긴 BOARD_TOKEN 대신 이 비밀번호를 넣어도 열림. 5번 틀리면 15분 잠금(계속 틀리면 30·60분… 최대 24시간)
 *
 * 이 시트가 하는 일 (이것뿐):
 *   - unlock   (누구나) 간단 비밀번호(UNLOCK_PASSWORD)가 맞으면 BOARD_TOKEN 을 돌려줌 — 틀리면 횟수 기록·잠금
 *   - list     (화면)   종료되지 않은 문의·리뷰 목록 + 수집기 PC 상태 + 최근 요청
 *   - save     (화면)   선택·고친 문안·보류 저장. 다른 사람이 먼저 바꿨으면 덮어쓰지 않고 알려줌
 *   - suggest  (화면)   AI 답변 후보 10개를 받아 답변안 뒤에 붙임(기존 답변안·선택은 그대로)
 *   - request  (화면)   수집·리뷰 수집·테스트 수집·등록 요청을 [요청] 탭에 한 줄 추가 (같은 종류가 이미 대기 중이면 추가 안 함)
 *   - cancel   (화면)   아직 시작 안 한 요청 취소
 *   - usage    (화면)   날짜별 AI 사용량
 *   - name     (화면)   상품명 요청: 키워드·메모 → AI 상품명 후보 (규칙은 [상품명 규칙] 탭 A1 — 거기서 고치면 바로 반영, 요청·결과는 [상품명 요청] 탭에 기록)
 *   - ingest   (수집기) 수집한 문의·리뷰 추가·갱신. 이미 있는 줄의 선택·답변안은 건드리지 않음.
 *                       정상 수집된 업체에서 사라진(=답변된) 문의는 "종료" — 다시 나타나면 다시 열림
 *   - close    (수집기) 이미 답변된 문의를 "종료"로
 *   - poll     (수집기) 살아 있음 알림 + 대기 중 요청 1개 가져가기(실행중으로 표시) + 처음 설정 상태(있다/없다만, 비밀값 없음)
 *   - finish   (수집기) 요청 결과 기록, 등록 결과를 문의 줄에 표시(등록완료면 종료)
 *   - progress (수집기) 실행 중 요청의 진행 안내 (예: "휴대폰에서 [확인]을 눌러 주세요")
 *   - selfJob  (수집기) 수집기 PC가 스스로 시작한 자동 수집을 [요청] 탭에 기록
 * 로그인 비밀번호·API 키는 화면에서 수집기 PC 공개키로 잠근(암호화) 값만 지나가고,
 * 수집기 PC가 가져가는 순간 [요청] 탭에서 "(전달됨)"으로 지웁니다. 풀 수 있는 건 수집기 PC뿐입니다.
 * 줄은 절대 지우지 않습니다. 시트의 다른 탭·다른 파일은 건드리지 않습니다.
 */
var SHEET_NAME = 'CS문의';
var JOB_SHEET = '요청';
var PHOTO_INDEX_SHEET = '사진색인';          // v13: 상품찾기 사진 검색 색인 (조각 번호 · 내용)
var PHOTO_INDEX_STAGE = '사진색인_새로';      // 올리는 중인 색인 — 다 올라오면 사진색인 으로 바꿈
var PHOTO_INDEX_CHUNK = 45000;               // 셀 하나 최대 글자 (구글 시트 한도 50,000)
var PHOTO_HUB_PREFIX = 'https://bpgvqmtsjgegnrdzmpep.supabase.co/storage/v1/object/public/product-images/sellpia/';
var DISC_SHEET = '단종';
var XX_SHEET = 'XX표시';                     // v14: 전달사항·임의필드의 XX · XXX 표시 (상품 현황 옵션명 옆 빨간 글씨)   // v12: 상품 현황 단종 옵션 (셀피아 코드 · 단종일시 · 처리자)
var HEADER = ['키', '업체', '게시판', '문의ID', '문의시각', '상품명', '상태', '문의', '답변안', '선택', '버전', '수정자', '수정시각', '수집시각', '종료', '등록'];
var COL = { key: 1, vendor: 2, board: 3, id: 4, date: 5, product: 6, status: 7, inquiry: 8, drafts: 9, choice: 10, version: 11, editor: 12, editedAt: 13, collectedAt: 14, closed: 15, reg: 16 };
var JOB_HEADER = ['ID', '종류', '상태', '요청자', '요청시각', '시작시각', '끝시각', '내용', '결과', 'PC'];
var JOB = { id: 1, kind: 2, status: 3, by: 4, at: 5, started: 6, ended: 7, body: 8, result: 9, pc: 10 };
var JOB_KINDS = { collect: '게시판 수집', reviews: '리뷰 수집', test: '테스트 수집', testReviews: '테스트 리뷰 수집', register: '등록',
  login: '로그인', settings: '설정 저장', apiTest: 'API 연결 테스트', apiKey: 'API 키 저장', ip: '공인 IP 확인', files: '수집 파일 목록', auto: '자동 수집',
  update: '웹연결 업데이트' };
var STAFF_KINDS = ['collect', 'reviews', 'test', 'testReviews', 'register', 'login', 'settings', 'apiTest', 'apiKey', 'ip', 'files', 'update'];
var REPLACE_KINDS = ['login', 'settings', 'apiKey', 'update']; // 대기 중인 같은 종류는 새 요청으로 바꿈
// 웹연결 업데이트: 이 저장소의 정해진 커밋 파일만 (주소·해시는 수집기 PC가 다시 확인)
var UPDATE_URL_RE = /^https:\/\/raw\.githubusercontent\.com\/w-works-official\/Picking_System\/[0-9a-f]{40}\/docs\/g1_v3_link\.py$/;
var NAME_RULES_SHEET = '상품명 규칙';
var NAME_LOG_SHEET = '상품명 요청';
var NAME_LOG_HEADER = ['요청시각', '요청자', '키워드·메모', '개수', '결과'];
var DEFAULT_NAME_RULES = '당신은 피어싱·귀걸이 쇼핑몰 \'핑크로켓\'의 상품명 담당자입니다. 주신 키워드·메모로 판매용 상품명 후보를 만듭니다.\n' +
  '\n' +
  '규칙 (임시 — 대표님 규칙으로 바꿔 쓰세요. 이 칸(A1)을 고치면 바로 반영됩니다)\n' +
  '- 지금 쓰는 상품명 모양을 따름: 소재 → 특징 → 상품 종류 → 두께·길이 → 종류 수 → 착용 부위 순서로 띄어쓰기로 나열\n' +
  '  예) 써지컬피어싱 데일리 미니 피어싱 바벨 얇은 바변경 100종 1 귓볼 귓바퀴 이너컨츠 아웃컨츠\n' +
  '  예) 실버 925 미니 큐빅 볼 피어싱 얇은 0.8mm 120종\n' +
  '- 검색에 쓰이는 낱말 위주, 특수문자·이모지·과장 표현(최고, 1위 등) 쓰지 않기\n' +
  '- 50자 안팎, 같은 낱말 반복하지 않기\n' +
  '- 키워드에 없는 소재·수치는 지어내지 않기';

var SECRET_KINDS = ['login', 'apiKey'];               // 가져가면 [요청] 탭의 암호문을 지움
var BOARD_VENDORS = ['스마트스토어', '지그재그', '에이블리', '메이크샵'];
var REVIEW_VENDORS = ['지그재그', '에이블리', '메이크샵'];
var REGISTER_SUPPORTED = { '스마트스토어|상품문의': true, '스마트스토어|고객문의': true, '메이크샵|리뷰': true }; // 스마트스토어 = 수집기 g1_register · 메이크샵 리뷰 = 웹연결 1.14 (v10)
// v25: 메이크샵은 게시판(Q&A · 도매 문의 등)도 — 웹연결 1.26 이 [간편답변] 창으로 등록
function registerSupported_(vendor, board) { return !!REGISTER_SUPPORTED[vendor + '|' + board] || (vendor === '메이크샵' && !!String(board || '').trim()); }
// v10: 메이크샵 리뷰 적립금 — 실구매금액 × MS_POINT_PCT % (MS_POINT_UNIT 원 미만 버림). 0 이면 답글만
var POINT_MAX_PCT = 30;
var POINT_UNIT = 10;
var POINT_MSG_DEFAULT = '[PRODUCT_NAME] 리뷰 적립금';
var MAX_INGEST = 300;
var MAX_DRAFTS = 40;
var MAX_AUTO_SUGGEST = 20;
var CELL_LIMIT = 45000;
var DEFAULT_MODEL = 'claude-haiku-5-5';
var DEFAULT_DAILY_LIMIT = 300;
var STALE_JOB_MS = 30 * 60 * 1000; // 실행중 30분 넘으면 실패로 정리

// G1 수집기 g1_ai.py 의 SHOP_RULES 와 같은 규칙 (바꾸면 두 곳 다 바꿀 것)
var SHOP_RULES =
  '당신은 피어싱·귀걸이 쇼핑몰 \'핑크로켓\'의 CS 담당자입니다. 고객 메시지에 보낼 답변 후보를 만듭니다.\n' +
  '\n' +
  '말투\n' +
  '- 친절한 존댓말, 짧고 또렷하게. 메신저 답변은 2~4문장.\n' +
  '- 첫 인사는 "안녕하세요 고객님 :)" 로 시작. 이모지는 :) 나 ♥ 정도만 가끔.\n' +
  '\n' +
  '지켜야 할 것\n' +
  '- 확인되지 않은 사실(재고 수량, 재입고 날짜, 출고일, 송장번호, 금액, 환불 여부)은 지어내지 말 것.\n' +
  '  필요하면 "확인 후 바로 안내드리겠습니다" 처럼 확인을 약속하는 표현을 쓸 것.\n' +
  '- 우리 쇼핑몰 기본 안내: 바(침) 두께·길이 변경은 옵션(바변경)으로 가능한 제품이 많고, 변경 시 출고가 1~2일 더 걸릴 수 있음.\n' +
  '- 개인정보(계좌번호·전화번호)는 답변에 다시 적지 말 것.\n' +
  '\n' +
  '답변 후보 10개를 만들 때\n' +
  '- 서로 다른 방향으로: 바로 처리 확정 / 담당팀 전달 / 확인 후 안내 / 사과 / 대안 제안 / 추가 정보 요청 등.\n' +
  '- 같은 문장을 반복하지 말 것.\n' +
  '- 출력은 JSON 문자열 배열 하나만. 다른 설명 없이: ["답변1", "답변2", ...]';

var REVIEW_RULES = '\n\n리뷰 답글일 때\n' +
  '- 고객이 남긴 상품 후기에 다는 답글입니다. 감사 인사 위주로 1~3문장.\n' +
  '- 별점이 낮거나 불만이면 사과하고 개선·확인을 약속하되, 보상·환불은 약속하지 말 것.';

// ---------- 처음설정 (Apps Script 편집기에서 한 번 실행) ----------
function 처음설정() {
  var props = PropertiesService.getScriptProperties();
  var made = [];
  ['BOARD_TOKEN', 'COLLECTOR_TOKEN'].forEach(function (name) {
    if (!props.getProperty(name)) {
      props.setProperty(name, Utilities.getUuid().replace(/-/g, '').slice(0, 24));
      made.push(name);
    }
  });
  sheet_();
  jobSheet_();
  Logger.log('화면 비밀번호 BOARD_TOKEN = ' + props.getProperty('BOARD_TOKEN'));
  Logger.log('수집기 비밀번호 COLLECTOR_TOKEN = ' + props.getProperty('COLLECTOR_TOKEN'));
  Logger.log(made.length ? '새로 만든 값: ' + made.join(', ') : '이미 있던 값을 그대로 둡니다.');
  Logger.log('Claude 키: ' + (props.getProperty('CLAUDE_KEY') ? '등록됨' : '아직 없음 — 스크립트 속성 CLAUDE_KEY 에 넣어 주세요'));
}

function doGet(e) {
  // 주소 확인용 — 문의 데이터는 돌려주지 않습니다(토큰은 POST 본문으로만)
  // v13: 사진 검색 색인(상품코드 + 사진 특징값 — 개인정보 없음)만 토큰 없이 읽기
  var p = (e && e.parameter) || {};
  if (p.action === 'photoIndexMeta') return json_(photoIndexMeta_());
  if (p.action === 'photoIndexGet') return json_(photoIndexGet_(p));
  return json_({ ok: true, service: 'system-v3-cs-board', version: 28 });
}

function doPost(e) {
  var result;
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    result = route_(body);
  } catch (error) {
    result = { ok: false, error: String(error && error.message || error) };
  }
  return json_(result);
}

function json_(result) {
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function prop_(name) {
  return String(PropertiesService.getScriptProperties().getProperty(name) || '');
}

function setProp_(name, value) {
  PropertiesService.getScriptProperties().setProperty(name, value);
}

function sameToken_(given, expected) {
  given = String(given || '');
  if (!expected || expected.length < 8 || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// 비교 시간이 값에 따라 달라지지 않게 (길이 제한 없는 버전 — 간단 비밀번호용)
function sameSecret_(given, expected) {
  given = String(given || '');
  expected = String(expected || '');
  if (!expected || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// ---------- 간단 비밀번호로 열기 (v6) ----------
var UNLOCK_MIN_LENGTH = 6;
var UNLOCK_TRIES = 5;          // 이만큼 틀리면 잠금
var UNLOCK_LOCK_MINUTES = 15;  // 첫 잠금. 또 틀리면 2배씩 (최대 24시간)

function unlock_(body) {
  var secret = prop_('UNLOCK_PASSWORD');
  var board = prop_('BOARD_TOKEN');
  if (secret.length < UNLOCK_MIN_LENGTH || !board) {
    return { ok: false, error: '간단 비밀번호가 아직 설정되지 않았습니다 — 스크립트 속성 UNLOCK_PASSWORD 에 6자 이상으로 넣어 주세요.' };
  }
  var now = Date.now();
  var until = Number(prop_('UNLOCK_LOCK_UNTIL') || 0);
  if (until > now) {
    return { ok: false, locked: true, error: '잠겨 있습니다 — 틀린 비밀번호가 여러 번 들어와 ' + Math.ceil((until - now) / 60000) + '분 뒤에 다시 시도할 수 있습니다.' };
  }
  if (sameSecret_(body.password, secret)) {
    setProp_('UNLOCK_FAILS', '0');
    return { ok: true, token: board };
  }
  var fails = Number(prop_('UNLOCK_FAILS') || 0) + 1;
  setProp_('UNLOCK_FAILS', String(fails));
  if (fails % UNLOCK_TRIES === 0) {
    var minutes = Math.min(24 * 60, UNLOCK_LOCK_MINUTES * Math.pow(2, fails / UNLOCK_TRIES - 1));
    setProp_('UNLOCK_LOCK_UNTIL', String(now + minutes * 60000));
    return { ok: false, denied: true, locked: true, error: '비밀번호가 맞지 않습니다 — ' + UNLOCK_TRIES + '번 틀려 ' + minutes + '분 동안 잠급니다.' };
  }
  return { ok: false, denied: true, error: '비밀번호가 맞지 않습니다 (' + (UNLOCK_TRIES - fails % UNLOCK_TRIES) + '번 더 틀리면 잠깁니다).' };
}

function route_(body) {
  var action = String(body.action || '');
  if (action === 'unlock') return withLock_(function () { return unlock_(body); });
  var staff = ['list', 'save', 'suggest', 'request', 'cancel', 'usage', 'name', 'msnSuggest', 'point', 'loginShotGet', 'loginAnswer', 'discList', 'discSet', 'photoIndexBegin', 'photoIndexPut', 'photoIndexCommit', 'photoAi', 'xxList', 'xxSet', 'optionPhotoAi', 'shipList', 'shipScan', 'shipUpload', 'newList', 'newPics', 'newSave', 'newAdd', 'retList', 'retSave', 'chatList', 'chatSuggest', 'shipMemoList', 'shipMemoSave', 'shipHints', 'shipMemoDelete', 'noticeGet', 'noticeSave'];
  var collector = ['ingest', 'close', 'poll', 'finish', 'progress', 'selfJob', 'loginShot', 'chatIngest'];
  if (staff.indexOf(action) >= 0) {
    if (!sameToken_(body.token, prop_('BOARD_TOKEN'))) return { ok: false, denied: true, error: '비밀번호가 맞지 않습니다.' };
  } else if (collector.indexOf(action) >= 0) {
    if (!sameToken_(body.token, prop_('COLLECTOR_TOKEN'))) return { ok: false, denied: true, error: '수집기 비밀번호가 맞지 않습니다.' };
  } else {
    return { ok: false, error: '알 수 없는 요청입니다.' };
  }
  if (action === 'list') return list_();
  if (action === 'save') return withLock_(function () { return save_(sheet_(), body); });
  if (action === 'suggest') return suggest_(body);
  if (action === 'request') return withLock_(function () { return request_(body); });
  if (action === 'cancel') return withLock_(function () { return cancel_(body); });
  if (action === 'usage') return { ok: true, usage: usage_() };
  if (action === 'name') return name_(body);
  if (action === 'msnSuggest') return msnSuggest_(body);
  if (action === 'point') return withLock_(function () { return point_(body); });
  if (action === 'discList') return discList_();
  if (action === 'discSet') return withLock_(function () { return discSet_(body); });
  if (action === 'photoIndexBegin') return withLock_(function () { return photoIndexBegin_(body); });
  if (action === 'photoIndexPut') return withLock_(function () { return photoIndexPut_(body); });
  if (action === 'photoIndexCommit') return withLock_(function () { return photoIndexCommit_(body); });
  if (action === 'photoAi') return photoAi_(body);
  if (action === 'optionPhotoAi') return optionPhotoAi_(body);
  if (action === 'shipList') return shipList_();
  if (action === 'shipScan') return shipScan_(body);
  if (action === 'shipUpload') return shipUpload_(body);
  if (action === 'newList') return updList_();
  if (action === 'retList') return retList_();
  if (action === 'chatList') return chatList_(body);
  if (action === 'shipMemoList') return shipMemoList_();
  if (action === 'shipMemoSave') return withLock_(function () { return shipMemoSave_(body); });
  if (action === 'shipHints') return shipHints_(body);
  if (action === 'shipMemoDelete') return withLock_(function () { return shipMemoDelete_(body); });
  if (action === 'noticeGet') return noticeGet_();
  if (action === 'noticeSave') return withLock_(function () { return noticeSave_(body); });
  if (action === 'chatSuggest') return chatSuggest_(body);
  if (action === 'chatIngest') return withLock_(function () { return chatIngest_(body); });
  if (action === 'retSave') return withLock_(function () { return retSave_(body); });
  if (action === 'newPics') return updPics_(body);
  if (action === 'newSave') return withLock_(function () { return updSave_(body); });
  if (action === 'newAdd') return withLock_(function () { return updAdd_(body); });
  if (action === 'xxList') return xxList_();
  if (action === 'xxSet') return withLock_(function () { return xxSet_(body); });
  if (action === 'loginShotGet') return loginShotGet_(body);
  if (action === 'loginAnswer') return loginAnswer_(body);
  if (action === 'loginShot') return loginShot_(body);
  if (action === 'ingest') {
    var result = withLock_(function () { return ingest_(sheet_(), body.rows, body.snapshot); });
    if (result.ok && result.newKeys && result.newKeys.length && body.autoSuggest !== false) result.suggested = autoSuggest_(result.newKeys);
    delete result.newKeys;
    return result;
  }
  if (action === 'close') return withLock_(function () { return close_(sheet_(), body.keys, '수집기 종료'); });
  if (action === 'poll') return withLock_(function () { return poll_(body); });
  if (action === 'progress') return withLock_(function () { return progress_(body); });
  if (action === 'selfJob') return withLock_(function () { return selfJob_(body); });
  return withLock_(function () { return finish_(body); });
}

function withLock_(work) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return work();
  } finally {
    lock.releaseLock();
  }
}

function book_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (book.getSpreadsheetTimeZone && book.getSpreadsheetTimeZone() !== 'Asia/Seoul') book.setSpreadsheetTimeZone('Asia/Seoul');
  return book;
}

function sheet_() {
  var book = book_();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.getSheets()[0];
    if (sheet.getLastRow() !== 0) sheet = book.insertSheet(SHEET_NAME);
    else sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  } else if (String(sheet.getRange(1, HEADER.length).getValue()) === '') {
    sheet.getRange(1, HEADER.length).setValue(HEADER[HEADER.length - 1]); // v1 시트(15칸)에 '등록' 머리글만 추가
  }
  return sheet;
}

function jobSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(JOB_SHEET);
  if (!sheet) sheet = book.insertSheet(JOB_SHEET);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(JOB_HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// ---------- 값 정리 ----------
function clean_(value, limit) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  return /^[=+\-@]/.test(text) ? "'" + text : text; // 수식으로 해석되지 않게
}

function plain_(value) {
  var text = String(value == null ? '' : value);
  return text.charAt(0) === "'" ? text.slice(1) : text;
}

function body_(value, limit) {
  return String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, limit);
}

function url_(value) {
  var url = String(value == null ? '' : value).trim();
  return /^https:\/\/[^\s"'<>]+$/i.test(url) ? url.slice(0, 1000) : '';
}

function parse_(text, fallback) {
  try {
    var value = JSON.parse(String(text || ''));
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function stringify_(value) {
  var text = JSON.stringify(value);
  if (text.length > CELL_LIMIT) throw new Error('내용이 너무 깁니다.');
  return "'" + text; // 시트가 숫자·수식으로 바꾸지 않게
}

function iso_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || '');
}

// "2026-10-29 10:12" 같은 글자 → 시각(ms). 못 읽으면 NaN
function when_(text) {
  if (text instanceof Date) return text.getTime();
  var m = String(text || '').match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], (+m[4] || 0) - 9, +m[5] || 0); // 한국 시간
}

function isReview_(board) {
  return plain_(board) === '리뷰';
}

// 수집기 행(한글 키) → 시트에 넣을 문의 내용 (문의·리뷰 같이)
function inquiryFrom_(row) {
  var photos = [];
  var urls = Array.isArray(row['사진URL']) ? row['사진URL'] : [];
  for (var p = 0; p < urls.length && photos.length < 12; p++) {
    var u = url_(urls[p]);
    if (u) photos.push(u);
  }
  var context = [];
  var history = Array.isArray(row['맥락']) ? row['맥락'].slice(-12) : [];
  for (var c = 0; c < history.length; c++) {
    var h = history[c] || {};
    context.push({ kind: plain_(clean_(h['구분'], 30)), date: plain_(clean_(h['날짜'], 40)), question: body_(h['내용'], 2000), answer: body_(h['답변'], 2000) });
  }
  var review = isReview_(row['게시판']);
  var star = String(row['별점'] == null ? '' : row['별점']).trim();
  var checks = [];
  if (row['확인'] || row['확인 필요']) checks.push(body_(row['확인'] || row['확인 필요'], 800));
  if (row['답글불가']) checks.push('이 업체는 리뷰 답글 기능이 없습니다 (목록 확인용)');
  return {
    kind: review ? '리뷰' : '문의',
    title: plain_(clean_(row['제목'], 300)),
    question: body_(review ? (row['내용'] || row['문의']) : (row['문의'] || row['내용']), 4000),
    type: plain_(clean_(row['유형'] || (star ? '별점 ' + star : ''), 60)),
    option: plain_(clean_(row['옵션'], 300)),
    check: checks.join('\n'),
    noReply: !!row['답글불가'],
    productLink: url_(row['상품링크']),
    productImage: url_(row['상품이미지']),
    link: url_(row['글링크'] || row['관리링크']),
    photos: photos,
    context: context,
  };
}

function rowKey_(row) {
  var vendor = plain_(clean_(row['업체'], 40));
  var board = plain_(clean_(row['게시판'], 40));
  var id = plain_(clean_(row['id'], 120));
  return vendor && id ? vendor + '_' + board + '_' + id : '';
}

function draftsFrom_(list) {
  var out = [];
  var items = Array.isArray(list) ? list : [];
  for (var i = 0; i < items.length && out.length < MAX_DRAFTS; i++) {
    var text = body_(typeof items[i] === 'string' ? items[i] : (items[i] && items[i].text), 2000).trim();
    if (text) out.push({ text: text, from: plain_(clean_(items[i] && items[i].from, 20)) || '수집' });
  }
  return out;
}

function statusOf_(closed, drafts, choice, reg) {
  if (reg && reg.state === '완료') return '등록완료';
  if (closed) return '종료';
  if (reg && reg.state === '요청') return '등록요청';
  if (choice && choice.hold) return '보류';
  if (choice && choice.pick >= 0) return '채택';
  return drafts.length ? '답변안' : '미답변';
}

// ---------- 읽기 ----------
function values_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADER.length).getValues();
}

function rowOut_(values) {
  return {
    key: plain_(values[COL.key - 1]),
    vendor: plain_(values[COL.vendor - 1]),
    board: plain_(values[COL.board - 1]),
    id: plain_(values[COL.id - 1]),
    date: iso_(values[COL.date - 1]),
    product: plain_(values[COL.product - 1]),
    inquiry: parse_(plain_(values[COL.inquiry - 1]), {}),
    drafts: parse_(plain_(values[COL.drafts - 1]), []),
    choice: parse_(plain_(values[COL.choice - 1]), {}),
    version: Number(values[COL.version - 1]) || 0,
    editor: plain_(values[COL.editor - 1]),
    editedAt: iso_(values[COL.editedAt - 1]),
    collectedAt: iso_(values[COL.collectedAt - 1]),
    closed: String(values[COL.closed - 1] || '') !== '',
    reg: parse_(plain_(values[COL.reg - 1]), null),
  };
}

function openRows_(sheet) {
  var rows = values_(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rowOut_(rows[i]);
    if (!row.key) continue;
    if (!row.closed) out.push(row);
    else if (row.reg && row.editedAt && Date.now() - new Date(row.editedAt).getTime() < 24 * 3600 * 1000) out.push(row); // 방금 등록·종료된 건은 하루 동안 보여줌
  }
  return out;
}

function find_(sheet, key) {
  var rows = values_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (plain_(rows[i][COL.key - 1]) === key) return { index: i + 2, values: rows[i] };
  }
  return null;
}

function collectorState_() {
  var state = parse_(prop_('COLLECTOR_STATE'), {});
  return {
    pc: state.pc || '',
    seenAt: state.seenAt || '',
    version: state.version || '',
    busy: !!state.busy,
    last: state.last || null,
    reviewLast: state.reviewLast || null,
    setup: state.setup || null,
  };
}

// 수집기 PC 처음 설정 상태: 정해진 칸만, 짧게 (비밀값은 원래 오지 않음 — 있다/없다만)
function cleanSetup_(raw) {
  if (!raw || typeof raw !== 'object') return null;
  var b = function (v) { return v === true ? true : v === false ? false : null; };
  var n = function (v) { var x = Number(v); return isFinite(x) ? Math.max(0, Math.min(100000, Math.round(x))) : 0; };
  var t = function (v, len) { return plain_(clean_(v, len)); };
  var list = function (v) { return Array.isArray(v) ? v.slice(0, 6).map(function (x) { return t(x, 20); }) : []; };
  return {
    dir: t(raw.dir, 200), outDir: t(raw.out_dir, 200), days: n(raw.days), reviewDays: n(raw.review_days), zzSlug: t(raw.zz_slug, 40),
    showBrowser: b(raw.show_browser), autoStart: t(raw.auto_start, 10), interval: n(raw.interval),
    vendors: list(raw.vendors), reviewVendors: list(raw.review_vendors),
    loginOk: b(raw.login_ok), api: t(raw.api, 10), claude: b(raw.claude), parts: b(raw.parts), icon: b(raw.icon),
    autostart: b(raw.autostart), bg: b(raw.bg), collector: t(raw.collector, 40), link: t(raw.link, 40),
    pubKey: t(raw.pub_key, 800), autoOn: b(raw.auto_on), nextAuto: t(raw.next_auto, 20), savedLogins: list(raw.saved_logins),
  };
}

// v8: 누군가 CS 화면을 보고 있으면(최근 3분 안에 list·request) 수집기 PC가 요청을 빨리(3초마다) 가져가게 — 평소엔 15초
var WEB_HOT_MS = 3 * 60 * 1000;
function markWeb_() {
  var now = Date.now();
  if (now - Number(prop_('WEB_SEEN') || 0) > 20000) setProp_('WEB_SEEN', String(now));   // 20초에 한 번만 기록 (속성 쓰기 횟수 아끼기)
}
function webHot_() {
  return Date.now() - Number(prop_('WEB_SEEN') || 0) < WEB_HOT_MS;
}

function list_() {
  markWeb_();
  return {
    ok: true,
    rows: openRows_(sheet_()),
    aiEnabled: !!prop_('CLAUDE_KEY'),
    point: pointSetting_(),
    collector: collectorState_(),
    jobs: recentJobs_(10),
    serverTime: new Date().toISOString(),
  };
}

// ---------- 화면: 선택 저장 ----------
function choiceFrom_(raw, draftCount) {
  raw = raw && typeof raw === 'object' ? raw : {};
  var ok = function (n) { return n === Math.floor(n) && n >= 0 && n < draftCount; };
  var pick = Number(raw.pick);
  var view = [];
  var rawView = Array.isArray(raw.view) ? raw.view : [];
  for (var v = 0; v < rawView.length && view.length < 2; v++) {
    var n = Number(rawView[v]);
    if (ok(n) && view.indexOf(n) < 0) view.push(n);
  }
  var edits = {};
  var rawEdits = raw.edits && typeof raw.edits === 'object' ? raw.edits : {};
  for (var k in rawEdits) {
    if (Object.prototype.hasOwnProperty.call(rawEdits, k) && ok(Number(k))) edits[Number(k)] = body_(rawEdits[k], 2000);
  }
  var hold = raw.hold === true;
  return { pick: !hold && ok(pick) ? pick : -1, view: view, edits: edits, hold: hold };
}

function save_(sheet, body) {
  var key = plain_(clean_(body.key, 200));
  var found = key ? find_(sheet, key) : null;
  if (!found) return { ok: false, error: '문의를 찾지 못했습니다.' };
  var current = rowOut_(found.values);
  if (current.closed) return { ok: false, error: '이미 종료된 문의입니다.', row: current };
  if (current.reg && current.reg.state === '요청') return { ok: false, error: '등록 요청 중이라 고칠 수 없습니다.', row: current };
  if (Number(body.baseVersion) !== current.version) {
    return { ok: false, conflict: true, error: '다른 사람이 먼저 바꿨습니다. 새 내용으로 다시 불러왔습니다.', row: current };
  }
  var drafts = Array.isArray(current.drafts) ? current.drafts : [];
  var choice = choiceFrom_(body.choice, drafts.length);
  var now = new Date();
  var version = current.version + 1;
  sheet.getRange(found.index, COL.status, 1, 1).setValues([[statusOf_(false, drafts, choice, current.reg)]]);
  sheet.getRange(found.index, COL.choice, 1, 4).setValues([[stringify_(choice), version, clean_(body.editor, 40), now]]);
  current.choice = choice;
  current.version = version;
  current.editor = plain_(clean_(body.editor, 40));
  current.editedAt = now.toISOString();
  return { ok: true, row: current };
}

// ---------- AI 추천 ----------
function todayKey_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
}

// 하루 한도 안에서 n 회 쓸 수 있으면 미리 차감하고 쓸 수 있는 횟수를 돌려줌
function reserveAi_(n) {
  var limit = Number(prop_('AI_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
  var name = 'AI_COUNT_' + todayKey_();
  var used = Number(prop_(name) || 0);
  var allow = Math.max(0, Math.min(n, limit - used));
  if (allow) setProp_(name, String(used + allow));
  return { allow: allow, limit: limit };
}

// 사용량 기록 (수집기 AI사용량.json 과 같은 계산: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10 — 100만 토큰당, 1달러 1,400원)
function recordUsage_(usage, model, kind) {
  usage = usage || {};
  var input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  var output = usage.output_tokens || 0;
  var price = /haiku/.test(model) ? [0.10, 0.50] : [2.0, 10.0];
  var won = (input * price[0] + output * price[1]) / 1e6 * 1400;
  var all = parse_(prop_('AI_USAGE'), {});
  var day = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  var d = all[day] || { n: 0, won: 0, input: 0, output: 0, kinds: {} };
  d.n += 1;
  d.won = Math.round((d.won + won) * 100) / 100;
  d.input += input;
  d.output += output;
  d.kinds[kind] = (d.kinds[kind] || 0) + 1;
  all[day] = d;
  var keys = Object.keys(all).sort();
  while (keys.length > 62) delete all[keys.shift()]; // 두 달치만 보관
  setProp_('AI_USAGE', JSON.stringify(all));
}

function usage_() {
  return parse_(prop_('AI_USAGE'), {});
}

function suggest_(body) {
  var key = plain_(clean_(body.key, 200));
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 아직 등록되지 않았습니다(스크립트 속성 CLAUDE_KEY).' };
  var sheet = sheet_();
  var found = key ? find_(sheet, key) : null;
  if (!found) return { ok: false, error: '문의를 찾지 못했습니다.' };
  var row = rowOut_(found.values);
  if (row.closed) return { ok: false, error: '이미 종료된 문의입니다.', row: row };

  var quota = withLock_(function () { return reserveAi_(1); });
  if (!quota.allow) return { ok: false, error: '오늘 AI 추천 한도(' + quota.limit + '회)를 다 썼습니다.' };

  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', claudeRequest_(apiKey, row));
  var texts = answersFromResponse_(response, row); // 3~7초 — 잠금 밖에서
  return withLock_(function () {
    var again = find_(sheet, key);
    var latest = rowOut_(again.values);
    var drafts = appendDrafts_(sheet, again.index, latest, texts);
    latest.drafts = drafts;
    return { ok: true, row: latest, added: texts.length };
  });
}

function appendDrafts_(sheet, index, row, texts) {
  var drafts = Array.isArray(row.drafts) ? row.drafts : [];
  for (var i = 0; i < texts.length && drafts.length < MAX_DRAFTS; i++) drafts.push({ text: texts[i], from: 'AI' });
  sheet.getRange(index, COL.drafts, 1, 1).setValues([[stringify_(drafts)]]);
  sheet.getRange(index, COL.status, 1, 1).setValues([[statusOf_(row.closed, drafts, row.choice, row.reg)]]);
  return drafts;
}

function promptFor_(row) {
  var inquiry = row.inquiry || {};
  var review = isReview_(row.board);
  var lines = ['판매처: ' + row.vendor + (row.board ? ' / ' + row.board : '')];
  if (row.product) lines.push('상품: ' + row.product + (inquiry.option ? ' (옵션: ' + inquiry.option + ')' : ''));
  var context = Array.isArray(inquiry.context) ? inquiry.context.slice(-12) : [];
  if (context.length) {
    lines.push('', '이전 대화 (위에서 아래로 시간순):');
    for (var i = 0; i < context.length; i++) {
      if (context[i].question) lines.push('고객: ' + context[i].question);
      if (context[i].answer) lines.push('우리: ' + context[i].answer);
    }
  }
  if (review) {
    lines.push('', '이번 리뷰' + (inquiry.type ? ' (' + inquiry.type + ')' : '') + ':', '고객: ' + (inquiry.question || '(내용 없음)'));
  } else {
    lines.push('', '이번 문의' + (inquiry.title ? ' (제목: ' + inquiry.title + ')' : '') + ':', '고객: ' + (inquiry.question || '(내용 없음)'));
  }
  if (inquiry.photos && inquiry.photos.length) lines.push('(고객이 사진 ' + inquiry.photos.length + '장을 첨부함 — 사진 내용은 직접 확인하지 못함)');
  lines.push('', review ? '이 리뷰에 달 답글 후보 10개를 JSON 배열로만 출력하세요.' : '(게시판 답변이라 메신저보다 조금 길어도 됩니다: 2~5문장)', review ? '' : '이번 문의에 보낼 답변 후보 10개를 JSON 배열로만 출력하세요.');
  return lines.join('\n').replace(/\n+$/, '');
}

function claudeRequest_(apiKey, row) {
  var payload = {
    model: prop_('CLAUDE_MODEL') || DEFAULT_MODEL,
    max_tokens: 2500,
    system: [{ type: 'text', text: SHOP_RULES + (isReview_(row.board) ? REVIEW_RULES : ''), cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: promptFor_(row) }],
  };
  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };
}

function answersFromResponse_(response, row) {
  var status = response.getResponseCode();
  if (status !== 200) throw new Error('AI 응답 오류 (' + status + ')');
  var data = parse_(response.getContentText(), {});
  var text = '';
  var content = Array.isArray(data.content) ? data.content : [];
  for (var i = 0; i < content.length; i++) if (content[i] && content[i].type === 'text') text += content[i].text;
  recordUsage_(data.usage, prop_('CLAUDE_MODEL') || DEFAULT_MODEL, isReview_(row.board) ? '리뷰' : '게시판');
  return answersFrom_(text, 10);
}

// 수집기 _parse 와 같은 규칙: JSON 배열 우선, 아니면 줄 단위
function answersFrom_(text, n) {
  var match = String(text || '').match(/\[[\s\S]*\]/);
  if (match) {
    var arr = parse_(match[0], null);
    if (Array.isArray(arr)) {
      var out = [];
      for (var i = 0; i < arr.length && out.length < n; i++) {
        var t = body_(arr[i], 2000).trim();
        if (t) out.push(t);
      }
      if (out.length) return out;
    }
  }
  // v28 AI 답이 길어 중간에 잘린 JSON 배열(끝 ] 없음 · 마지막 따옴표 없음)도 "…" 하나하나를 답변으로 (11/12 7번 문의: 배열 통째로 한 칸에 들어갔음)
  var src = String(text || '');
  var open = src.indexOf('["');
  if (open >= 0) {
    var quoted = src.slice(open).match(/"(?:[^"\\]|\\.)*"/g) || [];
    var got = [];
    for (var q = 0; q < quoted.length && got.length < n; q++) {
      var one = parse_(quoted[q], null);
      if (typeof one === 'string' && one.trim().length > 8) got.push(body_(one, 2000).trim());
    }
    if (got.length) return got;
  }
  var lines = src.split('\n');
  var rest = [];
  for (var j = 0; j < lines.length && rest.length < n; j++) {
    var s = lines[j].replace(/^[\s\-•"']+|[\s"']+$/g, '');
    if (s.length > 8) rest.push(body_(s, 2000));
  }
  return rest;
}

// 새로 들어온 문의에 AI 답변안을 미리 달아 둠 (여러 건을 한 번에 — 기다리는 시간 = 가장 느린 1건)
function autoSuggest_(keys) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey || !keys.length) return 0;
  var sheet = sheet_();
  var targets = [];
  for (var i = 0; i < keys.length && targets.length < MAX_AUTO_SUGGEST; i++) {
    var found = find_(sheet, keys[i]);
    if (!found) continue;
    var row = rowOut_(found.values);
    if (row.closed || (row.drafts && row.drafts.length) || (row.inquiry && row.inquiry.noReply)) continue;
    targets.push(row);
  }
  if (!targets.length) return 0;
  var quota = withLock_(function () { return reserveAi_(targets.length); });
  targets = targets.slice(0, quota.allow);
  if (!targets.length) return 0;
  var responses = UrlFetchApp.fetchAll(targets.map(function (row) { return claudeRequest_(apiKey, row); }));
  var added = 0;
  withLock_(function () {
    for (var t = 0; t < targets.length; t++) {
      var texts;
      try {
        texts = answersFromResponse_(responses[t], targets[t]);
      } catch (error) {
        continue;
      }
      var again = find_(sheet, targets[t].key);
      var latest = rowOut_(again.values);
      if (latest.drafts && latest.drafts.length) continue;
      appendDrafts_(sheet, again.index, latest, texts);
      added++;
    }
  });
  return added;
}

// ---------- 화면: 수집기 PC에 요청 ----------
function jobValues_() {
  var sheet = jobSheet_();
  var last = sheet.getLastRow();
  return { sheet: sheet, rows: last < 2 ? [] : sheet.getRange(2, 1, last - 1, JOB_HEADER.length).getValues() };
}

function jobOut_(values) {
  return {
    id: plain_(values[JOB.id - 1]),
    kind: plain_(values[JOB.kind - 1]),
    status: plain_(values[JOB.status - 1]),
    by: plain_(values[JOB.by - 1]),
    at: iso_(values[JOB.at - 1]),
    started: iso_(values[JOB.started - 1]),
    ended: iso_(values[JOB.ended - 1]),
    body: parse_(plain_(values[JOB.body - 1]), {}),
    result: parse_(plain_(values[JOB.result - 1]), {}),
    pc: plain_(values[JOB.pc - 1]),
  };
}

function recentJobs_(n) {
  var all = jobValues_().rows;
  var out = [];
  for (var i = all.length - 1; i >= 0 && out.length < n; i--) {
    var job = jobOut_(all[i]);
    if (job.kind === 'register') job.body = { count: (job.body.items || []).length };
    if (SECRET_KINDS.indexOf(job.kind) >= 0) job.body = redact_(job.kind, job.body);
    out.push(job);
  }
  return out;
}

function request_(body) {
  setProp_('WEB_SEEN', String(Date.now()));   // v8: 요청을 보낸 순간부터 수집기 PC가 빨리 가져가게
  var kind = String(body.kind || '');
  if (!JOB_KINDS[kind] || STAFF_KINDS.indexOf(kind) < 0) return { ok: false, error: '알 수 없는 요청 종류입니다.' };
  var content = {};
  var by = plain_(clean_(body.editor, 40));
  var options = body.options && typeof body.options === 'object' ? body.options : {};
  // 1) 내용 먼저 확인 (틀리면 아무것도 안 바꿈)
  if (kind === 'login') {
    content = loginContent_(options);
    if (content.error) return { ok: false, error: content.error };
  } else if (kind === 'settings') {
    content = { settings: cleanSettings_(options.settings) };
    if (!Object.keys(content.settings).length) return { ok: false, error: '바꿀 설정이 없습니다.' };
  } else if (kind === 'apiKey') {
    var cid = cipher_(options.clientId), sec = cipher_(options.secret);
    if (!cid || !sec) return { ok: false, error: '잠긴(암호화) Client ID·Secret 이 필요합니다. 화면을 새로고침해 주세요.' };
    content = { clientId: cid, secret: sec };
  } else if (kind === 'update') {
    var url = String(options.url || ''), sha = String(options.sha256 || '').toLowerCase(), ver = plain_(clean_(options.ver, 40));
    if (!UPDATE_URL_RE.test(url) || !/^[0-9a-f]{64}$/.test(sha)) return { ok: false, error: '업데이트 파일 주소·확인값이 맞지 않습니다.' };
    content = { url: url, sha256: sha, ver: ver };
  } else if (kind === 'collect' || kind === 'test' || kind === 'reviews' || kind === 'testReviews') {
    var vendors = Array.isArray(options.vendors) ? options.vendors.map(function (v) { return plain_(clean_(v, 20)); }).filter(String) : [];
    content = { vendors: vendors.slice(0, 4) };
    var days = Math.floor(Number(options.reviewDays));
    if ((kind === 'reviews' || kind === 'testReviews') && days >= 1 && days <= 365) content.reviewDays = days;
  }
  // 2) 같은 종류: 대기 중이면 새 요청으로 바꾸거나(로그인·설정·API 키) 그대로 둠
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    var j = jobOut_(jobs.rows[i]);
    if (j.kind !== kind || kind === 'register') continue;
    if (REPLACE_KINDS.indexOf(kind) >= 0 && j.status === '대기') {
      jobs.sheet.getRange(i + 2, JOB.status, 1, 1).setValues([['취소']]);
      jobs.sheet.getRange(i + 2, JOB.ended, 1, 1).setValues([[new Date()]]);
      jobs.sheet.getRange(i + 2, JOB.body, 1, 1).setValues([[stringify_(redact_(kind, j.body))]]);
      jobs.sheet.getRange(i + 2, JOB.result, 1, 1).setValues([[stringify_({ message: '새 요청으로 바꿈' })]]);
      continue;
    }
    if (j.status === '대기' || j.status === '실행중') return { ok: true, job: j, duplicate: true, jobs: recentJobs_(10) };
  }
  if (kind === 'register') {
    var made = registerItems_(body.keys, by);
    if (made.error) return { ok: false, error: made.error };
    content = { items: made.items };
  }
  var id = 'J' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8); // 같은 초에 여러 요청이 와도 겹치지 않게
  jobs.sheet.appendRow([id, kind, '대기', clean_(body.editor, 40), new Date(), '', '', stringify_(content), '', '']);
  var shown = SECRET_KINDS.indexOf(kind) >= 0 ? redact_(kind, content) : content;
  return { ok: true, job: jobOut_([id, kind, '대기', by, new Date(), '', '', JSON.stringify(shown), '', '']), jobs: recentJobs_(10), rows: kind === 'register' ? openRows_(sheet_()) : undefined };
}

// 잠긴 값(수집기 PC 공개키 RSA-OAEP 로 암호화한 base64url): 모양만 확인하고 그대로 전달
function cipher_(value) {
  var v = String(value || '');
  return /^[A-Za-z0-9_-]{100,700}$/.test(v) ? v : '';
}

function loginContent_(options) {
  var vendors = (Array.isArray(options.vendors) ? options.vendors : []).map(function (v) { return plain_(clean_(v, 20)); })
    .filter(function (v) { return BOARD_VENDORS.indexOf(v) >= 0; });
  if (!vendors.length) return { error: '로그인할 업체를 고르세요.' };
  var creds = {};
  var raw = options.creds && typeof options.creds === 'object' ? options.creds : {};
  vendors.forEach(function (v) {
    var c = raw[v];
    if (c && cipher_(c.id) && cipher_(c.pw)) creds[v] = { id: cipher_(c.id), pw: cipher_(c.pw) };
  });
  return { vendors: vendors.slice(0, 4), creds: creds, collectAfter: options.collectAfter === true };
}

function redact_(kind, body) {
  var b = JSON.parse(JSON.stringify(body || {}));
  if (kind === 'login' && b.creds) Object.keys(b.creds).forEach(function (v) { b.creds[v] = '(전달됨)'; });
  if (kind === 'apiKey') { if (b.clientId) b.clientId = '(전달됨)'; if (b.secret) b.secret = '(전달됨)'; }
  return b;
}

// 화면에서 바꿀 수 있는 수집기 설정만 (값 범위 확인)
function cleanSettings_(raw) {
  var s = raw && typeof raw === 'object' ? raw : {};
  var out = {};
  var int = function (v, lo, hi) { var n = Math.floor(Number(v)); return n >= lo && n <= hi ? n : null; };
  if (int(s.days, 1, 90) !== null) out.days = int(s.days, 1, 90);
  if (int(s.review_days, 1, 365) !== null) out.review_days = int(s.review_days, 1, 365);
  if (typeof s.zz_slug === 'string' && /^[a-z0-9-]{2,40}$/.test(s.zz_slug)) out.zz_slug = s.zz_slug;
  if (typeof s.show_browser === 'boolean') out.show_browser = s.show_browser;
  if (typeof s.auto_on === 'boolean') out.auto_on = s.auto_on;
  if (typeof s.auto_start === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s.auto_start)) out.auto_start = s.auto_start;
  if (int(s.interval, 10, 1440) !== null) out.interval = int(s.interval, 10, 1440);
  var flags = function (obj, names) {
    if (!obj || typeof obj !== 'object') return null;
    var o = {};
    names.forEach(function (n) { if (typeof obj[n] === 'boolean') o[n] = obj[n]; });
    return Object.keys(o).length ? o : null;
  };
  if (flags(s.vendors, BOARD_VENDORS)) out.vendors = flags(s.vendors, BOARD_VENDORS);
  if (flags(s.review_vendors, REVIEW_VENDORS)) out.review_vendors = flags(s.review_vendors, REVIEW_VENDORS);
  return out;
}

// 등록 요청: 채택 문안을 그대로 찍어 둠(요청 뒤에는 고칠 수 없음). 자동 등록 안 되는 업체는 받지 않음
function registerItems_(keys, by) {
  var list = Array.isArray(keys) ? keys.slice(0, 100) : [];
  if (!list.length) return { error: '등록할 문의가 없습니다.' };
  var sheet = sheet_();
  var items = [];
  var now = new Date();
  for (var i = 0; i < list.length; i++) {
    var key = plain_(clean_(list[i], 200));
    var found = find_(sheet, key);
    if (!found) continue;
    var row = rowOut_(found.values);
    var choice = row.choice || {};
    if (row.closed || choice.hold || !(choice.pick >= 0) || (row.reg && (row.reg.state === '요청' || row.reg.state === '완료'))) continue;
    if (!registerSupported_(row.vendor, row.board)) continue;
    var edits = choice.edits || {};
    var text = String(Object.prototype.hasOwnProperty.call(edits, choice.pick) ? edits[choice.pick] : (row.drafts[choice.pick] && row.drafts[choice.pick].text) || '').trim();
    if (!text) continue;
    var item = { key: key, vendor: row.vendor, board: row.board, id: row.id, date: row.date, text: text };
    if (row.vendor === '메이크샵' && row.board === '리뷰') item.point = pointSetting_();   // v10: 등록하는 순간의 적립금 설정을 같이 보냄
    items.push(item);
    var reg = { state: '요청', at: now.toISOString(), by: by };
    sheet.getRange(found.index, COL.reg, 1, 1).setValues([[stringify_(reg)]]);
    sheet.getRange(found.index, COL.status, 1, 1).setValues([[statusOf_(false, row.drafts, choice, reg)]]);
  }
  if (!items.length) return { error: '등록할 수 있는 글이 없습니다 (채택된 스마트스토어 문의 · 메이크샵 리뷰 · 메이크샵 게시판만 자동 등록).' };
  return { items: items };
}

function cancel_(body) {
  var id = plain_(clean_(body.id, 40));
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    var job = jobOut_(jobs.rows[i]);
    if (job.id !== id) continue;
    if (job.status !== '대기') return { ok: false, error: '이미 시작했거나 끝난 요청입니다.' };
    jobs.sheet.getRange(i + 2, JOB.status, 1, 1).setValues([['취소']]);
    jobs.sheet.getRange(i + 2, JOB.ended, 1, 1).setValues([[new Date()]]);
    if (job.kind === 'register') releaseRegister_(job.body.items || [], null);
    if (SECRET_KINDS.indexOf(job.kind) >= 0) jobs.sheet.getRange(i + 2, JOB.body, 1, 1).setValues([[stringify_(redact_(job.kind, job.body))]]);
    return { ok: true, jobs: recentJobs_(10) };
  }
  return { ok: false, error: '요청을 찾지 못했습니다.' };
}

// 등록 요청 표시 풀기 (취소·실패 시) — results 가 있으면 그 결과로
function releaseRegister_(items, results) {
  var sheet = sheet_();
  var byKey = {};
  (results || []).forEach(function (r) { if (r && r.key) byKey[r.key] = r; });
  var now = new Date();
  for (var i = 0; i < items.length; i++) {
    var found = find_(sheet, items[i].key);
    if (!found) continue;
    var row = rowOut_(found.values);
    var r = byKey[items[i].key];
    var state = r ? (r.state === '등록완료' ? '완료' : r.state === '확인 필요' ? '확인 필요' : '건너뜀') : '';
    var reg = state ? { state: state, at: now.toISOString(), note: plain_(clean_(r.note, 300)), text: items[i].text } : null;
    sheet.getRange(found.index, COL.reg, 1, 1).setValues([[reg ? stringify_(reg) : '']]);
    if (state === '완료') {
      sheet.getRange(found.index, COL.closed, 1, 1).setValues([[now]]);
      sheet.getRange(found.index, COL.editedAt, 1, 1).setValues([[now]]);
    }
    sheet.getRange(found.index, COL.status, 1, 1).setValues([[statusOf_(state === '완료' || row.closed, row.drafts, row.choice, reg)]]);
  }
}

// ---------- 화면: 메이크샵 리뷰 적립금 설정 (v10, 2026-11-05) ----------
// MS_POINT_PCT = 실구매금액의 몇 % (0 = 답글만, 소수 한 자리) · MS_POINT_MSG = 적립금 사유 (한글 50자, [PRODUCT_NAME] = 상품명)
function pointSetting_() {
  var pct = Number(prop_('MS_POINT_PCT'));
  if (!(pct >= 0 && pct <= POINT_MAX_PCT)) pct = 0;
  var msg = prop_('MS_POINT_MSG') || POINT_MSG_DEFAULT;
  return { pct: Math.round(pct * 10) / 10, unit: POINT_UNIT, msg: msg, max: POINT_MAX_PCT, by: prop_('MS_POINT_BY'), at: prop_('MS_POINT_AT') };
}

function point_(body) {
  if (body.set && typeof body.set === 'object') {
    var pct = Number(body.set.pct);
    if (!(pct >= 0 && pct <= POINT_MAX_PCT)) return { ok: false, error: '적립률은 0 ~ ' + POINT_MAX_PCT + '% 사이로 넣어 주세요.' };
    var msg = plain_(clean_(body.set.msg, 60)).trim() || POINT_MSG_DEFAULT;
    var bytes = 0;
    for (var i = 0; i < msg.length; i++) bytes += msg.charCodeAt(i) > 127 ? 2 : 1;
    if (bytes > 100) return { ok: false, error: '적립금 사유는 한글 50자(영문 100자)까지입니다 — 메이크샵 제한.' };
    setProp_('MS_POINT_PCT', String(Math.round(pct * 10) / 10));
    setProp_('MS_POINT_MSG', msg);
    setProp_('MS_POINT_BY', plain_(clean_(body.editor, 40)));
    setProp_('MS_POINT_AT', new Date().toISOString());
  }
  return { ok: true, point: pointSetting_() };
}

// ---------- 화면: 메신저 AI 추천 (v9, 2026-11-05) ----------
// 메신저 탭 슬롯에 붙은 카톡·네이트온 대화창 그림 → 마지막 고객 메시지에 보낼 짧은 답장 후보. 그림·대화는 시트에 남기지 않음 (사용량만)
var MSN_RULES = '\n\n메신저(카톡·네이트온) 대화창 그림일 때\n' +
  '- 그림은 고객과 주고받는 메신저 대화창입니다. 오른쪽(노란·파란 말풍선)이 우리, 왼쪽이 고객인 경우가 많습니다.\n' +
  '- 가장 아래쪽(최근) 고객 메시지에 바로 보낼 답장 후보를 만듭니다. 이미 우리가 답한 내용은 되풀이하지 말 것.\n' +
  '- 메신저라 짧게: 1~2문장. 대화가 이미 이어지는 중이면 "안녕하세요 고객님" 인사는 빼도 됨.\n' +
  '- 그림에서 읽을 수 없는 내용은 지어내지 말 것.';

function msnSuggest_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var data = String(body.image || '').replace(/^data:[^,]*,/, '');
  var mime = /^image\/(png|jpeg|webp)$/.test(String(body.mime || '')) ? String(body.mime) : 'image/png';
  if (data.length < 200) return { ok: false, error: '대화창 그림을 받지 못했습니다.' };
  if (data.length > 6000000) return { ok: false, error: '대화창 그림이 너무 큽니다.' };
  var count = Math.max(3, Math.min(8, Math.floor(Number(body.count)) || 5));
  var quota = withLock_(function () { return reserveAi_(1); });
  if (!quota.allow) return { ok: false, error: '오늘 AI 사용 한도(' + quota.limit + '회)를 다 썼습니다.' };
  var model = prop_('CLAUDE_MODEL') || DEFAULT_MODEL;
  var text = '메신저: ' + plain_(clean_(body.app, 20) || '카톡·네이트온') + (body.name ? ' / 대화방: ' + plain_(clean_(body.name, 40)) : '');
  if (body.draft) text += '\n지금 쓰다 만 답장(참고): ' + body_(body.draft, 500);
  text += '\n\n이 대화창의 마지막 고객 메시지에 보낼 답장 후보 ' + count + '개를 서로 다르게, JSON 문자열 배열로만 출력하세요.';
  var payload = {
    model: model,
    max_tokens: 1200,
    system: [{ type: 'text', text: SHOP_RULES + MSN_RULES, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mime, data: data } }, { type: 'text', text: text }] }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload),
  });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
  var res = parse_(response.getContentText(), {});
  var out = '';
  (Array.isArray(res.content) ? res.content : []).forEach(function (c) { if (c && c.type === 'text') out += c.text; });
  withLock_(function () { recordUsage_(res.usage, model, '메신저'); });
  var answers = answersFrom_(out, count).map(function (a) { return body_(a, 600).trim(); }).filter(String);
  if (!answers.length) return { ok: false, error: 'AI 가 답장을 만들지 못했습니다 — 다시 눌러 주세요.' };
  return { ok: true, answers: answers };
}

// ---------- 화면: 상품명 요청 (AI) ----------
function nameRules_() {
  var book = book_();
  var sheet = book.getSheetByName(NAME_RULES_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(NAME_RULES_SHEET);
    sheet.appendRow([DEFAULT_NAME_RULES]);
  }
  var text = String(sheet.getRange(1, 1, 1, 1).getValues()[0][0] || '').trim();
  return text || DEFAULT_NAME_RULES;
}

function name_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var keywords = body_(body.keywords, 2000).trim();
  if (!keywords) return { ok: false, error: '키워드·메모를 넣어 주세요.' };
  var count = Math.max(1, Math.min(10, Math.floor(Number(body.count)) || 5));
  var reserved = reserveAi_(1);
  if (!reserved.allow) return { ok: false, error: '오늘 AI 사용 한도(' + reserved.limit + '회)를 다 썼습니다.' };
  var model = prop_('CLAUDE_MODEL') || DEFAULT_MODEL;
  var payload = {
    model: model,
    max_tokens: 1500,
    system: [{ type: 'text', text: nameRules_() + '\n\n출력은 JSON 문자열 배열 하나만. 다른 설명 없이: ["상품명1", "상품명2", ...]', cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: '키워드·메모:\n' + keywords + '\n\n상품명 후보 ' + count + '개를 서로 다르게 만들어 주세요.' }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload),
  });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
  var data = parse_(response.getContentText(), {});
  var text = '';
  (Array.isArray(data.content) ? data.content : []).forEach(function (c) { if (c && c.type === 'text') text += c.text; });
  recordUsage_(data.usage, model, '상품명');
  var names = answersFrom_(text, count).map(function (n) { return body_(n, 200).trim(); }).filter(String);
  if (!names.length) return { ok: false, error: 'AI 가 상품명을 만들지 못했습니다. 다시 눌러 주세요.' };
  withLock_(function () {
    var book = book_();
    var log = book.getSheetByName(NAME_LOG_SHEET);
    if (!log) { log = book.insertSheet(NAME_LOG_SHEET); log.appendRow(NAME_LOG_HEADER); log.setFrozenRows(1); }
    log.appendRow([new Date(), clean_(body.editor, 40), clean_(keywords, 2000), count, clean_(names.join('\n'), 5000)]);
  });
  return { ok: true, names: names };
}

// ---------- 수집기: 요청 가져가기·결과 ----------
function poll_(body) {
  var state = parse_(prop_('COLLECTOR_STATE'), {});
  state.pc = plain_(clean_(body.pc, 60));
  state.version = plain_(clean_(body.version, 60));
  state.seenAt = new Date().toISOString();
  if (body.setup) state.setup = cleanSetup_(body.setup);
  state.busy = body.busy === true;
  var jobs = jobValues_();
  var job = null;
  var now = Date.now();
  for (var i = 0; i < jobs.rows.length; i++) {
    var j = jobOut_(jobs.rows[i]);
    if (j.status === '실행중' && j.started && now - new Date(j.started).getTime() > STALE_JOB_MS) {
      jobs.sheet.getRange(i + 2, JOB.status, 1, 1).setValues([['실패']]);
      jobs.sheet.getRange(i + 2, JOB.ended, 1, 1).setValues([[new Date()]]);
      jobs.sheet.getRange(i + 2, JOB.result, 1, 1).setValues([[stringify_({ message: '30분 넘게 끝나지 않아 실패로 정리' })]]);
      if (j.kind === 'register') releaseRegister_(j.body.items || [], null);
    }
  }
  if (!state.busy) {
    jobs = jobValues_();
    for (var k = 0; k < jobs.rows.length; k++) {
      var w = jobOut_(jobs.rows[k]);
      if (w.status !== '대기') continue;
      jobs.sheet.getRange(k + 2, JOB.status, 1, 1).setValues([['실행중']]);
      jobs.sheet.getRange(k + 2, JOB.started, 1, 1).setValues([[new Date()]]);
      jobs.sheet.getRange(k + 2, JOB.pc, 1, 1).setValues([[clean_(state.pc, 60)]]);
      if (SECRET_KINDS.indexOf(w.kind) >= 0) jobs.sheet.getRange(k + 2, JOB.body, 1, 1).setValues([[stringify_(redact_(w.kind, w.body))]]);
      w.status = '실행중';
      job = w;
      state.busy = true;
      break;
    }
  }
  setProp_('COLLECTOR_STATE', JSON.stringify(state));
  return { ok: true, job: job, hot: webHot_() };
}

function finish_(body) {
  var id = plain_(clean_(body.id, 40));
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    var job = jobOut_(jobs.rows[i]);
    if (job.id !== id) continue;
    if (job.status !== '실행중') return { ok: false, error: '실행 중인 요청이 아닙니다.' };
    var results = Array.isArray(body.results) ? body.results.slice(0, 100) : [];
    var result = { message: plain_(clean_(body.message, 500)), count: Number(body.count) || 0 };
    if (body.data && typeof body.data === 'object') {
      var data = JSON.stringify(body.data);
      if (data.length <= 20000) result.data = JSON.parse(data);
    }
    if (job.kind === 'register') {
      result.done = results.filter(function (r) { return r && r.state === '등록완료'; }).length;
      result.check = results.filter(function (r) { return r && r.state === '확인 필요'; }).length;
      releaseRegister_(job.body.items || [], results);
    }
    jobs.sheet.getRange(i + 2, JOB.status, 1, 1).setValues([[body.ok === false ? '실패' : '완료']]);
    jobs.sheet.getRange(i + 2, JOB.ended, 1, 1).setValues([[new Date()]]);
    jobs.sheet.getRange(i + 2, JOB.result, 1, 1).setValues([[stringify_(result)]]);
    var state = parse_(prop_('COLLECTOR_STATE'), {});
    state.busy = false;
    state.seenAt = new Date().toISOString();
    setProp_('COLLECTOR_STATE', JSON.stringify(state));
    return { ok: true };
  }
  return { ok: false, error: '요청을 찾지 못했습니다.' };
}

// 실행 중 요청의 진행 안내 (화면 [요청 현황]에 바로 보임)
function progress_(body) {
  var id = plain_(clean_(body.id, 40));
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    var job = jobOut_(jobs.rows[i]);
    if (job.id !== id) continue;
    if (job.status !== '실행중') return { ok: false, error: '실행 중인 요청이 아닙니다.' };
    jobs.sheet.getRange(i + 2, JOB.result, 1, 1).setValues([[stringify_({ message: plain_(clean_(body.message, 300)), progress: true })]]);
    var state = parse_(prop_('COLLECTOR_STATE'), {});
    state.seenAt = new Date().toISOString();
    setProp_('COLLECTOR_STATE', JSON.stringify(state));
    return { ok: true, cancel: false };
  }
  return { ok: false, error: '요청을 찾지 못했습니다.' };
}

// 수집기 PC가 스스로 시작한 자동 수집 기록 (실행중으로 한 줄 → 끝나면 finish)
function selfJob_(body) {
  var kind = String(body.kind || '');
  if (kind !== 'auto') return { ok: false, error: '알 수 없는 요청 종류입니다.' };
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    if (plain_(jobs.rows[i][JOB.status - 1]) === '실행중') return { ok: false, busy: true, error: '다른 요청이 실행 중입니다.' };
  }
  var vendors = Array.isArray(body.vendors) ? body.vendors.map(function (v) { return plain_(clean_(v, 20)); }).filter(String).slice(0, 4) : [];
  var id = 'A' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + '-' + Utilities.getUuid().slice(0, 8);
  var now = new Date();
  jobs.sheet.appendRow([id, kind, '실행중', '자동', now, now, '', stringify_({ vendors: vendors }), '', clean_(body.pc, 60)]);
  var state = parse_(prop_('COLLECTOR_STATE'), {});
  state.busy = true;
  state.seenAt = now.toISOString();
  setProp_('COLLECTOR_STATE', JSON.stringify(state));
  return { ok: true, job: { id: id, kind: kind } };
}

// ---------- 수집기: 문의 넣기·종료 ----------
// snapshot = { kind: '문의'|'리뷰', vendors: {업체: {상태, 건수, 메모}}, days, collectedAt, test, file }
function ingest_(sheet, rows, snapshot) {
  // 2026-11-03 v7: 시트를 한 번 읽고, 바뀐 줄만 메모리에서 고친 뒤 몰아서 씀 (예전: 줄마다 5~6번 따로 써서 300건이면 몇 분 → 그동안 다른 요청이 잠금에 막힘)
  var list = Array.isArray(rows) ? rows.slice(0, MAX_INGEST) : [];
  var existing = values_(sheet);
  var origLen = existing.length;
  var index = {};
  for (var i = 0; i < existing.length; i++) index[plain_(existing[i][COL.key - 1])] = i;
  var now = new Date();
  var added = 0;
  var updated = 0;
  var reopened = 0;
  var seen = {};
  var newKeys = [];
  var repaired = [];   // v28 글자 깨짐 고친 줄 — AI 답변안 다시
  var dirty = {};
  for (var r = 0; r < list.length; r++) {
    var row = list[r] || {};
    if (row['가상']) continue; // 테스트 수집 결과는 시트에 안 올림
    var key = rowKey_(row);
    if (!key) continue;
    seen[key] = true;
    var inquiry = stringify_(inquiryFrom_(row));
    var at = index[key];
    if (at !== undefined) {
      // 이미 있는 문의: 문의 내용·수집시각만 갱신, 선택·답변안은 그대로. 답변안이 비어 있을 때만 수집기 답변안을 넣음
      var vals = existing[at];
      var current = rowOut_(vals);
      // v28 글자 깨짐(�) 이 있던 줄이 바르게 다시 들어오면: 상품명도 새로 · 깨진 글로 만든 AI 답변안은 비우고 다시 추천 (채택·등록 전만)
      var wasBroken = /\uFFFD/.test(plain_(vals[COL.inquiry - 1]) + current.product) && !/\uFFFD/.test(inquiry + String(row['상품명'] || ''));
      var untouched = !(current.choice && current.choice.pick >= 0) && !current.reg;
      vals[COL.inquiry - 1] = inquiry;
      vals[COL.collectedAt - 1] = now;
      if (clean_(row['상품명'], 300) && (wasBroken || !current.product)) vals[COL.product - 1] = clean_(row['상품명'], 300);
      if (wasBroken && untouched) { current.drafts = []; repaired.push(key); }
      var drafts = current.drafts && current.drafts.length ? current.drafts : draftsFrom_(row['답변안']);
      if (drafts !== current.drafts) vals[COL.drafts - 1] = stringify_(drafts);
      if (current.closed && !(current.reg && current.reg.state === '완료')) {
        vals[COL.closed - 1] = ''; // 다시 나타남 = 아직 미답변 → 다시 열기
        current.closed = false;
        reopened++;
      }
      vals[COL.status - 1] = statusOf_(current.closed, drafts, current.choice, current.reg);
      if (at < origLen) dirty[at] = true;
      updated++;
      continue;
    }
    var fresh = draftsFrom_(row['답변안']);
    existing.push([
      key,
      clean_(row['업체'], 40),
      clean_(row['게시판'], 40),
      clean_(row['id'], 120),
      clean_(row['날짜'], 40),
      clean_(row['상품명'], 300),
      statusOf_(false, fresh, null, null),
      inquiry,
      stringify_(fresh),
      stringify_({ pick: -1, view: [], edits: {}, hold: false }),
      0,
      '',
      '',
      now,
      '',
      '',
    ]);
    index[key] = existing.length - 1;
    added++;
    newKeys.push(key);
  }
  writeRows_(sheet, existing, dirty);
  if (existing.length > origLen) {
    var need = existing.length + 1; // 머리줄 + 전체 줄
    if (sheet.getMaxRows() < need) sheet.insertRowsAfter(sheet.getMaxRows(), need - sheet.getMaxRows());
    sheet.getRange(origLen + 2, 1, existing.length - origLen, HEADER.length).setValues(existing.slice(origLen));
  }
  var closed = snapshot ? autoClose_(sheet, snapshot, seen) : 0;
  if (snapshot && !snapshot.test) rememberCollect_(snapshot, list.length);
  return { ok: true, added: added, updated: updated, reopened: reopened, closed: closed, newKeys: newKeys.concat(repaired), repaired: repaired.length };
}

// 2026-11-03 v7: 바뀐 줄(dirty)만 연속 구간으로 묶어 구간마다 한 번에 씀. 사이가 5줄 이하로 떨어진 구간은 합침(그 사이 줄은 방금 읽은 값 그대로 다시 씀 — 잠금 안이라 안전)
var WRITE_GAP = 5;
function writeRows_(sheet, rows, dirty) {
  var idx = Object.keys(dirty).map(Number).sort(function (a, b) { return a - b; });
  var calls = 0;
  for (var s = 0; s < idx.length;) {
    var e = s;
    while (e + 1 < idx.length && idx[e + 1] - idx[e] <= WRITE_GAP + 1) e++;
    sheet.getRange(idx[s] + 2, 1, idx[e] - idx[s] + 1, HEADER.length).setValues(rows.slice(idx[s], idx[e] + 1));
    calls++;
    s = e + 1;
  }
  return calls;
}

function autoClose_(sheet, snapshot, seen) {
  if (snapshot.test) return 0;
  var review = snapshot.kind === '리뷰';
  var vendors = snapshot.vendors && typeof snapshot.vendors === 'object' ? snapshot.vendors : {};
  var collectedAt = when_(snapshot.collectedAt);
  var days = Number(snapshot.days) || 0;
  if (!(collectedAt > 0) || days <= 0) return 0;
  var from = collectedAt - days * 24 * 3600 * 1000;
  var rows = values_(sheet);
  var now = new Date();
  var changed = 0;
  var dirty = {};
  for (var i = 0; i < rows.length; i++) {
    var row = rowOut_(rows[i]);
    if (row.closed || seen[row.key] || isReview_(row.board) !== review) continue;
    if (!vendors[row.vendor] || vendors[row.vendor]['상태'] !== 'ok') continue;
    if (row.reg && row.reg.state === '요청') continue;
    var t = when_(row.date);
    if (!(t >= from && t <= collectedAt + 3600 * 1000)) continue;
    rows[i][COL.status - 1] = '종료';
    rows[i][COL.closed - 1] = now;
    dirty[i] = true;
    changed++;
  }
  writeRows_(sheet, rows, dirty);
  return changed;
}

function rememberCollect_(snapshot, count) {
  var state = parse_(prop_('COLLECTOR_STATE'), {});
  var info = { at: plain_(clean_(snapshot.collectedAt, 40)), vendors: {}, count: count, file: plain_(clean_(snapshot.file, 80)) };
  var vendors = snapshot.vendors && typeof snapshot.vendors === 'object' ? snapshot.vendors : {};
  Object.keys(vendors).slice(0, 8).forEach(function (v) {
    var x = vendors[v] || {};
    info.vendors[plain_(clean_(v, 20))] = { state: plain_(clean_(x['상태'], 20)), count: Number(x['건수']) || 0, note: plain_(clean_(x['메모'] || x['메시지'], 200)) };
  });
  if (snapshot.kind === '리뷰') state.reviewLast = info;
  else state.last = info;
  setProp_('COLLECTOR_STATE', JSON.stringify(state));
}

function close_(sheet, keys) {
  var wanted = {};
  var list = Array.isArray(keys) ? keys.slice(0, 500) : [];
  for (var k = 0; k < list.length; k++) {
    var key = plain_(clean_(list[k], 200));
    if (key) wanted[key] = true;
  }
  var rows = values_(sheet);
  var now = new Date();
  var changed = 0;
  for (var i = 0; i < rows.length; i++) {
    if (!wanted[plain_(rows[i][COL.key - 1])] || String(rows[i][COL.closed - 1] || '') !== '') continue;
    sheet.getRange(i + 2, COL.status, 1, 1).setValues([['종료']]);
    sheet.getRange(i + 2, COL.closed, 1, 1).setValues([[now]]);
    changed++;
  }
  return { ok: true, changed: changed };
}


// ---------- 원격 로그인 (v11, 2026-11-06) ----------
// 수집기 PC 로그인 창(네이버 퀴즈 등)을 웹에서 보고 정답을 넣음. 화면 그림은 CacheService 에 10분만 (시트에 안 남김)
var REMOTE_TTL = 600;
var REMOTE_CHUNK = 90000;
function remoteId_(id) {
  var v = plain_(clean_(id, 40));
  return /^[A-Za-z0-9_-]{4,40}$/.test(v) ? v : '';
}

// 수집기: 화면 그림 올리기(바뀌었을 때만, 없으면 '') + 웹에서 넣은 정답 받아 가기(한 번 주면 지움)
function loginShot_(body) {
  var id = remoteId_(body.id);
  if (!id) return { ok: false, error: '요청 번호가 없습니다.' };
  var cache = CacheService.getScriptCache();
  var image = String(body.image || '');
  if (image) {
    if (image.length > REMOTE_CHUNK * 4 || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+\/=]+$/.test(image)) return { ok: false, error: '그림 형식이 맞지 않습니다.' };
    var parts = {}, n = Math.ceil(image.length / REMOTE_CHUNK);
    for (var k = 0; k < n; k++) parts['ls_' + id + '_' + k] = image.slice(k * REMOTE_CHUNK, (k + 1) * REMOTE_CHUNK);
    parts['ls_' + id] = JSON.stringify({ n: n, vendor: plain_(clean_(body.vendor, 20)), note: plain_(clean_(body.note, 200)), at: new Date().toISOString(), w: Number(body.w) || 0, h: Number(body.h) || 0 });
    cache.putAll(parts, REMOTE_TTL);
  } else if (body.note) {
    var meta = parse_(cache.get('ls_' + id), null);
    if (meta) { meta.note = plain_(clean_(body.note, 200)); cache.put('ls_' + id, JSON.stringify(meta), REMOTE_TTL); }
  }
  if (body.done) cache.removeAll(['ls_' + id, 'la_' + id]);
  var answer = parse_(cache.get('la_' + id), null);
  if (answer) cache.remove('la_' + id);
  return { ok: true, answer: answer };
}

// 화면: 최신 화면 그림
function loginShotGet_(body) {
  var id = remoteId_(body.id);
  if (!id) return { ok: false, error: '요청 번호가 없습니다.' };
  var cache = CacheService.getScriptCache();
  var meta = parse_(cache.get('ls_' + id), null);
  if (!meta) return { ok: true, shot: null };
  var keys = [];
  for (var k = 0; k < meta.n; k++) keys.push('ls_' + id + '_' + k);
  var got = cache.getAll(keys), image = '';
  for (var j = 0; j < keys.length; j++) { if (!got[keys[j]]) return { ok: true, shot: null }; image += got[keys[j]]; }
  return { ok: true, shot: { vendor: meta.vendor, note: meta.note, at: meta.at, w: meta.w, h: meta.h, image: image }, pending: !!cache.get('la_' + id) };
}

// 화면: 퀴즈 정답(또는 화면 클릭 자리) 넣기 → 수집기 PC가 다음 확인 때(몇 초 안) 가져가 넣음
function loginAnswer_(body) {
  var id = remoteId_(body.id);
  if (!id) return { ok: false, error: '요청 번호가 없습니다.' };
  var answer = { at: new Date().toISOString(), editor: plain_(clean_(body.editor, 20)) };
  if (Array.isArray(body.click) && body.click.length === 2) {
    var x = Math.round(Number(body.click[0])), y = Math.round(Number(body.click[1]));
    if (!(x >= 0 && y >= 0 && x < 4000 && y < 4000)) return { ok: false, error: '누를 자리가 맞지 않습니다.' };
    answer.click = [x, y];
  } else {
    var text = String(body.answer == null ? '' : body.answer).replace(/[\r\n\t]/g, ' ').trim().slice(0, 40);
    if (!text) return { ok: false, error: '정답을 넣어 주세요.' };
    answer.answer = text;
    answer.submit = body.submit !== false;
  }
  CacheService.getScriptCache().put('la_' + id, JSON.stringify(answer), REMOTE_TTL);
  return { ok: true };
}


// ---------- 상품 현황 단종 (v12, 2026-11-06) ----------
// '단종' 탭: A 셀피아 코드(옵션) · B 단종일시 · C 처리자. 상품 단종 = 그 상품의 옵션이 모두 단종 (화면이 계산)
function discSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(DISC_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(DISC_SHEET);
    sheet.getRange(1, 1, 1, 3).setValues([['셀피아코드', '단종일시', '처리자']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}
function discSku_(v) {
  var s = String(v == null ? '' : v).trim();
  return /^[0-9A-Za-z][0-9A-Za-z_.-]{0,39}$/.test(s) ? s : '';
}
function discList_() {
  var sheet = discSheet_();
  var n = sheet.getLastRow() - 1;
  if (n <= 0) return { ok: true, skus: [] };
  var rows = sheet.getRange(2, 1, n, 3).getDisplayValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = discSku_(rows[i][0]);
    if (sku) out.push({ sku: sku, at: String(rows[i][1] || ''), editor: String(rows[i][2] || '') });
  }
  return { ok: true, skus: out };
}
// on = true → 단종 추가 (이미 있으면 그대로) · on = false → 단종 해제 (줄 지움)
function discSet_(body) {
  var list = Array.isArray(body.skus) ? body.skus : [];
  var want = {};
  var count = 0;
  for (var i = 0; i < list.length && count < 5000; i++) { var k = discSku_(list[i]); if (k && !want[k]) { want[k] = true; count++; } }
  if (!count) return { ok: false, error: '고른 옵션이 없습니다.' };
  var on = body.on !== false;
  var sheet = discSheet_();
  var n = sheet.getLastRow() - 1;
  var rows = n > 0 ? sheet.getRange(2, 1, n, 3).getValues() : [];
  var keep = [], had = {}, changed = 0;
  for (var r = 0; r < rows.length; r++) {
    var sku = discSku_(rows[r][0]);
    if (!sku || had[sku]) continue;
    had[sku] = true;
    if (!on && want[sku]) { changed++; continue; }
    keep.push([sku, rows[r][1], rows[r][2]]);
  }
  if (on) {
    var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
    var editor = plain_(clean_(body.editor, 20));
    Object.keys(want).forEach(function (k) { if (!had[k]) { keep.push([k, stamp, editor]); changed++; } });
  }
  if (n > 0) sheet.getRange(2, 1, n, 3).clearContent();
  if (keep.length) {
    sheet.getRange(2, 1, keep.length, 1).setNumberFormat('@');
    sheet.getRange(2, 1, keep.length, 3).setValues(keep);
  }
  return { ok: true, changed: changed, total: keep.length };
}


// ---------- v13 상품찾기: 사진 검색 색인 ----------
// 색인 = 상품 관리 [상품찾기] 에서 PC 가 만든 "사진 이름 · 특징값" 글자 덩어리. 시트에는 45,000자씩 잘라 줄마다 저장.
// 칸 앞에 ~ 를 붙여 = + - 로 시작해도 수식으로 바뀌지 않게 함.
function photoIndexMeta_() {
  var meta = parse_(prop_('PHOTO_INDEX_META'), null);
  return meta ? { ok: true, meta: meta } : { ok: true, meta: null };
}

function photoIndexGet_(p) {
  var meta = parse_(prop_('PHOTO_INDEX_META'), null);
  if (!meta) return { ok: false, error: '아직 색인이 없습니다' };
  var from = Math.max(0, Math.floor(Number(p.from) || 0));
  var to = Math.min(meta.chunks, Math.max(from + 1, Math.floor(Number(p.to) || from + 1)), from + 12);
  var sheet = book_().getSheetByName(PHOTO_INDEX_SHEET);
  if (!sheet) return { ok: false, error: '색인 탭이 없습니다' };
  var values = sheet.getRange(from + 2, 2, to - from, 1).getValues();
  return { ok: true, version: meta.version, from: from, chunks: values.map(function (r) { return String(r[0] || '').replace(/^~/, ''); }) };
}

function photoIndexBegin_(body) {
  var chunks = Math.floor(Number(body.chunks) || 0);
  if (chunks < 1 || chunks > 2000) return { ok: false, error: '조각 수가 올바르지 않습니다' };
  var book = book_();
  var stage = book.getSheetByName(PHOTO_INDEX_STAGE);
  if (stage) book.deleteSheet(stage);
  stage = book.insertSheet(PHOTO_INDEX_STAGE);
  stage.getRange(1, 1, 1, 2).setValues([['조각', '내용']]);
  var id = Utilities.getUuid().slice(0, 8);
  setProp_('PHOTO_INDEX_STAGE', JSON.stringify({ id: id, chunks: chunks, at: new Date().toISOString() }));
  return { ok: true, stage: id };
}

function photoIndexPut_(body) {
  var st = parse_(prop_('PHOTO_INDEX_STAGE'), null);
  if (!st || st.id !== String(body.stage || '')) return { ok: false, error: '올리기가 새로 시작돼 이 조각은 버립니다 — 다시 시도해 주세요' };
  var from = Math.floor(Number(body.from) || 0);
  var list = Array.isArray(body.chunks) ? body.chunks : [];
  if (from < 0 || !list.length || from + list.length > st.chunks || list.length > 20) return { ok: false, error: '조각 범위가 올바르지 않습니다' };
  var rows = [];
  for (var i = 0; i < list.length; i++) {
    var text = String(list[i] == null ? '' : list[i]);
    if (text.length > PHOTO_INDEX_CHUNK) return { ok: false, error: '조각이 너무 깁니다' };
    rows.push([from + i, '~' + text]);
  }
  var stage = book_().getSheetByName(PHOTO_INDEX_STAGE);
  if (!stage) return { ok: false, error: '올리는 탭이 없습니다 — 다시 시작해 주세요' };
  stage.getRange(from + 2, 1, rows.length, 2).setValues(rows);
  return { ok: true, saved: rows.length };
}

function photoIndexCommit_(body) {
  var st = parse_(prop_('PHOTO_INDEX_STAGE'), null);
  if (!st || st.id !== String(body.stage || '')) return { ok: false, error: '올리기 정보가 없습니다 — 다시 시작해 주세요' };
  var book = book_();
  var stage = book.getSheetByName(PHOTO_INDEX_STAGE);
  if (!stage) return { ok: false, error: '올리는 탭이 없습니다' };
  var got = stage.getRange(2, 1, st.chunks, 2).getValues();
  for (var i = 0; i < st.chunks; i++) {
    var r = got[i] || [];
    if (r[0] === '' || r[0] == null || Number(r[0]) !== i || !String(r[1] || '')) return { ok: false, error: (i + 1) + '번째 조각이 빠졌습니다 — 다시 올려 주세요' };
  }
  var old = book.getSheetByName(PHOTO_INDEX_SHEET);
  if (old) book.deleteSheet(old);
  stage.setName(PHOTO_INDEX_SHEET);
  var meta = {
    version: st.id, chunks: st.chunks,
    count: Math.max(0, Math.floor(Number(body.count) || 0)),
    dim: Math.max(0, Math.floor(Number(body.dim) || 0)),
    model: plain_(clean_(body.model, 60)),
    updatedAt: new Date().toISOString(),
    editor: plain_(clean_(body.editor, 20)),
  };
  setProp_('PHOTO_INDEX_META', JSON.stringify(meta));
  PropertiesService.getScriptProperties().deleteProperty('PHOTO_INDEX_STAGE');
  return { ok: true, meta: meta };
}

// ---------- v13 상품찾기: 🤖 AI 추천 ----------
// 찾는 사진 1장 + 자체 검색 상위 후보(최대 10개, 허브 상품 사진 주소) → Claude 가 같은 상품을 고름 · 상품 특징 낱말도 돌려줌
function photoAi_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var image = String(body.image || '').replace(/^data:image\/\w+;base64,/, '');
  if (!/^[A-Za-z0-9+\/=]{100,}$/.test(image) || image.length > 1400000) return { ok: false, error: '찾는 사진이 올바르지 않습니다' };
  var cands = (Array.isArray(body.candidates) ? body.candidates : []).slice(0, 10).map(function (c) {
    var url = url_(c && c.url);
    return { code: plain_(clean_(c && c.code, 60)), label: plain_(clean_(c && c.label, 120)), url: url.indexOf(PHOTO_HUB_PREFIX) === 0 ? url : '' };
  }).filter(function (c) { return c.code && c.url; });
  var reserved = withLock_(function () { return reserveAi_(1); });
  if (!reserved.allow) return { ok: false, error: '오늘 AI 사용 한도(' + reserved.limit + '회)를 다 썼습니다.' };

  var fetched = cands.length ? UrlFetchApp.fetchAll(cands.map(function (c) { return { url: c.url, muteHttpExceptions: true }; })) : [];
  var content = [{ type: 'text', text: '[찾는 사진]' }, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }];
  var shown = [];
  fetched.forEach(function (res, i) {
    if (res.getResponseCode() !== 200) return;
    var blob = res.getBlob();
    var type = String(blob.getContentType() || 'image/jpeg');
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) type = 'image/jpeg';
    shown.push(cands[i]);
    content.push({ type: 'text', text: '[후보 ' + shown.length + '] ' + cands[i].code + (cands[i].label ? ' · ' + cands[i].label : '') });
    content.push({ type: 'image', source: { type: 'base64', media_type: type, data: Utilities.base64Encode(blob.getBytes()) } });
  });
  content.push({ type: 'text', text: shown.length
    ? '찾는 사진과 같은 상품(디자인·모양·색·재질이 같은 것)을 후보 중에서 골라 주세요. 같은 상품이 없으면 picks 를 비워 두세요.'
    : '후보가 없습니다. picks 는 비워 두고 keywords 만 주세요.' });
  var model = prop_('CLAUDE_MODEL') || DEFAULT_MODEL;
  var payload = {
    model: model,
    max_tokens: 700,
    system: '당신은 액세서리(피어싱·귀걸이·반지·목걸이 등) 쇼핑몰 상품 사진 대조 담당입니다. 사진 속 상품의 모양·색·재질·장식을 비교합니다. 출력은 JSON 하나만, 설명 없이: {"picks":[{"n":후보번호,"score":0~100,"why":"한 줄 이유"}],"keywords":"찾는 사진 상품을 설명하는 한국어 낱말 3~6개를 띄어쓰기로"} — picks 는 score 높은 순, 최대 3개, score 60 미만은 넣지 마세요.',
    messages: [{ role: 'user', content: content }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload),
  });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
  var data = parse_(response.getContentText(), {});
  var text = '';
  (Array.isArray(data.content) ? data.content : []).forEach(function (c) { if (c && c.type === 'text') text += c.text; });
  recordUsage_(data.usage, model, '사진찾기');
  var m = /\{[\s\S]*\}/.exec(text);
  var out = parse_(m ? m[0] : '', {});
  var picks = (Array.isArray(out.picks) ? out.picks : []).map(function (p) {
    var n = Math.floor(Number(p && p.n));
    var c = shown[n - 1];
    return c ? { code: c.code, score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))), why: plain_(clean_(p.why, 200)) } : null;
  }).filter(Boolean).slice(0, 3);
  return { ok: true, picks: picks, keywords: plain_(clean_(out.keywords, 120)), compared: shown.length };
}


// ---------- v15 옵션 사진 짝짓기 (상품 옵션 ↔ 자사몰 사진, 2026-11-10) ----------
// 자사몰 상품 사진(대표 · 상세)을 시트가 직접 받아 AI 에게 옵션 목록과 같이 보여 주고,
// 옵션마다 맞는 사진 번호 + (여러 옵션이 함께 있는 사진이면) 그 옵션 자리(box, 0~1000 비율)를 받음.
// 사진 주소는 자사몰(pink-rocket.com) · 상세 사진 서버(pink_rocket.cooljem.com) · 허브 검토 사진(sellpia/__pilot_… — 긴 상세 사진을 화면이 잘라 올린 조각, 검토 뒤 지움)만. 저장은 하지 않음
var OPTION_PHOTO_HOSTS = /^https:\/\/(www\.)?pink-rocket\.com\/|^https:\/\/pink_rocket\.cooljem\.com\/|^https:\/\/bpgvqmtsjgegnrdzmpep\.supabase\.co\/storage\/v1\/object\/public\/product-images\/sellpia\/__pilot_/;
var OPTION_PHOTO_MODELS = ['claude-haiku-5-5', 'claude-sonnet-5-5'];
function optionPhotoAi_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var opts = (Array.isArray(body.options) ? body.options : []).slice(0, 60).map(function (o) {
    return { sku: plain_(clean_(o && o.sku, 40)), label: plain_(clean_(o && o.label, 120)) };
  }).filter(function (o) { return o.sku; });
  if (!opts.length) return { ok: false, error: '옵션이 없습니다' };
  var urls = (Array.isArray(body.images) ? body.images : []).slice(0, 24).map(url_).filter(function (u) { return OPTION_PHOTO_HOSTS.test(u); });
  if (!urls.length) return { ok: false, error: '자사몰 사진 주소가 없습니다' };
  var reserved = withLock_(function () { return reserveAi_(1); });
  if (!reserved.allow) return { ok: false, error: '오늘 AI 사용 한도(' + reserved.limit + '회)를 다 썼습니다.' };

  var fetched = UrlFetchApp.fetchAll(urls.map(function (u) { return { url: u, muteHttpExceptions: true, followRedirects: true }; }));
  var name = plain_(clean_(body.product, 160));
  var content = [{ type: 'text', text: '상품명: ' + name + '\n옵션 목록 (번호. 셀피아코드 · 옵션명):\n' + opts.map(function (o, i) { return (i + 1) + '. ' + o.sku + ' · ' + o.label; }).join('\n') }];
  var shown = [];
  fetched.forEach(function (res, i) {
    if (res.getResponseCode() !== 200) return;
    var blob = res.getBlob();
    var bytes = blob.getBytes();
    if (!bytes.length || bytes.length > 4500000) return;
    var type = String(blob.getContentType() || '').toLowerCase().split(';')[0];
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return;   // 사진이 아닌 응답은 뺌
    shown.push(urls[i]);
    content.push({ type: 'text', text: '[사진 ' + shown.length + ']' });
    content.push({ type: 'image', source: { type: 'base64', media_type: type, data: Utilities.base64Encode(bytes) } });
  });
  if (!shown.length) return { ok: false, error: '자사몰 사진을 받지 못했습니다' };
  content.push({ type: 'text', text: '옵션마다 그 옵션 상품이 가장 잘 보이는 사진 하나를 고르세요. ' +
    '그 옵션만 따로 나온 제품 사진이 있으면 그 사진(box 는 제품이 있는 부분, 사진 전체면 null). ' +
    '여러 옵션이 한 사진에 같이 있으면 그 옵션 제품 자리만 box 로. 사진 속 번호·글자가 있으면 근거로 쓰세요. ' +
    '옵션명의 [ ] 위치표시 · (+가격) · -모델착용 은 무시. 귀에 찬 모델 사진보다 제품만 나온 사진을 고르고, 공지 · 이벤트 · 안내 · 리뷰 그림은 고르지 마세요. ' +
    '세트 상품(set · 개 · ea)은 세트 전체가 보이게. 확실하지 않으면 score 를 낮게(60 미만), 맞는 사진이 없으면 photo 0.' });
  var model = OPTION_PHOTO_MODELS.indexOf(String(body.model || '')) >= 0 ? String(body.model) : (prop_('CLAUDE_MODEL') || DEFAULT_MODEL);
  var payload = {
    model: model,
    max_tokens: Math.min(8000, 1500 + 160 * opts.length),
    system: '당신은 액세서리(피어싱·귀걸이·반지·목걸이 등) 쇼핑몰 사진 정리 담당입니다. 옵션(색·모양·크기·종류)마다 맞는 상품 사진을 고릅니다. ' +
      '출력은 JSON 하나만, 설명 없이: {"options":[{"n":옵션번호,"photo":사진번호(없으면 0),"box":[x0,y0,x1,y1] 또는 null,"score":0~100,"why":"한 줄 이유"}]} — box 는 사진 가로·세로를 각각 0~1000 으로 본 비율 좌표.',
    messages: [{ role: 'user', content: content }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload),
  });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ') ' + plain_(clean_((parse_(response.getContentText(), {}).error || {}).message, 200)) };
  var data = parse_(response.getContentText(), {});
  var text = '';
  (Array.isArray(data.content) ? data.content : []).forEach(function (c) { if (c && c.type === 'text') text += c.text; });
  recordUsage_(data.usage, model, '옵션사진');
  var m = /\{[\s\S]*\}/.exec(text);
  var out = parse_(m ? m[0] : '', {});
  var results = [];
  (Array.isArray(out.options) ? out.options : []).forEach(function (o) {
    var n = Math.floor(Number(o && o.n));
    var opt = opts[n - 1];
    if (!opt) return;
    var k = Math.floor(Number(o.photo));
    var url = k >= 1 && k <= shown.length ? shown[k - 1] : '';
    var box = null;
    if (Array.isArray(o.box) && o.box.length === 4) {
      var b = o.box.map(function (v) { return Math.max(0, Math.min(1000, Math.round(Number(v) || 0))); });
      if (b[2] - b[0] >= 20 && b[3] - b[1] >= 20) box = b;
    }
    results.push({ sku: opt.sku, url: url, box: url ? box : null, score: Math.max(0, Math.min(100, Math.round(Number(o.score) || 0))), why: plain_(clean_(o.why, 200)) });
  });
  var u = data.usage || {};
  var res = { ok: true, results: results, images: shown, model: model, tokens: { input: u.input_tokens || 0, output: u.output_tokens || 0 }, stop: String(data.stop_reason || '') };
  if (!results.length) res.raw = text.slice(0, 1500);   // 읽지 못한 답 확인용
  return res;
}


// ---------- v16 배송사진 (2026-11-10) ----------
// 드라이브 '5_배송기록' 폴더(배송 중 찍은 사진 + 동영상, 바로 아래 하위 폴더까지)를 시간 순서로 보여 주고,
// 송장이 찍힌 사진은 AI 가 수신자 이름을 읽어 파일명 끝에 붙임 (예: 20261110_143012.jpg → 20261110_143012_홍길동.jpg).
// 확인한 결과는 '배송사진' 탭에 (파일ID · 원래이름 · 바뀐이름 · 송장 · 수신자 · 확신 · 확인시각). 파일은 지우지 않고 이름만 바꿈.
// 이 기능은 드라이브 권한이 필요합니다 — 편집기에서 '배송사진_권한' 을 한 번 실행해 허용한 뒤 새 버전 배포.
var SHIP_FOLDER_DEFAULT = '1BYw0-dWxwq5zTwPot_dVS0EuDG52-_ie'; // 내 드라이브\C_주문리스트_재고매칭\5_배송기록 (11-10 사장님 지정 · 처음 시험 폴더 '배송사진' 1LKwNxSdQt1o2A2TVnqv9qOn9yFQ1ZHij)
var SHIP_SHEET = '배송사진';
var SHIP_BATCH = 6;          // AI 한 번에 볼 사진 수
var SHIP_MAX_FILES = 3000;

function 배송사진_권한() {
  // 구글 권한 창에서 항목을 하나씩 고를 수 있어서, 드라이브 '수정' 권한이 빠지면 이름 바꾸기만 막힘 → 빠진 권한을 다시 물음
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/drive', 'https://www.googleapis.com/auth/script.external_request']);
  var folder = DriveApp.getFolderById(prop_('SHIP_FOLDER') || SHIP_FOLDER_DEFAULT);
  Logger.log('배송사진 폴더: ' + folder.getName() + ' — 드라이브 보기·수정 권한 확인 완료');
  Logger.log('토큰: ' + (ScriptApp.getOAuthToken() ? '있음' : '없음'));
}

function shipSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(SHIP_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(SHIP_SHEET);
    sheet.getRange(1, 1, 1, 7).setValues([['파일ID', '원래이름', '바뀐이름', '송장', '수신자', '확신', '확인시각']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function shipKnown_() {
  var sheet = shipSheet_();
  var n = sheet.getLastRow() - 1;
  var map = {};
  if (n <= 0) return map;
  sheet.getRange(2, 1, n, 7).getValues().forEach(function (r, i) {
    var id = String(r[0] || '');
    if (id) map[id] = { row: i + 2, orig: String(r[1] || ''), name: String(r[2] || ''), invoice: r[3] === true || String(r[3]) === 'TRUE' || String(r[3]) === '예', recipient: String(r[4] || ''), score: Number(r[5]) || 0 };
  });
  return map;
}

// 파일 이름 · 만든 시각 → 정렬 시각 (휴대폰 이름 20261110_143012 · IMG_20261110_143012 · PXL_20261110_143012345 우선)
// 이름 속 시각: 20261110_143012 · 2026-11-06 17-04-45-823 (반디캠) · IMG_20261110_143012 → yyyyMMddHHmmss (+ 밀리초)
function shipTimeParts_(name, created) {
  var m = /(20\d{2})[-._]?(\d{2})[-._]?(\d{2})[_\-\s.T]?(\d{2})[-._:]?(\d{2})[-._:]?(\d{2})(?:[-._](\d{1,3}))?/.exec(String(name || ''));
  if (m) return { t: m[1] + m[2] + m[3] + m[4] + m[5] + m[6], ms: Number(m[7] || 0) };
  return { t: Utilities.formatDate(created, 'Asia/Seoul', 'yyyyMMddHHmmss'), ms: 0 };
}
function shipTimeKey_(name, created) { return shipTimeParts_(name, created).t; }

function shipFiles_() {
  var root = DriveApp.getFolderById(prop_('SHIP_FOLDER') || SHIP_FOLDER_DEFAULT);
  var out = [];
  var add = function (folder, sub) {
    var it = folder.getFiles();
    while (it.hasNext() && out.length < SHIP_MAX_FILES) {
      var f = it.next();
      var mime = String(f.getMimeType() || '');
      var kind = /^image\//.test(mime) ? 'photo' : /^video\//.test(mime) ? 'video' : '';
      if (!kind) continue;
      var created = f.getDateCreated();
      var tp = shipTimeParts_(f.getName(), created);
      out.push({ id: f.getId(), name: f.getName(), kind: kind, mime: mime, size: f.getSize(), folder: sub, t: tp.t, ms: tp.ms });
    }
  };
  add(root, '');
  var subs = root.getFolders();
  while (subs.hasNext()) { var sf = subs.next(); if (String(sf.getName()).charAt(0) !== '_') add(sf, sf.getName()); } // '_' 로 시작하는 폴더(_NAS로 등)는 목록에서 뺌
  // 같은 초에 찍힌 사진·동영상은 사진(송장) 먼저 — 반디캠은 캡처와 녹화가 같은 초에 시작됨
  out.sort(function (a, b) { return a.t < b.t ? -1 : a.t > b.t ? 1 : a.kind !== b.kind ? (a.kind === 'photo' ? -1 : 1) : a.ms !== b.ms ? a.ms - b.ms : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); });
  return out;
}

function shipList_() {
  var files = shipFiles_();
  var known = shipKnown_();
  var unchecked = 0;
  files.forEach(function (f) {
    var k = known[f.id];
    f.checked = !!k;
    if (k) { f.invoice = k.invoice; f.recipient = k.recipient; f.score = k.score; f.orig = k.orig; }
    else if (f.kind === 'photo') unchecked++;
  });
  return { ok: true, files: files, unchecked: unchecked, renamePending: shipPendingRenames_(files, known).length, folder: prop_('SHIP_FOLDER') || SHIP_FOLDER_DEFAULT };
}

// 송장 이름을 파일명 끝에 (확장자 앞) — 이미 붙어 있으면 그대로
function shipRename_(name, recipient) {
  // 가려진 글자 * 는 윈도우 파일 이름에 못 쓰므로 ○ 로 (예: 홍*동 → 홍○동)
  var who = String(recipient || '').replace(/\*/g, '○').replace(/[\\\/:?"<>|]/g, '').trim();
  if (!who) return name;
  var m = /^(.*?)(\.[A-Za-z0-9]{2,5})?$/.exec(String(name || ''));
  var base = m[1], ext = m[2] || '';
  if (base.slice(-(who.length + 1)) === '_' + who) return name;
  return base + '_' + who + ext;
}

// 확인 안 한 사진을 시간 순서로 SHIP_BATCH 장씩: AI 가 송장인지 · 받는 분 이름 → 이름 붙이기
function shipScan_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var started = Date.now();
  var files = shipFiles_();
  var known = shipKnown_();
  var todo = files.filter(function (f) { return f.kind === 'photo' && !known[f.id]; });
  var batch = todo.slice(0, Math.max(1, Math.min(SHIP_BATCH, Number(body && body.limit) || SHIP_BATCH)));
  if (!batch.length) {
    var fix = shipRenamePending_(files, known);
    var res = { ok: true, done: 0, remaining: 0, results: [] };
    if (fix.tried) { res.renamed = fix.renamed; res.renameErrors = fix.errors; }
    return res;
  }
  var reserved = withLock_(function () { return reserveAi_(1); });
  if (!reserved.allow) return { ok: false, error: '오늘 AI 사용 한도(' + reserved.limit + '회)를 다 썼습니다.' };

  var token = ScriptApp.getOAuthToken();
  var fetched = UrlFetchApp.fetchAll(batch.map(function (f) {
    return { url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(f.id) + '&sz=w1600', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true, followRedirects: true };
  }));
  var content = [];
  var shown = [];
  fetched.forEach(function (res, i) {
    var blob = res.getResponseCode() === 200 ? res.getBlob() : null;
    var type = blob ? String(blob.getContentType() || '').toLowerCase().split(';')[0] : '';
    if (!blob || !/^image\/(jpeg|png|webp|gif)$/.test(type) || blob.getBytes().length > 4500000) return;
    shown.push(batch[i]);
    content.push({ type: 'text', text: '[사진 ' + shown.length + ']' });
    content.push({ type: 'image', source: { type: 'base64', media_type: type, data: Utilities.base64Encode(blob.getBytes()) } });
  });
  var results = [];
  if (shown.length) {
    content.push({ type: 'text', text: '사진마다 택배 송장(운송장 · 배송 라벨)이 찍혀 있는지 보고, 송장이면 받는 분(수신자) 이름을 그대로 적어 주세요. ' +
      '가려진 글자는 * 로 (예: 홍*동). 보내는 분 이름은 적지 마세요. 송장이 아니거나 이름이 안 읽히면 name 은 빈 글자.' });
    var payload = {
      model: prop_('SHIP_MODEL') || DEFAULT_MODEL,
      max_tokens: 1200,
      system: '택배 사진 정리 담당입니다. 출력은 JSON 하나만, 설명 없이: {"photos":[{"n":사진번호,"invoice":true/false,"name":"받는 분 이름","score":0~100}]}',
      messages: [{ role: 'user', content: content }],
    };
    var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload),
    });
    if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
    var data = parse_(response.getContentText(), {});
    var text = '';
    (Array.isArray(data.content) ? data.content : []).forEach(function (c) { if (c && c.type === 'text') text += c.text; });
    recordUsage_(data.usage, payload.model, '배송사진');
    var m = /\{[\s\S]*\}/.exec(text);
    var out = parse_(m ? m[0] : '', {});
    var byN = {};
    (Array.isArray(out.photos) ? out.photos : []).forEach(function (p) { var n = Math.floor(Number(p && p.n)); if (n >= 1) byN[n] = p; });
    shown.forEach(function (f, i) {
      var p = byN[i + 1] || {};
      var name = plain_(clean_(p.name, 20)).replace(/\s+/g, '');
      var invoice = p.invoice === true;
      results.push({ id: f.id, orig: f.name, invoice: invoice, recipient: invoice ? name : '', score: Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))) });
    });
  }
  // 받지 못한 사진(썸네일 없음 등)도 확인한 것으로 기록 — 다음에 다시 막히지 않게
  batch.forEach(function (f) { if (!results.some(function (r) { return r.id === f.id; })) results.push({ id: f.id, orig: f.name, invoice: false, recipient: '', score: 0, skipped: true }); });
  // 이름 바꾸기 (송장 + 이름이 읽힌 사진만)
  results.forEach(function (r) {
    r.name = r.orig;
    if (!r.invoice || !r.recipient) return;
    var next = shipRename_(r.orig, r.recipient);
    if (next === r.orig) return;
    try { DriveApp.getFileById(r.id).setName(next); r.name = next; } catch (e) { r.renameError = String(e && e.message || e).slice(0, 120); }
  });
  var now = new Date();
  withLock_(function () {
    var sheet = shipSheet_();
    sheet.getRange(sheet.getLastRow() + 1, 1, results.length, 7).setValues(results.map(function (r) {
      return [r.id, r.orig, r.name, r.invoice ? '예' : '', r.recipient, r.score, now];
    }));
  });
  var errs = results.filter(function (r) { return r.renameError; }).map(function (r) { return { name: r.orig, error: r.renameError }; });
  var ret = { ok: true, done: results.length, remaining: Math.max(0, todo.length - batch.length), results: results, ms: Date.now() - started };
  if (errs.length) ret.renameErrors = errs;
  return ret;
}

// 송장 + 이름은 읽었는데 파일 이름을 못 바꾼 사진(권한 문제 등) → AI 없이 이름만 다시 붙임 · 탭의 바뀐이름 칸도 고침
function shipPendingRenames_(files, known) {
  return files.filter(function (f) { var k = known[f.id]; return k && k.invoice && k.recipient && shipRename_(f.name, k.recipient) !== f.name; });
}
function shipRenamePending_(files, known) {
  var pending = shipPendingRenames_(files, known);
  var out = { tried: pending.length, renamed: 0, errors: [] };
  if (!pending.length) return out;
  var fixed = [];
  pending.forEach(function (f) {
    var next = shipRename_(f.name, known[f.id].recipient);
    try { DriveApp.getFileById(f.id).setName(next); out.renamed++; fixed.push({ row: known[f.id].row, name: next }); }
    catch (e) { out.errors.push({ name: f.name, error: String(e && e.message || e).slice(0, 160) }); }
  });
  if (fixed.length) withLock_(function () { var sheet = shipSheet_(); fixed.forEach(function (x) { sheet.getRange(x.row, 3).setValue(x.name); }); });
  return out;
}


// ---------- v20 💬 상담톡 (2026-11-11) — 스마트스토어 톡톡 · 카카오 해피톡 ----------
// 수집기 PC 가 상담 화면에서 대화를 읽어 chatIngest 로 넣고, CS 관리 › 💬 상담톡 화면이 chatList 로 읽습니다.
//  · 이 시트 '상담톡' 탭: 한 줄 = 대화 하나 (매체 · 대화ID · 바뀐 시각 · 이름 · 안 읽음 · 내용 JSON)
//  · 내용 JSON: { name, tag, time, preview, unread, messages: [{ who: 'c'(고객)|'s'(우리), text, time }], aux: { title, lines: [...], items: [{ img, name, option, price, status, order }] } }
//  · v21 items: 상담 중인 상품 카드 — 사진은 파일이 아니라 https 주소만 (네이버 사진 주소 그대로)
//  · 답변 후보: chatSuggest — 대화 글자를 AI 에 보내 5개 (이미 본 후보는 피함). 보내기는 사람이 (붙여넣기만)
var CHAT_SHEET = '상담톡';
var CHAT_HEADER = ['매체', '대화ID', '바뀐 시각', '이름', '안 읽음', '내용'];
var CHAT_PLATFORMS = ['smart', 'kakao', 'ably'];   // v29: 에이블리 문의(채팅방)
var CHAT_KEEP = 200;   // 매체마다 남길 대화 수 (오래된 것부터 지움 — 이 탭은 화면용 임시 저장)

function chatSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(CHAT_SHEET);
  if (!sheet) { sheet = book.insertSheet(CHAT_SHEET); sheet.appendRow(CHAT_HEADER); sheet.setFrozenRows(1); }
  return sheet;
}
function chatClean_(c) {
  var msgs = (Array.isArray(c.messages) ? c.messages : []).slice(-60).map(function (m) {
    return { who: m && m.who === 's' ? 's' : 'c', text: body_(m && m.text, 2000), time: clean_(m && m.time, 30) };
  }).filter(function (m) { return m.text; });
  var aux = c.aux && typeof c.aux === 'object' ? { title: clean_(c.aux.title, 60), lines: (Array.isArray(c.aux.lines) ? c.aux.lines : []).slice(0, 30).map(function (l) { return body_(l, 300); }), items: chatItems_(c.aux.items) } : { title: '', lines: [], items: [] };
  return { name: clean_(c.name, 60), tag: clean_(c.tag, 30), time: clean_(c.time, 30), preview: clean_(c.preview, 200), unread: Math.max(0, Math.floor(Number(c.unread) || 0)), messages: msgs, aux: aux };
}
function chatItems_(list) {
  return (Array.isArray(list) ? list : []).slice(0, 10).map(function (it) {
    it = it || {};
    var img = String(it.img || '').trim();
    if (!/^https:\/\/[^\s"'<>]+$/.test(img) || img.length > 600) img = '';
    return { img: img, name: clean_(it.name, 120), option: clean_(it.option, 120), price: clean_(it.price, 30), status: clean_(it.status, 30), order: clean_(it.order, 40) };
  }).filter(function (it) { return it.name || it.img; });
}
function chatIngest_(body) {
  var platform = String(body && body.platform || '');
  if (CHAT_PLATFORMS.indexOf(platform) < 0) return { ok: false, error: '매체는 smart · kakao · ably 만' };
  var convs = (Array.isArray(body.convs) ? body.convs : []).slice(0, 60);
  var sheet = chatSheet_();
  var n = sheet.getLastRow() - 1;
  var rows = n > 0 ? sheet.getRange(2, 1, n, CHAT_HEADER.length).getValues() : [];
  var at = {};
  rows.forEach(function (r, i) { at[r[0] + '|' + r[1]] = i; });
  var now = new Date(), added = 0, changed = 0;
  convs.forEach(function (c) {
    var id = clean_(c && c.id, 80);
    if (!id) return;
    var v = chatClean_(c);
    var json = JSON.stringify(v);
    if (json.length > CELL_LIMIT) { v.messages = v.messages.slice(-20); json = JSON.stringify(v).slice(0, CELL_LIMIT); }
    var row = [platform, id, now, v.name, v.unread, json];
    var i = at[platform + '|' + id];
    if (i == null) { rows.push(row); at[platform + '|' + id] = rows.length - 1; added++; }
    else if (String(rows[i][5]) !== json || Number(rows[i][4]) !== v.unread) { rows[i] = row; changed++; }
  });
  // 매체마다 최근 CHAT_KEEP 개만
  var keep = [];
  CHAT_PLATFORMS.forEach(function (p) {
    keep = keep.concat(rows.filter(function (r) { return r[0] === p; }).sort(function (a, b) { return new Date(b[2]) - new Date(a[2]); }).slice(0, CHAT_KEEP));
  });
  if (n > 0) sheet.getRange(2, 1, n, CHAT_HEADER.length).clearContent();
  if (keep.length) sheet.getRange(2, 1, keep.length, CHAT_HEADER.length).setValues(keep);
  return { ok: true, added: added, changed: changed, total: keep.length };
}
function chatList_(body) {
  var sheet = chatSheet_();
  var n = sheet.getLastRow() - 1;
  var out = { smart: [], kakao: [], ably: [] };
  if (n > 0) sheet.getRange(2, 1, n, CHAT_HEADER.length).getValues().forEach(function (r) {
    if (!out[r[0]]) return;
    var v = parse_(String(r[5] || ''), null);
    if (!v) return;
    v.id = String(r[1]); v.at = r[2] instanceof Date ? r[2].toISOString() : String(r[2] || '');
    out[r[0]].push(v);
  });
  CHAT_PLATFORMS.forEach(function (p) { out[p].sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; }); out[p] = out[p].slice(0, 60); });
  return { ok: true, smart: out.smart, kakao: out.kakao, ably: out.ably };
}
var CHAT_RULES = '\n\n상담톡(스마트스토어 톡톡 · 카카오 해피톡 · 에이블리 문의) 대화일 때\n' +
  '- 대화 글은 [고객] / [우리] 로 표시됩니다. 마지막 고객 말에 바로 보낼 짧은 채팅 답장을 만듭니다 (게시판 답변보다 짧게, 1~3문장)\n' +
  '- 보조내용(구매이력 · 고객정보)이 있으면 참고하되, 주소·전화번호 같은 개인정보는 답장에 되풀이하지 않습니다\n' +
  '- 모르는 사실(재고 · 발송일 · 환불 여부)은 지어내지 않고 "확인 후 안내드리겠습니다" 처럼 씁니다';
function chatSuggest_(body) {
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var msgs = (Array.isArray(body.messages) ? body.messages : []).slice(-30);
  if (!msgs.length) return { ok: false, error: '대화 내용이 없습니다' };
  var count = Math.max(3, Math.min(8, Math.floor(Number(body.count)) || 5));
  var quota = withLock_(function () { return reserveAi_(1); });
  if (!quota.allow) return { ok: false, error: '오늘 AI 사용 한도(' + quota.limit + '회)를 다 썼습니다.' };
  var model = prop_('CLAUDE_MODEL') || DEFAULT_MODEL;
  var text = '매체: ' + (body.platform === 'kakao' ? '카카오 해피톡' : body.platform === 'ably' ? '에이블리 문의(앱 채팅)' : '스마트스토어 톡톡') + (body.name ? ' / 고객: ' + plain_(clean_(body.name, 40)) : '') + '\n\n대화:\n' +
    msgs.map(function (m) { return (m && m.who === 's' ? '[우리] ' : '[고객] ') + body_(m && m.text, 800); }).join('\n');
  var aux = body.aux && Array.isArray(body.aux.lines) ? body.aux.lines.slice(0, 20).map(function (l) { return body_(l, 200); }).join('\n') : '';
  var items = body.aux ? chatItems_(body.aux.items) : [];
  if (items.length) aux = '상담 상품: ' + items.map(function (it) { return [it.name, it.option, it.status].filter(String).join(' / '); }).join(' · ') + (aux ? '\n' + aux : '');
  if (aux) text += '\n\n보조내용(참고):\n' + aux;
  var avoid = (Array.isArray(body.avoid) ? body.avoid : []).slice(-15).map(function (a) { return body_(a, 300); }).filter(String);
  if (avoid.length) text += '\n\n이미 보여 준 후보(이것과 다르게):\n' + avoid.map(function (a) { return '- ' + a; }).join('\n');
  text += '\n\n마지막 고객 말에 보낼 답장 후보 ' + count + '개를 서로 다르게, JSON 문자열 배열로만 출력하세요.';
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: model, max_tokens: 1200, system: [{ type: 'text', text: SHOP_RULES + CHAT_RULES, cache_control: { type: 'ephemeral' } }], messages: [{ role: 'user', content: text }] }),
  });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
  var res = parse_(response.getContentText(), {});
  var out = '';
  (Array.isArray(res.content) ? res.content : []).forEach(function (c) { if (c && c.type === 'text') out += c.text; });
  withLock_(function () { recordUsage_(res.usage, model, '상담톡'); });
  var answers = answersFrom_(out, count).map(function (a) { return body_(a, 600).trim(); }).filter(String);
  if (!answers.length) return { ok: false, error: 'AI 가 답장을 만들지 못했습니다 — 다시 눌러 주세요.' };
  return { ok: true, answers: answers };
}

// ---------- v19 반품기록 메모 (2026-11-10) ----------
// CS 관리 › ↩ 반품기록 탭의 카드 메모. 이 시트 '반품기록' 탭 한 줄 = 카드 하나.
//  · 고칠 때 화면이 본 버전(base)과 지금 시트 값이 다르면 쓰지 않고 새 내용을 돌려줌
//  · 삭제는 '삭제' 칸에 표시만 (줄은 남김)
var RET_SHEET = '반품기록';
var RET_HEADER = ['ID', '작성 시각', '수정 시각', '작성자', '수정자', '고객·주문번호', '상품', '사유', '처리', '메모', '삭제', '버전'];
var RET_STATUS = ['접수', '회수 중', '도착·검수', '환불 완료', '교환 발송', '끝'];
var RET_FIELDS = { who: 5, item: 6, reason: 7, status: 8, memo: 9 }; // 0부터 (시트 칸 - 1)

function retSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(RET_SHEET);
  if (!sheet) { sheet = book.insertSheet(RET_SHEET); sheet.appendRow(RET_HEADER); sheet.setFrozenRows(1); }
  return sheet;
}
function retRow_(r) {
  return { id: String(r[0]), createdAt: retTime_(r[1]), updatedAt: retTime_(r[2]), by: String(r[3] || ''), editor: String(r[4] || ''),
    who: plain_(String(r[5] || '')), item: plain_(String(r[6] || '')), reason: plain_(String(r[7] || '')), status: String(r[8] || '접수'), memo: plain_(String(r[9] || '')), version: Number(r[11]) || 1 };
}
function retTime_(v) { return v instanceof Date ? v.toISOString() : String(v || ''); }
function retList_() {
  var sheet = retSheet_();
  var n = sheet.getLastRow() - 1;
  var items = [];
  if (n > 0) sheet.getRange(2, 1, n, RET_HEADER.length).getValues().forEach(function (r) { if (r[0] && !r[10]) items.push(retRow_(r)); });
  items.sort(function (a, b) { return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0; });
  return { ok: true, items: items, statuses: RET_STATUS };
}
function retSave_(body) {
  var sheet = retSheet_();
  var who = plain_(clean_(body && body.editor, 40));
  var now = new Date();
  var text = function (v, n) { return clean_(String(v == null ? '' : v).replace(/\r\n?/g, '\n'), n); };
  var multi = function (v, n) { var t = body_(v, n); return /^[=+\-@]/.test(t) ? "'" + t : t; };
  var id = String(body && body.id || '');
  var n = sheet.getLastRow() - 1;
  var rows = n > 0 ? sheet.getRange(2, 1, n, RET_HEADER.length).getValues() : [];
  var at = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === id) { at = i; break; }
  if (!id || at < 0) { // 새 카드
    if (body && body.remove) return { ok: true };
    var nid = '';
    for (var tries = 0; tries < 50 && (!nid || rows.some(function (r) { return String(r[0]) === nid; })); tries++) nid = 'R' + Utilities.formatDate(now, 'Asia/Seoul', 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);   // v25: 같은 초 겹침 막음
    var row = [nid, now, now, who, who, text(body.who, 200), text(body.item, 300), multi(body.reason, 2000), RET_STATUS.indexOf(String(body.status)) >= 0 ? String(body.status) : '접수', multi(body.memo, 5000), '', 1];
    sheet.appendRow(row);
    return { ok: true, item: retRow_(row) };
  }
  var cur = retRow_(rows[at]);
  if (Number(body.base) !== cur.version) return { ok: false, conflict: true, item: cur, error: '다른 사람이 먼저 고쳤습니다 — 새 내용을 보여 드립니다' };
  var next = rows[at].slice();
  if (body.remove) next[10] = '삭제';
  ['who', 'item'].forEach(function (k) { if (body[k] != null) next[RET_FIELDS[k]] = text(body[k], k === 'who' ? 200 : 300); });
  ['reason', 'memo'].forEach(function (k) { if (body[k] != null) next[RET_FIELDS[k]] = multi(body[k], k === 'memo' ? 5000 : 2000); });
  if (body.status != null && RET_STATUS.indexOf(String(body.status)) >= 0) next[8] = String(body.status);
  next[2] = now; next[4] = who; next[11] = cur.version + 1;
  sheet.getRange(at + 2, 1, 1, RET_HEADER.length).setValues([next]);
  return { ok: true, item: retRow_(next), removed: !!body.remove };
}

// ---------- v22 배송기록 주문별 메모 (2026-11-11) ----------
// 반품 요청이 오면 배송기록 영상을 보고 판단 → 그 송장 묶음(주문) 옆에 메모. 묶음 키 = 송장 사진 드라이브 파일 ID (이름이 바뀌어도 그대로)
//  · 이 시트 '배송기록 메모' 탭: 한 줄 = 묶음 하나 · 상품코드·수량·기타는 줄바꿈으로 여러 줄 (v23: 기타도 상품 줄마다)
//  · 먼저 고친 사람이 있으면 덮어쓰지 않음 (버전) · 지우기 없음 (칸을 비우면 빈 메모)
var SHIPMEMO_SHEET = '배송기록 메모';
// v24: 칸은 뒤에 덧붙임 (예전 줄은 그대로 읽힘) — 상품 줄 칸(상품코드·수량·기타·상품명·옵션명·자사코드)은 줄바꿈으로 여러 줄
var SHIPMEMO_HEADER = ['묶음 키', '수신자', '송장 시각', '이름', '상품코드', '수량', '기타', '작성자', '수정 시각', '버전', '전화번호', '매입처', '상품명', '옵션명', '자사코드', '주문번호'];
var SHIPMEMO_LINE_COLS = { code: 4, qty: 5, etc: 6, pname: 12, option: 13, own: 14 };   // 0부터

function shipMemoSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(SHIPMEMO_SHEET);
  if (!sheet) { sheet = book.insertSheet(SHIPMEMO_SHEET); sheet.appendRow(SHIPMEMO_HEADER); sheet.setFrozenRows(1); return sheet; }
  var head = sheet.getRange(1, 1, 1, SHIPMEMO_HEADER.length).getValues()[0];
  if (String(head[SHIPMEMO_HEADER.length - 1]) !== SHIPMEMO_HEADER[SHIPMEMO_HEADER.length - 1]) sheet.getRange(1, 1, 1, SHIPMEMO_HEADER.length).setValues([SHIPMEMO_HEADER]);   // v24 칸 이름 덧붙임
  return sheet;
}
function shipMemoRow_(r) {
  var cols = {};
  Object.keys(SHIPMEMO_LINE_COLS).forEach(function (k) { cols[k] = String(r[SHIPMEMO_LINE_COLS[k]] || '').split('\n'); });
  var count = Math.max.apply(null, Object.keys(cols).map(function (k) { return cols[k].length; }));
  var lines = [];
  for (var i = 0; i < count; i++) {
    var l = {};
    Object.keys(cols).forEach(function (k) { l[k] = (k === 'qty' ? String(cols[k][i] || '') : plain_(cols[k][i] || '')).trim(); });
    if (l.code || l.qty || l.etc || l.pname || l.option || l.own) lines.push(l);
  }
  return { key: String(r[0]), recipient: String(r[1] || ''), t: retTime_(r[2]), name: plain_(String(r[3] || '')), phone: plain_(String(r[10] || '')), vendor: plain_(String(r[11] || '')), ordNo: String(r[15] || ''),
    lines: lines, etc: plain_(String(r[6] || '')), editor: String(r[7] || ''), updatedAt: retTime_(r[8]), version: Number(r[9]) || 1 };
}
function shipMemoList_() {
  var sheet = shipMemoSheet_();
  var n = sheet.getLastRow() - 1;
  var memos = {};
  if (n > 0) sheet.getRange(2, 1, n, SHIPMEMO_HEADER.length).getValues().forEach(function (r) { if (r[0]) memos[String(r[0])] = shipMemoRow_(r); });
  return { ok: true, memos: memos };
}
function shipMemoSave_(body) {
  var key = clean_(body && body.key, 80);
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(key)) return { ok: false, error: '묶음 키가 맞지 않습니다' };
  var safe = function (v, n) { var t = clean_(String(v == null ? '' : v).replace(/[\r\n]+/g, ' '), n); return /^[=+\-@]/.test(t) ? "'" + t : t; };
  var lines = (Array.isArray(body.lines) ? body.lines : []).slice(0, 30).map(function (l) {
    l = l || {};
    return { code: safe(l.code, 60), qty: String(Math.max(0, Math.floor(Number(l.qty) || 0)) || ''), etc: safe(l.etc, 300), pname: safe(l.pname, 150), option: safe(l.option, 150), own: safe(l.own, 60) };
  }).filter(function (l) { return l.code || l.qty || l.etc || l.pname || l.option || l.own; });
  if (body.etc && lines.length && !lines[0].etc) lines[0].etc = safe(body.etc, 300);   // v22 화면이 보낸 하나짜리 기타 → 첫 줄
  else if (body.etc && !lines.length) lines.push({ code: '', qty: '', etc: safe(body.etc, 300), pname: '', option: '', own: '' });
  var cellOf = function (k) { var v = lines.map(function (l) { return String(l[k]).replace(/^'/, ''); }).join('\n'); return /^[=+\-@]/.test(v) ? "'" + v : v; };
  var who = plain_(clean_(body.editor, 40));
  var now = new Date();
  var tm = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(body.t || ''));   // 배송기록 시각 yyyyMMddHHmmss (한국 시각)
  var t = tm ? "'" + tm[1] + '-' + tm[2] + '-' + tm[3] + ' ' + tm[4] + ':' + tm[5] + ':' + tm[6] : '';
  var sheet = shipMemoSheet_();
  var n = sheet.getLastRow() - 1;
  var rows = n > 0 ? sheet.getRange(2, 1, n, SHIPMEMO_HEADER.length).getValues() : [];
  var at = -1;
  for (var i = 0; i < rows.length; i++) if (String(rows[i][0]) === key) { at = i; break; }
  var row = [key, safe(body.recipient, 60), t, safe(body.name, 60), cellOf('code'), cellOf('qty'), cellOf('etc'), who, now, 1,
    safe(body.phone, 40), safe(body.vendor, 60), cellOf('pname'), cellOf('option'), cellOf('own'), safe(body.ordNo, 40)];
  if (at < 0) { sheet.appendRow(row); return { ok: true, memo: shipMemoRow_(row) }; }
  var cur = shipMemoRow_(rows[at]);
  if (Number(body.base || 0) !== cur.version) return { ok: false, conflict: true, memo: cur, error: '다른 사람이 먼저 고쳤습니다 — 새 내용을 보여 드립니다' };
  if (!row[1]) row[1] = rows[at][1];
  if (!row[2]) row[2] = rows[at][2];
  row[9] = cur.version + 1;
  sheet.getRange(at + 2, 1, 1, SHIPMEMO_HEADER.length).setValues([row]);
  return { ok: true, memo: shipMemoRow_(row) };
}

// v26 빈 메모 슬롯(사진·영상 없는 memo-… 키)만 지우기 — 줄을 '배송기록 메모_지움' 탭으로 옮김 (지운 시각 · 지운 사람 덧붙임, 되살리려면 그 줄을 다시 옮기면 됨)
//  · 송장 묶음(사진 있는 것) 메모는 지우지 않음
var SHIPMEMO_TRASH = '배송기록 메모_지움';
function shipMemoDelete_(body) {
  var keys = (Array.isArray(body && body.keys) ? body.keys : []).map(function (k) { return clean_(k, 80); })
    .filter(function (k) { return /^memo-[A-Za-z0-9_-]{4,75}$/.test(k); }).slice(0, 200);
  if (!keys.length) return { ok: false, error: '지울 빈 메모 슬롯이 없습니다 (사진 있는 묶음 메모는 지우지 않습니다)' };
  var want = {}; keys.forEach(function (k) { want[k] = true; });
  var sheet = shipMemoSheet_();
  var n = sheet.getLastRow() - 1;
  var rows = n > 0 ? sheet.getRange(2, 1, n, SHIPMEMO_HEADER.length).getValues() : [];
  var hit = [];
  for (var i = 0; i < rows.length; i++) if (want[String(rows[i][0])]) hit.push(i);
  if (!hit.length) return { ok: true, deleted: [], missing: keys };
  var book = book_();
  var trash = book.getSheetByName(SHIPMEMO_TRASH);
  if (!trash) { trash = book.insertSheet(SHIPMEMO_TRASH); trash.appendRow(SHIPMEMO_HEADER.concat(['지운 시각', '지운 사람'])); trash.setFrozenRows(1); }
  var who = plain_(clean_(body.editor, 40));
  var now = new Date();
  var moved = hit.map(function (i) { return rows[i].concat([now, who]); });
  trash.getRange(trash.getLastRow() + 1, 1, moved.length, moved[0].length).setValues(moved);
  for (var j = hit.length - 1; j >= 0; j--) sheet.deleteRow(hit[j] + 2);   // 아래 줄부터 (위 줄 번호가 안 바뀌게)
  var done = hit.map(function (i) { return String(rows[i][0]); });
  return { ok: true, deleted: done, missing: keys.filter(function (k) { return done.indexOf(k) < 0; }) };
}

// v27 ★ 공지 메모장 (피킹시스템 맨 위) — '공지' 탭: 2행 = [내용, 수정 시각, 작성자, 버전] · 줄바꿈 그대로 · 2만 자까지
//  · 먼저 고친 사람이 있으면 덮어쓰지 않음 (버전)
var NOTICE_SHEET = '공지';
var NOTICE_HEADER = ['내용', '수정 시각', '작성자', '버전'];
function noticeSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(NOTICE_SHEET);
  if (!sheet) { sheet = book.insertSheet(NOTICE_SHEET); sheet.appendRow(NOTICE_HEADER); sheet.setFrozenRows(1); }
  return sheet;
}
function noticeRow_(r) {
  r = r || [];
  return { text: String(r[0] || '').replace(/^'/, ''), updatedAt: r[1] ? retTime_(r[1]) : '', editor: String(r[2] || ''), version: Number(r[3]) || 0 };
}
function noticeGet_() {
  var sheet = noticeSheet_();
  return { ok: true, notice: sheet.getLastRow() >= 2 ? noticeRow_(sheet.getRange(2, 1, 1, NOTICE_HEADER.length).getValues()[0]) : noticeRow_([]) };
}
function noticeSave_(body) {
  var text = String(body && body.text != null ? body.text : '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').slice(0, 20000);
  var sheet = noticeSheet_();
  var cur = sheet.getLastRow() >= 2 ? noticeRow_(sheet.getRange(2, 1, 1, NOTICE_HEADER.length).getValues()[0]) : noticeRow_([]);
  if (Number(body.base || 0) !== cur.version) return { ok: false, conflict: true, notice: cur, error: '다른 사람이 먼저 고쳤습니다 — 새 내용을 보여 드립니다' };
  var row = [/^[=+\-@]/.test(text) ? "'" + text : text, new Date(), plain_(clean_(body.editor, 40)), cur.version + 1];
  sheet.getRange(2, 1, 1, NOTICE_HEADER.length).setValues([row]);
  return { ok: true, notice: noticeRow_(row) };
}

// v24 주문서 찾기 힌트: 송장 사진에서 '또렷이 보이는 글자만' AI 가 읽음 (가려지거나 흐린 글자는 ?) — 화면이 이 힌트로 피킹 주문과 일치도를 매김
//  · 배송기록 폴더 사진만 · 결과는 6시간 캐시 (같은 사진 다시 눌러도 AI 를 또 쓰지 않음) · 시트에는 남기지 않음
function shipHints_(body) {
  var id = clean_(body && body.id, 80);
  var file = shipFiles_().filter(function (f) { return f.id === id && f.kind === 'photo'; })[0];
  if (!file) return { ok: false, error: '배송기록 폴더의 송장 사진이 아닙니다' };
  var cache = null;
  try { cache = CacheService.getScriptCache(); var hit = cache.get('shiphint_' + id); var hh = hit ? JSON.parse(hit) : null; if (hh && (hh.name || hh.phone || hh.invoice || hh.address)) return { ok: true, hints: hh, cached: true }; } catch (e) { cache = null; }
  var apiKey = prop_('CLAUDE_KEY');
  if (!apiKey) return { ok: false, error: 'AI 키가 없습니다 — 스크립트 속성 CLAUDE_KEY 등록 필요' };
  var reserved = withLock_(function () { return reserveAi_(1); });
  if (!reserved.allow) return { ok: false, error: '오늘 AI 사용 한도(' + reserved.limit + '회)를 다 썼습니다.' };
  var res = UrlFetchApp.fetchAll([{ url: 'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w1600', headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true, followRedirects: true }])[0];
  var blob = res.getResponseCode() === 200 ? res.getBlob() : null;
  var type = blob ? String(blob.getContentType() || '').toLowerCase().split(';')[0] : '';
  if (!blob || !/^image\/(jpeg|png|webp|gif)$/.test(type)) return { ok: false, error: '송장 사진을 불러오지 못했습니다' };
  var payload = {
    model: prop_('SHIP_MODEL') || DEFAULT_MODEL, max_tokens: 2000,   // 500 은 답이 잘림 (11-11 실제 송장)
    system: '택배 송장 사진에서 받는 분 정보를 찾는 도우미입니다. 또렷이 보이는 글자만 적고, 가려지거나(* ○ 등) 흐리거나 안 보이는 글자는 한 글자마다 ? 로 적습니다. 추측해서 채우지 마세요. 보내는 분 정보는 적지 않습니다. 출력은 JSON 하나만: {"name":"받는 분 이름","phone":"받는 분 전화(숫자·?·-)","invoice":"운송장(등기)번호(숫자·?)","address":"받는 분 주소에서 보이는 낱말들","zip":"우편번호"} — 없으면 빈 글자',
    messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: type, data: Utilities.base64Encode(blob.getBytes()) } }, { type: 'text', text: '이 송장에서 받는 분 정보를 보이는 만큼만 읽어 주세요.' }] }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', { method: 'post', contentType: 'application/json', muteHttpExceptions: true, headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, payload: JSON.stringify(payload) });
  if (response.getResponseCode() !== 200) return { ok: false, error: 'AI 응답 오류 (' + response.getResponseCode() + ')' };
  var data = parse_(response.getContentText(), {});
  var text = '';
  (Array.isArray(data.content) ? data.content : []).forEach(function (c) { if (c && c.type === 'text') text += c.text; });
  withLock_(function () { recordUsage_(data.usage, payload.model, '주문서 찾기'); });
  var m = /\{[\s\S]*\}/.exec(text);
  var out = parse_(m ? m[0] : '', {});
  var hints = { name: clean_(out.name, 30), phone: clean_(out.phone, 30), invoice: clean_(out.invoice, 30), address: clean_(out.address, 120), zip: clean_(out.zip, 10), t: file.t };
  var empty = !hints.name && !hints.phone && !hints.invoice && !hints.address;
  if (cache && !empty) try { cache.put('shiphint_' + id, JSON.stringify(hints), 21600); } catch (e) { /* 캐시 없이 */ }   // 못 읽은 결과는 캐시 안 함
  var ret = { ok: true, hints: hints };
  if (empty) ret.read = { json: !!m, keys: Object.keys(out).join(','), chars: text.length, stop: String(data.stop_reason || ''), img: blob.getBytes().length };   // 못 읽었을 때 원인 확인용 (내용은 안 보냄)
  return ret;
}

// ---------- v18 배송기록 업로드 (2026-11-10) ----------
// 화면에서 고른 송장 사진·동영상을 5_배송기록 폴더로. 동영상은 수백 MB 라 시트를 거치지 않고:
//  1) 화면 → shipUpload { name, mime, size, origin } → 시트가 드라이브 '이어 올리기' 주소를 만들어 돌려줌 (주소에 권한이 담김, 그 파일 하나만)
//  2) 화면이 그 주소로 파일을 8MB 씩 직접 올림
//  · 올린 파일은 5_배송기록\_NAS로 폴더에 → 사무실 PC 예약(평일 09:20 · 18:50)이 NAS [배송기록]으로 옮김
//    → 평소처럼 09:30 · 19:00 에 NAS → 5_배송기록 복사 (그때부터 목록 · 파일 정리 대상)
//  · 사진·동영상만 · 2GB 까지 · V3 화면 주소에서만 · 같은 이름(수신자 붙은 이름 포함) + 같은 크기 파일이 이미 있으면 건너뜀
var SHIP_UPLOAD_ORIGINS = ['https://w-works-official.github.io'];
var SHIP_UPLOAD_MAX = 2 * 1024 * 1024 * 1024;
var SHIP_UPLOAD_FOLDER = '_NAS로';
var SHIP_UPLOAD_EXT = /\.(jpe?g|png|webp|heic|heif|gif|mp4|mov|avi|mkv|m4v|wmv|3gp)$/i;

function shipUpload_(body) {
  var name = String(body && body.name || '').replace(/[\\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  var mime = String(body && body.mime || '').toLowerCase().slice(0, 80);
  var size = Math.floor(Number(body && body.size) || 0);
  var origin = String(body && body.origin || '');
  if (!name) return { ok: false, error: '파일 이름이 없습니다' };
  if (!/^(image|video)\//.test(mime) && !SHIP_UPLOAD_EXT.test(name)) return { ok: false, error: name + ': 사진·동영상만 올릴 수 있습니다' };
  if (!(size > 0) || size > SHIP_UPLOAD_MAX) return { ok: false, error: name + ': 크기가 맞지 않습니다 (2GB 까지)' };
  if (SHIP_UPLOAD_ORIGINS.indexOf(origin) < 0) return { ok: false, error: 'V3 화면에서만 올릴 수 있습니다' };
  var base = name.replace(/\.[^.]+$/, '');
  var root = DriveApp.getFolderById(prop_('SHIP_FOLDER') || SHIP_FOLDER_DEFAULT);
  var stage = root.getFoldersByName(SHIP_UPLOAD_FOLDER);
  var stageFolder = stage.hasNext() ? stage.next() : root.createFolder(SHIP_UPLOAD_FOLDER);
  var waiting = [];
  var sit = stageFolder.getFiles();
  while (sit.hasNext()) { var sf = sit.next(); waiting.push({ id: sf.getId(), name: sf.getName(), size: sf.getSize() }); }
  var same = shipFiles_().concat(waiting).filter(function (f) { return f.size === size && String(f.name).indexOf(base) === 0; })[0];
  if (same) return { ok: true, skip: true, id: same.id, name: same.name };
  var folderId = stageFolder.getId();
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
    method: 'post', contentType: 'application/json; charset=UTF-8', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime || 'application/octet-stream', 'X-Upload-Content-Length': String(size), Origin: origin },
    payload: JSON.stringify({ name: name, parents: [folderId] }),
  });
  var headers = res.getAllHeaders ? res.getAllHeaders() : {};
  var url = headers.Location || headers.location || '';
  if (res.getResponseCode() !== 200 || !/^https:\/\/www\.googleapis\.com\/upload\/drive\//.test(url)) return { ok: false, error: '업로드 준비 실패 (' + res.getResponseCode() + ')' };
  return { ok: true, url: url, name: name };
}

// ---------- v17 신상품 등록 (2026-11-10) — '업데이트 list' 시트의 '업데이트 순서' 탭 ----------
// V3 상품 관리 › 신상품 등록 화면이 이 탭을 읽고(newList), 칸 하나씩 고치고(newSave), 새 줄을 붙입니다(newAdd).
//  · 머리글 1~3줄, 상품은 4줄부터 · A~AD 30칸
//  · 고칠 때: 화면이 본 값(expect)과 지금 시트 값이 다르면 쓰지 않고 알려 줌 (시트에서 먼저 바꾼 것 덮어쓰기 방지)
//  · 수식 칸은 쓰지 않음 · '=' 로 시작하는 글은 글자로 저장 · 줄은 지우지 않음
//  · 고친 기록은 이 CS 시트 '신상품 기록' 탭에 (시각 · 수정자 · 줄 · 칸 · 전 값 · 새 값)
//  · 처음 한 번: 편집기에서 '신상품_권한' 실행 → 스프레드시트 권한 허용
var UPD_SHEET_DEFAULT = '1-o0XpuHE_A8ZrGpbnRyOqpKP715bHd21pTlLBwjOj4o'; // 업데이트 list (스크립트 속성 UPD_SHEET 로 바꿀 수 있음)
var UPD_TAB_GID = 813202838;
var UPD_TAB_NAME = '업데이트 순서';
var UPD_HEAD_ROWS = 3;
var UPD_COLS = 30;                    // A ~ AD
var UPD_KEY_COLS = [4, 5, 6, 9, 10];  // D 제품폴더 · E 체크 항목 · F 옵션 · I 제품명 · J 매입옵션명 — 마지막 상품 줄 찾기
var UPD_LOG_SHEET = '신상품 기록';
var UPD_IMG_COL = 3;                  // C 이미지 (셀 안 사진)
var UPD_CELL_LIMIT = 45000;

function 신상품_권한() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/spreadsheets']);
  var tab = updTab_();
  Logger.log('업데이트 list › ' + tab.getName() + ' — 읽기·쓰기 권한 확인 완료 (마지막 줄 ' + tab.getLastRow() + ')');
}

function updTab_() {
  var book = SpreadsheetApp.openById(prop_('UPD_SHEET') || UPD_SHEET_DEFAULT);
  var sheets = book.getSheets();
  for (var i = 0; i < sheets.length; i++) if (sheets[i].getSheetId && sheets[i].getSheetId() === UPD_TAB_GID) return sheets[i];
  var byName = book.getSheetByName(UPD_TAB_NAME);
  if (!byName) throw new Error("'" + UPD_TAB_NAME + "' 탭을 찾지 못했습니다");
  return byName;
}

function updLabels_(tab) {
  var head = tab.getRange(1, 1, UPD_HEAD_ROWS, UPD_COLS).getDisplayValues();
  var out = [];
  for (var c = 0; c < UPD_COLS; c++) {
    var parts = [];
    for (var r = 0; r < UPD_HEAD_ROWS; r++) { var t = String(head[r][c] || '').replace(/\s+/g, ' ').trim(); if (t && parts.indexOf(t) < 0) parts.push(t); }
    out.push(parts.join(' '));
  }
  return out;
}

function updLastRow_(tab) {
  var last = tab.getLastRow();
  if (last <= UPD_HEAD_ROWS) return UPD_HEAD_ROWS;
  var vals = tab.getRange(UPD_HEAD_ROWS + 1, 1, last - UPD_HEAD_ROWS, UPD_COLS).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    for (var k = 0; k < UPD_KEY_COLS.length; k++) if (String(vals[i][UPD_KEY_COLS[k] - 1] || '').trim()) return UPD_HEAD_ROWS + 1 + i;
  }
  return UPD_HEAD_ROWS;
}

function updList_() {
  var tab = updTab_();
  var labels = updLabels_(tab);
  var last = updLastRow_(tab);
  var rows = [];
  if (last > UPD_HEAD_ROWS) {
    var range = tab.getRange(UPD_HEAD_ROWS + 1, 1, last - UPD_HEAD_ROWS, UPD_COLS);
    var vals = range.getDisplayValues();
    var forms = range.getFormulas();
    for (var i = 0; i < vals.length; i++) {
      if (!vals[i].some(function (v) { return String(v || '').trim(); })) continue;
      var f = [];
      for (var c = 0; c < UPD_COLS; c++) if (forms[i][c]) f.push(c);
      rows.push({ r: UPD_HEAD_ROWS + 1 + i, cells: vals[i].map(function (v) { return String(v == null ? '' : v); }), formulas: f });
    }
  }
  return { ok: true, labels: labels, rows: rows, headRows: UPD_HEAD_ROWS, cols: UPD_COLS, sheetUrl: 'https://docs.google.com/spreadsheets/d/' + (prop_('UPD_SHEET') || UPD_SHEET_DEFAULT) + '/edit#gid=' + UPD_TAB_GID };
}

// C열 셀 안 사진 → 드라이브 'V3_신상품 사진' 폴더에 사본 (구글이 셀 사진 주소를 다른 화면에서 못 열게 막아서)
//  · 상품(제품폴더 D 글자)마다 한 번만 만들고, 만든 것은 CS 시트 '신상품 사진' 탭에 (열쇠 · 파일ID · 줄 · 만든 시각)
//  · 폴더는 '링크가 있는 사람 보기' — 화면은 https://lh3.googleusercontent.com/d/파일ID=w400 로 봄
//  · 줄 묶음(최대 40줄) · 3시간 기억 · 시트 C열은 안 바꿈
var UPD_PIC_CACHE_SEC = 3 * 3600;
var UPD_PIC_FOLDER = 'V3_신상품 사진';
var UPD_PIC_SHEET = '신상품 사진';
function updPicFolder_() {
  var id = prop_('NEW_PIC_FOLDER');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 지워졌으면 새로 */ } }
  var found = DriveApp.getFoldersByName(UPD_PIC_FOLDER);
  var folder = found.hasNext() ? found.next() : DriveApp.createFolder(UPD_PIC_FOLDER);
  try { folder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) { /* 공유 못 하면 사진만 안 보임 */ }
  PropertiesService.getScriptProperties().setProperty('NEW_PIC_FOLDER', folder.getId());
  return folder;
}
function updPicMap_() {
  var sheet = book_().getSheetByName(UPD_PIC_SHEET);
  var map = {};
  if (!sheet || sheet.getLastRow() < 2) return map;
  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0] && r[1]) map[String(r[0])] = String(r[1]); });
  return map;
}
function updPicKey_(folderText) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, String(folderText || '').trim())).slice(0, 16);
}
var updPicUrl_ = function (id) { return id ? 'https://lh3.googleusercontent.com/d/' + id + '=w400' : ''; };
function updPics_(body) {
  var want = (Array.isArray(body && body.rows) ? body.rows : []).map(function (r) { return Math.floor(Number(r)); }).filter(function (r) { return r > UPD_HEAD_ROWS; }).slice(0, 40);
  if (!want.length) return { ok: true, pics: {} };
  var tab = updTab_();
  var lo = Math.min.apply(null, want), hi = Math.max.apply(null, want);
  var folders = tab.getRange(lo, 4, hi - lo + 1, 1).getDisplayValues();
  var cache = CacheService.getScriptCache();
  var keyOf = function (r) { return updPicKey_(folders[r - lo][0]); };
  var ckeys = want.map(function (r) { return 'updpic2:' + keyOf(r); });
  var hit = cache.getAll(ckeys) || {};
  var pics = {}, todo = [];
  want.forEach(function (r, i) { if (hit[ckeys[i]] != null) pics[r] = hit[ckeys[i]]; else todo.push(r); });
  if (!todo.length) return { ok: true, pics: pics };
  var map = updPicMap_();
  var cells = null, folder = null, made = [], put = {};
  var token = ScriptApp.getOAuthToken();
  todo.forEach(function (r) {
    var key = keyOf(r);
    var id = String(folders[r - lo][0] || '').trim() ? map[key] : '';
    if (!id && String(folders[r - lo][0] || '').trim()) {
      if (!cells) cells = tab.getRange(lo, UPD_IMG_COL, hi - lo + 1, 1).getValues();
      var pic = cells[r - lo][0], src = '';
      try { if (pic && typeof pic === 'object' && typeof pic.getContentUrl === 'function') src = String(pic.getContentUrl() || ''); } catch (e) { src = ''; }
      if (src) {
        try {
          var res = UrlFetchApp.fetch(src, { headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true, followRedirects: true });
          var blob = res.getResponseCode() === 200 ? res.getBlob() : null;
          var type = blob ? String(blob.getContentType() || '').toLowerCase() : '';
          if (blob && /^image\//.test(type)) {
            if (!folder) folder = updPicFolder_();
            var name = (r + '_' + String(folders[r - lo][0]).replace(/[\\\/:*?"<>|\r\n]+/g, ' ').trim()).slice(0, 80) + (/png/.test(type) ? '.png' : '.jpg');
            id = folder.createFile(blob.setName(name)).getId();
            map[key] = id;
            made.push([key, id, r, new Date()]);
          }
        } catch (e) { id = ''; }
      }
    }
    pics[r] = updPicUrl_(id);
    put['updpic2:' + key] = pics[r];
  });
  if (made.length) withLock_(function () {
    var book = book_();
    var sheet = book.getSheetByName(UPD_PIC_SHEET);
    if (!sheet) { sheet = book.insertSheet(UPD_PIC_SHEET); sheet.appendRow(['열쇠(제품폴더)', '드라이브 파일ID', '줄', '만든 시각']); sheet.setFrozenRows(1); }
    sheet.getRange(sheet.getLastRow() + 1, 1, made.length, 4).setValues(made);
  });
  try { cache.putAll(put, UPD_PIC_CACHE_SEC); } catch (e) { /* 기억 못 해도 이번엔 줌 */ }
  return { ok: true, pics: pics, made: made.length };
}

function updValue_(value) {
  var text = String(value == null ? '' : value).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').slice(0, UPD_CELL_LIMIT);
  return text.charAt(0) === '=' ? "'" + text : text; // 수식으로 해석되지 않게
}

function updLog_(rows) {
  var book = book_();
  var sheet = book.getSheetByName(UPD_LOG_SHEET);
  if (!sheet) { sheet = book.insertSheet(UPD_LOG_SHEET); sheet.appendRow(['시각', '수정자', '줄', '칸', '전 값', '새 값']); sheet.setFrozenRows(1); }
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 6).setValues(rows.map(function (x) {
    return [x[0], x[1], x[2], x[3], clean_(String(x[4]).slice(0, 2000), 2000), clean_(String(x[5]).slice(0, 2000), 2000)];
  }));
}

function updColName_(c) { var s = ''; c += 1; while (c > 0) { var m = (c - 1) % 26; s = String.fromCharCode(65 + m) + s; c = Math.floor((c - 1) / 26); } return s; }

function updSave_(body) {
  var r = Math.floor(Number(body && body.r)), c = Math.floor(Number(body && body.c));
  if (!(r > UPD_HEAD_ROWS) || !(c >= 0 && c < UPD_COLS)) return { ok: false, error: '줄·칸 번호가 맞지 않습니다' };
  var tab = updTab_();
  var cell = tab.getRange(r, c + 1);
  if (cell.getFormula()) return { ok: false, error: updColName_(c) + r + ' 칸은 수식이라 시트에서 직접 고쳐 주세요' };
  var before = String(cell.getDisplayValue());
  if (before !== String(body.expect == null ? '' : body.expect)) return { ok: false, conflict: true, current: before, error: '시트에서 먼저 바뀐 칸입니다 — 새 값을 보여 드립니다' };
  var next = updValue_(body.value);
  cell.setValue(next);
  var now = String(cell.getDisplayValue());
  updLog_([[new Date(), plain_(clean_(body.editor, 40)), r, updColName_(c), before, now]]);
  return { ok: true, r: r, c: c, value: now };
}

function updAdd_(body) {
  var cells = body && body.cells && typeof body.cells === 'object' ? body.cells : {};
  var keys = Object.keys(cells).map(Number).filter(function (c) { return c >= 0 && c < UPD_COLS && String(cells[c] == null ? '' : cells[c]).trim(); });
  if (!keys.length) return { ok: false, error: '넣을 내용이 없습니다' };
  var tab = updTab_();
  var target = updLastRow_(tab) + 1;
  for (var tries = 0; tries < 50; tries++, target++) {
    var range = tab.getRange(target, 1, 1, UPD_COLS);
    var vals = range.getDisplayValues()[0], forms = range.getFormulas()[0];
    var busy = keys.some(function (c) { return String(vals[c] || '').trim() || forms[c]; });
    if (!busy) break;
  }
  if (tries >= 50) return { ok: false, error: '빈 줄을 찾지 못했습니다' };
  var who = plain_(clean_(body.editor, 40)), at = new Date(), log = [];
  keys.forEach(function (c) {
    var v = updValue_(cells[c]);
    tab.getRange(target, c + 1).setValue(v);
    log.push([at, who, target, updColName_(c), '', v]);
  });
  updLog_(log);
  return { ok: true, r: target };
}

// ---------- v14 XX 표시 (전달사항 · 임의필드) ----------
// 상품 현황에서 [XX 표시 올리기]로 엑셀(상품코드 · 전달사항 · 임의필드)을 올리면 표시가 있는 옵션만 통째로 바꿔 저장
function xxSheet_() {
  var book = book_();
  var sheet = book.getSheetByName(XX_SHEET);
  if (!sheet) {
    sheet = book.insertSheet(XX_SHEET);
    sheet.getRange(1, 1, 1, 5).setValues([['셀피아코드', '표시', '칸', '내용', '올린 시각']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function xxList_() {
  var sheet = xxSheet_();
  var n = sheet.getLastRow() - 1;
  if (n <= 0) return { ok: true, items: [], at: '' };
  var rows = sheet.getRange(2, 1, n, 5).getDisplayValues();
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var sku = discSku_(rows[i][0]);
    if (sku) out.push({ sku: sku, mark: String(rows[i][1] || ''), field: String(rows[i][2] || ''), text: String(rows[i][3] || '') });
  }
  return { ok: true, items: out, at: n > 0 ? String(rows[0][4] || '') : '' };
}

function xxSet_(body) {
  var list = Array.isArray(body.items) ? body.items : [];
  if (list.length > 40000) return { ok: false, error: '한 번에 40,000줄까지입니다' };
  var stamp = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm');
  var seen = {}, rows = [];
  for (var i = 0; i < list.length; i++) {
    var it = list[i] || {};
    var sku = discSku_(it.sku);
    var mark = String(it.mark || '').toUpperCase();
    if (!sku || seen[sku] || !/^X{2,3}$/.test(mark)) continue;
    seen[sku] = true;
    rows.push([sku, mark, plain_(clean_(it.field, 20)), plain_(clean_(it.text, 120)), stamp]);
  }
  var sheet = xxSheet_();
  var n = sheet.getLastRow() - 1;
  if (n > 0) sheet.getRange(2, 1, n, 5).clearContent();
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, 1).setNumberFormat('@');
    sheet.getRange(2, 4, rows.length, 1).setNumberFormat('@');
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  return { ok: true, total: rows.length, at: stamp };
}

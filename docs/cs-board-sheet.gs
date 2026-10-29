/**
 * @OnlyCurrentDoc  (시트 권한은 "이 시트 하나"로만 제한. AI 추천 때문에 외부 주소 호출 권한만 추가로 묻습니다)
 *
 * System V3 CS 게시판 답변 시트 (2026-10-29 v2: 수집기 PC 연결 — 수집·등록 요청, 리뷰, AI 사용량)
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
 *
 * 이 시트가 하는 일 (이것뿐):
 *   - list     (화면)   종료되지 않은 문의·리뷰 목록 + 수집기 PC 상태 + 최근 요청
 *   - save     (화면)   선택·고친 문안·보류 저장. 다른 사람이 먼저 바꿨으면 덮어쓰지 않고 알려줌
 *   - suggest  (화면)   AI 답변 후보 10개를 받아 답변안 뒤에 붙임(기존 답변안·선택은 그대로)
 *   - request  (화면)   수집·리뷰 수집·테스트 수집·등록 요청을 [요청] 탭에 한 줄 추가 (같은 종류가 이미 대기 중이면 추가 안 함)
 *   - cancel   (화면)   아직 시작 안 한 요청 취소
 *   - usage    (화면)   날짜별 AI 사용량
 *   - ingest   (수집기) 수집한 문의·리뷰 추가·갱신. 이미 있는 줄의 선택·답변안은 건드리지 않음.
 *                       정상 수집된 업체에서 사라진(=답변된) 문의는 "종료" — 다시 나타나면 다시 열림
 *   - close    (수집기) 이미 답변된 문의를 "종료"로
 *   - poll     (수집기) 살아 있음 알림 + 대기 중 요청 1개 가져가기(실행중으로 표시)
 *   - finish   (수집기) 요청 결과 기록, 등록 결과를 문의 줄에 표시(등록완료면 종료)
 * 줄은 절대 지우지 않습니다. 시트의 다른 탭·다른 파일은 건드리지 않습니다.
 */
var SHEET_NAME = 'CS문의';
var JOB_SHEET = '요청';
var HEADER = ['키', '업체', '게시판', '문의ID', '문의시각', '상품명', '상태', '문의', '답변안', '선택', '버전', '수정자', '수정시각', '수집시각', '종료', '등록'];
var COL = { key: 1, vendor: 2, board: 3, id: 4, date: 5, product: 6, status: 7, inquiry: 8, drafts: 9, choice: 10, version: 11, editor: 12, editedAt: 13, collectedAt: 14, closed: 15, reg: 16 };
var JOB_HEADER = ['ID', '종류', '상태', '요청자', '요청시각', '시작시각', '끝시각', '내용', '결과', 'PC'];
var JOB = { id: 1, kind: 2, status: 3, by: 4, at: 5, started: 6, ended: 7, body: 8, result: 9, pc: 10 };
var JOB_KINDS = { collect: '게시판 수집', reviews: '리뷰 수집', test: '테스트 수집', register: '등록' };
var REGISTER_SUPPORTED = { '스마트스토어|상품문의': true, '스마트스토어|고객문의': true }; // 수집기 g1_register.SUPPORTED 와 같음
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
  // 주소 확인용 — 데이터는 돌려주지 않습니다(토큰은 POST 본문으로만)
  return json_({ ok: true, service: 'system-v3-cs-board', version: 2 });
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

function route_(body) {
  var action = String(body.action || '');
  var staff = ['list', 'save', 'suggest', 'request', 'cancel', 'usage'];
  var collector = ['ingest', 'close', 'poll', 'finish'];
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
  if (action === 'ingest') {
    var result = withLock_(function () { return ingest_(sheet_(), body.rows, body.snapshot); });
    if (result.ok && result.newKeys && result.newKeys.length && body.autoSuggest !== false) result.suggested = autoSuggest_(result.newKeys);
    delete result.newKeys;
    return result;
  }
  if (action === 'close') return withLock_(function () { return close_(sheet_(), body.keys, '수집기 종료'); });
  if (action === 'poll') return withLock_(function () { return poll_(body); });
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
  };
}

function list_() {
  return {
    ok: true,
    rows: openRows_(sheet_()),
    aiEnabled: !!prop_('CLAUDE_KEY'),
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
  var lines = String(text || '').split('\n');
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
    out.push(job);
  }
  return out;
}

function request_(body) {
  var kind = String(body.kind || '');
  if (!JOB_KINDS[kind]) return { ok: false, error: '알 수 없는 요청 종류입니다.' };
  var jobs = jobValues_();
  for (var i = 0; i < jobs.rows.length; i++) {
    var j = jobOut_(jobs.rows[i]);
    if (j.kind === kind && (j.status === '대기' || j.status === '실행중') && kind !== 'register') {
      return { ok: true, job: j, duplicate: true, jobs: recentJobs_(10) };
    }
  }
  var content = {};
  var by = plain_(clean_(body.editor, 40));
  if (kind === 'register') {
    var made = registerItems_(body.keys, by);
    if (made.error) return { ok: false, error: made.error };
    content = { items: made.items };
  } else {
    var options = body.options && typeof body.options === 'object' ? body.options : {};
    var vendors = Array.isArray(options.vendors) ? options.vendors.map(function (v) { return plain_(clean_(v, 20)); }).filter(String) : [];
    content = { vendors: vendors.slice(0, 4) };
    var days = Math.floor(Number(options.reviewDays));
    if (kind === 'reviews' && days >= 1 && days <= 365) content.reviewDays = days;
  }
  var id = 'J' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyMMddHHmmss') + Math.floor(Math.random() * 90 + 10);
  jobs.sheet.appendRow([id, kind, '대기', clean_(body.editor, 40), new Date(), '', '', stringify_(content), '', '']);
  return { ok: true, job: jobOut_([id, kind, '대기', by, new Date(), '', '', JSON.stringify(content), '', '']), jobs: recentJobs_(10), rows: kind === 'register' ? openRows_(sheet_()) : undefined };
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
    if (!REGISTER_SUPPORTED[row.vendor + '|' + row.board]) continue;
    var edits = choice.edits || {};
    var text = String(Object.prototype.hasOwnProperty.call(edits, choice.pick) ? edits[choice.pick] : (row.drafts[choice.pick] && row.drafts[choice.pick].text) || '').trim();
    if (!text) continue;
    items.push({ key: key, vendor: row.vendor, board: row.board, id: row.id, date: row.date, text: text });
    var reg = { state: '요청', at: now.toISOString(), by: by };
    sheet.getRange(found.index, COL.reg, 1, 1).setValues([[stringify_(reg)]]);
    sheet.getRange(found.index, COL.status, 1, 1).setValues([[statusOf_(false, row.drafts, choice, reg)]]);
  }
  if (!items.length) return { error: '등록할 수 있는 문의가 없습니다 (채택·스마트스토어만 자동 등록).' };
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

// ---------- 수집기: 요청 가져가기·결과 ----------
function poll_(body) {
  var state = parse_(prop_('COLLECTOR_STATE'), {});
  state.pc = plain_(clean_(body.pc, 60));
  state.version = plain_(clean_(body.version, 40));
  state.seenAt = new Date().toISOString();
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
      w.status = '실행중';
      job = w;
      state.busy = true;
      break;
    }
  }
  setProp_('COLLECTOR_STATE', JSON.stringify(state));
  return { ok: true, job: job };
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

// ---------- 수집기: 문의 넣기·종료 ----------
// snapshot = { kind: '문의'|'리뷰', vendors: {업체: {상태, 건수, 메모}}, days, collectedAt, test, file }
function ingest_(sheet, rows, snapshot) {
  var list = Array.isArray(rows) ? rows.slice(0, MAX_INGEST) : [];
  var existing = values_(sheet);
  var index = {};
  for (var i = 0; i < existing.length; i++) index[plain_(existing[i][COL.key - 1])] = i + 2;
  var now = new Date();
  var added = 0;
  var updated = 0;
  var reopened = 0;
  var seen = {};
  var newKeys = [];
  for (var r = 0; r < list.length; r++) {
    var row = list[r] || {};
    if (row['가상']) continue; // 테스트 수집 결과는 시트에 안 올림
    var key = rowKey_(row);
    if (!key) continue;
    seen[key] = true;
    var inquiry = stringify_(inquiryFrom_(row));
    var at = index[key];
    if (at) {
      // 이미 있는 문의: 문의 내용·수집시각만 갱신, 선택·답변안은 그대로. 답변안이 비어 있을 때만 수집기 답변안을 넣음
      var current = rowOut_(sheet.getRange(at, 1, 1, HEADER.length).getValues()[0]);
      sheet.getRange(at, COL.inquiry, 1, 1).setValues([[inquiry]]);
      sheet.getRange(at, COL.collectedAt, 1, 1).setValues([[now]]);
      var drafts = current.drafts && current.drafts.length ? current.drafts : draftsFrom_(row['답변안']);
      if (drafts !== current.drafts) sheet.getRange(at, COL.drafts, 1, 1).setValues([[stringify_(drafts)]]);
      if (current.closed && !(current.reg && current.reg.state === '완료')) {
        sheet.getRange(at, COL.closed, 1, 1).setValues([['']]); // 다시 나타남 = 아직 미답변 → 다시 열기
        current.closed = false;
        reopened++;
      }
      sheet.getRange(at, COL.status, 1, 1).setValues([[statusOf_(current.closed, drafts, current.choice, current.reg)]]);
      updated++;
      continue;
    }
    var fresh = draftsFrom_(row['답변안']);
    sheet.appendRow([
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
    index[key] = sheet.getLastRow();
    added++;
    newKeys.push(key);
  }
  var closed = snapshot ? autoClose_(sheet, snapshot, seen) : 0;
  if (snapshot && !snapshot.test) rememberCollect_(snapshot, list.length);
  return { ok: true, added: added, updated: updated, reopened: reopened, closed: closed, newKeys: newKeys };
}

// 정상 수집된 업체에서 이번에 없는 문의 = 그 사이 답변됨 → 종료 (수집 기간 안의 문의만, 테스트 수집은 제외)
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
  for (var i = 0; i < rows.length; i++) {
    var row = rowOut_(rows[i]);
    if (row.closed || seen[row.key] || isReview_(row.board) !== review) continue;
    if (!vendors[row.vendor] || vendors[row.vendor]['상태'] !== 'ok') continue;
    if (row.reg && row.reg.state === '요청') continue;
    var t = when_(row.date);
    if (!(t >= from && t <= collectedAt + 3600 * 1000)) continue;
    sheet.getRange(i + 2, COL.status, 1, 1).setValues([['종료']]);
    sheet.getRange(i + 2, COL.closed, 1, 1).setValues([[now]]);
    changed++;
  }
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

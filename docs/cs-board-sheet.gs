/**
 * @OnlyCurrentDoc  (시트 권한은 "이 시트 하나"로만 제한. AI 추천 때문에 외부 주소 호출 권한만 추가로 묻습니다)
 *
 * System V3 CS 게시판 답변 시트 (2026-10-29)
 * G1 CS 수집기가 모은 문의와 답변안을 이 시트에 모으고, System V3 CS 관리 화면(브라우저)에서
 * 답변안 A~J 중에서 고르고·고치고·보류합니다. AI 추천(답변 후보 10개)도 여기서 대신 부릅니다.
 *
 * 설치(대표님이 한 번):
 *   1) 구글드라이브 A_총괄 폴더에 새 구글 시트 "System V3 CS문의" 만들기
 *   2) 확장 프로그램 > Apps Script 에 이 파일 내용을 붙여넣고 저장
 *   3) 프로젝트 설정(톱니바퀴) > 스크립트 속성 에 아래 3개 추가 (값은 이 저장소·채팅에 적지 않습니다)
 *        BOARD_TOKEN      화면에서 입력할 비밀번호 (영문·숫자·-·_ 8자 이상)
 *        COLLECTOR_TOKEN  수집기 PC가 쓸 비밀번호 (BOARD_TOKEN 과 다르게)
 *        CLAUDE_KEY       Claude API 키
 *      (선택) CLAUDE_MODEL 기본 claude-haiku-5-5 / AI_DAILY_LIMIT 하루 AI 추천 최대 횟수, 기본 300
 *   4) 배포 > 새 배포 > 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 → 웹앱 주소를 알려주세요
 *
 * 이 시트가 하는 일 (이것뿐):
 *   - list     (화면)   종료되지 않은 문의 목록
 *   - save     (화면)   선택·고친 문안·보류 저장. 다른 사람이 먼저 바꿨으면 덮어쓰지 않고 알려줌
 *   - suggest  (화면)   AI 답변 후보 10개를 받아 답변안 뒤에 붙임(기존 답변안·선택은 그대로)
 *   - ingest   (수집기) 수집한 문의 추가·갱신. 이미 있는 문의의 선택·답변안은 건드리지 않음
 *   - close    (수집기) 이미 답변된 문의를 "종료"로 (줄은 지우지 않음)
 * 줄은 절대 지우지 않습니다. 시트의 다른 탭·다른 파일은 건드리지 않습니다.
 */
var SHEET_NAME = 'CS문의';
var HEADER = ['키', '업체', '게시판', '문의ID', '문의시각', '상품명', '상태', '문의', '답변안', '선택', '버전', '수정자', '수정시각', '수집시각', '종료'];
var COL = { key: 1, vendor: 2, board: 3, id: 4, date: 5, product: 6, status: 7, inquiry: 8, drafts: 9, choice: 10, version: 11, editor: 12, editedAt: 13, collectedAt: 14, closed: 15 };
var MAX_INGEST = 200;
var MAX_DRAFTS = 40;
var CELL_LIMIT = 45000;
var DEFAULT_MODEL = 'claude-haiku-5-5';
var DEFAULT_DAILY_LIMIT = 300;

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

function doGet(e) {
  // 주소 확인용 — 데이터는 돌려주지 않습니다(토큰은 POST 본문으로만)
  return json_({ ok: true, service: 'system-v3-cs-board', version: 1 });
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

function sameToken_(given, expected) {
  given = String(given || '');
  if (!expected || expected.length < 8 || given.length !== expected.length) return false;
  var diff = 0;
  for (var i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

function route_(body) {
  var action = String(body.action || '');
  var staff = ['list', 'save', 'suggest'];
  var collector = ['ingest', 'close'];
  if (staff.indexOf(action) >= 0) {
    if (!sameToken_(body.token, prop_('BOARD_TOKEN'))) return { ok: false, denied: true, error: '비밀번호가 맞지 않습니다.' };
  } else if (collector.indexOf(action) >= 0) {
    if (!sameToken_(body.token, prop_('COLLECTOR_TOKEN'))) return { ok: false, denied: true, error: '수집기 비밀번호가 맞지 않습니다.' };
  } else {
    return { ok: false, error: '알 수 없는 요청입니다.' };
  }
  if (action === 'list') return { ok: true, rows: openRows_(sheet_()), aiEnabled: !!prop_('CLAUDE_KEY'), serverTime: new Date().toISOString() };
  if (action === 'save') return withLock_(function () { return save_(sheet_(), body); });
  if (action === 'suggest') return suggest_(body);
  if (action === 'ingest') return withLock_(function () { return ingest_(sheet_(), body.rows); });
  return withLock_(function () { return close_(sheet_(), body.keys); });
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

function sheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  if (book.getSpreadsheetTimeZone && book.getSpreadsheetTimeZone() !== 'Asia/Seoul') book.setSpreadsheetTimeZone('Asia/Seoul');
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.getSheets()[0];
    if (sheet.getLastRow() !== 0) sheet = book.insertSheet(SHEET_NAME);
    else sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
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

// 수집기 행(한글 키) → 시트에 넣을 문의 내용
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
    context.push({ kind: clean_(h['구분'], 30), date: clean_(h['날짜'], 40), question: body_(h['내용'], 2000), answer: body_(h['답변'], 2000) });
  }
  return {
    title: plain_(clean_(row['제목'], 300)),
    question: body_(row['문의'], 4000),
    type: plain_(clean_(row['유형'], 60)),
    option: plain_(clean_(row['옵션'], 300)),
    check: body_(row['확인'] || row['확인 필요'] || '', 1000),
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
    if (text) out.push({ text: text, from: clean_(items[i] && items[i].from, 20) || '수집' });
  }
  return out;
}

function statusOf_(closed, drafts, choice) {
  if (closed) return '종료';
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
  };
}

function openRows_(sheet) {
  var rows = values_(sheet);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rowOut_(rows[i]);
    if (!row.closed && row.key) out.push(row);
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
  if (Number(body.baseVersion) !== current.version) {
    return { ok: false, conflict: true, error: '다른 사람이 먼저 바꿨습니다. 새 내용으로 다시 불러왔습니다.', row: current };
  }
  var drafts = Array.isArray(current.drafts) ? current.drafts : [];
  var choice = choiceFrom_(body.choice, drafts.length);
  var now = new Date();
  var version = current.version + 1;
  sheet.getRange(found.index, COL.status, 1, 1).setValues([[statusOf_(false, drafts, choice)]]);
  sheet.getRange(found.index, COL.choice, 1, 4).setValues([[stringify_(choice), version, clean_(body.editor, 40), now]]);
  current.choice = choice;
  current.version = version;
  current.editor = plain_(clean_(body.editor, 40));
  current.editedAt = now.toISOString();
  return { ok: true, row: current };
}

// ---------- 화면: AI 추천 ----------
function todayKey_() {
  return 'AI_COUNT_' + Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyyMMdd');
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

  var props = PropertiesService.getScriptProperties();
  var limit = Number(prop_('AI_DAILY_LIMIT')) || DEFAULT_DAILY_LIMIT;
  var used = withLock_(function () {
    var count = Number(props.getProperty(todayKey_()) || 0);
    if (count < limit) props.setProperty(todayKey_(), String(count + 1));
    return count;
  });
  if (used >= limit) return { ok: false, error: '오늘 AI 추천 한도(' + limit + '회)를 다 썼습니다.' };

  var texts = callClaude_(apiKey, row); // 3~7초 — 잠금 밖에서
  return withLock_(function () {
    var again = find_(sheet, key);
    var latest = rowOut_(again.values);
    var drafts = Array.isArray(latest.drafts) ? latest.drafts : [];
    for (var i = 0; i < texts.length && drafts.length < MAX_DRAFTS; i++) drafts.push({ text: texts[i], from: 'AI' });
    sheet.getRange(again.index, COL.drafts, 1, 1).setValues([[stringify_(drafts)]]);
    sheet.getRange(again.index, COL.status, 1, 1).setValues([[statusOf_(latest.closed, drafts, latest.choice)]]);
    latest.drafts = drafts;
    return { ok: true, row: latest, added: texts.length };
  });
}

function promptFor_(row) {
  var inquiry = row.inquiry || {};
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
  lines.push('', '이번 문의' + (inquiry.title ? ' (제목: ' + inquiry.title + ')' : '') + ':', '고객: ' + (inquiry.question || '(내용 없음)'));
  if (inquiry.photos && inquiry.photos.length) lines.push('(고객이 사진 ' + inquiry.photos.length + '장을 첨부함 — 사진 내용은 직접 확인하지 못함)');
  lines.push('', '(게시판 답변이라 메신저보다 조금 길어도 됩니다: 2~5문장)', '이번 문의에 보낼 답변 후보 10개를 JSON 배열로만 출력하세요.');
  return lines.join('\n');
}

function callClaude_(apiKey, row) {
  var payload = {
    model: prop_('CLAUDE_MODEL') || DEFAULT_MODEL,
    max_tokens: 2500,
    system: [{ type: 'text', text: SHOP_RULES, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: promptFor_(row) }],
  };
  var response = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var status = response.getResponseCode();
  if (status !== 200) throw new Error('AI 응답 오류 (' + status + ')');
  var data = parse_(response.getContentText(), {});
  var text = '';
  var content = Array.isArray(data.content) ? data.content : [];
  for (var i = 0; i < content.length; i++) if (content[i] && content[i].type === 'text') text += content[i].text;
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

// ---------- 수집기: 문의 넣기·종료 ----------
function ingest_(sheet, rows) {
  var list = Array.isArray(rows) ? rows.slice(0, MAX_INGEST) : [];
  var existing = values_(sheet);
  var index = {};
  for (var i = 0; i < existing.length; i++) index[plain_(existing[i][COL.key - 1])] = i + 2;
  var now = new Date();
  var added = 0;
  var updated = 0;
  for (var r = 0; r < list.length; r++) {
    var row = list[r] || {};
    var key = rowKey_(row);
    if (!key) continue;
    var inquiry = stringify_(inquiryFrom_(row));
    var at = index[key];
    if (at) {
      // 이미 있는 문의: 문의 내용·수집시각만 갱신, 선택·답변안·종료는 그대로. 답변안이 비어 있을 때만 수집기 답변안을 넣음
      var current = rowOut_(existing[at - 2]);
      sheet.getRange(at, COL.inquiry, 1, 1).setValues([[inquiry]]);
      sheet.getRange(at, COL.collectedAt, 1, 1).setValues([[now]]);
      var given = draftsFrom_(row['답변안']);
      if (given.length && !(current.drafts && current.drafts.length)) {
        sheet.getRange(at, COL.drafts, 1, 1).setValues([[stringify_(given)]]);
        sheet.getRange(at, COL.status, 1, 1).setValues([[statusOf_(current.closed, given, current.choice)]]);
      }
      updated++;
      continue;
    }
    var drafts = draftsFrom_(row['답변안']);
    sheet.appendRow([
      key,
      clean_(row['업체'], 40),
      clean_(row['게시판'], 40),
      clean_(row['id'], 120),
      clean_(row['날짜'], 40),
      clean_(row['상품명'], 300),
      statusOf_(false, drafts, null),
      inquiry,
      stringify_(drafts),
      stringify_({ pick: -1, view: [], edits: {}, hold: false }),
      0,
      '',
      '',
      now,
      '',
    ]);
    index[key] = sheet.getLastRow();
    added++;
  }
  return { ok: true, added: added, updated: updated };
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

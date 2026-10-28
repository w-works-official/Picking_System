/**
 * System V3 사진 요청 시트 (2026-10-28)
 * 구글드라이브 A_총괄 폴더의 시트 "System V3 사진요청" > 확장 프로그램 > Apps Script 에 붙여넣고
 * 배포 > 새 배포 > 유형: 웹 앱 / 실행: 나 / 액세스 권한: 모든 사용자 로 배포합니다.
 *
 * 앱이 하는 일 (이 세 가지뿐):
 *   - 목록 보기: 상태가 "요청"인 줄만 돌려줍니다.
 *   - 요청 추가: 같은 셀피아코드가 이미 "요청" 상태면 줄을 늘리지 않고 시각만 바꿉니다.
 *   - 요청 닫기: 줄을 지우지 않고 상태를 "취소" 또는 "완료"로 바꿉니다.
 * 시트의 다른 탭·다른 파일은 건드리지 않습니다.
 */
var SHEET_NAME = '사진요청';
var HEADER = ['셀피아코드', '상품', '요청 화면', '요청 시각', '상태', '처리 시각'];
var OPEN = '요청';
var MAX_CODES_PER_CALL = 200;

function doGet(e) {
  return respond_(function () {
    return { ok: true, requests: openRequests_(sheet_()) };
  });
}

function doPost(e) {
  return respond_(function () {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = sheet_();
      var changed = 0;
      if (body.action === 'add') {
        changed = addRequest_(sheet, body);
      } else if (body.action === 'close') {
        changed = closeRequests_(sheet, body.codes, body.reason === '완료' ? '완료' : '취소');
      } else {
        return { ok: false, error: '알 수 없는 요청입니다.' };
      }
      return { ok: true, changed: changed, requests: openRequests_(sheet) };
    } finally {
      lock.releaseLock();
    }
  });
}

function respond_(work) {
  var result;
  try {
    result = work();
  } catch (error) {
    result = { ok: false, error: String(error && error.message || error) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = book.getSheets()[0];
    sheet.setName(SHEET_NAME);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function clean_(value, limit) {
  var text = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit);
  // 수식으로 해석되지 않도록 (=, +, -, @ 로 시작하면 앞에 ' 를 붙임)
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function plain_(value) {
  var text = String(value == null ? '' : value);
  return text.charAt(0) === "'" ? text.slice(1) : text;
}

function rows_(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, HEADER.length).getValues();
}

function isoTime_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || '');
}

function openRequests_(sheet) {
  var list = [];
  var rows = rows_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][4]) !== OPEN) continue;
    list.push({
      code: plain_(rows[i][0]),
      title: plain_(rows[i][1]),
      source: plain_(rows[i][2]),
      requestedAt: isoTime_(rows[i][3]),
    });
  }
  return list;
}

function addRequest_(sheet, body) {
  var code = clean_(body.code, 80);
  if (!code) throw new Error('셀피아코드가 없습니다.');
  var title = clean_(body.title, 300);
  var source = clean_(body.source, 40);
  var now = new Date();
  var rows = rows_(sheet);
  for (var i = 0; i < rows.length; i++) {
    if (plain_(rows[i][0]) === plain_(code) && String(rows[i][4]) === OPEN) {
      sheet.getRange(i + 2, 2, 1, 3).setValues([[title || rows[i][1], source || rows[i][2], now]]);
      return 1;
    }
  }
  sheet.appendRow([code, title, source, now, OPEN, '']);
  return 1;
}

function closeRequests_(sheet, codes, status) {
  var wanted = {};
  var list = Array.isArray(codes) ? codes.slice(0, MAX_CODES_PER_CALL) : [];
  for (var c = 0; c < list.length; c++) {
    var key = plain_(clean_(list[c], 80));
    if (key) wanted[key] = true;
  }
  var now = new Date();
  var rows = rows_(sheet);
  var changed = 0;
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][4]) !== OPEN || !wanted[plain_(rows[i][0])]) continue;
    sheet.getRange(i + 2, 5, 1, 2).setValues([[status, now]]);
    changed++;
  }
  return changed;
}

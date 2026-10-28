import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REMOTE_BOARD_TOPICS,
  REMOTE_BOARD_URL,
  isRemoteBoardTokenValid,
  isRemoteSubJob,
  remoteBoardSections,
  remoteChip,
  remoteJobKind,
  remoteQueueByCode,
  remoteRunnerStates,
  remoteShortFileName,
} from "../src/domain/remoteBoard.mjs";

const job = (topic, code, name, par = "", desc = "") => ({ 주제: topic, 작업코드: code, 버튼이름: name, 파라미터: par, 설명: desc });
const jobs = [
  job("I 재고 체크 / 주문서", "STOCK_HEAD", "A_재고체크", "제목"),
  job("I 재고 체크 / 주문서", "PO_A", "A_1 파일 생성", "하위"),
  job("I 재고 체크 / 주문서", "STOCK_PHOTO", "A_2 사진 촬영", "하위사진"),
  job("I 재고 체크 / 주문서", "STOCK_APPLY", "A_4 재고 적용 (미정)", "하위목업"),
  job("I 재고 체크 / 주문서", "PO_B", "B_주문서 파일 생성"),
  job("재고매칭", "STOCK_A", "A_메이크샵"),
  job("셀피아 주문서 등록", "ORDER_C", "C_에이블리"),
  job("상품", "PHOTO_ADD", "상품사진 등록", "사진"),
  job("재고매칭", "STOCK_ALL", "전체적용", "그룹"),
  job("회계", "RECEIPT_NOW", "영수증 정리"),
];

// 발주 = 재고체크/주문서, 입고 = 재고매칭 + 셀피아 주문서 등록 (대표님 지정 2026-10-28)
assert.deepEqual(REMOTE_BOARD_TOPICS, { order: ["I 재고 체크 / 주문서"], receiving: ["재고매칭", "셀피아 주문서 등록"] });
const order = remoteBoardSections(jobs, REMOTE_BOARD_TOPICS.order);
assert.equal(order.length, 1);
assert.deepEqual(order[0].rows.map((j) => j.작업코드), ["STOCK_HEAD", "PO_A", "STOCK_PHOTO", "STOCK_APPLY", "PO_B"]);
const receiving = remoteBoardSections(jobs, REMOTE_BOARD_TOPICS.receiving);
assert.deepEqual(receiving.map((s) => s.topic), ["재고매칭", "셀피아 주문서 등록"]);
assert.equal(receiving[0].headJob.작업코드, "STOCK_ALL", "그룹 버튼은 소제목 옆으로");
assert.deepEqual(receiving[0].rows.map((j) => j.작업코드), ["STOCK_A"]);
assert.ok(![...order, ...receiving].some((s) => s.rows.some((j) => ["PHOTO_ADD", "RECEIPT_NOW"].includes(j.작업코드))), "다른 주제는 안 보임");
assert.deepEqual(remoteBoardSections(jobs, ["없는 주제"]), []);

assert.equal(remoteJobKind(jobs[0]), "title");
assert.equal(remoteJobKind(jobs[1]), "run");
assert.equal(remoteJobKind(jobs[2]), "board", "카메라 작업은 보드 화면으로");
assert.equal(remoteJobKind(jobs[3]), "mock");
assert.equal(remoteJobKind(jobs[7]), "board");
assert.equal(remoteJobKind(job("x", "y", "z", "기간")), "board");
assert.equal(isRemoteSubJob(jobs[1]), true);
assert.equal(isRemoteSubJob(jobs[4]), false);

assert.equal(isRemoteBoardTokenValid("4321"), true);
assert.equal(isRemoteBoardTokenValid(""), false);
assert.equal(isRemoteBoardTokenValid("a b"), false);
assert.equal(isRemoteBoardTokenValid("<x>"), false);

assert.equal(remoteShortFileName("(F_1) PC_LIST - 1007.xlsm"), "(F_1) 1007");
assert.equal(remoteShortFileName("재고체크_261028_102806_ST.jpg"), "재고체크_261028_102806_ST");

const now = new Date("2026-10-28T09:00:00Z");
const chip = remoteChip({ ID: "1", 상태: "완료", 요청시각: "2026-10-28T08:00:00Z", 종료시각: "2026-10-28T08:30:00Z", 결과파일: "(F_4) CK-LIST - 1028.xlsm\nb.txt", 결과링크: "https://drive.google.com/a\njavascript:alert(1)" }, now);
assert.equal(chip.status, "완료");
assert.equal(chip.active, false);
assert.deepEqual(chip.files.map((f) => [f.label, f.href]), [["(F_4) 1028", "https://drive.google.com/a"], ["b", ""]], "https 링크만 사용");
assert.equal(remoteChip({ 상태: "실행중", 요청시각: "2026-10-28T08:00:00Z" }, now).running, true);
assert.match(remoteChip({ 상태: "완료", 종료시각: "2026-10-26T08:00:00Z" }, now).time, /^10\/26 /, "다른 날은 날짜 표시");

const queue = [
  { ID: "3", 작업코드: "PO_B", 상태: "대기" },
  { ID: "2", 작업코드: "PO_B", 상태: "취소" },
  { ID: "1", 작업코드: "PO_B", 상태: "완료" },
  { ID: "0", 작업코드: "PO_A", 상태: "실패" },
];
const byCode = remoteQueueByCode(queue, (id) => id === "0");
assert.deepEqual(byCode.PO_B.map((q) => q.ID), ["1", "3"], "먼저 누른 것이 앞, 취소 제외");
assert.equal(byCode.PO_A, undefined, "숨김 처리한 건 제외");

const nowMs = Date.parse("2026-10-28T09:00:00Z");
assert.deepEqual(remoteRunnerStates({ 사무실: nowMs - 5000, 집: nowMs - 900000 }, [], nowMs), [{ name: "사무실", state: "on" }, { name: "집", state: "off" }]);
assert.deepEqual(remoteRunnerStates({ 사무실: nowMs - 5000 }, [{ 상태: "실행중", 러너: "사무실" }], nowMs), [{ name: "사무실", state: "busy" }]);

// 같은 큐(보드와 동일 웹앱), 토큰은 코드에 없음.
assert.match(REMOTE_BOARD_URL, /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/);
const files = await Promise.all(["../src/domain/remoteBoard.mjs", "../src/app/remoteBoardPanel.mjs", "../purchase/index.html"].map((f) => readFile(new URL(f, import.meta.url), "utf8")));
for (const text of files) assert.doesNotMatch(text, /["'=]4321\b|token\s*[:=]\s*["']\d{4}["']/, "no token in public code");
const panel = files[1];
assert.match(panel, /window\.confirm\(`'\$\{job\["버튼이름"\]\}' 을\(를\) 실행할까요\?/, "실행 전 확인");
assert.match(panel, /"Content-Type": "text\/plain;charset=utf-8"/);
assert.match(panel, /writeToken\(storage, state\.token\);\s*state\.jobs/, "token saved only after the board accepts it");
assert.match(files[2], /data-remote-board="order"/);
assert.match(files[2], /data-remote-board="receiving"/);

console.log("remoteBoard.mock.test: OK");

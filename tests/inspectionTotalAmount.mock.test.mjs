import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  combineInvoicesBySharedInvoice,
  combineInvoicesWithShipmentGroups,
} from "../src/domain/shipmentGroups.mjs";

// Exercise the production helpers without starting the app or accessing a backend.
const app = await readFile(new URL("../src/app/pickingApp.mjs", import.meta.url), "utf8");
const start = app.indexOf("function formatAmount(");
const end = app.indexOf("function invoiceTotalQuantity(", start);
assert.ok(start >= 0 && end > start);
const context = vm.createContext({ escapeHtml: (value) => String(value) });
vm.runInContext(app.slice(start, end), context);
const total = (invoice) => context.getInvoiceTotalAmount(invoice);
const badge = (invoice) => context.renderInspectionTotalAmountBadge(invoice);
const first = {
  orderGroupNo: "ORDER-A", invoiceNo: "MOCK-SHARED", orderTotalAmount: 9600,
  raw: { sellpia_order_total_amount: 9600 },
  items: [{ itemSalesAmount: 4800 }, { itemSalesAmount: 4800 }],
};
const second = {
  orderGroupNo: "ORDER-B", invoiceNo: "MOCK-SHARED", orderTotalAmount: 15000,
  raw: { sellpia_order_total_amount: 15000 },
  items: [{ itemSalesAmount: 5000 }, { itemSalesAmount: 5000 }, { itemSalesAmount: 5000 }],
};
const original = JSON.stringify([first, second]);
const combine = (sources) => combineInvoicesBySharedInvoice(sources)[0];
const combined = combine([first, second]);
assert.equal(combined.items.length, 5);
assert.equal(total(combined), 24600);
assert.match(badge(combined), /총금액 24,600원/);
assert.match(badge(combined), /사은품확인!/);
assert.equal(total(combine([second, first])), 24600, "source order must not change the sum");
assert.equal(JSON.stringify([first, second]), original, "display calculation must not mutate source orders");

const manualGroup = {
  id: "MOCK-GROUP", key: "shipment:MOCK-GROUP", status: "active",
  representativeOrderGroupNo: "ORDER-B",
  members: [{ orderGroupNo: "ORDER-A" }, { orderGroupNo: "ORDER-B" }],
};
assert.equal(total(combineInvoicesWithShipmentGroups([first, second], [manualGroup])[0]), 24600);
assert.equal(total(combine([first, { ...first }, second])), 24600, "the same order must only count once");
assert.equal(total(combine([first, { ...first, orderTotalAmount: 9700 }, second])), null,
  "conflicting amounts for the same source order must be refused");

for (const value of [null, undefined, "", " ", "not-a-number", Infinity]) {
  const unknown = { orderGroupNo: "ORDER-B", invoiceNo: "MOCK-SHARED", orderTotalAmount: value, items: second.items };
  const incomplete = combine([first, unknown]);
  assert.equal(total(incomplete), null, `missing source amount ${String(value)} must not reuse representative raw data`);
  assert.match(badge(incomplete), /총금액 확인 필요/);
  assert.doesNotMatch(badge(incomplete), /9,600|사은품확인!/);
  assert.equal(total(combine([unknown, first])), null, "missing source amount is independent of order");
}
assert.equal(total({ ...combined, sourceInvoices: [] }), null);
assert.equal(total({ ...combined, sourceInvoices: undefined }), null);
assert.equal(total({ ...combined, sourceInvoices: [{ orderTotalAmount: 1000 }, first] }), null);
assert.equal(total(combine([first, { ...second, orderTotalAmount: 0 }])), 9600, "zero is a known amount");
assert.equal(total(combine([{ ...first, orderTotalAmount: "9,600" }, second])), 24600);
assert.equal(total(combine([first, { ...second, orderTotalAmount: null, raw: { order_total_amount: 15000 } }])), 24600);

assert.equal(total(first), 9600, "single-order behavior must remain unchanged");
assert.equal(total({ raw: { sellpia_order_total_amount: 13070 } }), 13070);
assert.equal(total({ orderTotalAmount: 0 }), 0);
assert.equal(total({ items: [{ itemSalesAmount: 99999 }] }), null, "item amounts must not replace order totals");
assert.equal(badge({ items: [{ itemSalesAmount: 99999 }] }), "", "single-order unknown behavior must remain unchanged");
assert.doesNotMatch(badge(combine([{ ...first, orderTotalAmount: 9600 }, { ...second, orderTotalAmount: 10399 }])), /사은품확인!/);
assert.match(badge(combine([{ ...first, orderTotalAmount: 9600 }, { ...second, orderTotalAmount: 10400 }])), /사은품확인!/);
console.log("Inspection combined-shipment order totals and gift threshold: passed");

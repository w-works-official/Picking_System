import assert from "node:assert/strict";
import {
  BARCODE_SCAN_DUPLICATE_MS,
  canonicalInvoiceScan,
  isDuplicateInvoiceScan,
} from "../src/domain/barcodeScan.mjs";

const invoice = "6890123456789";
const other = "6890987654321";

assert.equal(canonicalInvoiceScan(invoice, [invoice]), invoice);
assert.equal(canonicalInvoiceScan(invoice.repeat(2), [invoice]), invoice);
assert.equal(canonicalInvoiceScan(invoice.repeat(3), [invoice]), invoice);
assert.equal(canonicalInvoiceScan(`${invoice}\r\n`, [invoice]), invoice);
assert.equal(canonicalInvoiceScan(invoice.slice(0, 12), [invoice]), "");
assert.equal(canonicalInvoiceScan("1111111111111", [invoice]), "");
assert.equal(canonicalInvoiceScan(`${invoice}${other}`, [invoice, other]), "");

assert.equal(isDuplicateInvoiceScan({ code: invoice, lastCode: invoice, lastProcessedAt: 1000, now: 1000 + BARCODE_SCAN_DUPLICATE_MS - 1 }), true);
assert.equal(isDuplicateInvoiceScan({ code: invoice, lastCode: invoice, lastProcessedAt: 1000, now: 1000 + BARCODE_SCAN_DUPLICATE_MS }), false);
assert.equal(isDuplicateInvoiceScan({ code: other, lastCode: invoice, lastProcessedAt: 1000, now: 1001 }), false);

console.log("barcodeScan.mock.test: OK");

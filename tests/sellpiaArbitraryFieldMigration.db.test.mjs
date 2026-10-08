import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import {
  resolveOperationDisplayFields,
  snapshotFromCurrentOrderItem,
} from "../src/adapters/orderItemOperationsAdapter.mjs";

let PGlite;
try {
  const moduleUrl = process.env.CODEX_NODE_MODULES
    ? pathToFileURL(join(process.env.CODEX_NODE_MODULES, "@electric-sql", "pglite", "dist", "index.js")).href
    : "@electric-sql/pglite";
  ({ PGlite } = await import(moduleUrl));
} catch {}

async function schemaBoundary(db) {
  const queries = [
    `select c.relname, c.relacl::text as permissions, c.relrowsecurity, c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('order_items', 'order_item_operations')
     order by c.relname`,
    `select c.relname, a.attname, a.attacl::text as permissions
     from pg_attribute a join pg_class c on c.oid = a.attrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('order_items', 'order_item_operations')
       and a.attnum > 0 and not a.attisdropped
       and a.attname not in ('sellpia_arbitrary_field_raw', 'arbitrary_field_raw_snapshot')
     order by c.relname, a.attnum`,
    `select policyname, tablename, permissive, roles, cmd, qual, with_check
     from pg_policies where schemaname = 'public'
       and tablename in ('order_items', 'order_item_operations')
     order by tablename, policyname`,
    `select c.relname, con.conname, pg_get_constraintdef(con.oid) as definition
     from pg_constraint con join pg_class c on c.oid = con.conrelid
     join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname in ('order_items', 'order_item_operations')
     order by c.relname, con.conname`,
    `select tablename, indexname, indexdef from pg_indexes where schemaname = 'public'
       and tablename in ('order_items', 'order_item_operations')
     order by tablename, indexname`,
  ];
  const results = [];
  for (const sql of queries) results.push((await db.query(sql)).rows);
  return results;
}

test("arbitrary field migration adds nullable raw text without changing existing data or access", { skip: !PGlite }, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create table public.order_items (
        item_no text primary key,
        ord_no text not null,
        sellpia_order_item_no text,
        sellpia_outbound_confirmed_date date
      );
    `);
    for (const filename of [
      "20261001093000_order_item_operations_foundation.sql",
      "20261001131748_fix_order_item_operations_trigger_search_path.sql",
    ]) {
      await db.exec(await readFile(new URL(`../supabase/pr_system_migrations/${filename}`, import.meta.url), "utf8"));
    }
    await db.exec(`
      insert into public.order_items(item_no, ord_no, sellpia_order_item_no, sellpia_supplier_cell_raw)
      values ('1_R1', 'O1', 'R1', '기존 매입처');
      insert into public.order_item_operations(
        ord_no, sellpia_order_item_no, item_no, custom_required_at, internal_memo,
        sellpia_product_code_snapshot, own_code_snapshot, supplier_cell_raw_snapshot
      ) values ('O1', 'R1', '1_R1', '2026-10-01 00:00:00+00', '기존 상태', 'SKU-1', 'OWN-1', '기존 매입처');
    `);
    const sourceBefore = (await db.query("select * from public.order_items order by item_no")).rows;
    const operationsBefore = (await db.query("select * from public.order_item_operations order by operation_id")).rows;
    const boundaryBefore = await schemaBoundary(db);

    await db.exec(await readFile(
      new URL("../supabase/pr_system_migrations/20261008031238_add_sellpia_arbitrary_field_raw.sql", import.meta.url),
      "utf8",
    ));

    const columns = await db.query(`
      select table_name, column_name, data_type, is_nullable, column_default
      from information_schema.columns where table_schema = 'public'
        and ((table_name = 'order_items' and column_name = 'sellpia_arbitrary_field_raw')
          or (table_name = 'order_item_operations' and column_name = 'arbitrary_field_raw_snapshot'))
      order by table_name
    `);
    assert.deepEqual(columns.rows, [
      { table_name: "order_item_operations", column_name: "arbitrary_field_raw_snapshot", data_type: "text", is_nullable: "YES", column_default: null },
      { table_name: "order_items", column_name: "sellpia_arbitrary_field_raw", data_type: "text", is_nullable: "YES", column_default: null },
    ]);
    const sourceAfter = (await db.query("select * from public.order_items order by item_no")).rows;
    const operationsAfter = (await db.query("select * from public.order_item_operations order by operation_id")).rows;
    assert.equal(sourceAfter[0].sellpia_arbitrary_field_raw, null);
    assert.equal(operationsAfter[0].arbitrary_field_raw_snapshot, null);
    assert.deepEqual(sourceAfter.map(({ sellpia_arbitrary_field_raw, ...row }) => row), sourceBefore);
    assert.deepEqual(operationsAfter.map(({ arbitrary_field_raw_snapshot, ...row }) => row), operationsBefore);
    assert.deepEqual(await schemaBoundary(db), boundaryBefore, "migration must preserve privileges, RLS, policies, identity constraints and indexes");

    const raw = "\t 00001234  / 업체-A \n";
    await db.query(`
      insert into public.order_items(item_no, ord_no, sellpia_order_item_no, sellpia_arbitrary_field_raw)
      values ('2_R2', 'O2', 'R2', $1)
    `, [raw]);
    const currentItem = (await db.query("select * from public.order_items where ord_no = 'O2'")).rows[0];
    const snapshot = snapshotFromCurrentOrderItem(currentItem);
    assert.equal(snapshot.arbitrary_field_raw_snapshot, raw, "database source must retain leading zeros and whitespace");
    await db.query(`
      insert into public.order_item_operations(ord_no, sellpia_order_item_no, item_no, arbitrary_field_raw_snapshot)
      values ('O2', 'R2', '2_R2', $1)
    `, [snapshot.arbitrary_field_raw_snapshot]);
    await db.query("update public.order_items set sellpia_arbitrary_field_raw = $1 where ord_no = 'O2'", ["  updated-vendor  "]);
    await db.exec("update public.order_item_operations set internal_memo = '일반 작업 수정' where ord_no = 'O2'");
    const operation = (await db.query("select * from public.order_item_operations where ord_no = 'O2'")).rows[0];
    assert.equal(operation.arbitrary_field_raw_snapshot, raw, "ordinary workflow updates must preserve the initial snapshot");
    await db.exec("delete from public.order_items where ord_no = 'O2'");
    const surviving = (await db.query("select * from public.order_item_operations where ord_no = 'O2'")).rows;
    assert.equal(surviving.length, 1);
    assert.equal(resolveOperationDisplayFields({ operation: surviving[0] }).arbitraryFieldRaw, raw, "source cleanup must preserve raw display through the operation snapshot");
  } finally {
    await db.close();
  }
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

// Real isolated PostgreSQL/WASM: no production URLs, credentials or source data.
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated;
    grant usage on schema public to anon, authenticated;
    create table public.order_items(item_no text, qty integer);
    insert into public.order_items values ('source-item',3);
    create schema picking_private;
    grant usage on schema picking_private to anon, authenticated;
    create function picking_private.has_valid_session() returns boolean language sql stable
      security invoker set search_path='' as $f$
      select coalesce(current_setting('test.picking_session',true),'')='approved' $f$;
    grant execute on function picking_private.has_valid_session() to anon, authenticated;`);
  for (const filename of ["20261001093000_order_item_operations_foundation.sql", "20261001131748_fix_order_item_operations_trigger_search_path.sql", "20261008031238_add_sellpia_arbitrary_field_raw.sql"]) {
    await db.exec(await fs.readFile(new URL(`../supabase/pr_system_migrations/${filename}`, import.meta.url), "utf8"));
  }
  await db.exec(`create policy picking_session_required on public.order_item_operations as restrictive for all to anon, authenticated
    using ((select picking_private.has_valid_session())) with check ((select picking_private.has_valid_session()));
    insert into public.order_item_operations(operation_id,ord_no,item_no,custom_required_at,internal_memo,product_name_snapshot,supplier_cell_raw_snapshot)
    values ('00000000-0000-0000-0000-000000000001','local-1','source-1',now(),'원래 메모','원본 상품','원래 업체'),
           ('00000000-0000-0000-0000-000000000002','local-2','source-2',now(),null,'다른 상품','대상 업체');`);
  const immutable = async () => (await db.query(`select to_jsonb(o)-array['slip_overrides','slip_sort_order','internal_memo','updated_at'] as row from public.order_item_operations o order by operation_id`)).rows;
  const before = await immutable();
  await db.exec(await fs.readFile(new URL("../supabase/migrations/20261019055236_custom_order_slip_edits.sql", import.meta.url), "utf8"));
  assert.deepEqual(await immutable(), before, "additive migration must not transform existing data");
  const security = (await db.query(`select p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='picking_save_custom_order_slips_v1'`)).rows[0];
  assert.equal(security.prosecdef, false);
  assert.ok(security.proconfig.includes('search_path=""'));
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await db.query(`select has_column_privilege($1,'public.order_item_operations','slip_overrides','UPDATE') as allowed`, [role])).rows[0].allowed, true);
    assert.equal((await db.query(`select has_column_privilege($1,'public.order_item_operations','ord_no','UPDATE') as allowed`, [role])).rows[0].allowed, false);
    assert.equal((await db.query(`select has_table_privilege($1,'public.order_item_operations','DELETE') as allowed`, [role])).rows[0].allowed, false);
  }
  const allRows = async () => (await db.query("select * from public.order_item_operations order by operation_id")).rows;
  const version = (await allRows())[0].updated_at;
  const change = (id, patch, expected = version) => ({ operation_id: `00000000-0000-0000-0000-00000000000${id}`, expected_updated_at: expected, patch });
  const rpc = (changes) => db.query("select * from public.picking_save_custom_order_slips_v1($1::jsonb)", [JSON.stringify(changes)]);
  await db.exec("set role anon");
  await assert.rejects(rpc([]), /유효한 피킹/);
  assert.equal((await db.query("select * from public.order_item_operations")).rows.length, 0, "RLS still denies unauthenticated SELECT");
  await db.exec("set test.picking_session = 'approved'");
  const moved = await rpc([change(1, { slip_overrides: { supplierCellRaw: "대상 업체", optionName: "조합", barLength: "8바", supplierCode: "CODE", productName: "수정 상품", quantity: 2 }, slip_sort_order: 1, internal_memo: "수정 메모" }), change(2, { slip_sort_order: 0 })]);
  assert.equal(moved.rows.length, 2);
  assert.equal(moved.rows.find((row) => row.ord_no === "local-1").slip_overrides.supplierCellRaw, "대상 업체");
  assert.ok(moved.rows[0].updated_at > version, "existing trigger advances version");
  assert.deepEqual(await immutable(), before, "RPC never changes snapshots, identity, workflow or source data");
  const saved = await allRows();
  const first = saved[0], second = saved[1];
  // A stale row in the batch must roll back every sibling, not partially reorder.
  await assert.rejects(rpc([change(2, { slip_sort_order: 8 }, second.updated_at), change(1, { internal_memo: "must not save" }, version)]), /다른 작업자/);
  assert.deepEqual(await allRows(), saved);
  for (const patch of [{ qty: 9 }, { ord_no: "wrong" }, { slip_overrides: { quantity: -1 } }, { slip_overrides: { quantity: true } }, { slip_overrides: { quantity: 1.5 } }, { slip_overrides: { unknown: "x" } }, { slip_overrides: { optionName: "x".repeat(501) } }, { slip_sort_order: -1 }, { slip_sort_order: 0.5 }, { slip_sort_order: null }, { internal_memo: "x".repeat(501) }]) {
    await assert.rejects(rpc([change(1, patch, first.updated_at)]));
    assert.deepEqual(await allRows(), saved);
  }
  await assert.rejects(rpc([change(1, { slip_sort_order: 5 }, first.updated_at), change(1, { slip_sort_order: 6 }, first.updated_at)]), /중복/);
  await assert.rejects(rpc([change(9, { slip_sort_order: 0 }, first.updated_at)]), /접근할 수 없거나/);
  await assert.rejects(db.query("update public.order_item_operations set slip_overrides=$1 where operation_id=$2", [JSON.stringify({ quantity: -1 }), first.operation_id]), /check constraint/);
  await assert.rejects(db.query("update public.order_item_operations set ord_no='wrong'"), /permission denied/);
  await assert.rejects(db.query("delete from public.order_item_operations"), /permission denied/);
  await db.exec("set role authenticated");
  const restored = await rpc([change(1, { slip_overrides: {}, internal_memo: null }, first.updated_at)]);
  assert.deepEqual(restored.rows[0].slip_overrides, {});
  assert.equal(restored.rows[0].internal_memo, null);
  await db.exec("reset role");
  assert.deepEqual((await db.query("select item_no,qty from public.order_items")).rows, [{ item_no: "source-item", qty: 3 }]);
  await db.exec("set role anon; set test.picking_session=''");
  await assert.rejects(rpc([]), /유효한 피킹/);
  console.log("customOrderSlipMigration.mock.test: OK (PostgreSQL, additive schema, invoker/RLS, atomic transfer, version conflict, validation, source preservation)");
} finally {
  await db.close();
}

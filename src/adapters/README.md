# Adapters

Adapters convert external names into the internal domain model.

Planned adapters:

- Supabase current DB adapter: `currentDbPickingAdapter.mjs`
- Workflow event read adapter: `workflowEventAdapter.mjs`
- Sellpia grid row adapter
- Sellpia memo updater adapter
- Label export adapter
- Product image storage adapter

The Operations Hub mapping-write adapter is not part of the Picking runtime.
Product-photo Storage is a separate external integration; its ownership and
consumption contract are documented at `../../docs/product-images-consumer-contract.md`.

`workflowEventAdapter.mjs` intentionally does not start from the selected UI
date. It loads workflow events, derives the affected `order_group_no` values,
then hydrates original `orders` and `order_items` for shortage picking and
inspection queues.

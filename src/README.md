# Picking source layout

`app/pickingApp.mjs` is the browser entry point. It composes the Picking
adapters, domain modules, workflows, and styles. `adapters/` contains boundaries
to the existing Picking database and external services; `domain/` contains
business rules; `workflows/` assembles operational views.

The browser app uses relative paths so it can run under the GitHub Pages
`/Picking_System/` repository path. Product photo storage is an external
Operations Hub dependency described in `../docs/product-images-consumer-contract.md`.

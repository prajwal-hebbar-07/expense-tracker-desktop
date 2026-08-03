---
id: index
type: reference
status: active
updated: 2026-08-03
links: []
---

# Map

Twenty-five nodes is past the point where the graph needs one. Start from the question, not the top.

## Where do I start?

| Question | Node |
|---|---|
| What is this app built out of? | [[stack]], [[repo-layout]], [[turborepo]] |
| How is data stored and read? | [[persistence-sqlite]], [[transaction-ledger]], [[derived-balances]] |
| What does a ledger row look like, and why? | [[card-movement]], [[debit-red]] |
| Anything about a credit card | [[card-movement]], [[card-due-day]] |
| What colour / size / shape do I use? | [[design-tokens]], [[accent-green]] |
| What is the app called, and what does its icon depict? | [[brand-ledgerflow]] |
| Where are the logo and icon files, and how do I change them? | [[brand-assets]] |
| How do I build a dropdown, a menu, a popup? | [[custom-select]], [[date-picker]], [[floating-layer]] |
| How does the layout respond to width? | [[nav-breakpoints]] |
| I am touching a screen | [[analytics-page]], [[report-page]], [[settings-schema]] |
| How does the app reach an LLM, and where is the API key? | [[ollama-flow]] |
| How does a transaction get a category? | [[expense-categories]] |
| I am touching a chart or a tile | [[summary-tile-delta]], [[chart-outlier]], [[filter-row]] |
| Why does this dialog / confirm not work? | [[webview-dialogs]] |
| Money moving between own accounts | [[self-transfer]] |
| Shipping a new version | [[auto-update]], [[linux-release]] |

## Superseded

Kept, not deleted — the reasoning is what stops a question being re-litigated.

- [[native-controls]] → [[custom-select]]. Native `<select>` and `<input type="date">`, and the five things that forced them out on 2026-08-01.
- [[ledger-row-debit-red]] → [[card-movement]] + [[debit-red]]. Debits in red and cards on a blue chip. Split verdict on 2026-08-02: the blue chip lost to violet, the red debits shipped.
- [[icon-vector-source]] → [[brand-assets]]. The icon as hand-written SVG screenshotted by Chrome, replaced by raster masters on 2026-08-02. Keeps the three constraints the SVG encoded.

## Conventions

Every node is `id` / `type` (decision · constraint · alternative · reference) / `status` / `updated` / `links`. One topic per file — split rather than append a second subject. A wiki link to a node that does not exist yet is valid; it marks one worth writing, not an error.

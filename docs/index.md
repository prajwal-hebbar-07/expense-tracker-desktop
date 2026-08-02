---
id: index
type: reference
status: active
updated: 2026-08-01
links: []
---

# Map

Twenty nodes is past the point where the graph needs one. Start from the question, not the top.

## Where do I start?

| Question | Node |
|---|---|
| What is this app built out of? | [[stack]], [[repo-layout]], [[turborepo]] |
| How is data stored and read? | [[persistence-sqlite]], [[transaction-ledger]], [[derived-balances]] |
| What colour / size / shape do I use? | [[design-tokens]], [[accent-green]] |
| How do I build a dropdown, a menu, a popup? | [[custom-select]], [[date-picker]], [[floating-layer]] |
| How does the layout respond to width? | [[nav-breakpoints]] |
| I am touching a screen | [[analytics-page]], [[report-page]], [[settings-schema]] |
| I am touching a chart or a tile | [[summary-tile-delta]], [[chart-outlier]], [[filter-row]] |
| Why does this dialog / confirm not work? | [[webview-dialogs]] |
| Money moving between own accounts | [[self-transfer]] |
| Shipping a new version | [[auto-update]] |

## Superseded

Kept, not deleted — the reasoning is what stops a question being re-litigated.

- [[native-controls]] → [[custom-select]]. Native `<select>` and `<input type="date">`, and the five things that forced them out on 2026-08-01.

## Conventions

Every node is `id` / `type` (decision · constraint · alternative · reference) / `status` / `updated` / `links`. One topic per file — split rather than append a second subject. A wiki link to a node that does not exist yet is valid; it marks one worth writing, not an error.

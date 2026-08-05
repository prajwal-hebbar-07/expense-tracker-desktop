---
id: analytics-mock-feed
type: decision
status: superseded
superseded-by: analytics-real-feed
updated: 2026-08-05
links: [analytics-real-feed, analytics-page, report-page, expense-categories]
---

# The mock Analytics feed (2026-08-01 → 2026-08-05)

Until 2026-08-05, `apps/desktop/src/analyticsFeed.ts` exported `FEED`, nineteen months of transactions generated once at import from a fixed seed, and `TODAY = "2026-07-31"`, the newest generated day. [[analytics-page]] and [[report-page]] read it. It was replaced by a real ledger query — [[analytics-real-feed]] — and this node keeps why it existed, because the same question ("shouldn't this have read the database from the start?") will be asked again.

**It was the right call at the time and it paid for itself.** The Analytics screen was designed and built before a ledger row had anything to aggregate: the `expense` table had `category` as a column ([[persistence-sqlite]], migration 1) but the add form deliberately never collected one ([[transaction-ledger]]), so every real row was `''`. "Where it went" — the whole premise of the screen — had nothing to group by. Waiting for categorisation would have meant designing the charts, the deltas, the bucket widths and the entire Report generator against a blank page.

## What it bought

1. **A page that could be designed at all.** Nineteen months of plausible rows meant every window — week, month, year, custom range — had enough data to show the layout under real load: a long tail worth folding into "Other", a rent bar that dwarfs its neighbours ([[chart-outlier]]), a previous period to compare against. An empty database shows none of the cases the design has to survive.
2. **Stability across renders and reloads.** The generator was a seeded LCG (`random(20260801)`), called once at module scope. Charts that reshuffle on every keystroke cannot be reviewed, screenshotted, or compared before and after a change; a fresh `Math.random()` per render would have made every visual decision unfalsifiable.
3. **A frozen "today".** `TODAY` was the newest day in the feed, not the clock, so the page never opened on a month containing two days and the window maths could be asserted by `analytics.check.ts` against fixed expectations.
4. **A one-export swap, by construction.** Every aggregation — `within`, `totals`, `rank`, `buckets`, `biggest`, `splitFixed` — was written to take a `Txn[]` and know nothing about where it came from. That was deliberate, stated in the file's own header comment and in rule 8 of [[analytics-page]], and it held: the replacement changed the source of `Txn[]` and touched neither the maths nor the charts. The mock's real product was the `Txn` shape, and that shape survived it — `ANALYTICS_FEED` is now written to produce exactly it.
5. **A ready-made fixture.** The generator did not die; it moved to `apps/desktop/feed.fixture.ts`, outside `src/`, where `analytics.check.ts` and `report.check.ts` still use its deterministic rows. The checks that pinned month boundaries and bucket widths never had to be rewritten.

## What it contained

| Symbol | Was |
|---|---|
| `CATEGORIES` | eight weighted labels — `Rent`, `Groceries`, `Eating out`, `Transport`, `Shopping`, `Utilities`, `Health`, `Subscriptions` |
| `SOURCES` | four weighted sources — `HDFC`, `ICICI` (accounts), `HDFC Regalia`, `Amex Platinum` (cards) |
| `TITLES` | per-category merchant names, so "Biggest spends" read like a statement |
| `random` / `pick` / `weighted` | the seeded LCG and its two samplers |
| `iso` | `en-CA` day formatting, the ancestor of `toIso` in `apps/desktop/src/day.ts` |
| `generate(from, to)` | 2–5 rows a day (more at weekends), salary and rent on the 1st, a 15% chance of a large spend but only in categories where one is plausible |
| `FEED` | `generate("2025-01-01", "2026-07-31")` |
| `TODAY` | `"2026-07-31"` |

The long-tail rule was the most carefully judged part and is worth keeping in mind for any future fixture: a big spend was only ever generated in `Shopping`, `Eating out`, `Health` or `Groceries`, because a ₹6,000 Netflix charge makes the Report's "sleep on anything over ₹3,000" advice look absurd. Sample data that is merely random produces a page that argues with itself.

## What forced the replacement

- **Categorisation shipped** on 2026-08-03 ([[expense-categories]]), so a real row finally has a label worth grouping by. The one blocker named in the old "Swapping in real data" section of [[analytics-page]] was gone.
- **The vocabularies had diverged.** The mock invented `Eating out`, `Utilities` and `Salary`; the closed list in `categorize.ts` says `Food & Dining`, `Bills & Utilities` and `Income`. Two vocabularies for one concept is a bug waiting for the swap, and `report.ts` was already matching on the mock's spelling.
- **`TODAY` had made a rule untestable in practice.** Clamping a window in progress (rule 1 of [[analytics-page]]) never fired against a feed that ended on the last day of a month. The real clock exercises it every day.
- **A convincing fake is a liability once it can be mistaken for real.** With accounts, cards, transfers and categories all shipped, a user looking at Analytics had no way to tell the page was not about their money.

## Rules that carried over

Nothing here is advice for building a new mock — rule 1 of [[analytics-real-feed]] forbids one inside `src/`. These are the properties any deterministic fixture must keep:

1. **Seed it and generate once at module scope**, because a fixture that moves between calls cannot be asserted against.
2. **Pass the pinned day in explicitly** (`FIXTURE_TODAY`) rather than exporting a global "today", because the application's `today` is now the clock and a second definition of it is how the two drift.
3. **Keep it out of `src/`**, so no application import can reach it.
4. **Use the closed category list from `categorize.ts`**, so a check cannot pass against labels the app can never produce.

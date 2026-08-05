<img src="assets/logo.png" alt="LedgerFlow" width="360">

A local-first desktop expense tracker for macOS, Linux and Windows. Every rupee you
move — spent, received, shifted between your own accounts, or charged to a card — is
one row in a SQLite file on your own machine. No account, no sign-in, no server, no
sync. The app opens, reads a file, and shows you where the money went.

Built with [Tauri 2](https://tauri.app), React 19 and Rust. Optional AI (via
[Ollama](https://ollama.com)) can categorise transactions and write a plain-English
report — the app is fully usable without it.

---

## Table of contents

- [What LedgerFlow is](#what-ledgerflow-is)
- [Install](#install)
- [First run](#first-run)
- [The five screens](#the-five-screens)
- [How the ledger models money](#how-the-ledger-models-money)
- [AI features (optional)](#ai-features-optional)
- [Where your data lives](#where-your-data-lives)
- [Updates](#updates)
- [What is deliberately not built](#what-is-deliberately-not-built)
- [Build from source](#build-from-source)
- [Project layout](#project-layout)
- [Documentation](#documentation)
- [Releasing](#releasing)
- [Tech stack](#tech-stack)

---

## What LedgerFlow is

A single-user expense tracker that runs as a native desktop app. It exists because
tracking spending should not require a web account, a subscription, or a daemon you
remember to start.

Three ideas hold the whole design together:

**One row per money movement.** There is one table, `expense`, and it holds credits as
well as debits — the column that matters is `direction`. Money in, money out, a
transfer between two of your own accounts, and a credit-card charge are all the same
row shape, distinguished by which of `account_id` / `card_id` / `to_account_id` is
set. Amounts are always positive integers in minor units (paise/cents); a direction is
a word, never a minus sign.

**Balances are derived, never stored.** What you type in Settings is an account's
*opening* balance. The live balance is computed in SQL — opening balance plus every
transaction that touched the account. Nothing writes a running total back, so there is
no figure that can drift out of sync with the ledger.

**Nothing leaves the machine unless you ask.** The database is a plain SQLite file in
your OS application-data directory. The app makes exactly two kinds of outbound
request: one update check at launch, and an AI call when you press an AI button.
There is no telemetry and no analytics.

Currency is single-currency and INR-oriented — amounts default to `INR` and format
with en-IN grouping (`₹1,27,645`). Multi-currency is not supported.

## Install

Downloads are on the [Releases
page](https://github.com/prajwal-hebbar-07/expense-tracker-desktop/releases/latest).

| Platform | Download | Status |
|---|---|---|
| macOS (Apple Silicon) | `LedgerFlow_<version>_aarch64.dmg` | Shipping |
| Linux (x86_64) | `LedgerFlow_<version>_amd64.AppImage` or `_amd64.deb` | Shipping |
| macOS (Intel) | — | Not built |
| Windows | `LedgerFlow_<version>_x64-setup.exe` | Wired up in CI, **not yet published** |

### macOS

Open the `.dmg`, drag **LedgerFlow** to Applications. The app is *ad-hoc signed*, not
signed with an Apple Developer ID, so the first launch is blocked by Gatekeeper.
Either right-click the app → **Open** once, or clear the quarantine attribute:

```bash
xattr -dr com.apple.quarantine /Applications/LedgerFlow.app
```

Only Apple Silicon (`aarch64`) builds are published. Notarisation — which would remove
the warning entirely — needs a paid Apple Developer account.

### Linux

The **AppImage** is the recommended route, because it is the only Linux artifact that
self-updates:

```bash
chmod +x LedgerFlow_<version>_amd64.AppImage
./LedgerFlow_<version>_amd64.AppImage
```

If it exits with `dlopen(): error loading libfuse.so.2` and nothing else, your distro
ships FUSE 3 only (Ubuntu 24.04 and later):

```bash
sudo apt install libfuse2t64
```

The **`.deb`** installs the conventional way but has no path back to the updater — you
upgrade by downloading the next one by hand:

```bash
sudo apt install ./LedgerFlow_<version>_amd64.deb
```

Builds are produced on Ubuntu 22.04 so the AppImage links an older glibc and runs on
as many distributions as possible.

### Windows

The release workflow has a Windows job that produces an NSIS installer
(`LedgerFlow_<version>_x64-setup.exe`, per-user, no admin prompt), but **no Windows
artifact has been published yet** — the job was added after the most recent release.
When one ships, expect a *"Windows protected your PC"* SmartScreen prompt on first
run, because the installer carries no code-signing certificate: **More info → Run
anyway**.

## First run

1. Go to **Settings** and add at least one bank account with its current balance —
   this is recorded as the *opening* balance. Add your credit cards too (bank, card
   name, last four digits, and the statement due day if you want due-date reminders).
2. Go to **Overview** and start adding transactions. Each one needs an amount, a
   title, a date, a direction, and a source (an account *or* a card — one dropdown,
   two groups, so "exactly one source" cannot be got wrong). A note is optional.
3. Categories are assigned *after the fact*, not at entry time. Once you have some
   rows, either configure a model (see below) and press **Categorise** on the
   Transactions screen, or leave them uncategorised — everything else still works.

## The five screens

| Screen | What you do there |
|---|---|
| **Overview** | Add a transaction, and see four tiles: In accounts, Card outstanding, Net, and Spent this month (with how much of it went on a card). |
| **Transactions** | The history — last 200 rows, newest first, grouped by day. Edit in place, delete behind a two-step confirm, run **Categorise**, and switch between a **Ledger** view (everything) and a **Categories** view (grouped, biggest first). |
| **Analytics** | *How much.* Pick a week, month, year or custom range; get summary tiles with period-over-period deltas, a spend-over-time chart, and breakdowns by category, source and account-vs-card. |
| **Report** | *So what.* The same window turned into prose: a headline, findings with figures, concrete habits with estimated savings, reframes, and a spending target. |
| **Settings** | Bank accounts, credit cards, and the AI model configuration. |

Analytics and Report share one period picker, and both truncate an in-progress window
to today — a year that is three months old is compared against the same three months
of last year, not against a full 365 days.

Charts are plain CSS boxes, not a charting library. Bucket width follows the window:
one bar per day up to 31 days, per week up to 186, per calendar month beyond that.

## How the ledger models money

Worth understanding before you use the app, because a few behaviours are deliberate
and would otherwise look like bugs.

**Transfers between your own accounts** are one row, not two: the source is
`account_id`, the destination is `to_account_id`. They move money without being income
or spending, so they are excluded from every spend figure, from Analytics, and from
the Report. They are never categorised.

**A credit-card charge never touches an account balance.** A card holds no money —
your bank balance only changes when you pay the bill, and that payment is itself a
transaction. Card outstanding is simply card debits minus card credits; a negative
figure means the card is in credit. A charge counts as *spent* on the day you make it,
not on the day the bill clears.

**Due dates are advisory.** A card can carry a statement due day; the app shows the
next occurrence, and counts down only inside the last seven days. It never says
"overdue", because bill payment is not modelled and it cannot tell a paid bill from an
unpaid one. A card with no due day on file shows no due line rather than a guess.

**Deltas report the verdict, not just the arithmetic.** Each summary tile knows which
direction is good: `−9%` is green on Spent and red on Received. Moves under 5% render
as `flat`, and a period with no predecessor says `no prior period` rather than `↑0%`.

**Rent leaves the daily chart.** Fixed charges distort a day-by-day series, so they
are held out, stated as a figure in a strip above the chart, and put back with one
click. The split never loses money — variable plus fixed is the window's whole spend.

**The category vocabulary is a closed list** of fourteen names, and it is the only one
the app uses:

`Food & Dining` · `Groceries` · `Transport` · `Shopping` · `Bills & Utilities` ·
`Rent` · `Loans & EMIs` · `Health` · `Entertainment` · `Travel` · `Education` ·
`Subscriptions` · `Income` · `Other`

Of those, `Rent`, `Loans & EMIs`, `Groceries`, `Bills & Utilities` and `Health` are
treated as essential — the Report only ever suggests trimming the other half.

**Deletes are real.** There is no soft delete and no trash; removing a transaction
removes the row.

## AI features (optional)

LedgerFlow talks to **Ollama** and nothing else. You can point it at Ollama Cloud with
an API key, or at a local Ollama daemon with no key at all — it is the same `Server`
field, and there is no cloud/local toggle.

### Configure it

**Settings → AI model**:

1. **Server** — `https://ollama.com` (the default) or `http://localhost:11434` for a
   local daemon.
2. **Add API key** — give it a name (e.g. `Personal`) and paste a key from
   [ollama.com/settings/keys](https://ollama.com/settings/keys). Several named
   accounts can be saved; one is active at a time, chosen under **Account used for
   AI**. For a local daemon, pick **No API key**.
3. **Connect** to load the model list, pick a **Model**, then press **Test** — a real
   one-word completion. Listing models is not proof that a key works; ollama.com
   answers the catalogue request anonymously. Only **Test** verifies the key.

### What it powers

Three buttons, each pressed by hand. Nothing runs on mount, on a period change, or on
a timer — every run costs tokens.

| Button | Screen | What it does |
|---|---|---|
| **Categorise** | Transactions | Assigns categories to uncategorised rows, in batches of 40, validated against the closed list above. Transfers are skipped. |
| **Explain with AI** | Analytics | Sends only the aggregates already on screen and returns a one-line summary plus up to four bullets. |
| **Generate report** | Report | Rewrites the report's prose from a rules-computed fact sheet. |

Two guarantees worth knowing: **the model writes sentences, never figures** — every
number on screen is recomputed from your ledger on each render, so a hallucinated
total would contradict the line above it. And results are **saved with the name of the
model that wrote them**; if the underlying figures change afterwards, the card says so
and names the button rather than silently regenerating (and re-billing).

### Without a model

Everything works. The ledger, the tiles and the charts never touch a model, and the
Report page has a complete rules-based generator — arithmetic over your own rows — that
is what you see unless you press the button. Pressing an AI button with nothing
configured produces a one-line message, not an error state.

The only thing you lose is categorisation: rows stay in the uncategorised bucket, and
there is currently no way to set a category by hand.

### Key storage caveat

API keys are stored **in plaintext** in the app's own SQLite database. Any process
running as your user can read them. The accepted reasoning is that such a process
could already read your entire expense history, and what the key grants is inference
billed to your Ollama subscription — it is not a login and it reaches no expense data.
If a key leaks, revoke it at
[ollama.com/settings/keys](https://ollama.com/settings/keys) and paste a new one.

## Where your data lives

One SQLite file, outside the application bundle:

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/com.hebbar.desktop/expenses.db` |
| Linux | `~/.local/share/com.hebbar.desktop/expenses.db` |
| Windows | `%APPDATA%\com.hebbar.desktop\expenses.db` |

Back it up by copying that file. The directory is derived from the bundle identifier
`com.hebbar.desktop`, which is why the identifier must never change — changing it
orphans the database.

The schema is versioned; migrations run at startup when the app opens the connection,
and only ever append a new version. Updates never touch the database — it lives
outside the bundle, so a new build simply opens the existing file and applies whatever
migrations are pending.

## Updates

The app checks for updates once at launch, with a single anonymous GET of a
minisign-signed manifest on GitHub Releases. If one is available a banner offers
**Install and restart**; otherwise nothing is shown. A failed check is silent by
design — offline is the normal state of a local-first app.

Signature verification uses a public key compiled into the binary, so an update can
only come from a build signed with the matching private key. Only the macOS `.app` and
the Linux AppImage self-update; a `.deb` install upgrades by hand.

## What is deliberately not built

Stated plainly so you know what you are getting:

- **Editing a category by hand.** A category can only be set by an AI run, and a run
  skips rows that already have one.
- **Credit-card bill payment as a linked pair.** You can record the account debit and
  the card credit as two transactions; the app does not connect them, which is also
  why it never reports a card as overdue.
- **Multi-currency.** Everything is one currency, defaulting to `INR`.
- **Accounts, sync, sharing, multi-user.** There is no authentication and no `user_id`
  column anywhere. One person, one machine, one file.
- **Investment advice.** The Report suggests spending changes and never products or
  returns.

## Build from source

### Prerequisites

- **pnpm** — mandatory, pinned to `pnpm@11.11.0` via `packageManager`. Never `npm` or
  `yarn`; a stray `package-lock.json` corrupts resolution.
- **Node 24** — what the project is developed and CI-built against.
- **Rust (stable)** — install from [rustup.rs](https://rustup.rs) if absent.
- **Linux only** — the webview and bundler dependencies:
  ```bash
  sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libxdo-dev
  ```
  It must be `libwebkit2gtk-4.1-dev`; `4.0` is the Tauri v1 package and fails deep in
  the `wry` build with no mention of the version.

### Commands

Run everything from the repo root:

```bash
pnpm install                  # install the workspace
pnpm dev                      # turbo dev → tauri dev → Vite on :1420 + a native window
pnpm build                    # turbo build → tauri build → installers in src-tauri/target/release/bundle/
pnpm typecheck                # tsc --noEmit
pnpm --filter desktop test    # node --test *.check.ts
```

`pnpm --filter desktop <script>` targets the one package directly, which is useful for
a one-off and gives unbuffered output.

Add JavaScript dependencies with `pnpm --filter desktop add <pkg>` — never at the
root, where they resolve by hoisting accident. `turbo` is the only permitted root
dependency.

Dev-server port **1420** is fixed (`strictPort`), because that is the URL Tauri loads.
If it is occupied: `lsof -ti:1420 | xargs kill -9`.

### Conventions worth knowing before you contribute

1. **No server process, port listener, or background daemon** ever ships in the app.
   A feature that seems to need a server needs a Rust command instead.
2. **Disk and network access live in Rust** (`apps/desktop/src-tauri/src/lib.rs`),
   exposed as `#[tauri::command]` and called with `invoke(...)`. The WebView renders;
   it does not `fetch()`.
3. **Styling is Tailwind utility classes only** — no component library, no CSS-in-JS.
   Tailwind v4 has no config file; theme values go in the `@theme { }` block in
   `apps/desktop/src/App.css`.
4. **Prefer a Rust crate to a JS dependency** when either could do the job.
5. **Tests are `*.check.ts` files** at `apps/desktop/`, deliberately outside `src/`
   (the TypeScript project only includes `src`, so a `node:test` import there would
   fail the typecheck). They run under Node's native test runner with no build step.

## Project layout

A pnpm workspace orchestrated by Turborepo, holding exactly one buildable app. The
monorepo exists to leave room for a second surface later; nothing is shared today, and
`packages/` deliberately does not exist yet.

```
expense-tracker-desktop/
├── assets/                     # brand masters: icon.png (1024²), logo.png (lockup)
├── docs/                       # 42-node documentation graph — start at docs/index.md
├── .github/workflows/release.yml
└── apps/
    └── desktop/
        ├── src/                # React + TypeScript frontend
        │   ├── App.tsx             # shell + tab switch
        │   ├── AddTransaction.tsx  # Overview
        │   ├── Transactions.tsx    # history, categorise
        │   ├── Analytics.tsx       # tiles + charts
        │   ├── Reports.tsx         # written report
        │   ├── Settings.tsx        # accounts, cards
        │   ├── OllamaSettings.tsx  # AI configuration
        │   ├── db.ts / queries.ts  # SQLite connection + every SQL string
        │   ├── report.ts           # rules-based report generator
        │   ├── analyticsFeed.ts    # windowing, bucketing, aggregation
        │   └── categorize.ts       # the category vocabulary + batching
        ├── *.check.ts          # tests (node --test)
        └── src-tauri/          # Rust host
            ├── src/lib.rs          # migrations, #[tauri::command]s, invoke_handler
            ├── tauri.conf.json     # productName, identifier, updater endpoint
            └── capabilities/       # per-window plugin permission allowlists
```

Where a given change goes:

| Change | File |
|---|---|
| UI screen or component | `apps/desktop/src/` |
| Database access, HTTP, backend behaviour | `apps/desktop/src-tauri/src/lib.rs` + `invoke_handler` |
| Window title/size, bundle identifier, build hooks | `apps/desktop/src-tauri/tauri.conf.json` |
| Granting a plugin capability | `apps/desktop/src-tauri/capabilities/default.json` |
| Vite plugins, dev server | `apps/desktop/vite.config.ts` |
| A JS dependency | `pnpm --filter desktop add <pkg>` |

## Documentation

`docs/` is not a manual — it is a memory graph of small, cross-linked nodes, one topic
per file, each recording a decision with its reasoning, its rejected alternatives, and
its failure modes. Superseded decisions are kept with a `superseded-by` marker rather
than deleted, because the reasoning is what stops a question being re-litigated.

**Start at [`docs/index.md`](docs/index.md)**, which routes from a question to a node.
A few entry points:

| Question | Node |
|---|---|
| What is this built out of? | [`stack`](docs/stack.md), [`repo-layout`](docs/repo-layout.md), [`turborepo`](docs/turborepo.md) |
| How is data stored and read? | [`persistence-sqlite`](docs/persistence-sqlite.md), [`transaction-ledger`](docs/transaction-ledger.md), [`derived-balances`](docs/derived-balances.md) |
| Anything about a credit card | [`card-movement`](docs/card-movement.md), [`card-due-day`](docs/card-due-day.md) |
| How does the app reach an LLM? | [`ollama-flow`](docs/ollama-flow.md), [`ollama-accounts`](docs/ollama-accounts.md) |
| How does a transaction get a category? | [`expense-categories`](docs/expense-categories.md) |
| Shipping a new version | [`auto-update`](docs/auto-update.md), [`linux-release`](docs/linux-release.md), [`windows-release`](docs/windows-release.md) |

`CLAUDE.md` holds the authoring contract for those nodes, plus the repo rules an AI
coding agent must follow.

## Releasing

Releases are cut entirely from GitHub Actions — there is nothing to do locally and no
tag to push by hand.

**Actions → release → Run workflow →** choose `patch`, `minor` or `major` → **Run**.

The workflow runs tests and the typecheck *before* bumping anything, so a red test
never leaves a version commit behind. It then rewrites the version in four files
(`tauri.conf.json` is the source of truth, plus `package.json`, `Cargo.toml` and
`Cargo.lock`), commits `chore(release): <version>`, tags `v<version>`, and builds in
three chained jobs — macOS, then Linux, then Windows.

The jobs are sequential rather than a matrix on purpose: all three upload `latest.json`
to the same release, and `tauri-action` merges platform keys into whatever is already
there. Running them in parallel is a race in which one manifest silently overwrites
another and half the users stop seeing updates.

Two repository secrets are required: `TAURI_SIGNING_PRIVATE_KEY` (the contents of the
minisign key file, not its path) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Regenerating the icon set after changing `assets/icon.png`:

```bash
cp assets/icon.png apps/desktop/src-tauri/icons/icon-source.png
cd apps/desktop && pnpm tauri icon src-tauri/icons/icon-source.png
rm -rf src-tauri/icons/android src-tauri/icons/ios
```

Never hand-edit a file under `src-tauri/icons/` — the next regeneration overwrites it.

## Tech stack

| Layer | Choice |
|---|---|
| Shell | Tauri 2 |
| Frontend | React 19, TypeScript 5.8, Vite 7 |
| Styling | Tailwind CSS 4 (no config file; `@theme` block in `App.css`) |
| State | None — a `useState` tab switch; changing tabs remounts the screen |
| Charts | None — CSS boxes with percentage heights |
| Host | Rust 2021, `reqwest` + `rustls` for outbound HTTP |
| Database | SQLite via `tauri-plugin-sql` |
| Updates | `tauri-plugin-updater`, minisign-signed manifest on GitHub Releases |
| Tooling | pnpm 11 workspace, Turborepo 2 |

No component library, no charting library, no state-management library, and no
backend. The dependency list is short on purpose.

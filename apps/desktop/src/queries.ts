// Balances are *derived*, never mutated. `account.balance` is the opening
// balance the user typed in Settings; the live figure is that plus every credit
// minus every debit booked against the account. Booking a transaction is then a
// single INSERT — there is no second write that a crash could leave un-applied,
// and deleting a transaction corrects the balance for free.
//
// These live outside the component so `balances.check.ts` can run them against
// a real SQLite database.

// A transfer joins twice — once as the source account, once as the destination —
// but those are different `a` rows, so each group counts the row once. The first
// CASE arm must stay first: for the destination the row is money in, whatever
// `direction` says.
export const ACCOUNT_BALANCES = `
  SELECT a.id, a.bank, a.currency,
         a.balance + COALESCE(SUM(CASE WHEN e.to_account_id = a.id THEN e.amount
                                       WHEN e.direction = 'credit' THEN e.amount
                                       ELSE -e.amount END), 0) AS balance
  FROM account a
  LEFT JOIN expense e ON e.account_id = a.id OR e.to_account_id = a.id
  GROUP BY a.id
  ORDER BY a.bank`;

// A card holds no money: its number is what you owe. Debits add to it, credits
// (a refund, or a bill payment) subtract. Negative means the card is in credit.
export const CARD_OUTSTANDING = `
  SELECT c.id, c.bank, c.name, c.last4, c.due_day,
         COALESCE(SUM(CASE WHEN e.direction = 'debit' THEN e.amount
                           ELSE -e.amount END), 0) AS outstanding
  FROM card c
  LEFT JOIN expense e ON e.card_id = c.id
  GROUP BY c.id
  ORDER BY c.bank, c.name`;

/** $1 is a local `YYYY-MM`; spent_at is stored as `YYYY-MM-DDT00:00:00Z`.
 *  Transfers are excluded: moving your own money between your own accounts is
 *  neither spending nor income, and counting it inflates both figures.
 *
 *  `on_card` is the borrowed slice of the same figure, not a separate total.
 *  Spending happens when you commit, not when the statement clears — a tile
 *  that waited for the bill would report a quiet month you did not have — so a
 *  card charge counts in `total` and the tile says how much of it was borrowed. */
export const MONTH_TOTALS = `
  SELECT direction, COALESCE(SUM(amount), 0) AS total,
         COALESCE(SUM(CASE WHEN card_id IS NOT NULL THEN amount ELSE 0 END), 0) AS on_card
  FROM expense
  WHERE substr(spent_at, 1, 7) = $1 AND to_account_id IS NULL
  GROUP BY direction`;

export const TRANSACTIONS = `
  SELECT e.id, e.amount, e.currency, e.title, e.note, e.spent_at, e.direction,
         e.account_id, e.card_id, e.to_account_id, e.category,
         COALESCE(a.bank, c.bank || COALESCE(' ' || c.name, '')) AS source,
         d.bank AS destination
  FROM expense e
  LEFT JOIN account a ON a.id = e.account_id
  LEFT JOIN card c ON c.id = e.card_id
  LEFT JOIN account d ON d.id = e.to_account_id
  ORDER BY e.spent_at DESC, e.id DESC
  LIMIT 200`;

/** The Analytics and Report feed: one window of the ledger, shaped as `Txn`.
 *
 *  `$1`/`$2` are local `YYYY-MM-DD` bounds and `spent_at` is stored as
 *  `YYYY-MM-DDT00:00:00Z`, so the comparison is on `substr(...,1,10)` rather
 *  than on the raw column — a plain `BETWEEN` would drop the last day, whose
 *  rows all sort after `<to>` once the `T00:00:00Z` suffix is compared.
 *
 *  Transfers are excluded for the same reason MONTH_TOTALS excludes them:
 *  moving your own money between your own accounts is neither spending nor
 *  income, and counting it inflates both sides of every chart.
 *
 *  `category` is '' until a categorisation run files a row, and '' is not a
 *  label anyone can read on a chart, so it surfaces as 'Uncategorised' here.
 *  The empty string stays the stored value — see docs/expense-categories.md. */
export const ANALYTICS_FEED = `
  SELECT substr(e.spent_at, 1, 10) AS date,
         e.amount, e.direction, e.title,
         CASE WHEN e.category = '' THEN 'Uncategorised' ELSE e.category END AS category,
         CASE WHEN e.card_id IS NOT NULL THEN 'card' ELSE 'account' END AS kind,
         COALESCE(a.bank, c.bank || COALESCE(' ' || c.name, ''), 'Unassigned') AS source
  FROM expense e
  LEFT JOIN account a ON a.id = e.account_id
  LEFT JOIN card c ON c.id = e.card_id
  WHERE e.to_account_id IS NULL
    AND substr(e.spent_at, 1, 10) BETWEEN $1 AND $2
  ORDER BY date`;

/** One analysis per window: pressing the button again replaces the row rather
 *  than growing a history nobody reads. `insights` is a JSON array and
 *  `fingerprint` is what the figures looked like when it was written — see
 *  docs/analysis-persistence.md. */
export const SAVE_ANALYSIS = `
  INSERT INTO analysis (window_from, window_to, model, summary, insights, fingerprint)
  VALUES ($1, $2, $3, $4, $5, $6)
  ON CONFLICT(window_from, window_to) DO UPDATE SET
    model = excluded.model, summary = excluded.summary,
    insights = excluded.insights, fingerprint = excluded.fingerprint,
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`;

export const LOAD_ANALYSIS = `
  SELECT model, summary, insights, fingerprint, created_at
  FROM analysis WHERE window_from = $1 AND window_to = $2`;

/** One written report per window, same upsert as `SAVE_ANALYSIS`: pressing
 *  Generate again replaces it. `findings`, `habits` and `reframes` are JSON
 *  arrays — documents, never queried by field. See docs/report-ai.md. */
export const SAVE_REPORT = `
  INSERT INTO report (window_from, window_to, model, headline, findings, habits, reframes, fingerprint)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT(window_from, window_to) DO UPDATE SET
    model = excluded.model, headline = excluded.headline,
    findings = excluded.findings, habits = excluded.habits,
    reframes = excluded.reframes, fingerprint = excluded.fingerprint,
    created_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')`;

export const LOAD_REPORT = `
  SELECT model, headline, findings, habits, reframes, fingerprint, created_at
  FROM report WHERE window_from = $1 AND window_to = $2`;

// `category` is still NOT NULL with no default from migration 1, and the form
// does not ask for one, so every new row starts at '' — the uncategorised
// bucket. Categorise on the Transactions page backfills it; see
// docs/expense-categories.md.
// ponytail: '' as "uncategorised"; a real default or a nullable column needs a
// table rebuild, and nothing needs to tell '' apart from NULL.
export const INSERT_TRANSACTION = `
  INSERT INTO expense (amount, currency, title, note, category, spent_at, direction, account_id, card_id, to_account_id)
  VALUES ($1, $2, $3, $4, '', $5, $6, $7, $8, $9)`;

// Same nine parameters as INSERT_TRANSACTION, in the same order, plus the id.
// They are built by one `toParams` in transactionForm.tsx so an edit can never
// accept a value the insert would have rejected.
export const UPDATE_TRANSACTION = `
  UPDATE expense
  SET amount = $1, currency = $2, title = $3, note = $4,
      spent_at = $5, direction = $6, account_id = $7, card_id = $8,
      to_account_id = $9
  WHERE id = $10`;

export const DELETE_TRANSACTION = `DELETE FROM expense WHERE id = $1`;

// The only writer of `category`, and deliberately not part of
// UPDATE_TRANSACTION: editing a row must not silently re-file it, and a
// categorisation run must not touch the amounts a balance is derived from.
export const SET_CATEGORY = `UPDATE expense SET category = $1 WHERE id = $2`;

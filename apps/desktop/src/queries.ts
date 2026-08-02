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
  SELECT c.id, c.bank, c.name, c.last4,
         COALESCE(SUM(CASE WHEN e.direction = 'debit' THEN e.amount
                           ELSE -e.amount END), 0) AS outstanding
  FROM card c
  LEFT JOIN expense e ON e.card_id = c.id
  GROUP BY c.id
  ORDER BY c.bank, c.name`;

/** $1 is a local `YYYY-MM`; spent_at is stored as `YYYY-MM-DDT00:00:00Z`.
 *  Transfers are excluded: moving your own money between your own accounts is
 *  neither spending nor income, and counting it inflates both figures. */
export const MONTH_TOTALS = `
  SELECT direction, COALESCE(SUM(amount), 0) AS total
  FROM expense
  WHERE substr(spent_at, 1, 7) = $1 AND to_account_id IS NULL
  GROUP BY direction`;

export const TRANSACTIONS = `
  SELECT e.id, e.amount, e.currency, e.title, e.note, e.spent_at, e.direction,
         e.account_id, e.card_id, e.to_account_id,
         COALESCE(a.bank, c.bank || COALESCE(' ' || c.name, '')) AS source,
         d.bank AS destination
  FROM expense e
  LEFT JOIN account a ON a.id = e.account_id
  LEFT JOIN card c ON c.id = e.card_id
  LEFT JOIN account d ON d.id = e.to_account_id
  ORDER BY e.spent_at DESC, e.id DESC
  LIMIT 200`;

// `category` is still NOT NULL with no default from migration 1, and the form
// no longer asks for one, so every new row gets ''. Categorising is a separate
// feature; when it lands it backfills the empty ones.
// ponytail: '' as "uncategorised"; a real default or a nullable column needs a
// table rebuild, worth it only once something reads the column.
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

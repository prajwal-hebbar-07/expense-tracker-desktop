// Balances are *derived*, never mutated. `account.balance` is the opening
// balance the user typed in Settings; the live figure is that plus every credit
// minus every debit booked against the account. Booking a transaction is then a
// single INSERT — there is no second write that a crash could leave un-applied,
// and deleting a transaction corrects the balance for free.
//
// These live outside the component so `balances.check.ts` can run them against
// a real SQLite database.

export const ACCOUNT_BALANCES = `
  SELECT a.id, a.bank, a.currency,
         a.balance + COALESCE(SUM(CASE WHEN e.direction = 'credit' THEN e.amount
                                       ELSE -e.amount END), 0) AS balance
  FROM account a
  LEFT JOIN expense e ON e.account_id = a.id
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

/** $1 is a local `YYYY-MM`; spent_at is stored as `YYYY-MM-DDT00:00:00Z`. */
export const MONTH_TOTALS = `
  SELECT direction, COALESCE(SUM(amount), 0) AS total
  FROM expense
  WHERE substr(spent_at, 1, 7) = $1
  GROUP BY direction`;

export const RECENT = `
  SELECT e.id, e.amount, e.currency, e.description, e.category, e.spent_at, e.direction,
         COALESCE(a.bank, c.bank || COALESCE(' ' || c.name, '')) AS source
  FROM expense e
  LEFT JOIN account a ON a.id = e.account_id
  LEFT JOIN card c ON c.id = e.card_id
  ORDER BY e.spent_at DESC, e.id DESC
  LIMIT 25`;

export const INSERT_TRANSACTION = `
  INSERT INTO expense (amount, currency, description, category, spent_at, direction, account_id, card_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

export const CATEGORIES = `SELECT DISTINCT category FROM expense ORDER BY category`;

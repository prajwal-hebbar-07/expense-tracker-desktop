// Money is stored as integer minor units (paise). Binary floating point cannot
// represent 0.10, so `parseFloat(x) * 100` drifts and totals end up off by a
// cent. Everything here works on the digit strings instead.

const AMOUNT = /^(-?)(\d+)(?:\.(\d{1,2}))?$/;

/** "1245.50" -> 124550. Returns null for anything that is not a valid amount. */
export function toMinor(input: string): number | null {
  const m = AMOUNT.exec(input.trim());
  if (!m) return null;

  const [, sign, major, minor = ""] = m;
  const paise = Number(major) * 100 + Number(minor.padEnd(2, "0"));
  if (!Number.isSafeInteger(paise)) return null;

  return sign === "-" ? -paise : paise;
}

/** 124550 -> "1245.50". Inverse of toMinor for well-formed input. */
export function fromMinor(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Display helper: "1245.50" -> "1,245.50" (Indian grouping). */
export function formatAmount(paise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(paise / 100);
}

/** Display helper for summary tiles and axes: "124550" -> "₹1,246". Paise on a
 *  headline figure is noise, and the exact string overflows a narrow tile. */
export function formatAmountRound(paise: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

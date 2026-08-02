// Calendar-day arithmetic on `YYYY-MM-DD` strings — the shape the ledger
// stores, the shape `<input type="date">` used to emit, and the shape the date
// picker still speaks. Its own module so the form's validator and the picker
// can share it without either importing the other's component.

/**
 * Noon, always. Parsing a bare `2026-07-31` gives UTC midnight, which is the
 * *previous* calendar day for anyone west of Greenwich — the single most common
 * way a date control ends up one day out.
 */
export const at = (iso: string) => new Date(`${iso}T12:00:00`);

/** en-CA is `YYYY-MM-DD`, and it is the locale's own format rather than a
 *  hand-rolled pad — which is why it is used here instead of toISOString. */
export const toIso = (d: Date) => d.toLocaleDateString("en-CA");

export const todayIso = () => toIso(new Date());

export const shiftDays = (iso: string, days: number) => {
  const d = at(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

export function shiftMonths(iso: string, months: number) {
  const d = at(iso);
  // Clamp the day first: 31 Jan + 1 month rolls through to 3 March otherwise,
  // because setMonth keeps the day number and lets it overflow.
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  return toIso(d);
}

/** "2026-07-31" → "31 Jul 2026". */
export const formatDay = (iso: string) =>
  at(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

/**
 * The six weeks covering the month `iso` falls in, starting Sunday — en-IN's
 * first day, hard-coded rather than read from the OS locale so the grid does
 * not silently reshape per machine.
 */
export function weeks(iso: string): string[][] {
  const first = at(iso);
  first.setDate(1);
  const start = new Date(first);
  start.setDate(1 - first.getDay());
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const c = new Date(start);
      c.setDate(start.getDate() + w * 7 + d);
      return toIso(c);
    }),
  );
}

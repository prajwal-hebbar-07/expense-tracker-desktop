import { ComponentType } from "react";
import { Goal, arrow, tone } from "./delta";

const TONE = {
  good: "text-credit",
  bad: "text-danger",
  // Inside the noise band the number is still shown, just not dressed up as
  // news. Both colours clear 4.5:1 on --surface in either theme.
  flat: "text-muted",
} as const;

/** The summary tile used on Overview and Analytics. One copy, because two
 *  screens showing the same figure in two shapes reads as two features. */
export default function Stat({
  label,
  value,
  hint,
  delta,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string;
  hint?: string;
  /** Period-on-period change. `goal` says which way this figure wants to move,
   *  which is the only thing that makes the sign mean anything. */
  delta?: { pct: number | null; goal: Goal };
  icon: ComponentType<{ className?: string }>;
  /** Text-colour utility for the icon, e.g. `text-accent`. */
  tint: string;
}) {
  const pct = delta?.pct ?? null;
  const mood = pct === null ? null : tone(pct, delta!.goal);
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full bg-ink/5 ${tint}`}>
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
        <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        {pct !== null && mood ? (
          <p className={`truncate text-xs tabular-nums ${TONE[mood]}`}>
            {arrow(pct)} {Math.abs(pct)}% vs prev
          </p>
        ) : (
          hint && <p className="truncate text-xs text-muted">{hint}</p>
        )}
      </div>
    </div>
  );
}

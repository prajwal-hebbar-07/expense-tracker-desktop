import { ComponentType } from "react";
import { Goal, VERDICT, direction, tone } from "./delta";
import { MarkDown, MarkFlat, MarkUp } from "./icons";

const TONE = {
  good: "text-credit",
  bad: "text-danger",
  // Inside the noise band the number is still shown, just not dressed up as
  // news. --muted at 6.3:1 is the correct volume — "nothing happened" should
  // not compete, and it reads as a deliberate third state next to two coloured
  // siblings. All three clear 4.5:1 on --surface in either theme.
  flat: "text-muted",
} as const;

const MARK = { up: MarkUp, down: MarkDown, flat: MarkFlat };

// Written out rather than interpolated: Tailwind scans source text for class
// names, so `bg-${tint}-weak` compiles to a class that was never generated and
// the circle comes out transparent with no error anywhere.
const TINT = {
  accent: "bg-accent-weak text-accent",
  credit: "bg-credit-weak text-credit",
  danger: "bg-danger-weak text-danger",
  violet: "bg-violet-weak text-violet",
} as const;

/** The summary tile on Analytics. One copy, because two screens showing the
 *  same figure in two shapes reads as two features — the Overview balance tile
 *  is a different object (no comparison exists for a standing balance). */
export default function Stat({
  label,
  value,
  delta,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string;
  /** Period-on-period change. `goal` says which way this figure wants to move,
   *  which is the only thing that makes the sign mean anything. `vs` names the
   *  period being compared against. */
  delta: { pct: number | null; goal: Goal; vs: string };
  icon: ComponentType<{ className?: string }>;
  /** Token stem for the icon tint — the circle takes the weak fill, the glyph
   *  the full colour. Tint only: the figure itself stays --ink. */
  tint: keyof typeof TINT;
}) {
  const { pct, goal, vs } = delta;
  const mood = pct === null ? null : tone(pct, goal);
  const Mark = pct === null ? null : MARK[direction(pct)];

  return (
    <div className="flex min-h-[118px] flex-col gap-2 rounded-[10px] border border-line bg-surface p-3.5 shadow-card">
      <div className="flex items-center gap-2.5">
        <span className={`grid size-10 shrink-0 place-items-center rounded-full ${TINT[tint]}`}>
          <Icon className="size-6" />
        </span>
        <span className="text-[11px] leading-tight font-medium tracking-[0.07em] text-muted uppercase">
          {label}
        </span>
      </div>

      <p className="truncate text-[22px] leading-none font-semibold tracking-[-0.01em] tabular-nums">
        {value}
      </p>

      {/* The row keeps its height with no delta in it, so four tiles stay flush. */}
      {pct === null || !mood || !Mark ? (
        // Not a 0% delta: the first month in the file, and any Range with no
        // equal-length predecessor, has nothing to compare against. Rendering
        // ↑0% there is a lie told in the strongest colour on the screen.
        <p className="h-[15px] text-xs text-muted">no prior period</p>
      ) : (
        <p
          className={`flex h-[15px] items-center gap-[5px] text-xs font-medium tabular-nums ${TONE[mood]}`}
          aria-label={`${label}, ${value}, ${
            mood === "flat" ? "flat" : direction(pct) === "up" ? "up" : "down"
          } ${Math.abs(pct)} percent versus ${vs}, ${VERDICT[mood]}`}
        >
          <Mark className="size-[9px] shrink-0" />
          <span aria-hidden>
            {mood === "flat" && "flat · "}
            {Math.abs(pct)}%
          </span>
          <span aria-hidden className="font-normal text-muted">
            vs {vs}
          </span>
        </p>
      )}
    </div>
  );
}

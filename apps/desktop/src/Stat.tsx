import { ComponentType } from "react";

/** The summary tile used on Overview and Analytics. One copy, because two
 *  screens showing the same figure in two shapes reads as two features. */
export default function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tint,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: ComponentType<{ className?: string }>;
  /** Text-colour utility for the icon, e.g. `text-accent`. */
  tint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-4 py-4">
      <span className={`grid size-11 shrink-0 place-items-center rounded-full bg-ink/5 ${tint}`}>
        <Icon />
      </span>
      <div className="min-w-0">
        <p className="text-xs tracking-wide text-muted uppercase">{label}</p>
        <p className="truncate text-xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="truncate text-xs text-muted">{hint}</p>}
      </div>
    </div>
  );
}

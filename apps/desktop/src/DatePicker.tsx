// Our date picker, replacing `<input type="date">`.
//
// The native control was carrying the platform picker and keyboard for free.
// What it could not carry: a trigger that matches the 34px field next to it (in
// the WebView it renders its own box, its own spinner and its own popup, none
// of which take our CSS), a first-day-of-week that follows en-IN rather than
// the OS locale, and a "Today" affordance. Everything the native control did is
// re-implemented below, keyboard included.

import { useEffect, useId, useRef, useState } from "react";
import Popover, { useDismiss } from "./Popover";
import { Calendar, ChevronLeft, ChevronRight } from "./icons";
import { input, inputError, label as labelClass } from "./ui";
import { at, formatDay, shiftDays as shift, shiftMonths, todayIso, weeks } from "./day";

const MONTHS =
  "January February March April May June July August September October November December".split(
    " ",
  );

export default function DatePicker({
  value,
  onChange,
  label,
  error,
  className = "",
  id: idProp,
}: {
  value: string;
  onChange: (iso: string) => void;
  label?: string;
  error?: string;
  className?: string;
  id?: string;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Where the roving tabindex sits. Not the selection — moving around the
   *  calendar with the arrows must not commit anything. */
  const [cursor, setCursor] = useState(value);
  /** The header doubles as a month/year switch, in the same panel. */
  const [picking, setPicking] = useState(false);

  const today = todayIso();

  const close = (refocus = true) => {
    setOpen(false);
    setPicking(false);
    if (refocus) trigger.current?.focus();
  };
  useDismiss(trigger, panel, open, () => close(false));

  function show() {
    setCursor(value || today);
    setPicking(false);
    setOpen(true);
  }

  function commit(iso: string) {
    onChange(iso);
    close();
  }

  // Roving tabindex: focus follows the cursor into the grid, which is what
  // makes the arrow keys work at all without a keydown listener on the window.
  useEffect(() => {
    if (!open || picking) return;
    panel.current?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }, [open, picking, cursor]);

  function onKeyDown(e: React.KeyboardEvent) {
    const by = (days: number) => {
      e.preventDefault();
      setCursor(shift(cursor, days));
    };
    switch (e.key) {
      case "ArrowLeft":
        return by(-1);
      case "ArrowRight":
        return by(1);
      case "ArrowUp":
        return by(-7);
      case "ArrowDown":
        return by(7);
      case "Home":
        return by(-at(cursor).getDay());
      case "End":
        return by(6 - at(cursor).getDay());
      case "PageUp":
        e.preventDefault();
        return setCursor(shiftMonths(cursor, e.shiftKey ? -12 : -1));
      case "PageDown":
        e.preventDefault();
        return setCursor(shiftMonths(cursor, e.shiftKey ? 12 : 1));
      case "Enter":
      case " ":
        e.preventDefault();
        return commit(cursor);
      case "Escape":
        e.preventDefault();
        return close();
      case "t":
      case "T":
        e.preventDefault();
        return setCursor(today);
    }
  }

  const month = at(cursor);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className={`${labelClass} mb-1.5 block`}>
          {label}
        </label>
      )}
      <button
        id={id}
        ref={trigger}
        type="button"
        role="combobox"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={error !== undefined || undefined}
        onClick={() => (open ? close() : show())}
        onKeyDown={(e) => {
          if (!open && ["Enter", " ", "ArrowDown"].includes(e.key)) {
            e.preventDefault();
            show();
          }
        }}
        className={`${input} flex w-full items-center justify-between gap-1.5 pr-2 text-left tabular-nums ${
          error !== undefined ? inputError : ""
        } ${open ? "border-accent! shadow-[0_0_0_3px_var(--focus)]" : ""}`}
      >
        <span className="min-w-0 truncate">{value ? formatDay(value) : "Pick a date…"}</span>
        <Calendar className={`size-4 shrink-0 ${open ? "text-accent" : "text-muted"}`} />
      </button>

      {error && <p className="mt-1 text-[11.5px] text-danger">{error}</p>}

      <Popover
        anchor={trigger}
        open={open}
        menuRef={panel}
        role="dialog"
        aria-modal={false}
        aria-label="Choose date"
        className="p-2"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPicking(!picking)}
            aria-expanded={picking}
            className="flex-1 rounded-md px-2 py-1.5 text-left text-[13.5px] font-medium text-ink hover:bg-hover focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)_inset]"
          >
            {MONTHS[month.getMonth()]} {month.getFullYear()}
          </button>
          <Step
            label={picking ? "Previous year" : "Previous month"}
            onClick={() => setCursor(shiftMonths(cursor, picking ? -12 : -1))}
          >
            <ChevronLeft className="size-[18px]" />
          </Step>
          <Step
            label={picking ? "Next year" : "Next month"}
            onClick={() => setCursor(shiftMonths(cursor, picking ? 12 : 1))}
          >
            <ChevronRight className="size-[18px]" />
          </Step>
        </div>

        {picking ? (
          // Same panel, one screen — a second popover to choose a month is two
          // dismissable layers over a form field, and the wrong one always closes.
          <div className="mt-1 grid grid-cols-3 gap-1 sm:w-[244px]">
            {MONTHS.map((name, m) => (
              <button
                key={name}
                type="button"
                onClick={() => {
                  setCursor(shiftMonths(cursor, m - month.getMonth()));
                  setPicking(false);
                }}
                className={`h-8 rounded-md text-[12.5px] hover:bg-hover focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)_inset] ${
                  m === month.getMonth() ? "bg-accent text-accent-ink" : "text-ink"
                }`}
              >
                {name.slice(0, 3)}
              </button>
            ))}
          </div>
        ) : (
          <div role="grid" className="mt-1">
            <div role="row" className="grid grid-cols-7 gap-0.5">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div
                  key={i}
                  role="columnheader"
                  // The 30px fluid cell and the 32px fixed one are the same
                  // track: `minmax(0,1fr)` with a floor, so the calendar can
                  // pin to a narrow field without a second layout.
                  className="grid h-7 min-w-[30px] place-items-center text-[11px] font-medium text-muted sm:min-w-8"
                >
                  {d}
                </div>
              ))}
            </div>
            <div role="rowgroup">
              {weeks(cursor).map((week, w) => (
                <div key={w} role="row" className="grid grid-cols-7 gap-0.5">
                  {week.map((iso) => {
                    const outside = at(iso).getMonth() !== month.getMonth();
                    const isSelected = iso === value;
                    const isToday = iso === today;
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        aria-selected={isSelected}
                        aria-label={at(iso).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                        // Exactly one cell is tabbable, so Tab leaves the grid
                        // instead of walking 42 buttons.
                        tabIndex={iso === cursor ? 0 : -1}
                        onClick={() => commit(iso)}
                        className={`grid h-8 min-w-[30px] cursor-pointer place-items-center rounded-md text-[12.5px] tabular-nums focus-visible:outline-none sm:min-w-8 ${
                          isSelected
                            ? "bg-accent font-medium text-accent-ink"
                            : outside
                              ? "text-muted/55 hover:bg-hover"
                              : "text-ink hover:bg-hover"
                        } ${
                          // Today keeps its ring even when selected — the fill
                          // says "chosen", the ring says "now", and on the day
                          // they coincide both facts still hold.
                          isToday ? "shadow-[0_0_0_1px_var(--accent)_inset]" : ""
                        }`}
                      >
                        {at(iso).getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Kept because same-day logging is the common case: one click instead
            of navigate-then-click, and it gives the T shortcut a visible home. */}
        <button
          type="button"
          onClick={() => commit(today)}
          className="mt-1 flex w-full items-center justify-between rounded-md border-t border-line px-2 py-1.5 text-[12.5px] text-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)_inset]"
        >
          <span>Today</span>
          <span className="tabular-nums">
            {at(today).toLocaleDateString("en-IN", {
              weekday: "short",
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
        </button>
      </Popover>
    </div>
  );
}

function Step({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:shadow-[0_0_0_2px_var(--focus)_inset]"
    >
      {children}
    </button>
  );
}

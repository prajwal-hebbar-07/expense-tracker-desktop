// Our select, replacing the native one.
//
// The platform popup was keeping the platform's keyboard and a11y for free,
// which was the right trade until the app needed grouped options with a
// secondary hint, a menu that matches the 34px field row it sits in, and a
// disabled/error skin. A `<select>` gives you none of those and no CSS of ours
// reaches inside it. What that free ride bought is re-implemented here in full
// — see the keyboard contract below; a combobox that only half-works with a
// keyboard is worse than the native control it replaced.

import { useId, useRef, useState } from "react";
import Popover, { insetRing, useDismiss, useTypeahead } from "./Popover";
import { ChevronDown, ChevronUp, Tick } from "./icons";
import { input, inputError, label as labelClass } from "./ui";

/** A heading is a label, not a choice: it is skipped by Up/Down and carries no
 *  value. Modelling both as one list is what makes "skip headings" a filter
 *  rather than a nested traversal. */
export type Item =
  | { group: string }
  | { value: string; label: string; hint?: string };

const isOption = (i: Item): i is Extract<Item, { value: string }> => !("group" in i);

type Section = { group?: string; opts: { item: Extract<Item, { value: string }>; at: number }[] };

/** Folds the flat list into the sections ARIA wants. The list is flat in the
 *  prop because that is what makes "skip headings" a filter and what keeps a
 *  single index valid for aria-activedescendant; it is nested here because
 *  `role="group"` has to wrap the options it names. */
function sections(items: Item[]): Section[] {
  const out: Section[] = [];
  items.forEach((item, at) => {
    if ("group" in item) return out.push({ group: item.group, opts: [] });
    if (!out.length) out.push({ opts: [] });
    out[out.length - 1].opts.push({ item, at });
  });
  return out;
}

export default function Select({
  items,
  value,
  onChange,
  placeholder = "Select…",
  label,
  error,
  disabled,
  className = "",
  id: idProp,
}: {
  items: Item[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  /** Switches the trigger to the error skin, and captions it when non-empty.
   *  `""` flags without a message — the "two different accounts" rule marks
   *  both selects but says it once. */
  error?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const generated = useId();
  const id = idProp ?? generated;
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  /** Index into `items`, always pointing at an option. −1 when nothing is
   *  highlighted, which only happens while closed. */
  const [active, setActive] = useState(-1);

  const options = items.filter(isOption);
  const selected = options.find((o) => o.value === value);

  const close = (refocus = false) => {
    setOpen(false);
    setActive(-1);
    if (refocus) trigger.current?.focus();
  };
  useDismiss(trigger, menu, open, close);

  /** Opens with the highlight on the chosen option, or the first one. */
  function show() {
    if (disabled) return;
    const at = items.findIndex((i) => isOption(i) && i.value === value);
    setActive(at === -1 ? items.findIndex(isOption) : at);
    setOpen(true);
  }

  function commit(at: number) {
    const item = items[at];
    if (item && isOption(item)) onChange(item.value);
    close(true);
  }

  /** Steps `by` options from `from`, skipping headings and wrapping at both
   *  ends. Wrapping matters more here than in a menu bar: the list is short and
   *  the last option is one Up press from the first. */
  function step(from: number, by: number) {
    const n = items.length;
    for (let i = 1; i <= n; i++) {
      const at = (((from + by * i) % n) + n) % n;
      if (isOption(items[at])) return at;
    }
    return from;
  }

  const edge = (last: boolean) => {
    const at = last ? items.map(isOption).lastIndexOf(true) : items.findIndex(isOption);
    return at === -1 ? active : at;
  };

  const typeahead = useTypeahead((prefix) => {
    const at = items.findIndex((i) => isOption(i) && i.label.toLowerCase().startsWith(prefix));
    if (at !== -1) setActive(at);
  });

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        show();
      }
      return;
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        return setActive(step(active, 1));
      case "ArrowUp":
        e.preventDefault();
        return setActive(step(active, -1));
      case "Home":
        e.preventDefault();
        return setActive(edge(false));
      case "End":
        e.preventDefault();
        return setActive(edge(true));
      case "Enter":
      case " ":
        e.preventDefault();
        return commit(active);
      case "Escape":
        e.preventDefault();
        // Reverts by construction: nothing is written until `commit`.
        return close(true);
      case "Tab":
        // Commits and lets focus move on — the one exit that does not preventDefault.
        if (active !== -1) commit(active);
        return setOpen(false);
      default:
        if (typeahead(e.key)) e.preventDefault();
    }
  }

  const Chevron = open ? ChevronUp : ChevronDown;

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
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        // DOM focus stays here the whole time the menu is open; the highlight
        // is announced through activedescendant instead of being focused.
        aria-activedescendant={open && active !== -1 ? `${id}-opt-${active}` : undefined}
        aria-invalid={error !== undefined || undefined}
        aria-errormessage={error ? `${id}-error` : undefined}
        disabled={disabled}
        onClick={() => (open ? close(true) : show())}
        onKeyDown={onKeyDown}
        // Trigger states are the input states verbatim, so a select and a text
        // field in the same row are indistinguishable until you click one.
        className={`${input} flex w-full items-center justify-between gap-1.5 pr-2 text-left ${
          error !== undefined ? inputError : ""
        } ${open ? "border-accent! shadow-[0_0_0_3px_var(--focus)]" : ""} ${
          selected ? "text-ink" : "text-muted"
        } disabled:cursor-default disabled:bg-bg`}
      >
        <span className="min-w-0 truncate">
          {selected ? selected.label : placeholder}
          {selected?.hint && (
            <span className="pl-1.5 font-mono text-muted">{selected.hint}</span>
          )}
        </span>
        <Chevron
          className={`size-4 shrink-0 ${
            open ? "text-accent" : error !== undefined ? "text-danger" : "text-muted"
          }`}
        />
      </button>

      {error && (
        <p id={`${id}-error`} className="mt-1 text-[11.5px] text-danger">
          {error}
        </p>
      )}

      <Popover anchor={trigger} open={open} menuRef={menu} id={`${id}-menu`}>
        {/* overscroll-contain is the whole of "scroll-lock inside the menu" —
            it stops a wheel event at the end of the list scrolling the page. */}
        <div
          role="listbox"
          aria-labelledby={label ? id : undefined}
          className="menu-scroll flex max-h-[280px] flex-col gap-0.5 overflow-y-auto overscroll-contain p-1"
        >
          {sections(items).map((section, s) => (
            <div
              key={s}
              role={section.group ? "group" : "presentation"}
              aria-labelledby={section.group ? `${id}-grp-${s}` : undefined}
              className={
                // A rule between groups only, never above the first one.
                s > 0 ? "mt-1 flex flex-col gap-0.5 border-t border-line pt-1" : "flex flex-col gap-0.5"
              }
            >
              {section.group && (
                <div id={`${id}-grp-${s}`} className={`${labelClass} px-2.5 pt-1 pb-1`}>
                  {section.group}
                </div>
              )}
              {section.opts.map(({ item, at }) => (
                <div
                  key={item.value}
                  id={`${id}-opt-${at}`}
                  role="option"
                  aria-selected={item.value === value}
                  onClick={() => commit(at)}
                  ref={(el) => {
                    if (at === active) el?.scrollIntoView({ block: "nearest" });
                  }}
                  // Hover and the keyboard highlight are deliberately different
                  // marks: the pointer is already telling you where it is, so it
                  // gets the quieter one and never moves the keyboard position.
                  className={`flex h-8 shrink-0 cursor-pointer items-center justify-between gap-2 rounded-md pr-2 pl-2.5 text-[13.5px] text-ink ${
                    at === active ? `bg-accent-weak ${insetRing}` : "hover:bg-hover"
                  }`}
                >
                  <span className="min-w-0 truncate">
                    {item.label}
                    {item.hint && <span className="pl-1.5 font-mono text-muted">{item.hint}</span>}
                  </span>
                  {/* One marker only — no tint, no rail. The highlight is a
                      separate axis, so a row can be both and stay legible. */}
                  {item.value === value && <Tick className="size-4 shrink-0 text-accent" />}
                </div>
              ))}
            </div>
          ))}
        </div>
      </Popover>
    </div>
  );
}

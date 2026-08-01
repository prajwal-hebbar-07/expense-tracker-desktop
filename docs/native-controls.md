---
id: native-controls
type: decision
status: superseded
superseded-by: custom-select
updated: 2026-08-01
links: [custom-select, date-picker, floating-layer, design-tokens]
---

# Native `<select>` and `<input type="date">` (superseded)

The form used the platform controls with only the closed-state arrow restyled (`appearance-none` plus our own `ChevronDown`). The reasoning was sound at the time and is recorded here so it is not re-proposed: a native `<select>` carries the platform popup, the full keyboard model, typeahead, and screen-reader support for free, and re-implementing all of that is a real cost.

## Why it was replaced on 2026-08-01

1. **No CSS of ours reaches inside either control.** The popup, the date spinner and the calendar are drawn by WKWebView, so they could not take `--overlay`, `--line`, the 34px control height, or the 6px radius. Next to our own fields they read as a different application.
2. **A `<select>` cannot show a secondary hint.** `HDFC Regalia ••••0421` needs the digits in mono and `--muted`; an `<option>` renders one flat string.
3. **`<optgroup>` gives no control over the heading.** The design's headings are 11/500 caps `--muted` with a 1px rule between groups.
4. **No error skin.** `--danger` border plus `--danger-weak` fill is not expressible on a native popup.
5. **First day of week followed the OS locale**, not en-IN, so the calendar reshaped per machine.

## What survived the change

`color-scheme: light dark` on `:root` stays. It still governs scrollbars, and removing it is a separate regression — see [[design-tokens]] rule 4, which was rewritten rather than deleted.

The replacements are [[custom-select]] and [[date-picker]], both built on [[floating-layer]]. The keyboard and ARIA contract the native controls provided for free is now written out in full in those nodes; **a combobox that only half-works with a keyboard is worse than the control it replaced**, which is why those contracts are normative rather than aspirational.

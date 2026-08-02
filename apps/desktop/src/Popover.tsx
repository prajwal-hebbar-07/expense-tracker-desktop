// The floating layer, shared by the select menu and the date picker.
//
// Two things make this its own module rather than something each control does
// for itself. First, `position: fixed` plus a portal is the only placement that
// survives an inline row editor inside a scrolling card — an absolutely
// positioned menu is clipped by the first `overflow` ancestor, and the
// Transactions list is one. Second, flip-and-clamp is a rule with an off-by-one
// in it (a menu that flips at the first opportunity jumps under the cursor for
// no reason), and one copy of that rule is one place to get it right.

import { RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { overlay } from "./ui";

/** Trigger → menu, both directions. */
const GAP = 4;
/** Closest a menu may come to the window edge. */
const EDGE = 8;
/** Below this a menu is not worth opening downwards. */
const MIN_WIDTH = 176;
const MAX_WIDTH = 320;

type Placement = { style: React.CSSProperties; ready: boolean };

function usePlacement(
  anchor: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  open: boolean,
): Placement {
  const [style, setStyle] = useState<React.CSSProperties>({});
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    if (!open) return setReady(false);

    const place = () => {
      const a = anchor.current;
      const m = menu.current;
      if (!a || !m) return;
      const r = a.getBoundingClientRect();
      // Constrain before measuring. The element is portalled into <body> with no
      // width of its own, so an unconstrained first pass measures it at the full
      // body width — which then clamps `left` to the window's left edge and
      // parks every menu in the corner. Setting these on the node rather than
      // waiting for the style state to land keeps it a single pass.
      const width = Math.max(r.width, MIN_WIDTH);
      // The menu is its trigger's width; a grouped one may *grow past* that to
      // fit its content, and the 320 cap binds only on that growth. Written as
      // max(cap, width) rather than a bare cap so it never contradicts minWidth
      // — a full-width trigger should get a full-width menu, not a 320px one.
      const cap = Math.max(MAX_WIDTH, width);
      m.style.minWidth = `${width}px`;
      m.style.maxWidth = `${cap}px`;

      const h = m.offsetHeight;
      const w = m.offsetWidth;
      const below = window.innerHeight - r.bottom;

      // Flip only when there is genuinely no room below *and* above is the
      // better side. `below < h + EDGE` alone would flip a short menu near the
      // bottom of a tall window into an even tighter space.
      const flip = below < h + EDGE && r.top > below;
      setStyle({
        position: "fixed",
        top: flip ? Math.max(EDGE, r.top - h - GAP) : r.bottom + GAP,
        // Left-aligned to the trigger, then pushed back inside the window. For
        // a menu wider than its trigger that push *is* right-alignment, which
        // is why there is no separate right-aligned branch.
        left: Math.min(Math.max(EDGE, r.left), Math.max(EDGE, window.innerWidth - w - EDGE)),
        // One rule covers both specified widths: a simple menu's content is
        // narrower than its trigger so it lands on minWidth, and a grouped one
        // grows to its content until it hits the cap.
        minWidth: width,
        maxWidth: cap,
      });
      setReady(true);
    };

    place();
    // `true` — capture, so a scroll in any ancestor container repositions it,
    // not just a scroll of the document.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, anchor, menu]);

  return { style, ready };
}

/**
 * Closes on Escape and on a pointer press outside both the menu and its
 * trigger. `pointerdown`, not `click`: a click fires after the press has
 * already moved focus, which lets a second trigger open while the first is
 * still shown.
 */
export function useDismiss(
  anchor: RefObject<HTMLElement | null>,
  menu: RefObject<HTMLElement | null>,
  open: boolean,
  close: () => void,
) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (anchor.current?.contains(t) || menu.current?.contains(t)) return;
      close();
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open, anchor, menu, close]);
}

/** The positioned overlay itself. Renders nothing when closed. */
export default function Popover({
  anchor,
  open,
  menuRef,
  className = "",
  children,
  ...rest
}: {
  anchor: RefObject<HTMLElement | null>;
  open: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const { style, ready } = usePlacement(anchor, menuRef, open);
  if (!open) return null;

  return createPortal(
    <div
      {...rest}
      ref={menuRef}
      className={`${overlay} z-50 ${className}`}
      // Hidden for the one frame between mount and measurement, so the menu is
      // never seen at 0,0 before it is placed.
      style={{ ...style, visibility: ready ? "visible" : "hidden" }}
    >
      {children}
    </div>,
    document.body,
  );
}

/** Focus-visible-only ring, for elements inside a menu where an outline would
 *  be clipped by the scroll container. */
export const insetRing = "shadow-[0_0_0_2px_var(--focus)_inset]";

export { GAP, EDGE };

/** Kept next to the placement rules it belongs with — a control that opens a
 *  Popover almost always also wants "did the user just type a letter". */
export function useTypeahead(onMatch: (prefix: string) => void) {
  const buf = useRef("");
  const timer = useRef<number>(0);
  return (key: string) => {
    // Single printable characters only: `key` is "ArrowDown" for the arrows and
    // a length check is the cheapest way to tell those apart.
    if (key.length !== 1 || key === " ") return false;
    window.clearTimeout(timer.current);
    buf.current += key.toLowerCase();
    timer.current = window.setTimeout(() => (buf.current = ""), 800);
    onMatch(buf.current);
    return true;
  };
}

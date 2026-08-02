// Inline SVG icons instead of an icon package: a couple of dozen glyphs is a
// few hundred bytes here versus a dependency in the WebView bundle. Shapes are
// the standard 24×24 stroke grid, so any Lucide/Feather path can be pasted in
// as-is.

type Props = { className?: string };

// 1.7, not 2: these are drawn at 18px far more often than at 24, and a 2-stroke
// at 18 is heavy enough to read as bold next to 13.5px text.
const Svg = ({ className = "size-5", children }: Props & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.7}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    {children}
  </svg>
);

export const Wallet = (p: Props) => (
  <Svg {...p}>
    <path d="M20 12V8H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12v4" />
    <path d="M4 6v12a2 2 0 0 0 2 2h14v-4" />
    <path d="M18 12a2 2 0 0 0 0 4h4v-4z" />
  </Svg>
);

/** Overview. Four panes, not a house — the screen is a dashboard, and a house
 *  glyph in a nav of five promises a "home" that this app does not have. */
export const Home = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);

export const List = (p: Props) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </Svg>
);

export const Sliders = (p: Props) => (
  <Svg {...p}>
    <path d="M4 8h8M17 8h3M4 16h3M12 16h8" />
    <circle cx="14.5" cy="8" r="2.2" />
    <circle cx="9.5" cy="16" r="2.2" />
  </Svg>
);

export const Bank = (p: Props) => (
  <Svg {...p}>
    <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7" />
    <path d="M12 2 2 7v2h20V7z" />
  </Svg>
);

export const Card = (p: Props) => (
  <Svg {...p}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </Svg>
);

export const ArrowsUpDown = (p: Props) => (
  <Svg {...p}>
    <path d="m21 16-4 4-4-4M17 20V4" />
    <path d="m3 8 4-4 4 4M7 4v16" />
  </Svg>
);

export const Calendar = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2.5" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Svg>
);

/** The leading slot on a transfer row, and the Spent tile's sibling. Money
 *  going one way and coming back the other — no sign, because none applies. */
export const ArrowsLeftRight = (p: Props) => (
  <Svg {...p}>
    <path d="M4 9h13M14 6l3 3-3 3M20 15H7M10 12l-3 3 3 3" />
  </Svg>
);

/** Money out. Points away from the origin. */
export const ArrowOut = (p: Props) => (
  <Svg {...p}>
    <path d="M7 17L17 7M9 7h8v8" />
  </Svg>
);

/** Money in. The same glyph reflected, so a scan down the leading column reads
 *  direction by angle before it reads it by colour. */
export const ArrowIn = (p: Props) => (
  <Svg {...p}>
    <path d="M17 7L7 17M7 9v8h8" />
  </Svg>
);

/** The leading slot on a card charge. Same out-angle as ArrowOut, drawn leaving
 *  a card body: the angle still reads direction, and the card says the money
 *  was borrowed rather than yours. */
export const CardOut = (p: Props) => (
  <Svg {...p}>
    <rect x="2" y="12" width="12" height="9" rx="2" />
    <path d="M2 15.5h12" />
    <path d="M13 11L21 3M16 3h5v5" />
  </Svg>
);

/** A card refund or a cleared bill — debt going down. The arrow angles *into*
 *  the card, which is what separates it from a self-transfer's two-way glyph:
 *  both are "neither in nor out", only one of them is about debt. */
export const CardIn = (p: Props) => (
  <Svg {...p}>
    <rect x="2" y="12" width="12" height="9" rx="2" />
    <path d="M2 15.5h12" />
    <path d="M21 3L13 11M13 7v4h4" />
  </Svg>
);

/** The Spent tile. A single arrow leaving, matched to ArrowOut's direction. */
export const ArrowRight = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </Svg>
);

export const Info = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </Svg>
);

export const ChevronDown = (p: Props) => (
  <Svg {...p}>
    <path d="m6 9 6 6 6-6" />
  </Svg>
);

export const ChevronUp = (p: Props) => (
  <Svg {...p}>
    <path d="M18 15l-6-6-6 6" />
  </Svg>
);

export const ChevronLeft = (p: Props) => (
  <Svg {...p}>
    <path d="M15 6l-6 6 6 6" />
  </Svg>
);

export const ChevronRight = (p: Props) => (
  <Svg {...p}>
    <path d="M9 6l6 6-6 6" />
  </Svg>
);

/** The selected marker inside a menu. Squarer than `Check` so it reads at the
 *  16px it is drawn at there. */
export const Tick = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Svg>
);

// The delta marks. Filled, not stroked, and on their own 10-unit grid: at the
// 9px these render at, a 1.7 stroke is 1.7px of ink on a 9px glyph and greys
// out against --surface. Up and down are separate paths rather than one
// rotated triangle, so neither inherits the other's optical weight.
const Mark = ({ className = "size-[9px]", d }: Props & { d: string }) => (
  <svg viewBox="0 0 10 10" fill="currentColor" aria-hidden="true" className={className}>
    <path d={d} />
  </svg>
);

export const MarkUp = (p: Props) => <Mark {...p} d="M5 1l4 7H1z" />;
export const MarkDown = (p: Props) => <Mark {...p} d="M5 9l4-7H1z" />;
/** "Nothing happened". A slab, because `≈` at 12px collapses into a smudge
 *  that scans as a dash, an equals sign, or dirt on the screen. */
export const MarkFlat = (p: Props) => <Mark {...p} d="M1 4h8v2H1z" />;

export const TrendUp = (p: Props) => (
  <Svg {...p}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M15 7h6v6" />
  </Svg>
);

/** Three bars on a baseline. */
export const BarChart = (p: Props) => (
  <Svg {...p}>
    <path d="M3 21h18M6.5 21V12M12 21V6M17.5 21v-6" />
  </Svg>
);

/** A sheet with three rules, the last one short — prose, not a table. */
export const FileText = (p: Props) => (
  <Svg {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2.5" />
    <path d="M8 8.5h8M8 12.5h8M8 16.5h5" />
  </Svg>
);

export const Alert = (p: Props) => (
  <Svg {...p}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 18h.01" />
  </Svg>
);

export const Check = (p: Props) => (
  <Svg {...p}>
    <path d="M20 6 9 17l-5-5" />
  </Svg>
);

export const Lightbulb = (p: Props) => (
  <Svg {...p}>
    <path d="M9 18h6M10 22h4" />
    <path d="M12 2a7 7 0 0 0-4 12.7V18h8v-3.3A7 7 0 0 0 12 2z" />
  </Svg>
);

export const Repeat = (p: Props) => (
  <Svg {...p}>
    <path d="m17 2 4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </Svg>
);

export const Target = (p: Props) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1" />
  </Svg>
);

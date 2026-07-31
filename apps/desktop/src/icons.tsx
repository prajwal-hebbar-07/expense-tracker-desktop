// Inline SVG icons instead of an icon package: nine glyphs is a few hundred
// bytes here versus a dependency in the WebView bundle. Shapes are the standard
// 24×24 stroke grid, so any Lucide/Feather path can be pasted in as-is.

type Props = { className?: string };

const Svg = ({ className = "size-5", children }: Props & { children: React.ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
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

export const Home = (p: Props) => (
  <Svg {...p}>
    <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </Svg>
);

export const List = (p: Props) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
  </Svg>
);

export const Sliders = (p: Props) => (
  <Svg {...p}>
    <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
    <path d="M1 14h6M9 8h6M17 16h6" />
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
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <path d="M16 2v4M8 2v4M3 10h18" />
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

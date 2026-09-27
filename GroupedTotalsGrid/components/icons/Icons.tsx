/**
 * Local icon set.
 *
 * These replace `@fluentui/react-icons`, which is deliberately NOT used.
 *
 * Why: only React and Fluent are declared as platform libraries, so
 * `@fluentui/react-icons` gets bundled rather than supplied by the host. That
 * pulled `@griffel/react` into the bundle (breaking the webpack build on
 * `react/jsx-runtime` resolution) and pushed bundle.js to 1.57 MiB, well past
 * the 1 MB target. The dozen glyphs below cost a couple of KB instead.
 *
 * All shapes are plain geometry drawn with `currentColor`, so they inherit the
 * surrounding Fluent token colour and stay correct in light, dark and
 * high-contrast themes with no extra work.
 *
 * Sized at 16px in a 20x20 viewBox to sit correctly against the 14px cell text.
 */

import * as React from "react";

export interface IconProps {
  className?: string;
  /** Override the rendered size in px. Defaults to 16. */
  size?: number;
}

const Svg: React.FC<IconProps & { children: React.ReactNode }> = ({ className, size = 16, children }) => (
  <svg
    className={className}
    width={size}
    height={size}
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    style={{ flexShrink: 0 }}
  >
    {children}
  </svg>
);

/** Common stroke treatment: matches the weight of Fluent's regular icon set. */
const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const
};

/* ---- expand / collapse ------------------------------------------------ */

export const ChevronRight: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M7.5 4.5 L13 10 L7.5 15.5" {...stroke} />
  </Svg>
);

export const ChevronDown: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M4.5 7.5 L10 13 L15.5 7.5" {...stroke} />
  </Svg>
);

/** The header affordance indicating a sortable / menu-bearing column. */
export const ChevronUpDown: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M6.5 8.5 L10 5 L13.5 8.5" {...stroke} />
    <path d="M6.5 11.5 L10 15 L13.5 11.5" {...stroke} />
  </Svg>
);

/* ---- notices ----------------------------------------------------------- */

export const Info: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <circle cx="10" cy="10" r="7.25" {...stroke} />
    <path d="M10 9.25 L10 14" {...stroke} />
    <circle cx="10" cy="6.25" r="0.9" fill="currentColor" />
  </Svg>
);

/* ---- header menu commands --------------------------------------------- */

export const SortAscending: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M10 15 L10 5" {...stroke} />
    <path d="M6 9 L10 5 L14 9" {...stroke} />
  </Svg>
);

export const SortDescending: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M10 5 L10 15" {...stroke} />
    <path d="M6 11 L10 15 L14 11" {...stroke} />
  </Svg>
);

export const Filter: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M3.5 5 L16.5 5 L11.5 10.75 L11.5 15.5 L8.5 14 L8.5 10.75 Z" {...stroke} />
  </Svg>
);

export const Group: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="14" height="4.5" rx="1" {...stroke} />
    <rect x="3" y="11.5" width="14" height="4.5" rx="1" {...stroke} />
  </Svg>
);

export const GroupDismiss: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <rect x="3" y="4" width="14" height="4.5" rx="1" {...stroke} />
    <path d="M3 13.75 L10 13.75" {...stroke} />
    <path d="M12.5 11.5 L17 16 M17 11.5 L12.5 16" {...stroke} />
  </Svg>
);

/** Sigma reads as "total" far more directly than a calculator glyph. */
export const Sum: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M14 5 L6 5 L10.5 10 L6 15 L14 15" {...stroke} />
  </Svg>
);

export const ArrowLeft: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M15 10 L5 10" {...stroke} />
    <path d="M9 5 L4.5 10 L9 15" {...stroke} />
  </Svg>
);

export const ArrowRight: React.FC<IconProps> = (p) => (
  <Svg {...p}>
    <path d="M5 10 L15 10" {...stroke} />
    <path d="M11 5 L15.5 10 L11 15" {...stroke} />
  </Svg>
);

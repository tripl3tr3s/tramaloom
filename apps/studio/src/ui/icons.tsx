import type { ReactNode } from "react";

/** Small stroke icons, 16px box, drawn in currentColor. Decorative: label the button, not the icon. */
function Icon({ children, size = 14 }: { readonly children: ReactNode; readonly size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const GripIcon = () => (
  <Icon>
    <circle cx="6" cy="4" r="0.6" />
    <circle cx="10" cy="4" r="0.6" />
    <circle cx="6" cy="8" r="0.6" />
    <circle cx="10" cy="8" r="0.6" />
    <circle cx="6" cy="12" r="0.6" />
    <circle cx="10" cy="12" r="0.6" />
  </Icon>
);

export const EyeIcon = () => (
  <Icon>
    <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
    <circle cx="8" cy="8" r="2" />
  </Icon>
);

export const EyeOffIcon = () => (
  <Icon>
    <path d="M6.2 3.8A6.4 6.4 0 0 1 8 3.5c4.1 0 6.5 4.5 6.5 4.5a11 11 0 0 1-1.7 2.2M4.2 4.9C2.5 6.1 1.5 8 1.5 8s2.4 4.5 6.5 4.5c1.2 0 2.3-.4 3.2-.9" />
    <path d="M2 2l12 12" />
  </Icon>
);

export const UpIcon = () => (
  <Icon>
    <path d="M4 10l4-4 4 4" />
  </Icon>
);

export const DownIcon = () => (
  <Icon>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

export const CopyIcon = () => (
  <Icon>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 3.5v-.5a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h.5" />
  </Icon>
);

export const TrashIcon = () => (
  <Icon>
    <path d="M2.5 4.5h11M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4 4.5l.7 8.6a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9l.7-8.6" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon size={12}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon size={10}>
    <path d="M4 6l4 4 4-4" />
  </Icon>
);

export const ResetIcon = () => (
  <Icon size={12}>
    <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
    <path d="M3.5 2.5v2.8h2.8" />
  </Icon>
);

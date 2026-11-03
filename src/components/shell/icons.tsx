import type { ReactNode } from "react";

interface IconProps {
  size?: number;
}

function Icon({ size = 16, children }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ProjectsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2" y="2" width="5" height="5" rx="1" />
    <rect x="9" y="2" width="5" height="5" rx="1" />
    <rect x="2" y="9" width="5" height="5" rx="1" />
    <rect x="9" y="9" width="5" height="5" rx="1" />
  </Icon>
);

export const DeploymentsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 1.5 14 4.75v6.5L8 14.5 2 11.25v-6.5L8 1.5Z" />
    <path d="M2 4.75 8 8l6-3.25M8 8v6.5" />
  </Icon>
);

export const DomainsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="6.25" />
    <path d="M1.75 8h12.5M8 1.75c1.8 1.7 2.7 3.8 2.7 6.25S9.8 12.55 8 14.25C6.2 12.55 5.3 10.45 5.3 8S6.2 3.45 8 1.75Z" />
  </Icon>
);

export const DatabasesIcon = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="8" cy="3.75" rx="5.25" ry="2" />
    <path d="M2.75 3.75v8.5c0 1.1 2.35 2 5.25 2s5.25-.9 5.25-2v-8.5M2.75 8c0 1.1 2.35 2 5.25 2s5.25-.9 5.25-2" />
  </Icon>
);

export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="2.25" />
    <path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" />
  </Icon>
);

export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5H3.5v11H6M10 5l3 3-3 3M13 8H6.5" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="7" r="4.5" />
    <path d="m10.5 10.5 3.25 3.25" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />
  </Icon>
);

export const SetupIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 2 4 9h3.5L6.5 14 12 7H8.5L9.5 2Z" />
  </Icon>
);

export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 6.5 3-3 3 3M5 9.5l3 3 3-3" />
  </Icon>
);

export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11V7.5a4 4 0 1 1 8 0V11l1 1.5H3L4 11ZM6.5 14a1.5 1.5 0 0 0 3 0" />
  </Icon>
);

export const GridIcon = ProjectsIcon;

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 4h8M5.5 8h8M5.5 12h8M2.5 4h.01M2.5 8h.01M2.5 12h.01" />
  </Icon>
);

export const GithubIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.93-.89-1.17-.89-1.17-.73-.5.05-.49.05-.49.8.06 1.23.83 1.23.83.72 1.22 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
  </svg>
);

export const ZipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 2.5h6.5L13 6v7.5H3v-11Z" />
    <path d="M9.5 2.5V6H13M6 5v1M6 7.5v1M6 10v1" />
  </Icon>
);

export const RestartIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13 8a5 5 0 1 1-1.6-3.7" />
    <path d="M13 2.5v3h-3" />
  </Icon>
);

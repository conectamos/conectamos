export type DashboardIconName =
  | "home"
  | "sales"
  | "inventory"
  | "loans"
  | "cash"
  | "approvals"
  | "reports"
  | "settings"
  | "calendar"
  | "store"
  | "bell"
  | "trend"
  | "warning"
  | "menu"
  | "arrow"
  | "lock"
  | "user"
  | "close"
  | "search"
  | "send"
  | "document"
  | "download"
  | "catalog";

export default function DashboardIcon({
  name,
  className = "h-5 w-5",
}: {
  name: DashboardIconName;
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...common}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5.5 9.5V21h13V9.5M9.5 21v-7h5v7" />
        </svg>
      );
    case "sales":
      return (
        <svg {...common}>
          <path d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
        </svg>
      );
    case "inventory":
      return (
        <svg {...common}>
          <path d="m4 7.5 8-4 8 4-8 4-8-4Z" />
          <path d="m4 7.5 8 4 8-4V17l-8 4-8-4V7.5Z" />
          <path d="M12 11.5V21" />
        </svg>
      );
    case "loans":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M15 8.5c-.7-.8-1.7-1.2-3-1.2-1.7 0-3 1-3 2.3 0 3.5 6 1.6 6 5 0 1.4-1.3 2.4-3 2.4-1.4 0-2.6-.5-3.3-1.4M12 5.5v13" />
        </svg>
      );
    case "cash":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M7 9h3m4 6h3m-5-6v6" />
          <circle cx="12" cy="12" r="2.5" />
        </svg>
      );
    case "approvals":
      return (
        <svg {...common}>
          <rect x="5" y="4" width="14" height="17" rx="2" />
          <path d="M9 4V2.5h6V4m-6 9 2 2 4-5" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M4 20V10m5 10V4m5 16v-7m5 7V7" />
          <path d="M3 20h18" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M8 3v4m8-4v4M3 10h18" />
        </svg>
      );
    case "store":
      return (
        <svg {...common}>
          <path d="M4 10v10h16V10M3 10l2-6h14l2 6" />
          <path d="M3 10a3 3 0 0 0 5 2 3 3 0 0 0 4 0 3 3 0 0 0 4 0 3 3 0 0 0 5-2M9 20v-5h6v5" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 8h18c0-1-3-1-3-8M10 21h4" />
        </svg>
      );
    case "trend":
      return (
        <svg {...common}>
          <path d="m4 17 5-5 4 3 7-8" />
          <path d="M15 7h5v5" />
        </svg>
      );
    case "warning":
      return (
        <svg {...common}>
          <path d="M10.3 4.1 2.7 18a2 2 0 0 0 1.8 3h15a2 2 0 0 0 1.8-3L13.7 4.1a2 2 0 0 0-3.4 0Z" />
          <path d="M12 9v4m0 4h.01" />
        </svg>
      );
    case "menu":
      return (
        <svg {...common}>
          <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
      );
    case "arrow":
      return (
        <svg {...common}>
          <path d="M5 12h14m-5-5 5 5-5 5" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="10" width="14" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 0 1 8 0v3" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "close":
      return (
        <svg {...common}>
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="m16.5 16.5 4 4" />
        </svg>
      );
    case "send":
      return (
        <svg {...common}>
          <path d="m3 11 17-8-7.5 18-2.2-7.3L3 11Z" />
          <path d="m10.3 13.7 4.2-4.2" />
        </svg>
      );
    case "document":
      return (
        <svg {...common}>
          <path d="M6 3h8l4 4v14H6V3Z" />
          <path d="M14 3v5h5M9 13h6m-6 4h6" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 3v12m-4-4 4 4 4-4" />
          <path d="M5 20h14" />
        </svg>
      );
    case "catalog":
      return (
        <svg {...common}>
          <path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H11v17H7.5A3.5 3.5 0 0 0 4 22V5.5Z" />
          <path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H13v17h3.5A3.5 3.5 0 0 1 20 22V5.5Z" />
        </svg>
      );
  }
}

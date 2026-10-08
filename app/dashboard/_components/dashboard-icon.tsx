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
  | "catalog"
  | "wallet"
  | "transfer"
  | "clock"
  | "shield"
  | "chevron"
  | "refresh"
  | "database"
  | "receivable"
  | "trophy"
  | "tag";

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
    case "trophy":
      return <svg {...common}><path d="M7 3h10v7a5 5 0 0 1-10 0V3ZM7 5H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4M12 15v5m-4 1h8" /></svg>;
    case "tag":
      return <svg {...common}><path d="M13 3h6a2 2 0 0 1 2 2v6L11 21 3 13 13 3Z" /><circle cx="17" cy="7" r="1" /></svg>;
    case "database":
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></svg>;
    case "receivable":
      return <svg {...common}><circle cx="14" cy="6" r="4" /><path d="M14 4v4m1.5-3.2c-.8-1-3-.7-3 .3 0 1.2 3 .1 3 1.3 0 1-2.2 1.3-3 .3M3 21v-6h3l3-2h4a2 2 0 0 1 0 4h-3m-4 4h7l8-6a2 2 0 0 0-3-2l-3 2M6 15v6" /></svg>;
    case "wallet":
      return <svg {...common}><path d="M19 7V4L5 6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5" /><path d="M21 12h-5v5h5m-3-2.5h.01" /></svg>;
    case "transfer":
      return <svg {...common}><path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4" /></svg>;
    case "clock":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></svg>;
    case "shield":
      return <svg {...common}><path d="m12 3 8 3v6c0 5-8 9-8 9S4 17 4 12V6l8-3Z" /><path d="m8.5 12 2.5 2.5 4.5-5" /></svg>;
    case "chevron":
      return <svg {...common}><path d="m6 9 6 6 6-6" /></svg>;
    case "refresh":
      return <svg {...common}><path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" /></svg>;
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

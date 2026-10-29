import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { useNotifications } from "../../notifications";
import { NotificationsPanel } from "./NotificationsPanel";
import { ToastStack } from "./ToastStack";
import { Wordmark } from "./ui";

type NavKey = "overview" | "workspaces" | "settings";

interface NavItem {
  key: NavKey;
  label: string;
  to: string;
  badge?: ReactNode;
}

interface PortalShellProps {
  active: NavKey;
  children: ReactNode;
  workspaceCount?: number;
}

export function PortalShell({ active, children, workspaceCount }: PortalShellProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { notifications, togglePanel } = useNotifications();
  const unreadCount = notifications.length;

  const items: NavItem[] = [
    { key: "overview", label: "Overview", to: "/account" },
    {
      key: "workspaces",
      label: "Workspaces",
      to: "/workspaces",
      badge: workspaceCount ?? undefined,
    },
    { key: "settings", label: "Settings", to: "/account/settings" },
  ];

  async function handleSignOut() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: portal.canvas,
        fontFamily: portal.font,
        color: portal.ink,
        fontSize: 14,
        lineHeight: "20px",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          height: 56,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: "0 16px",
          borderBottom: `1px solid ${portal.border}`,
        }}
      >
        <Wordmark size="sm" />
        <input
          placeholder="Search workspaces, wards, agents"
          style={{
            flex: 1,
            maxWidth: 460,
            height: 32,
            boxSizing: "border-box",
            border: `1px solid ${portal.border}`,
            borderRadius: 8,
            padding: "0 12px",
            fontSize: 14,
            background: portal.canvasSubtle,
            color: portal.ink,
            fontFamily: "inherit",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Bell icon */}
          <button
            onClick={togglePanel}
            style={{ position: "relative", width: 32, height: 32, borderRadius: "50%", background: portal.neutral, border: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
            aria-label="Notifications"
          >
            <BellIcon />
            {unreadCount > 0 && (
              <span style={{ position: "absolute", top: 4, right: 4, width: 8, height: 8, borderRadius: "50%", background: portal.brand, border: `2px solid ${portal.canvas}` }} />
            )}
          </button>
          <Avatar initials={user?.initials ?? "··"} name={user?.name ?? ""} email={user?.email ?? ""} onSignOut={handleSignOut} />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", alignItems: "stretch", minHeight: 0 }}>
        <nav
          style={{
            width: 256,
            flexShrink: 0,
            background: portal.canvasSubtle,
            borderRight: `1px solid ${portal.border}`,
            padding: "16px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 16 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: portal.avatarDark,
                color: portal.inverse,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 13,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {user?.initials ?? "··"}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{user?.name ?? "Aspirant"}</div>
              <div style={{ fontSize: 12, color: portal.textSubtle }}>Aspirant account</div>
            </div>
          </div>

          {items.map((item) => (
            <NavLink key={item.key} item={item} active={item.key === active} />
          ))}
        </nav>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>

      <NotificationsPanel />
      <ToastStack />
    </div>
  );
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={item.to}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: 32,
        padding: "0 8px",
        borderRadius: 8,
        marginBottom: 2,
        textDecoration: "none",
        fontWeight: active ? 600 : 400,
        color: active ? portal.brandText : hover ? portal.ink : portal.label,
        background: active ? portal.brandSubtlest : hover ? portal.neutral : "transparent",
      }}
    >
      <span>{item.label}</span>
      {item.badge !== undefined && (
        <span style={{ fontSize: 12, color: active ? portal.brandText : portal.textSubtle }}>{item.badge}</span>
      )}
    </Link>
  );
}

function Avatar({ initials, name, email, onSignOut }: { initials: string; name: string; email: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: 32, height: 32, borderRadius: "50%", background: portal.brand, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, border: 0, cursor: "pointer", fontFamily: "inherit" }}
      >
        {initials}
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 49 }} />
          <div style={{ position: "absolute", top: 40, right: 0, background: portal.canvas, border: `1px solid ${portal.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", width: 300, zIndex: 50, overflow: "hidden" }}>
            {/* Sign out row */}
            <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 16px 0" }}>
              <button onClick={onSignOut} style={{ background: "none", border: 0, fontSize: 13, color: portal.brandText, cursor: "pointer", fontFamily: "inherit", fontWeight: 500, padding: 0 }}>
                Sign out
              </button>
            </div>
            {/* User card */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px 20px" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: portal.brand, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, flexShrink: 0 }}>
                {initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, color: portal.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
                <div style={{ fontSize: 13, color: portal.textSubtle, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{email}</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" fill={portal.label} />
    </svg>
  );
}

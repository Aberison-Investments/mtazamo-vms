import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { Wordmark } from "./ui";

type NavKey = "overview" | "workspaces" | "geography" | "settings";

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

  const items: NavItem[] = [
    { key: "overview", label: "Overview", to: "/account" },
    {
      key: "workspaces",
      label: "Workspaces",
      to: "/workspaces",
      badge: workspaceCount ?? undefined,
    },
    { key: "geography", label: "Geography", to: "/geography" },
    { key: "settings", label: "Settings", to: "/account/settings" },
  ];

  async function handleSignOut() {
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
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: portal.neutral,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              color: portal.label,
            }}
          >
            ?
          </span>
          <Avatar initials={user?.initials ?? "··"} onSignOut={handleSignOut} />
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

function Avatar({ initials, onSignOut }: { initials: string; onSignOut: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: portal.brand,
          color: portal.inverse,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 600,
          border: 0,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {initials}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: 40,
            right: 0,
            background: portal.canvas,
            border: `1px solid ${portal.border}`,
            borderRadius: 8,
            boxShadow: portal.cardShadow,
            minWidth: 140,
            zIndex: 50,
          }}
        >
          <button
            onClick={onSignOut}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "10px 14px",
              background: "transparent",
              border: 0,
              fontSize: 14,
              color: portal.ink,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}

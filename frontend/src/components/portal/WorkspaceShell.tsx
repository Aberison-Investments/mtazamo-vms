import { useState, useEffect, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { portal, seatLabel } from "../../portalTheme";
import { useAuth } from "../../auth";
import { api } from "../../api";
import { Wordmark } from "./ui";
import type { Workspace } from "../../api";

// Tier officer roles — these get a scoped view with fewer nav items
const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);

export type WorkspaceNavKey = "overview" | "candidates" | "agents" | "volunteers" | "managers" | "geography" | "warroom" | "settings" | "recruitment";

interface WorkspaceShellProps {
  workspace: Workspace;
  active: WorkspaceNavKey;
  children: ReactNode;
  managerCount?: number;
  myRole?: string;
  tierGeoScope?: string | null;
}

export function WorkspaceShell({ workspace, active, children, managerCount, myRole, tierGeoScope }: WorkspaceShellProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const badge = String(workspace.year).slice(-2);
  const location = workspace.ward ?? workspace.constituency ?? workspace.county ?? "";
  const seatLocationLine = [seatLabel(workspace.seat), location].filter(Boolean).join(" · ");
  const isTierOfficer = myRole ? TIER_ROLES.has(myRole) : false;
  const roleLabel = myRole ? roleLabelFor(myRole) : null;
  const scopeNote = tierGeoScope ? `You see ${tierGeoScope} only` : isTierOfficer ? "Scoped to your area" : null;
  const [tierCanInvite, setTierCanInvite] = useState(false);

  useEffect(() => {
    if (!isTierOfficer) return;
    api.getTierContext(workspace.id)
      .then((ctx) => setTierCanInvite(ctx.can_invite))
      .catch(() => {});
  }, [isTierOfficer, workspace.id]);

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
          placeholder="Search stations, agents, wards"
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
          {roleLabel && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 20,
                padding: "0 8px",
                borderRadius: 3,
                background: portal.brandSubtlest,
                color: portal.brandText,
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.3px",
                flexShrink: 0,
              }}
            >
              {roleLabel}
            </span>
          )}
          {!roleLabel && (
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
          )}
          <TopBarAvatar initials={user?.initials ?? "··"} onSignOut={handleSignOut} />
        </div>
      </div>

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
          {user?.is_aspirant && (
            <Link
              to="/workspaces"
              style={{
                display: "block",
                fontSize: 12,
                color: portal.textSubtle,
                textDecoration: "none",
                padding: "0 8px 8px",
              }}
            >
              ← All workspaces
            </Link>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 16 }}>
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: 5,
                background: portal.avatarDark,
                color: portal.inverse,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {badge}
            </span>
            <div style={{ minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {workspace.name}
              </div>
              <div style={{ fontSize: 12, color: portal.textSubtle }}>{seatLocationLine}</div>
            </div>
          </div>

          <NavItem to={`/workspaces/${workspace.id}`} active={active === "overview"} label="Overview" />
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/candidates`} active={active === "candidates"} label="Candidates" />
          )}
          <NavItem to={`/workspaces/${workspace.id}/agents`} active={active === "agents"} label="Agents" />
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/volunteers`} active={active === "volunteers"} label="Volunteers" />
          )}
          {!isTierOfficer && (
            <NavItem
              to={`/workspaces/${workspace.id}/managers`}
              active={active === "managers"}
              label="Campaign managers"
              badge={managerCount}
            />
          )}
          {(!isTierOfficer || tierCanInvite) && (
            <NavItem to={`/workspaces/${workspace.id}/recruitment`} active={active === "recruitment"} label="Recruitment" />
          )}
          <NavItem to={`/workspaces/${workspace.id}/geography`} active={active === "geography"} label="Geography" />
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/warroom`} active={active === "warroom"} label="War room" live />
          )}
          <NavItem to={`/workspaces/${workspace.id}/settings`} active={active === "settings"} label="Settings" />

          {scopeNote && (
            <>
              <div style={{ height: 1, background: portal.border, margin: "12px 8px" }} />
              <div style={{ padding: "0 8px", fontSize: 12, color: portal.textSubtlest, lineHeight: "17px" }}>
                {scopeNote}.
              </div>
            </>
          )}
        </nav>

        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>{children}</div>
      </div>
    </div>
  );
}

function NavItem({
  to,
  active,
  label,
  badge,
  live,
}: {
  to: string;
  active: boolean;
  label: string;
  badge?: number;
  live?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
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
      <span>{label}</span>
      {badge !== undefined && (
        <span style={{ fontSize: 12, color: active ? portal.brandText : portal.textSubtle }}>{badge}</span>
      )}
      {live && (
        <span
          style={{ width: 8, height: 8, borderRadius: "50%", background: portal.successBold, flexShrink: 0 }}
        />
      )}
    </Link>
  );
}

function TopBarAvatar({ initials, onSignOut }: { initials: string; onSignOut: () => void }) {
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

function roleLabelFor(role: string): string | null {
  const labels: Record<string, string> = {
    aspirant:         "Aspirant",
    campaign_manager: "Campaign manager",
    national:         "National officer",
    county:           "County officer",
    constituency:     "Constituency officer",
    ward:             "Ward admin",
  };
  return labels[role] ?? null;
}

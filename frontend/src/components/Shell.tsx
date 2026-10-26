import type { ReactNode } from "react";
import { colors } from "../theme";
import {
  MenuIcon,
  OverviewIcon,
  GeographyIcon,
  AgentsIcon,
  VolunteersIcon,
  VerificationIcon,
  WarRoomIcon,
  ExportsIcon,
} from "./icons";

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", label: "Overview", icon: <OverviewIcon /> },
  { key: "geography", label: "Geography", icon: <GeographyIcon /> },
  { key: "agents", label: "Agents", icon: <AgentsIcon /> },
  { key: "volunteers", label: "Volunteers", icon: <VolunteersIcon /> },
  { key: "verification", label: "Verification", icon: <VerificationIcon /> },
  { key: "warroom", label: "War room", icon: <WarRoomIcon /> },
  { key: "exports", label: "Exports and payments", icon: <ExportsIcon /> },
];

interface ShellProps {
  workspaceName: string;
  activeKey: string;
  children: ReactNode;
}

export function Shell({ workspaceName, activeKey, children }: ShellProps) {
  return (
    <div
      style={{
        height: "100vh",
        boxSizing: "border-box",
        background: colors.pageBg,
        display: "flex",
        flexDirection: "column",
        color: colors.textPrimary,
      }}
    >
      {/* Top bar */}
      <header
        style={{
          height: 48,
          flexShrink: 0,
          background: colors.headerBg,
          display: "flex",
          alignItems: "center",
          padding: "0 16px",
          gap: 16,
        }}
      >
        <button
          type="button"
          aria-label="Show portal menu"
          style={{
            width: 40,
            height: 40,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: 0,
            cursor: "pointer",
          }}
        >
          <MenuIcon />
        </button>
        <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "0.1em" }}>
          MTAZAMO
        </span>
        <div style={{ width: 1, height: 24, background: colors.headerDivider }} />
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <label htmlFor="segswitch" style={{ color: colors.headerLabel, fontSize: 12 }}>
            Segment
          </label>
          <select
            id="segswitch"
            style={{
              height: 30,
              boxSizing: "border-box",
              padding: "0 8px",
              fontSize: 13,
              fontFamily: "inherit",
              border: `1px solid ${colors.headerDivider}`,
              borderRadius: 2,
              background: colors.selectBg,
              color: "#fff",
            }}
          >
            <option>General election 2027</option>
            <option>Party primary</option>
          </select>
        </div>
        <div style={{ flexGrow: 1 }} />
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: "50%",
            background: colors.avatarBg,
            color: colors.headerBg,
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          AN
        </div>
      </header>

      {/* Body: sidebar + content */}
      <div style={{ flexGrow: 1, display: "flex", minHeight: 0 }}>
        <nav
          style={{
            width: 236,
            flexShrink: 0,
            background: colors.panelBg,
            borderRight: `1px solid ${colors.border}`,
            padding: "12px 0",
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <div style={{ padding: "4px 16px 12px 16px", fontSize: 13, fontWeight: 600, color: colors.textMuted }}>
            {workspaceName}
          </div>
          {NAV_ITEMS.map((item) => {
            const active = item.key === activeKey;
            return (
              <a
                key={item.key}
                href={`#${item.key}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 40,
                  padding: active ? "0 13px" : "0 16px",
                  fontSize: 14,
                  textDecoration: "none",
                  color: active ? colors.textPrimary : colors.textSecondary,
                  fontWeight: active ? 600 : 400,
                  background: active ? colors.selected : "transparent",
                  borderLeft: active ? `3px solid ${colors.accent}` : "3px solid transparent",
                }}
              >
                {item.icon}
                {item.label}
              </a>
            );
          })}
        </nav>

        <main style={{ flexGrow: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          {children}
        </main>
      </div>
    </div>
  );
}

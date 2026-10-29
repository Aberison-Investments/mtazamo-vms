import { useState, useEffect, useRef, type ReactNode } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { portal, seatLabel } from "../../portalTheme";
import { useAuth } from "../../auth";
import { api, type ElectionRun } from "../../api";
import { Wordmark } from "./ui";
import type { Workspace } from "../../api";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { ToastStack } from "./ToastStack";
import { useNotifications } from "../../notifications";

// Tier officer roles — scoped view with fewer nav items
const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);

export type WorkspaceNavKey = "overview" | "candidates" | "agents" | "volunteers" | "managers" | "geography" | "warroom" | "settings" | "recruitment" | "audit";

interface WorkspaceShellProps {
  workspace: Workspace;
  active: WorkspaceNavKey;
  children: ReactNode;
  managerCount?: number;
  myRole?: string;
}

// ---- nav icons ---------------------------------------------------------------

function Icon({ d, cx, cy, r, rect, path2 }: { d?: string; cx?: number; cy?: number; r?: number; rect?: boolean; path2?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      style={{ width: 15, height: 15, flexShrink: 0 }}>
      {d && <path d={d} />}
      {path2 && <path d={path2} />}
      {cx !== undefined && cy !== undefined && r !== undefined && <circle cx={cx} cy={cy} r={r} />}
      {rect && <><rect x="2" y="2" width="5" height="5" rx="1" /><rect x="9" y="2" width="5" height="5" rx="1" /><rect x="2" y="9" width="5" height="5" rx="1" /><rect x="9" y="9" width="5" height="5" rx="1" /></>}
    </svg>
  );
}

const NAV_ICONS: Record<WorkspaceNavKey, ReactNode> = {
  overview:    <Icon rect />,
  candidates:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><path d="M3 12h10M3 8h10M3 4h10" /></svg>,
  agents:      <Icon cx={8} cy={5.5} r={2.5} d="M3 14c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />,
  volunteers:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><circle cx="6" cy="6" r="2.2" /><circle cx="11.5" cy="6.5" r="1.8" /><path d="M2 13.5c.5-2.2 2-3.4 4-3.4s3.5 1.2 4 3.4" /><path d="M10.5 10.3c1.6 0 2.8.9 3.3 2.7" /></svg>,
  managers:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><rect x="2" y="5" width="12" height="8.5" rx="1.5" /><path d="M5.5 5V3.5h5V5" /></svg>,
  recruitment: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><circle cx="6.5" cy="5.5" r="2.5" /><path d="M2 14c.5-2.5 2.3-4 4.5-4s4 1.5 4.5 4" /><path d="M12.5 4v4M10.5 6h4" /></svg>,
  geography:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><path d="M8 14s4.5-4 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 10 8 14 8 14z" /><circle cx="8" cy="6.5" r="1.6" /></svg>,
  warroom:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><path d="M1.5 8h3l2-5 3 10 2-5h3" /></svg>,
  settings:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><circle cx="8" cy="8" r="2.2" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4" /></svg>,
  audit:       <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15, flexShrink: 0 }}><path d="M2 4h12M2 8h8M2 12h5" /><circle cx="12" cy="11" r="2.5" /><path d="M14 13l1.5 1.5" /></svg>,
};

// ---- run selector ------------------------------------------------------------

function RunSelector({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const { viewedRun, runs, setActiveRun, setViewedRun, refreshRuns } = useWorkspaceContext();
  const { add: addNotif, update: updateNotif } = useNotifications();
  const [open, setOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"live" | "rehearsal">("rehearsal");
  const [newDate, setNewDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmClose, setConfirmClose] = useState<ElectionRun | null>(null);
  const [confirmCreate, setConfirmCreate] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowForm(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleCreate() {
    if (!newName.trim() || creating) return;
    setConfirmCreate(false);
    setCreating(true);
    setError(null);
    setOpen(false);
    setShowForm(false);
    const label = newName.trim();
    const toastId = addNotif(`Creating run "${label}"…`, "loading");
    try {
      const res = await api.createRun(workspaceId, { name: label, type: newType, run_date: newDate || null });
      setActiveRun(res.run);
      setViewedRun(res.run);
      await refreshRuns();
      setNewName("");
      setNewDate("");
      updateNotif(toastId, `Run "${label}" is now active`, "success");
    } catch (e: unknown) {
      const err = e as { message?: string };
      const msg = err.message ?? "Failed to create run.";
      setError(msg);
      setOpen(true);
      setShowForm(true);
      updateNotif(toastId, msg, "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleActivate(run: ElectionRun) {
    try {
      const res = await api.updateRun(workspaceId, run.id, { action: "activate" });
      setActiveRun(res.run);
      setViewedRun(res.run);
      await refreshRuns();
    } catch { /* ignore */ }
    setOpen(false);
  }

  async function handleDeactivate(run: ElectionRun) {
    setConfirmClose(null);
    setOpen(false);
    const toastId = addNotif(`Closing run "${run.name}"…`, "loading");
    try {
      await api.updateRun(workspaceId, run.id, { action: "deactivate" });
      setActiveRun(null);
      await refreshRuns();
      updateNotif(toastId, `Run "${run.name}" has been permanently closed`, "success");
    } catch (e: unknown) {
      const err = e as { message?: string };
      updateNotif(toastId, err.message ?? "Failed to close run.", "error");
    }
  }

  // Pill reflects the viewed run, not necessarily the active one.
  const displayRun = viewedRun;
  const isViewingActive = displayRun && (displayRun.status === "open" || displayRun.status === "tallying");
  const pillBg = displayRun?.type === "live" && isViewingActive ? "#386271" : displayRun?.type === "live" ? "#5E7D89" : displayRun ? "#FFAB00" : "#F1F2F4";
  const pillFg = displayRun?.type === "live" ? "#FFFFFF" : displayRun ? "#172B4D" : "#44546F";
  const pillLabel = !displayRun ? "NO RUN" : isViewingActive ? (displayRun.type === "live" ? "LIVE" : "REHEARSAL") : "CLOSED";

  return (
    <div ref={dropRef} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen((o) => !o); setShowForm(false); }}
        style={{
          display: "inline-flex", alignItems: "center", gap: 7, height: 32, boxSizing: "border-box",
          padding: "0 10px 0 5px", border: `1px solid ${open ? portal.brandBorder : portal.border}`,
          borderRadius: 9999, background: portal.canvas, fontSize: 13, fontWeight: 500,
          color: portal.ink, cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "2px 6px",
          borderRadius: 9999, background: pillBg, color: pillFg,
        }}>{pillLabel}</span>
        {displayRun?.name ?? "No runs yet"}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14, color: portal.textSubtle }}><path d="M4 6l4 4 4-4" /></svg>
      </button>

      {open && (
        <div style={{
          position: "absolute", right: 0, top: 40, width: 380, background: portal.canvas,
          borderRadius: 12, boxShadow: portal.modalShadow, overflow: "hidden", zIndex: 60,
        }}>
          <div style={{ padding: "12px 14px 8px", fontSize: 12, fontWeight: 600, color: portal.textSubtle, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Runs in this workspace
          </div>

          {runs.map((r) => {
            const isActive = r.status === "open" || r.status === "tallying";
            const isViewed = viewedRun?.id === r.id;
            const badgeBg = r.type === "live" ? "#386271" : "#FFAB00";
            const badgeFg = r.type === "live" ? "#FFFFFF" : "#172B4D";
            const statusLabel = { open: "OPEN", tallying: "TALLYING", certified: "CLOSED", archived: "ARCHIVED" }[r.status] ?? r.status.toUpperCase();
            const statusFg = isActive ? "#386271" : "#626F86";
            return (
              <div
                key={r.id}
                onClick={() => { setViewedRun(r); setOpen(false); setShowForm(false); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid #F1F2F4", background: isViewed ? portal.brandSubtlest : isActive ? "#EEF6F8" : portal.canvas, opacity: r.status === "archived" ? 0.55 : 1, cursor: "pointer" }}
              >
                <span style={{ width: 14, flexShrink: 0, color: "#386271" }}>
                  {isViewed
                    ? <svg viewBox="0 0 16 16" fill="none" stroke="#386271" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><path d="M3 8.5l3 3 7-7" /></svg>
                    : isActive
                      ? <svg viewBox="0 0 16 16" fill="none" stroke="#22A06B" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 14, height: 14 }}><circle cx="8" cy="8" r="3" fill="#22A06B" /></svg>
                      : null}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: isActive || isViewed ? 600 : 400, color: portal.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</div>
                  <div style={{ fontSize: 11, color: portal.textSubtle, display: "flex", alignItems: "center", gap: 6, marginTop: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: badgeBg, color: badgeFg }}>{r.type === "live" ? "LIVE" : "REHEARSAL"}</span>
                    <span style={{ fontWeight: 700, color: statusFg }}>{statusLabel}</span>
                    {r.run_date && <span>{r.run_date}</span>}
                  </div>
                </div>
                {canManage && isActive && (
                  <button onClick={(e) => { e.stopPropagation(); setConfirmClose(r); }} style={{ flexShrink: 0, height: 26, padding: "0 8px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, fontSize: 11, fontWeight: 600, color: portal.label, cursor: "pointer", fontFamily: "inherit" }}>
                    Close
                  </button>
                )}
                {canManage && !isActive && r.closed_at === null && r.status !== "archived" && (
                  <button onClick={(e) => { e.stopPropagation(); handleActivate(r); }} style={{ flexShrink: 0, height: 26, padding: "0 8px", border: "none", borderRadius: 6, background: portal.brand, fontSize: 11, fontWeight: 600, color: portal.inverse, cursor: "pointer", fontFamily: "inherit" }}>
                    Open
                  </button>
                )}
                {!isActive && r.closed_at !== null && (
                  <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "#F1F2F4", color: "#626F86" }}>Closed</span>
                )}
              </div>
            );
          })}

          {canManage && (
            <div style={{ borderTop: `1px solid ${portal.border}` }}>
              {!showForm ? (
                <button onClick={() => setShowForm(true)} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", height: 44, padding: "0 14px", border: 0, background: portal.canvas, fontSize: 14, fontWeight: 600, color: portal.brandText, cursor: "pointer", fontFamily: "inherit" }}>
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 15, height: 15 }}><path d="M8 3v10M3 8h10" /></svg>
                  New run
                </button>
              ) : (
                <div style={{ padding: 14, background: portal.canvasSubtle, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>New run</div>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: portal.label }}>
                    Run name
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rehearsal 1 — full dry run" style={{ height: 36, boxSizing: "border-box", padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, fontFamily: "inherit", fontSize: 14, fontWeight: 400, color: portal.ink }} />
                  </label>
                  <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12, fontWeight: 600, color: portal.label }}>
                    Run date (optional)
                    <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} style={{ height: 36, boxSizing: "border-box", padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, fontFamily: "inherit", fontSize: 14, color: portal.ink }} />
                  </label>
                  <div role="radiogroup" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, padding: 3, borderRadius: 8, background: portal.neutral }}>
                    {(["live", "rehearsal"] as const).map((t) => (
                      <button key={t} type="button" role="radio" aria-checked={newType === t} onClick={() => setNewType(t)}
                        style={{ height: 32, border: 0, borderRadius: 6, background: newType === t ? portal.canvas : "transparent", boxShadow: newType === t ? "0 1px 1px rgba(9,30,66,0.25)" : "none", fontSize: 13, fontWeight: 600, color: portal.ink, cursor: "pointer", fontFamily: "inherit", textTransform: "capitalize" }}>
                        {t}
                      </button>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>
                    {newType === "live" ? "Live runs feed the real tally. Only one live run can be open at a time." : "Rehearsal data is kept separate and never mixes with the live tally."}
                  </div>
                  {error && <div style={{ fontSize: 12, color: "#BF2600" }}>{error}</div>}
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button onClick={() => { setShowForm(false); setError(null); }} style={{ height: 36, padding: "0 12px", border: 0, borderRadius: 6, background: "transparent", color: portal.label, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                    <button onClick={() => { if (newName.trim() && !creating) setConfirmCreate(true); }} disabled={!newName.trim() || creating} style={{ height: 36, padding: "0 14px", border: 0, borderRadius: 6, background: !newName.trim() || creating ? portal.neutral : portal.brand, color: !newName.trim() || creating ? portal.textSubtle : portal.inverse, fontSize: 13, fontWeight: 600, cursor: !newName.trim() || creating ? "default" : "pointer", fontFamily: "inherit" }}>
                      Create run
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Create run confirmation modal */}
      {confirmCreate && (
        <>
          <div onClick={() => setConfirmCreate(false)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", zIndex: 99 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: portal.canvas, borderRadius: 14, boxShadow: portal.modalShadow, padding: "28px 24px", width: "100%", maxWidth: 420, zIndex: 100 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: portal.brandSubtlest, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke={portal.brandText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M1.5 8h3l2-5 3 10 2-5h3" />
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Create this run?</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: portal.ink, marginBottom: 4 }}>{newName.trim()}</div>
            <div style={{ fontSize: 13, color: portal.label, lineHeight: "20px", marginBottom: 6 }}>
              Type: <strong style={{ textTransform: "capitalize" }}>{newType}</strong>
              {newDate && <> · Date: <strong>{newDate}</strong></>}
            </div>
            <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "20px", marginBottom: 24 }}>
              {newType === "live"
                ? "This will open a live run. Agents will be able to submit results immediately."
                : "This will open a rehearsal run. Data is kept separate from the live tally."}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmCreate(false)} style={{ flex: 1, height: 42, border: "none", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleCreate} style={{ flex: 2, height: 42, border: "none", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Create run
              </button>
            </div>
          </div>
        </>
      )}

      {/* Permanent close confirmation modal */}
      {confirmClose && (
        <>
          <div onClick={() => setConfirmClose(null)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", zIndex: 99 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: portal.canvas, borderRadius: 14, boxShadow: portal.modalShadow, padding: "28px 24px", width: "100%", maxWidth: 420, zIndex: 100 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#FFD5CC", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke="#AE2A19" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M8 3v5M8 11v1" />
                <path d="M3.5 14h9l-4.5-11L3.5 14z" />
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Close this run permanently?</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: portal.ink, marginBottom: 4 }}>{confirmClose.name}</div>
            <div style={{ fontSize: 13, color: portal.label, lineHeight: "20px", marginBottom: 24 }}>
              Once closed, this run cannot be reopened. War room access for agents will be disabled. Results already submitted remain intact.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmClose(null)} style={{ flex: 1, height: 42, border: "none", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={() => handleDeactivate(confirmClose)} style={{ flex: 2, height: 42, border: "none", borderRadius: 8, background: "#AE2A19", color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Close run permanently
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- main shell --------------------------------------------------------------

export function WorkspaceShell({ workspace, active, children, managerCount, myRole }: WorkspaceShellProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeRun } = useWorkspaceContext();
  const recruitmentTab = new URLSearchParams(location.search).get("tab") ?? "public";
  const badge = String(workspace.year).slice(-2);
  const geoLocation = workspace.ward ?? workspace.constituency ?? workspace.county ?? "";
  const seatLocationLine = [seatLabel(workspace.seat), geoLocation].filter(Boolean).join(" · ");
  const isTierOfficer = myRole ? TIER_ROLES.has(myRole) : false;
  const roleLabel = myRole ? roleLabelFor(myRole) : null;
  const [tierCanInvite, setTierCanInvite] = useState(false);
  const [tierGeoScope, setTierGeoScope] = useState<string | null>(null);
  const scopeNote = tierGeoScope ? `You see ${tierGeoScope} only` : isTierOfficer ? "Scoped to your area" : null;

  // Collapsible sidebar state
  const [collapsed, setCollapsed] = useState(false);

  const canManageRuns = myRole === "aspirant" || myRole === "campaign_manager";
  // Aspirant, CM, and area tier officers always see the war room (read-only when no run is active).
  // Polling agents (role="agent") only see it when a run is active.
  const showWarRoom = canManageRuns || isTierOfficer || (!!activeRun && myRole === "agent");

  useEffect(() => {
    if (!isTierOfficer) return;
    api.getTierContext(workspace.id)
      .then((ctx) => {
        setTierCanInvite(ctx.can_invite);
        setTierGeoScope(ctx.geo_scope ?? null);
      })
      .catch(() => {});
  }, [isTierOfficer, workspace.id]);

  async function handleSignOut() {
    if (!window.confirm("Are you sure you want to log out?")) return;
    await signOut();
    navigate("/login", { replace: true });
  }

  const SIDEBAR_FULL = 232;
  const SIDEBAR_RAIL = 52;
  const sidebarW = collapsed ? SIDEBAR_RAIL : SIDEBAR_FULL;

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column", background: portal.canvas, fontFamily: portal.font, color: portal.ink, fontSize: 14, lineHeight: "20px" }}>
      {/* Top bar */}
      <div style={{ height: 56, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "0 16px", borderBottom: `1px solid ${portal.border}`, background: portal.canvas }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            style={{ width: 30, height: 30, border: 0, borderRadius: 6, background: "transparent", color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 16, height: 16 }}>
              {collapsed
                ? <><path d="M2 4h12M2 8h12M2 12h12" /></>
                : <><path d="M2 4h12M2 8h8M2 12h12" /></>}
            </svg>
          </button>
          {!collapsed && <Wordmark size="sm" />}
        </div>

        <input
          placeholder="Search stations, agents, wards"
          style={{ flex: 1, maxWidth: 460, height: 32, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 12px", fontSize: 14, background: portal.canvasSubtle, color: portal.ink, fontFamily: "inherit" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Run selector — shown in header for CM/aspirant and in warroom for all */}
          {(canManageRuns || active === "warroom") && (
            <RunSelector workspaceId={workspace.id} canManage={canManageRuns} />
          )}
          {roleLabel && (
            <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: portal.brandSubtlest, color: portal.brandText, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>
              {roleLabel}
            </span>
          )}
          <TopBarAvatar initials={user?.initials ?? "··"} name={user?.name ?? ""} email={user?.email ?? ""} onSignOut={handleSignOut} />
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", alignItems: "stretch", minHeight: 0, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav
          style={{
            width: sidebarW, flexShrink: 0, background: portal.canvasSubtle,
            borderRight: `1px solid ${portal.border}`, padding: collapsed ? "12px 6px" : "16px 12px",
            transition: "width 180ms ease-out, padding 180ms ease-out",
            overflow: "hidden",
          }}
        >
          {!collapsed && user?.is_aspirant && (
            <Link to="/workspaces" style={{ display: "block", fontSize: 12, color: portal.textSubtle, textDecoration: "none", padding: "0 8px 8px" }}>
              ← All workspaces
            </Link>
          )}

          {!collapsed ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, marginBottom: 16 }}>
              <span style={{ width: 32, height: 32, borderRadius: 5, background: portal.avatarDark, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                {badge}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{workspace.name}</div>
                <div style={{ fontSize: 12, color: portal.textSubtle }}>{seatLocationLine}</div>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <span style={{ width: 32, height: 32, borderRadius: 5, background: portal.avatarDark, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                {badge}
              </span>
            </div>
          )}

          <NavItem to={`/workspaces/${workspace.id}`}           active={active === "overview"}    label="Overview"          icon={NAV_ICONS.overview}    collapsed={collapsed} />
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/candidates`} active={active === "candidates"} label="Candidates" icon={NAV_ICONS.candidates} collapsed={collapsed} />
          )}
          <NavItem to={`/workspaces/${workspace.id}/agents`}    active={active === "agents"}      label="Agents"            icon={NAV_ICONS.agents}      collapsed={collapsed} />
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/volunteers`} active={active === "volunteers"} label="Volunteers"       icon={NAV_ICONS.volunteers}  collapsed={collapsed} />
          )}
          {!isTierOfficer && (
            <NavItem to={`/workspaces/${workspace.id}/managers`} active={active === "managers"}   label="Campaign managers"  icon={NAV_ICONS.managers}    collapsed={collapsed} badge={!collapsed ? managerCount : undefined} />
          )}
          {(!isTierOfficer || tierCanInvite) && (
            <NavItem to={`/workspaces/${workspace.id}/recruitment`} active={active === "recruitment"} label="Recruitment"   icon={NAV_ICONS.recruitment} collapsed={collapsed} />
          )}
          {active === "recruitment" && !collapsed && (
            <div style={{ marginLeft: 24, marginTop: -2, marginBottom: 4 }}>
              <SubNavLink to={`/workspaces/${workspace.id}/recruitment?tab=public`}   label="Public links"     active={recruitmentTab === "public"} />
              <SubNavLink to={`/workspaces/${workspace.id}/recruitment?tab=targeted`} label="Targeted invites" active={recruitmentTab === "targeted"} />
            </div>
          )}
          <NavItem to={`/workspaces/${workspace.id}/geography`} active={active === "geography"}   label="Geography"         icon={NAV_ICONS.geography}   collapsed={collapsed} />
          {showWarRoom && (
            <NavItem to={`/workspaces/${workspace.id}/warroom`} active={active === "warroom"} label="War room" icon={NAV_ICONS.warroom} collapsed={collapsed} live={!!activeRun} />
          )}
          <NavItem to={`/workspaces/${workspace.id}/audit`}     active={active === "audit"}       label="Audit log"         icon={NAV_ICONS.audit}       collapsed={collapsed} />
          <NavItem to={`/workspaces/${workspace.id}/settings`}  active={active === "settings"}    label="Settings"          icon={NAV_ICONS.settings}    collapsed={collapsed} />

          {!collapsed && scopeNote && (
            <>
              <div style={{ height: 1, background: portal.border, margin: "12px 8px" }} />
              <div style={{ padding: "0 8px", fontSize: 12, color: portal.textSubtlest, lineHeight: "17px" }}>{scopeNote}.</div>
            </>
          )}
        </nav>

        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>{children}</div>
      </div>
      <ToastStack />
    </div>
  );
}

// ---- NavItem -----------------------------------------------------------------

function NavItem({ to, active, label, icon, badge, live, collapsed }: {
  to: string; active: boolean; label: string; icon: ReactNode;
  badge?: number; live?: boolean; collapsed: boolean;
}) {
  const [hover, setHover] = useState(false);
  const content = (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between",
        height: 34, padding: collapsed ? 0 : "0 8px", borderRadius: 8, marginBottom: 2,
        textDecoration: "none", fontWeight: active ? 600 : 400,
        color: active ? portal.brandText : hover ? portal.ink : portal.label,
        background: active ? portal.brandSubtlest : hover ? portal.neutral : "transparent",
        gap: collapsed ? 0 : 8,
      }}
    >
      {icon}
      {!collapsed && <span style={{ flex: 1 }}>{label}</span>}
      {!collapsed && badge !== undefined && (
        <span style={{ fontSize: 12, color: active ? portal.brandText : portal.textSubtle }}>{badge}</span>
      )}
      {!collapsed && live && (
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: portal.successBold, flexShrink: 0 }} />
      )}
    </Link>
  );
  return content;
}

// ---- SubNavLink --------------------------------------------------------------

function SubNavLink({ to, label, active }: { to: string; label: string; active: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      to={to}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px 0 4px", borderRadius: 6, marginBottom: 1, textDecoration: "none", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? portal.brandText : hover ? portal.ink : portal.label, background: active ? portal.brandSubtlest : hover ? portal.neutral : "transparent" }}
    >
      <span style={{ width: 2, height: 12, background: active ? portal.brand : portal.border, borderRadius: 1, flexShrink: 0 }} />
      {label}
    </Link>
  );
}

// ---- TopBarAvatar ------------------------------------------------------------

function TopBarAvatar({ initials, name, email, onSignOut }: { initials: string; name: string; email: string; onSignOut: () => void }) {
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

// ---- helpers -----------------------------------------------------------------

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

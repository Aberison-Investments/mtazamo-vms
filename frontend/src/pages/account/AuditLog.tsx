import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type AuditLogEntry } from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

// ---- action label map -------------------------------------------------------

const ACTION_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "auth.login":                  { label: "Logged in",           color: "#44546F", bg: "#F1F2F4" },
  "auth.logout":                 { label: "Logged out",          color: "#44546F", bg: "#F1F2F4" },
  "auth.token_refreshed":        { label: "Session refreshed",   color: "#44546F", bg: "#F1F2F4" },
  "auth.session_revoked":        { label: "Session revoked",     color: "#AE2A19", bg: "#FFECEB" },
  "auth.all_sessions_revoked":   { label: "All sessions revoked",color: "#AE2A19", bg: "#FFECEB" },
  "agent.approved":              { label: "Agent approved",      color: "#164B35", bg: "#E3FCEF" },
  "agent.rejected":              { label: "Agent rejected",      color: "#AE2A19", bg: "#FFECEB" },
  "agent.bulk_approved":         { label: "Bulk approved",       color: "#164B35", bg: "#E3FCEF" },
  "agent.deployed":              { label: "Agent deployed",      color: "#164B35", bg: "#E3FCEF" },
  "result.submitted":            { label: "Result submitted",    color: "#1D5C7A", bg: "#D7EAEF" },
  "result.resubmitted":          { label: "Result resubmitted",  color: "#1D5C7A", bg: "#D7EAEF" },
  "result.verified":             { label: "Result verified",     color: "#164B35", bg: "#E3FCEF" },
  "result.queried":              { label: "Query raised",        color: "#7F5F01", bg: "#FFF7D6" },
  "run.created":                 { label: "Run created",         color: "#294854", bg: "#D7EAEF" },
  "run.activate":                { label: "Run opened",          color: "#164B35", bg: "#E3FCEF" },
  "run.deactivate":              { label: "Run closed",          color: "#7F5F01", bg: "#FFF7D6" },
  "run.certify":                 { label: "Run certified",       color: "#164B35", bg: "#E3FCEF" },
  "run.archive":                 { label: "Run archived",        color: "#44546F", bg: "#F1F2F4" },
  "manager.invited":             { label: "Manager invited",     color: "#294854", bg: "#D7EAEF" },
  "manager.removed":             { label: "Manager removed",     color: "#AE2A19", bg: "#FFECEB" },
  "candidates.saved":            { label: "Candidates saved",    color: "#44546F", bg: "#F1F2F4" },
  "candidates.published":        { label: "Candidates published",color: "#164B35", bg: "#E3FCEF" },
  "delegation.updated":          { label: "Permissions updated", color: "#7F5F01", bg: "#FFF7D6" },
  "recruitment.invite_sent":     { label: "Invite sent",         color: "#294854", bg: "#D7EAEF" },
  "recruitment.link_opened":     { label: "Link opened",         color: "#164B35", bg: "#E3FCEF" },
  "recruitment.link_closed":     { label: "Link closed",         color: "#7F5F01", bg: "#FFF7D6" },
  "recruitment.link_regenerated":{ label: "Link regenerated",    color: "#7F5F01", bg: "#FFF7D6" },
};

function actionChip(action: string) {
  const meta = ACTION_LABELS[action];
  if (meta) return meta;
  // Fallback for any unlisted action
  return { label: action.replace(".", " · "), color: "#44546F", bg: "#F1F2F4" };
}

function roleLabel(role: string | null): string {
  const map: Record<string, string> = {
    aspirant: "Aspirant", campaign_manager: "Campaign manager",
    national: "National officer", county: "County officer",
    constituency: "Constituency officer", ward: "Ward admin",
    agent: "Polling agent", volunteer: "Volunteer",
  };
  return role ? (map[role] ?? role) : "—";
}

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)  return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ---- component ---------------------------------------------------------------

export function AuditLog() {
  const { id } = useParams<{ id: string }>();
  const { myRole } = useWorkspaceContext();

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getAuditLogs(id, actionFilter ? { action: actionFilter } : undefined)
      .then((r) => setLogs(r.logs))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id, actionFilter]);

  const isCMOrAspirant = myRole === "aspirant" || myRole === "campaign_manager";

  const ACTION_GROUPS = [
    { label: "Results", prefix: "result" },
    { label: "Runs", prefix: "run" },
    { label: "Agents", prefix: "agent" },
    { label: "Recruitment", prefix: "recruitment" },
    { label: "Managers", prefix: "manager" },
    { label: "Candidates", prefix: "candidates" },
    { label: "Delegation", prefix: "delegation" },
  ];

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", overflowY: "auto" }}>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Audit log</h1>
        <p style={{ margin: 0, fontSize: 14, color: portal.textSubtle }}>
          {isCMOrAspirant
            ? "Every action taken in this workspace, across all users."
            : "Actions you can see based on your role and geographic scope."}
        </p>
      </div>

      {/* Filter bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
        <button
          onClick={() => setActionFilter("")}
          style={filterBtn(actionFilter === "")}
        >
          All actions
        </button>
        {ACTION_GROUPS.map((g) => (
          <button
            key={g.prefix}
            onClick={() => setActionFilter(actionFilter === g.prefix ? "" : g.prefix)}
            style={filterBtn(actionFilter === g.prefix)}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Log table */}
      <div style={{ background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
        {/* Column headers */}
        <div style={{
          display: "grid",
          gridTemplateColumns: "180px 1fr 160px 130px 120px",
          padding: "10px 16px",
          background: portal.canvasSubtle,
          borderBottom: `1px solid ${portal.border}`,
          fontSize: 11, fontWeight: 700, letterSpacing: "0.05em",
          textTransform: "uppercase", color: portal.textSubtle,
        }}>
          <span>Action</span>
          <span>Who / What</span>
          <span>Role</span>
          <span>IP address</span>
          <span style={{ textAlign: "right" }}>When</span>
        </div>

        {loading && (
          <div style={{ padding: "24px 16px", color: portal.textSubtle, fontSize: 14 }}>Loading…</div>
        )}

        {!loading && logs.length === 0 && (
          <div style={{ padding: "32px 16px", textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>
            No log entries {actionFilter ? `for "${actionFilter}"` : "yet"}.
          </div>
        )}

        {logs.map((log) => {
          const chip = actionChip(log.action);
          const isExpanded = expandedId === log.id;
          const hasContext = log.context && Object.keys(log.context).length > 0;

          return (
            <div key={log.id}>
              <div
                onClick={() => hasContext && setExpandedId(isExpanded ? null : log.id)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "180px 1fr 160px 130px 120px",
                  padding: "12px 16px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                  alignItems: "center",
                  cursor: hasContext ? "pointer" : "default",
                  background: isExpanded ? portal.brandSubtlest : portal.canvas,
                }}
                onMouseEnter={(e) => {
                  if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle;
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLDivElement).style.background = isExpanded ? portal.brandSubtlest : portal.canvas;
                }}
              >
                {/* Action chip */}
                <div>
                  <span style={{
                    display: "inline-flex", alignItems: "center", height: 20,
                    padding: "0 8px", borderRadius: 3, fontSize: 11, fontWeight: 700,
                    background: chip.bg, color: chip.color,
                    textTransform: "uppercase", letterSpacing: "0.3px",
                  }}>
                    {chip.label}
                  </span>
                </div>

                {/* Actor + entity */}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: portal.ink }}>
                    {log.actor?.name ?? "System"}
                  </div>
                  {log.entity_label && (
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 1 }}>
                      {log.entity_label}
                    </div>
                  )}
                </div>

                {/* Role */}
                <div style={{ fontSize: 13, color: portal.label }}>
                  {roleLabel(log.actor_role)}
                </div>

                {/* IP */}
                <div style={{ fontSize: 12, color: portal.textSubtle, fontFamily: "monospace" }}>
                  {log.ip_address ?? "—"}
                </div>

                {/* Time */}
                <div style={{ textAlign: "right" }}>
                  <span
                    title={absoluteTime(log.created_at)}
                    style={{ fontSize: 12, color: portal.textSubtle }}
                  >
                    {relativeTime(log.created_at)}
                  </span>
                  {hasContext && (
                    <span style={{ marginLeft: 6, fontSize: 10, color: portal.textSubtlest }}>
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  )}
                </div>
              </div>

              {/* Expanded context row */}
              {isExpanded && log.context && (
                <div style={{
                  padding: "12px 16px 14px 196px",
                  background: "#F5FAFB",
                  borderBottom: `1px solid ${portal.border}`,
                }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: portal.textSubtle, marginBottom: 8 }}>
                    Detail
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 24px" }}>
                    {Object.entries(log.context).map(([k, v]) => (
                      <div key={k} style={{ fontSize: 13 }}>
                        <span style={{ color: portal.textSubtle }}>{k.replace(/_/g, " ")}: </span>
                        <span style={{ fontWeight: 500, color: portal.ink, fontFamily: typeof v === "string" && v.length > 30 ? "monospace" : "inherit", fontSize: typeof v === "string" && v.length > 30 ? 12 : 13 }}>
                          {v == null ? "—" : String(v)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Footer */}
        {!loading && logs.length > 0 && (
          <div style={{ padding: "10px 16px", borderTop: `1px solid ${portal.border}`, fontSize: 12, color: portal.textSubtle, display: "flex", justifyContent: "space-between" }}>
            <span>Showing {logs.length} most recent entries</span>
            <span>Click a row to expand details · Hover timestamps to see exact time</span>
          </div>
        )}
      </div>
    </div>
  );
}

function filterBtn(active: boolean): React.CSSProperties {
  return {
    height: 30, padding: "0 12px", border: "none", borderRadius: 6,
    background: active ? portal.brand : portal.neutral,
    color: active ? portal.inverse : portal.label,
    fontSize: 13, fontWeight: active ? 600 : 400,
    cursor: "pointer", fontFamily: "inherit",
  };
}

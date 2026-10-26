import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Workspace } from "../../api";
import { portal, geoScopeLabel, seatLabel, segmentLabel } from "../../portalTheme";
import { PortalShell } from "../../components/portal/PortalShell";

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWorkspaces()
      .then(({ workspaces }) => setWorkspaces(workspaces))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load workspaces."));
  }, []);

  return (
    <PortalShell active="workspaces" workspaceCount={workspaces?.length}>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>Account / Workspaces</div>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>Workspaces</div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              One workspace per election you contest. Data never crosses between them.
            </div>
          </div>
          <CreateButton />
        </div>

        {error && <div style={{ color: portal.dangerText, fontSize: 14 }}>{error}</div>}

        {workspaces && workspaces.length === 0 && <EmptyState />}

        {workspaces?.map((w) => (
          <WorkspaceCard key={w.id} workspace={w} />
        ))}
      </div>
    </PortalShell>
  );
}

function CreateButton() {
  return (
    <Link
      to="/workspaces/new"
      style={{
        display: "flex",
        alignItems: "center",
        height: 32,
        padding: "0 12px",
        borderRadius: 8,
        background: portal.brand,
        color: portal.inverse,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        flexShrink: 0,
      }}
    >
      Create workspace
    </Link>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        border: `1px dashed ${portal.border}`,
        borderRadius: 8,
        padding: "40px 24px",
        textAlign: "center",
        color: portal.textSubtle,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: portal.ink, marginBottom: 6 }}>
        No workspaces yet
      </div>
      <div style={{ fontSize: 14, marginBottom: 16 }}>
        Create your first workspace to start preparing for an election.
      </div>
      <Link to="/workspaces/new" style={{ color: portal.brandText, fontWeight: 500, textDecoration: "none" }}>
        Create a workspace →
      </Link>
    </div>
  );
}

function WorkspaceCard({ workspace: w }: { workspace: Workspace }) {
  const active = w.status === "active";
  const scopeLabel = geoScopeLabel(w);
  const badge = String(w.year).slice(-2);
  return (
    <div
      style={{
        border: `1px solid ${portal.border}`,
        borderRadius: 8,
        background: portal.canvas,
        boxShadow: portal.cardShadow,
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "18px 20px",
          borderBottom: `1px solid ${portal.borderSubtle}`,
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            background: active ? portal.avatarDark : portal.textSubtle,
            color: portal.inverse,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 13,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {badge}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{w.name}</span>
            <StatusTag active={active} />
          </div>
          <div style={{ fontSize: 13, color: portal.textSubtle }}>
            {seatLabel(w.seat)} · {segmentLabel(w.segment)} · {scopeLabel}
            {w.party ? ` · ${w.party}` : ""}
          </div>
        </div>
        <Link
          to={`/workspaces/${w.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            height: 32,
            padding: "0 14px",
            borderRadius: 8,
            background: portal.brand,
            color: portal.inverse,
            fontSize: 14,
            fontWeight: 500,
            textDecoration: "none",
            flexShrink: 0,
          }}
        >
          Open
        </Link>
      </div>
      <div style={{ display: "flex", gap: 32, padding: "14px 20px" }}>
        <Stat label="Segment" value={segmentLabel(w.segment)} />
        <Stat label="Scope" value={w.scope.charAt(0).toUpperCase() + w.scope.slice(1)} />
        <Stat label="Election day" value={w.election_date ? formatElectionDate(w.election_date) : String(w.year)} />
      </div>
    </div>
  );
}

// "2027-08-09" → "9 Aug 2027". Parsed as a plain date (no timezone shift).
function formatElectionDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: portal.textSubtle }}>{label}</div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

function StatusTag({ active }: { active: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 3,
        background: active ? portal.brandSubtlest : portal.neutral,
        color: active ? portal.brandText : portal.textSubtle,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
      }}
    >
      {active ? "Active" : "Closed"}
    </span>
  );
}

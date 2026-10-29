import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Workspace } from "../../api";
import { portal, geoScopeLabel, seatLabel, segmentLabel } from "../../portalTheme";
import { PortalShell } from "../../components/portal/PortalShell";
import { WorkspaceFormBody } from "../../components/portal/WorkspaceFormBody";
import { useNotifications } from "../../notifications";

export function Workspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { add, update } = useNotifications();

  function loadWorkspaces() {
    api.listWorkspaces()
      .then(({ workspaces }) => setWorkspaces(workspaces))
      .catch((e) => setError(e instanceof Error ? e.message : "Could not load workspaces."));
  }

  useEffect(() => { loadWorkspaces(); }, []);

  async function handleSuccess(name: string) {
    setDrawerOpen(false);
    const id = add(`Creating workspace "${name}"…`, "loading");
    await new Promise((r) => setTimeout(r, 600)); // let the toast appear before reload
    loadWorkspaces();
    update(id, `Workspace "${name}" created`, "success");
  }

  return (
    <PortalShell active="workspaces" workspaceCount={workspaces?.length}>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>Account / Workspaces</div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>Workspaces</div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>One workspace per election you contest. Data never crosses between them.</div>
          </div>
          <button
            onClick={() => setDrawerOpen(true)}
            style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, border: 0, cursor: "pointer", flexShrink: 0 }}
          >
            Create workspace
          </button>
        </div>

        {error && <div style={{ color: portal.dangerText, fontSize: 14 }}>{error}</div>}
        {workspaces && workspaces.length === 0 && <EmptyState onOpen={() => setDrawerOpen(true)} />}
        {workspaces?.map((w) => <WorkspaceCard key={w.id} workspace={w} />)}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div onClick={() => setDrawerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.25)", zIndex: 299 }} />
          <div style={{
            position: "fixed", top: 0, right: 0, bottom: 0,
            width: 520,
            background: portal.canvas,
            borderLeft: `1px solid ${portal.border}`,
            boxShadow: "-8px 0 24px rgba(9,30,66,0.15)",
            zIndex: 300,
            display: "flex", flexDirection: "column",
            animation: "mtazamo-slide-in-right 0.22s ease",
          }}>
            {/* Drawer header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: `1px solid ${portal.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: portal.ink }}>Create workspace</span>
              <button onClick={() => setDrawerOpen(false)} style={{ background: "none", border: 0, cursor: "pointer", color: portal.textSubtle, fontSize: 22, lineHeight: 1, padding: 0 }}>×</button>
            </div>
            {/* Drawer body */}
            <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
              <WorkspaceFormBody
                onSuccess={handleSuccess}
                onCancel={() => setDrawerOpen(false)}
                cancelLabel="Discard"
              />
            </div>
          </div>
        </>
      )}
    </PortalShell>
  );
}

function EmptyState({ onOpen }: { onOpen: () => void }) {
  return (
    <div style={{ border: `1px dashed ${portal.border}`, borderRadius: 8, padding: "40px 24px", textAlign: "center", color: portal.textSubtle }}>
      <div style={{ fontSize: 16, fontWeight: 600, color: portal.ink, marginBottom: 6 }}>No workspaces yet</div>
      <div style={{ fontSize: 14, marginBottom: 16 }}>Create your first workspace to start preparing for an election.</div>
      <button onClick={onOpen} style={{ background: "none", border: 0, color: portal.brandText, fontWeight: 500, cursor: "pointer", fontSize: 14 }}>
        Create a workspace →
      </button>
    </div>
  );
}

function WorkspaceCard({ workspace: w }: { workspace: Workspace }) {
  const active = w.status === "active";
  const scopeLabel = geoScopeLabel(w);
  const badge = String(w.year).slice(-2);
  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, boxShadow: portal.cardShadow, marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
        <span style={{ width: 40, height: 40, borderRadius: 8, background: active ? portal.avatarDark : portal.textSubtle, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
          {badge}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>{w.name}</span>
            <StatusTag active={active} />
          </div>
          <div style={{ fontSize: 13, color: portal.textSubtle }}>
            {seatLabel(w.seat)} · {segmentLabel(w.segment)} · {scopeLabel}{w.party ? ` · ${w.party}` : ""}
          </div>
        </div>
        <Link to={`/workspaces/${w.id}`} style={{ display: "flex", alignItems: "center", height: 32, padding: "0 14px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, textDecoration: "none", flexShrink: 0 }}>
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

function formatElectionDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d} ${months[m - 1]} ${y}`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div><div style={{ fontSize: 12, color: portal.textSubtle }}>{label}</div><div style={{ fontSize: 14, fontWeight: 600 }}>{value}</div></div>;
}

function StatusTag({ active }: { active: boolean }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: active ? portal.brandSubtlest : portal.neutral, color: active ? portal.brandText : portal.textSubtle, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
      {active ? "Active" : "Closed"}
    </span>
  );
}

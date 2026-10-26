import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  api,
  type AssignedStation,
  type AssignedWardSummary,
  type BenchAgent,
  type Workspace,
} from "../../api";
import { portal } from "../../portalTheme";
import { WorkspaceShell } from "../../components/portal/WorkspaceShell";

// ---- tiny helpers -----------------------------------------------------------

function tag(tone: "green" | "amber" | "red" | "grey") {
  const tones = {
    green: { bg: "#E3FCEF", color: "#164B35" },
    amber: { bg: "#FFF7D6", color: "#974F0C" },
    red:   { bg: "#FFECEB", color: "#AE2A19" },
    grey:  { bg: portal.neutral, color: portal.label },
  };
  const t = tones[tone];
  return {
    display: "inline-flex", alignItems: "center",
    height: 20, padding: "0 8px", borderRadius: 3,
    fontSize: 11, fontWeight: 700,
    textTransform: "uppercase" as const, letterSpacing: "0.3px",
    whiteSpace: "nowrap" as const, flexShrink: 0,
    background: t.bg, color: t.color,
  };
}

function stationTone(state: AssignedStation["state"]): "green" | "amber" | "red" {
  return state === "assigned" ? "green" : state === "pending" ? "amber" : "red";
}

function stationTagLabel(state: AssignedStation["state"]) {
  return state === "assigned" ? "Confirmed" : state === "pending" ? "Invite sent" : "Uncovered";
}

// ---- Ward list panel --------------------------------------------------------

function WardList({
  wards,
  selectedId,
  onSelect,
}: {
  wards: AssignedWardSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      style={{
        width: 200, flexShrink: 0, overflowY: "auto",
        border: `1px solid ${portal.border}`, borderRadius: 8,
        padding: 8, boxShadow: portal.cardShadow, boxSizing: "border-box",
      }}
    >
      <div
        style={{
          padding: "8px 10px 10px",
          fontSize: 11, fontWeight: 700, letterSpacing: "0.5px",
          textTransform: "uppercase", color: portal.textSubtle,
        }}
      >
        Wards
      </div>
      {wards.map((w) => {
        const covered = w.assigned_count + w.pending_count;
        const pct = w.total_stations > 0 ? Math.round((covered / w.total_stations) * 100) : 0;
        const active = w.id === selectedId;
        return (
          <div
            key={w.id}
            onClick={() => onSelect(w.id)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: 10, borderRadius: 8, cursor: "pointer", marginBottom: 2,
              background: active ? portal.brandSubtlest : "transparent",
            }}
            onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = portal.neutral; }}
            onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLDivElement).style.background = "transparent"; }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 14, fontWeight: active ? 600 : 500,
                  color: active ? portal.brandText : portal.ink,
                  marginBottom: 5,
                }}
              >
                {w.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: portal.neutral, overflow: "hidden" }}>
                  <div
                    style={{
                      display: "block", height: "100%",
                      width: `${pct}%`,
                      background: pct >= 80 ? "#1F845A" : portal.brand,
                    }}
                  />
                </div>
                <span style={{ fontSize: 11, color: portal.textSubtle, whiteSpace: "nowrap" }}>
                  {covered}/{w.total_stations}
                </span>
              </div>
            </div>
            <span style={{ fontSize: 11, color: portal.textSubtle, whiteSpace: "nowrap" }}>
              {w.bench_count} bench
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ---- Stations panel ---------------------------------------------------------

type StationFilter = "all" | "assigned" | "gap";

function StationsPanel({
  ward,
  stations,
  loading,
}: {
  ward: AssignedWardSummary | undefined;
  stations: AssignedStation[];
  loading: boolean;
}) {
  const [filter, setFilter] = useState<StationFilter>("all");
  const [search, setSearch] = useState("");

  const assigned = stations.filter((s) => s.state === "assigned").length;
  const pending  = stations.filter((s) => s.state === "pending").length;
  const gap      = stations.filter((s) => s.state === "gap").length;
  const total    = stations.length;

  const filtered = stations.filter((s) => {
    if (filter === "assigned" && s.state === "gap") return false;
    if (filter === "gap" && s.state !== "gap") return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      (s.code && s.code.includes(q)) ||
      (s.agent && s.agent.name.toLowerCase().includes(q))
    );
  });

  const summaryText = ward
    ? `${total} stations · ${assigned} confirmed · ${pending} invite sent · ${gap} uncovered`
    : "";

  const filters: { id: StationFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "assigned", label: "Assigned" },
    { id: "gap", label: "Uncovered" },
  ];

  return (
    <div
      style={{
        flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
        border: `1px solid ${portal.border}`, borderRadius: 8,
        boxShadow: portal.cardShadow,
      }}
    >
      {/* Panel header */}
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}`,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>
            Polling stations{ward ? ` — ${ward.name} Ward` : ""}
          </div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>{summaryText}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Station or agent"
            style={{
              width: 180, height: 32, boxSizing: "border-box",
              border: `1px solid ${portal.border}`, borderRadius: 8,
              padding: "0 10px", fontSize: 13,
              color: portal.ink, background: portal.canvasSubtle, fontFamily: "inherit",
            }}
          />
          <div
            style={{
              display: "flex", background: portal.neutral,
              borderRadius: 8, padding: 2, gap: 2,
            }}
          >
            {filters.map((f) => {
              const active = filter === f.id;
              return (
                <div
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  style={{
                    height: 28, display: "flex", alignItems: "center",
                    padding: "0 10px", borderRadius: 6, fontSize: 13, cursor: "pointer",
                    fontWeight: active ? 600 : 500,
                    color: active ? portal.ink : portal.label,
                    background: active ? portal.canvas : "transparent",
                    boxShadow: active ? "0 1px 1px rgba(9,30,66,0.25)" : "none",
                  }}
                >
                  {f.label}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Table header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px minmax(0,1.4fr) minmax(0,1fr)",
          gap: 12, padding: "10px 14px",
          background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`,
          fontSize: 12, fontWeight: 600, color: portal.label,
        }}
      >
        <span>Code</span>
        <span>Station</span>
        <span>Agent</span>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "24px 20px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: "28px 20px", textAlign: "center", fontSize: 13, color: portal.textSubtle }}>
            No stations match.
          </div>
        ) : (
          filtered.map((s) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "44px minmax(0,1.4fr) minmax(0,1fr)",
                gap: 12, alignItems: "start",
                padding: "10px 14px", borderBottom: `1px solid ${portal.borderSubtle}`,
              }}
            >
              <span style={{ fontSize: 13, color: portal.textSubtle, fontVariantNumeric: "tabular-nums" }}>
                {s.code ?? "—"}
              </span>
              <span style={{ fontSize: 13 }}>{s.name}</span>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 13, fontWeight: s.agent ? 500 : 400,
                      color: s.agent ? portal.ink : "#974F0C",
                    }}
                  >
                    {s.agent ? s.agent.name : "Unassigned"}
                  </span>
                  <span style={tag(stationTone(s.state))}>{stationTagLabel(s.state)}</span>
                </div>
                {s.agent && (
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>{s.agent.phone_masked}</div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ---- Bench panel ------------------------------------------------------------

function BenchPanel({
  wardName,
  bench,
  gapStations,
  canAssign,
  onDeploy,
}: {
  wardName: string;
  bench: BenchAgent[];
  gapStations: AssignedStation[];
  canAssign: boolean;
  onDeploy: (agentId: string, stationId: string) => Promise<void>;
}) {
  const [picks, setPicks]       = useState<Record<string, string>>({});
  const [deploying, setDeploying] = useState<string | null>(null);

  const total   = Math.ceil((gapStations.length + bench.length) * 0.1) || 1;
  const benchTone = bench.length >= total ? "green" : bench.length > 0 ? "amber" : "red";

  async function handleDeploy(agent: BenchAgent) {
    const stationId = picks[agent.id];
    if (!stationId || deploying) return;
    setDeploying(agent.id);
    try {
      await onDeploy(agent.id, stationId);
      setPicks((p) => { const n = { ...p }; delete n[agent.id]; return n; });
    } finally {
      setDeploying(null);
    }
  }

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow }}>
      <div
        style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}`, flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{wardName} bench</div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
            Vetted reserve agents. Deploy one to cover a gap or replace a no-show on election day.
          </div>
        </div>
        <span style={tag(benchTone)}>
          {bench.length} of {total} reserve
        </span>
      </div>

      {bench.length === 0 ? (
        <div style={{ padding: 20, fontSize: 13, color: portal.textSubtle }}>
          Nobody on the bench. Approve a reserve from the{" "}
          <Link to="pending" relative="path" style={{ fontWeight: 500, color: portal.brandText }}>
            review queue
          </Link>{" "}
          to add one.
        </div>
      ) : (
        bench.map((b) => {
          const picked = picks[b.id] || "";
          const canDeploy = canAssign && gapStations.length > 0;
          const readyToDeploy = canDeploy && !!picked;

          return (
            <div
              key={b.id}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "12px 20px", borderBottom: `1px solid ${portal.borderSubtle}`,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: portal.brandSubtlest, color: portal.brandText,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}
              >
                {b.initials}
              </span>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{b.name}</div>
                <div style={{ fontSize: 12, color: portal.textSubtle }}>
                  {b.phone_masked}
                  {b.approved_at ? ` · Vetted ${new Date(b.approved_at).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}` : ""}
                </div>
              </div>
              {canDeploy && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={picked}
                    onChange={(e) => setPicks((p) => ({ ...p, [b.id]: e.target.value }))}
                    style={{
                      height: 32, maxWidth: 240, boxSizing: "border-box",
                      border: `1px solid ${portal.border}`, borderRadius: 8,
                      padding: "0 8px", fontSize: 13, color: portal.ink,
                      background: portal.canvas, fontFamily: "inherit",
                    }}
                  >
                    <option value="">Choose an uncovered station</option>
                    {gapStations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `${s.code} · ` : ""}{s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => handleDeploy(b)}
                    disabled={!readyToDeploy || deploying === b.id}
                    style={{
                      display: "flex", alignItems: "center", height: 32,
                      padding: "0 12px", borderRadius: 8,
                      fontSize: 14, fontWeight: 500, border: "none",
                      cursor: readyToDeploy ? "pointer" : "not-allowed",
                      background: readyToDeploy ? portal.brand : portal.neutral,
                      color: readyToDeploy ? portal.inverse : portal.textSubtlest,
                      fontFamily: "inherit",
                    }}
                  >
                    {deploying === b.id ? "Deploying…" : "Deploy"}
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}

      <div style={{ padding: "12px 20px", fontSize: 12, color: portal.textSubtle }}>
        Target: 10% of the ward's stations in reserve · {total} for {wardName}
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

export function AssignedAgents() {
  const { id } = useParams<{ id: string }>();

  const [workspace,      setWorkspace]      = useState<Workspace | null>(null);
  const [myRole,         setMyRole]         = useState<string>("campaign_manager");
  const [notFound,       setNotFound]       = useState(false);
  const [wards,          setWards]          = useState<AssignedWardSummary[]>([]);
  const [canAssign,      setCanAssign]      = useState(false);
  const [pendingCount,   setPendingCount]   = useState(0);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [stations,       setStations]       = useState<AssignedStation[]>([]);
  const [bench,          setBench]          = useState<BenchAgent[]>([]);
  const [wardLoading,    setWardLoading]    = useState(false);
  const [toast,          setToast]          = useState("");

  // Load workspace + ward list
  useEffect(() => {
    if (!id) return;
    Promise.all([api.getWorkspace(id), api.getAssignedWards(id)])
      .then(([{ workspace: w, my_role }, { wards: ws, can_assign, pending_count }]) => {
        setWorkspace(w);
        setMyRole(my_role);
        setWards(ws);
        setCanAssign(can_assign);
        setPendingCount(pending_count);
        if (ws.length > 0) setSelectedWardId(ws[0].id);
      })
      .catch(() => setNotFound(true));
  }, [id]);

  // Load selected ward detail
  useEffect(() => {
    if (!id || !selectedWardId) return;
    setWardLoading(true);
    api
      .getAssignedWard(id, selectedWardId)
      .then(({ stations: ss, bench: bb }) => {
        setStations(ss);
        setBench(bb);
      })
      .finally(() => setWardLoading(false));
  }, [id, selectedWardId]);

  async function handleDeploy(agentId: string, stationId: string) {
    if (!id) return;
    await api.deployBenchAgent(id, agentId, stationId);

    const agent = bench.find((b) => b.id === agentId)!;

    // Update stations list
    setStations((prev) =>
      prev.map((s) =>
        s.id === stationId
          ? { ...s, state: "assigned", agent: { id: agentId, name: agent.name, phone_masked: agent.phone_masked } }
          : s,
      ),
    );
    // Remove from bench
    setBench((prev) => prev.filter((b) => b.id !== agentId));
    // Update ward summary
    setWards((prev) =>
      prev.map((w) =>
        w.id === selectedWardId
          ? { ...w, assigned_count: w.assigned_count + 1, bench_count: Math.max(0, w.bench_count - 1) }
          : w,
      ),
    );

    setToast(`${agent.name} deployed successfully.`);
    setTimeout(() => setToast(""), 4000);
  }

  if (notFound) return <Navigate to="/workspaces" replace />;
  if (!workspace) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: portal.font, color: portal.textSubtle, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const selectedWard = wards.find((w) => w.id === selectedWardId);
  const gapStations  = stations.filter((s) => s.state === "gap");

  return (
    <WorkspaceShell workspace={workspace} active="agents" myRole={myRole}>
      <div style={{ flex: 1, minWidth: 0, padding: "24px 24px 48px" }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to={`/workspaces/${workspace.id}`} style={{ color: portal.textSubtle, textDecoration: "none" }}>
            {selectedWard?.name ?? "Agents"}
          </Link>
          {" / Agents"}
        </div>

        {/* Title row */}
        <div
          style={{
            display: "flex", alignItems: "flex-end", justifyContent: "space-between",
            gap: 16, marginBottom: 20, flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
              Assigned agents
            </div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              Who is placed at each polling station, and who's on the bench in each ward.
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <Link
              to={`/workspaces/${workspace.id}/agents/pending`}
              style={{
                display: "flex", alignItems: "center", height: 32, padding: "0 12px",
                borderRadius: 8, background: portal.brand, color: portal.inverse,
                fontSize: 14, fontWeight: 500, textDecoration: "none",
              }}
            >
              Review queue{pendingCount > 0 ? ` · ${pendingCount} pending` : ""}
            </Link>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Two-panel row */}
          <div style={{ display: "flex", gap: 16, alignItems: "stretch", height: 540 }}>
            <WardList
              wards={wards}
              selectedId={selectedWardId}
              onSelect={(wardId) => {
                setSelectedWardId(wardId);
                setStations([]);
                setBench([]);
              }}
            />
            <StationsPanel
              ward={selectedWard}
              stations={stations}
              loading={wardLoading}
            />
          </div>

          {/* Bench + extras */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {selectedWard && (
              <BenchPanel
                wardName={selectedWard.name}
                bench={bench}
                gapStations={gapStations}
                canAssign={canAssign}
                onDeploy={handleDeploy}
              />
            )}

            {!canAssign && (
              <div
                style={{
                  display: "flex", alignItems: "flex-start", gap: 10,
                  padding: "12px 16px", borderRadius: 8,
                  background: portal.brandSubtlest, color: portal.brandText,
                  fontSize: 13, lineHeight: "19px",
                }}
              >
                <span
                  style={{
                    width: 8, height: 8, borderRadius: "50%",
                    background: portal.brand, marginTop: 6, flexShrink: 0,
                  }}
                />
                <span>
                  You can view all assignments here. Your campaign manager deploys bench agents and approves station changes.
                </span>
              </div>
            )}

            {toast && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "12px 16px", borderRadius: 8,
                  background: "#E3FCEF", color: "#164B35", fontSize: 13,
                }}
              >
                <span style={{ fontWeight: 700 }}>✓</span>
                <span>{toast}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </WorkspaceShell>
  );
}

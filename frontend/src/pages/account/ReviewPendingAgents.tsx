import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  api,
  type AssignStation,
  type PendingAgent,
  type ReviewMetrics,
  type ReviewWard,
  type Workspace,
} from "../../api";
import { portal } from "../../portalTheme";
import { WorkspaceShell } from "../../components/portal/WorkspaceShell";

// ---- helpers ----------------------------------------------------------------

function waitColor(days: number): string {
  if (days > 5) return portal.dangerText;
  if (days > 2) return "#974F0C";
  return portal.textSubtle;
}

// ---- small UI pieces --------------------------------------------------------

function Checkbox({ checked, onClick }: { checked: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        width: 16, height: 16, borderRadius: 4, flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        background: checked ? portal.brand : portal.canvas,
        border: `1px solid ${checked ? portal.brand : portal.textSubtlest}`,
        fontSize: 10, fontWeight: 700, color: portal.inverse,
      }}
    >
      {checked ? "✓" : ""}
    </div>
  );
}

function Toggle2({ on }: { on: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px",
        borderRadius: 3,
        background: on ? portal.successBg : portal.warnBg,
        color: on ? portal.successText : portal.warnText,
        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px",
      }}
    >
      {on ? "Verified" : "Phone unverified"}
    </span>
  );
}

function RoleTag({ role }: { role: string }) {
  const isAgent = role === "agent";
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px",
        borderRadius: 3,
        background: isAgent ? portal.brandSubtlest : portal.neutral,
        color: isAgent ? portal.brandText : portal.label,
        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px",
        whiteSpace: "nowrap",
      }}
    >
      {isAgent ? "Polling agent" : "Volunteer"}
    </span>
  );
}

function DupBadge() {
  return (
    <span
      style={{
        display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px",
        borderRadius: 3, background: "#FFECEB", color: "#AE2A19",
        fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px",
      }}
    >
      Duplicate
    </span>
  );
}

// ---- Modals -----------------------------------------------------------------

type ModalStage = "detail" | "assign" | "reject";

interface ModalState {
  agent: PendingAgent;
  stage: ModalStage;
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0,
        background: "rgba(9,30,66,0.44)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, zIndex: 50,
      }}
    >
      <div
        style={{
          width: "100%", maxWidth: 440,
          background: portal.canvas, borderRadius: 10,
          boxShadow: "0 8px 24px rgba(9,30,66,0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

function DetailModal({
  agent,
  onClose,
  onApprove,
  onReject,
}: {
  agent: PendingAgent;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const blocked = !!agent.duplicate || !agent.phone_verified;
  const fields = [
    { label: "National ID",          value: agent.national_id ?? "—",       color: portal.ink },
    { label: "Phone",                value: agent.phone_masked,              color: portal.ink },
    { label: "Phone verified (OTP)", value: agent.phone_verified ? "Yes" : "Not yet",
      color: agent.phone_verified ? "#216E4E" : "#974F0C" },
    { label: "Source",               value: agent.source,                    color: portal.label },
    { label: "Waiting",              value: `${agent.wait_days} day${agent.wait_days === 1 ? "" : "s"}`,
      color: waitColor(agent.wait_days) },
  ];
  if (agent.age)   fields.push({ label: "Age",   value: String(agent.age),  color: portal.ink });
  if (agent.email) fields.push({ label: "Email", value: agent.email,        color: portal.ink });

  const meta = agent.role === "agent"
    ? [agent.station_name, agent.ward_name && `${agent.ward_name} Ward`, agent.constituency_name].filter(Boolean).join(" · ")
    : [agent.ward_name && `${agent.ward_name} Ward`, agent.constituency_name].filter(Boolean).join(" · ");

  return (
    <Overlay>
      {/* Header */}
      <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", gap: 14 }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: portal.neutral, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: portal.label }}>
          {agent.first_name[0]}{agent.last_name[0]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <span style={{ fontSize: 17, fontWeight: 700 }}>{agent.name}</span>
            <RoleTag role={agent.role} />
          </div>
          <div style={{ fontSize: 12, color: portal.textSubtle }}>{meta}</div>
        </div>
      </div>
      {/* Fields */}
      <div style={{ padding: "16px 24px" }}>
        {fields.map((f) => (
          <div key={f.label} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "8px 0", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <span style={{ fontSize: 12, color: portal.textSubtle }}>{f.label}</span>
            <span style={{ fontSize: 13, fontWeight: 500, textAlign: "right", color: f.color }}>{f.value}</span>
          </div>
        ))}
        {agent.duplicate && (
          <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 8, background: "#FFECEB", color: "#AE2A19", fontSize: 12, lineHeight: "18px", marginTop: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#C9372C", marginTop: 5, flexShrink: 0 }} />
            <span>
              {agent.duplicate.type === "id"
                ? `This national ID is already registered to ${agent.duplicate.with}.`
                : `This phone number matches ${agent.duplicate.with}'s application.`
              }{" "}
              Approval is blocked until this is resolved.
            </span>
          </div>
        )}
        {!agent.phone_verified && !agent.duplicate && (
          <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 8, background: portal.warnBg, color: portal.warnText, fontSize: 12, lineHeight: "18px", marginTop: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: portal.warnBold, marginTop: 5, flexShrink: 0 }} />
            <span>Phone number not yet verified by OTP. Approval is blocked until they complete it.</span>
          </div>
        )}
      </div>
      {/* Actions */}
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 22px" }}>
        <button onClick={onClose} style={{ ...btnBase, background: portal.canvas, border: `1px solid ${portal.border}`, color: portal.label }}>Close</button>
        <div style={{ flex: 1 }} />
        <button onClick={onReject} style={{ ...btnBase, background: portal.canvas, border: `1px solid ${portal.border}`, color: "#AE2A19" }}>Reject</button>
        <button
          onClick={onApprove}
          disabled={blocked}
          style={{ ...btnBase, background: blocked ? portal.neutral : portal.brand, color: blocked ? portal.textSubtlest : portal.inverse, cursor: blocked ? "not-allowed" : "pointer" }}
        >
          Approve
        </button>
      </div>
    </Overlay>
  );
}

function AssignModal({
  agent,
  stations,
  wardTotals,
  wardName,
  loading,
  onBack,
  onConfirm,
}: {
  agent: PendingAgent;
  stations: AssignStation[];
  wardTotals: { total: number; covered: number; gap: number } | null;
  wardName: string;
  loading: boolean;
  onBack: () => void;
  onConfirm: (stationId: string | null) => void;
}) {
  const [search, setSearch]       = useState("");
  const [selected, setSelected]   = useState<string | null>(
    agent.station_id ?? null,
  );
  const [confirming, setConfirming] = useState(false);

  const isVolunteer = agent.role === "volunteer";

  async function handleConfirm() {
    setConfirming(true);
    await onConfirm(isVolunteer ? null : selected);
  }

  const filtered = stations.filter(
    (s) => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase()),
  );

  const benchSelected = selected === "bench";

  const confirmLabel = isVolunteer
    ? "Confirm approval"
    : benchSelected
    ? "Confirm approval to the bench"
    : "Confirm approval and assignment";

  return (
    <Overlay>
      <div style={{ padding: "20px 24px 4px" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          {isVolunteer ? `Add ${agent.name} as a volunteer` : `Assign ${agent.name}`}
        </div>
        <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "19px" }}>
          {isVolunteer
            ? "Approving adds them to the ward volunteer roster."
            : "Approving places them once you confirm a station, or holds them on the bench."}
        </div>
      </div>
      <div style={{ padding: "16px 24px" }}>
        {isVolunteer ? (
          <div style={{ display: "flex", gap: 10, padding: 12, borderRadius: 8, background: portal.brandSubtlest, color: portal.brandText, fontSize: 12, lineHeight: "18px" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: portal.brand, marginTop: 5, flexShrink: 0 }} />
            <span>Volunteers aren't tied to a station. They're added to the {wardName} ward volunteer group.</span>
          </div>
        ) : (
          <>
            {wardTotals && (
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {[
                  { label: `Stations in ${wardName}`, value: wardTotals.total, color: portal.ink },
                  { label: "Already covered",          value: wardTotals.covered, color: "#216E4E" },
                  { label: "Still uncovered",          value: wardTotals.gap, color: "#AE2A19" },
                ].map((s) => (
                  <div key={s.label} style={{ flex: 1, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "8px 10px", background: portal.canvasSubtle }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginTop: 1 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Assign to a station</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search stations"
              style={{ width: "100%", height: 34, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 13, color: portal.ink, fontFamily: "inherit", marginBottom: 10 }}
            />
            {loading ? (
              <div style={{ fontSize: 13, color: portal.textSubtle, padding: "12px 0" }}>Loading stations…</div>
            ) : (
              <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", maxHeight: 220, overflowY: "auto" }}>
                {filtered.map((st) => {
                  const isFull   = st.coverage === "full";
                  const isSel    = selected === st.id;
                  const tagStyle = isFull
                    ? { bg: portal.neutral, color: portal.textSubtle, label: "Covered" }
                    : { bg: "#FFECEB", color: "#AE2A19", label: "No agent" };
                  return (
                    <div
                      key={st.id}
                      onClick={() => !isFull && setSelected(st.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: `1px solid ${portal.borderSubtle}`, cursor: isFull ? "not-allowed" : "pointer", opacity: isFull ? 0.55 : 1, background: isSel ? portal.brandSubtlest : portal.canvas }}
                    >
                      <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: portal.inverse, background: isSel ? portal.brand : portal.canvas, border: `1px solid ${isSel ? portal.brand : portal.textSubtlest}` }}>
                        {isSel ? "●" : ""}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{st.name}</div>
                        {st.code && <div style={{ fontSize: 11, color: portal.textSubtle }}>Station {st.code}{st.registered_voters ? ` · ${st.registered_voters.toLocaleString()} voters` : ""}</div>}
                      </div>
                      <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap", flexShrink: 0, background: tagStyle.bg, color: tagStyle.color }}>
                        {tagStyle.label}
                      </span>
                    </div>
                  );
                })}
                {/* Bench option */}
                <div
                  onClick={() => setSelected("bench")}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", cursor: "pointer", background: benchSelected ? portal.brandSubtlest : portal.canvasSubtle }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: portal.inverse, background: benchSelected ? portal.brand : portal.canvas, border: `1px solid ${benchSelected ? portal.brand : portal.textSubtlest}` }}>
                    {benchSelected ? "●" : ""}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>Add to the ward bench instead</div>
                    <div style={{ fontSize: 11, color: portal.textSubtle }}>Reserve pool — swappable into any station in {wardName} later.</div>
                  </div>
                </div>
              </div>
            )}
            <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 10 }}>
              Their preferred station is preselected. Covered stations can't be picked — a second agent goes to the ward bench.
            </div>
          </>
        )}
      </div>
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 22px" }}>
        <button onClick={onBack} style={{ ...btnBase, background: portal.canvas, border: `1px solid ${portal.border}`, color: portal.label }}>Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleConfirm}
          disabled={confirming || (!isVolunteer && !selected)}
          style={{ ...btnBase, background: portal.brand, color: portal.inverse, opacity: confirming ? 0.7 : 1 }}
        >
          {confirming ? "Confirming…" : confirmLabel}
        </button>
      </div>
    </Overlay>
  );
}

function RejectModal({
  agent,
  onBack,
  onConfirm,
}: {
  agent: PendingAgent;
  onBack: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason]     = useState("");
  const [loading, setLoading]   = useState(false);

  async function handleConfirm() {
    if (!reason.trim()) return;
    setLoading(true);
    await onConfirm(reason.trim());
  }

  const canSubmit = reason.trim().length >= 5;
  return (
    <Overlay>
      <div style={{ padding: "20px 24px 4px" }}>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 4 }}>
          Reject {agent.name}'s application
        </div>
        <div style={{ fontSize: 13, color: portal.textSubtle }}>
          Recorded on the application and visible to the applicant.
        </div>
      </div>
      <div style={{ padding: "16px 24px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>
          Reason for rejection <span style={{ color: portal.dangerText }}>*</span>
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. National ID does not match the photo submitted"
          style={{ width: "100%", minHeight: 80, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: portal.ink, fontFamily: "inherit", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 8, padding: "16px 24px 22px" }}>
        <button onClick={onBack} style={{ ...btnBase, background: portal.canvas, border: `1px solid ${portal.border}`, color: portal.label }}>Back</button>
        <div style={{ flex: 1 }} />
        <button
          onClick={handleConfirm}
          disabled={!canSubmit || loading}
          style={{ ...btnBase, background: canSubmit ? "#C9372C" : portal.neutral, color: canSubmit ? portal.inverse : portal.textSubtlest, cursor: canSubmit ? "pointer" : "not-allowed" }}
        >
          {loading ? "Confirming…" : "Confirm rejection"}
        </button>
      </div>
    </Overlay>
  );
}

const btnBase: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  height: 36, padding: "0 16px", border: "none", borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

// ---- Page -------------------------------------------------------------------

export function ReviewPendingAgents() {
  const { id } = useParams<{ id: string }>();

  const [workspace,  setWorkspace]  = useState<Workspace | null>(null);
  const [myRole,     setMyRole]     = useState<string>('campaign_manager');
  const [notFound,   setNotFound]   = useState(false);

  // List state
  const [agents,     setAgents]     = useState<PendingAgent[]>([]);
  const [metrics,    setMetrics]    = useState<ReviewMetrics>({ pending: 0, over_5_days: 0, duplicates: 0, approved_today: 0 });
  const [wards,      setWards]      = useState<ReviewWard[]>([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const perPage = 20;
  const [loading,    setLoading]    = useState(false);
  const [canAssign,  setCanAssign]  = useState(false);
  const [canInvite,  setCanInvite]  = useState(false);

  // Filters
  const [roleFilter, setRoleFilter] = useState("all");
  const [wardFilter, setWardFilter] = useState("");
  const [search,     setSearch]     = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection
  const [checked, setChecked]       = useState<Set<string>>(new Set());

  // Modals
  const [modal,      setModal]      = useState<ModalState | null>(null);
  const [stations,   setStations]   = useState<AssignStation[]>([]);
  const [stationTotals, setStationTotals] = useState<{ total: number; covered: number; gap: number } | null>(null);
  const [stationsLoading, setStationsLoading] = useState(false);

  // Load workspace
  useEffect(() => {
    if (!id) return;
    api.getWorkspace(id)
      .then(({ workspace: w, my_role }) => { setWorkspace(w); setMyRole(my_role); })
      .catch(() => setNotFound(true));
  }, [id]);

  // Load agents list
  const loadAgents = useCallback(
    async (pg = 1, role = roleFilter, ward = wardFilter, q = search) => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await api.getPendingAgents(id, {
          page: pg, per_page: perPage,
          role: role === "all" ? undefined : role,
          ward_id: ward || undefined,
          search: q.trim() || undefined,
        });
        setAgents(res.agents);
        setTotal(res.total);
        setMetrics(res.metrics);
        setWards(res.wards);
        setCanAssign(res.can_assign);
        setCanInvite(res.can_invite);
        setChecked(new Set());
      } finally {
        setLoading(false);
      }
    },
    [id, roleFilter, wardFilter, search],
  );

  useEffect(() => {
    if (workspace) loadAgents(1, roleFilter, wardFilter, search);
  }, [workspace]); // eslint-disable-line react-hooks/exhaustive-deps

  function reload() {
    loadAgents(page, roleFilter, wardFilter, search);
  }

  function applyFilter(role: string, ward: string, q: string, pg = 1) {
    setPage(pg);
    loadAgents(pg, role, ward, q);
  }

  function handleSearch(val: string) {
    setSearch(val);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => applyFilter(roleFilter, wardFilter, val), 350);
  }

  // Station loading when assign modal opens
  async function openAssignStage(agent: PendingAgent) {
    setModal({ agent, stage: "assign" });
    if (agent.role === "agent") {
      setStationsLoading(true);
      try {
        const res = await api.getAgentStations(id!, agent.id);
        setStations(res.stations);
        setStationTotals(res.totals);
      } finally {
        setStationsLoading(false);
      }
    }
  }

  async function handleApprove(agent: PendingAgent, stationId: string | null | undefined) {
    await api.approveAgent(id!, agent.id, stationId);
    setModal(null);
    reload();
  }

  async function handleReject(agent: PendingAgent, reason: string) {
    await api.rejectAgent(id!, agent.id, reason);
    setModal(null);
    reload();
  }

  async function handleBulkApprove() {
    const eligible = agents
      .filter((a) => checked.has(a.id) && !a.duplicate && a.phone_verified)
      .map((a) => a.id);
    if (!eligible.length) return;
    await api.bulkApproveAgents(id!, eligible);
    setChecked(new Set());
    reload();
  }

  // Pagination
  const totalPages = Math.max(1, Math.ceil(total / perPage));

  function toggleCheck(agentId: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(agentId) ? next.delete(agentId) : next.add(agentId);
      return next;
    });
  }

  function toggleAllPage() {
    const allChecked = agents.every((a) => checked.has(a.id));
    setChecked((prev) => {
      const next = new Set(prev);
      agents.forEach((a) => (allChecked ? next.delete(a.id) : next.add(a.id)));
      return next;
    });
  }

  const pageAllChecked = agents.length > 0 && agents.every((a) => checked.has(a.id));
  const checkedEligible = agents.filter((a) => checked.has(a.id) && !a.duplicate && a.phone_verified);
  const checkedBlocked  = [...checked].filter((cid) => agents.find((a) => a.id === cid && (a.duplicate || !a.phone_verified))).length;

  if (notFound) return <Navigate to="/account" replace />;
  if (!workspace) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: portal.font, color: portal.textSubtle, fontSize: 14 }}>
      Loading…
    </div>
  );

  return (
    <WorkspaceShell workspace={workspace} active="agents" myRole={myRole}>
      <div style={{ flex: 1, padding: "28px 40px 56px", minWidth: 0 }}>
        {/* Breadcrumb + title */}
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to={`/workspaces/${workspace.id}/agents`} style={{ color: portal.textSubtle, textDecoration: "none" }}>Agents</Link>
          {" / Review queue"}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
              {canAssign ? "Review pending agents" : "Pending agents"}
            </div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              {canAssign
                ? "Applications from the public link and targeted invites. Nothing here is placed until you approve it."
                : "Applications in your area. Your campaign manager approves — you can review and flag."}
            </div>
          </div>
          {(!['constituency', 'ward', 'county', 'national'].includes(myRole) || canInvite) && (
            <Link
              to={`/workspaces/${workspace.id}/recruitment`}
              style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 500, textDecoration: "none", flexShrink: 0 }}
            >
              Recruitment link
            </Link>
          )}
        </div>

        {/* Permission banner */}
        {!canAssign && !canInvite && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: portal.warnBg, color: portal.warnText, fontSize: 13, marginBottom: 20 }}>
            You can view the pending queue but cannot approve or reject applications. Ask the campaign manager to grant assign permission in Settings → Delegation.
          </div>
        )}
        {!canAssign && canInvite && (
          <div style={{ padding: "12px 16px", borderRadius: 8, background: portal.brandSubtlest, color: portal.brandText, fontSize: 13, marginBottom: 20 }}>
            You can send invites and review applications here. Final approval and station assignment is handled by the campaign manager.
          </div>
        )}

        {/* Metrics */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16, marginBottom: 24 }}>
          {[
            { label: "Awaiting your review",  value: metrics.pending,        color: "#974F0C" },
            { label: "Waiting over 5 days",   value: metrics.over_5_days,    color: portal.dangerText },
            { label: "Duplicates flagged",     value: metrics.duplicates,     color: portal.dangerText },
            { label: "Approved today",         value: metrics.approved_today, color: "#216E4E" },
          ].map((m) => (
            <div key={m.label} style={{ border: `1px solid ${portal.border}`, borderRadius: 8, padding: "14px 16px", background: portal.canvas }}>
              <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, lineHeight: "26px", fontWeight: 700, color: m.color }}>{m.value}</div>
            </div>
          ))}
        </div>

        {/* Filters toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
          <input
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search by name"
            style={{ height: 32, width: 200, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 13, color: portal.ink, fontFamily: "inherit", background: portal.canvas }}
          />
          {(["all", "agent", "volunteer"] as const).map((r) => {
            const active = roleFilter === r;
            const label  = r === "all" ? "All" : r === "agent" ? "Polling agent" : "Volunteer";
            return (
              <div
                key={r}
                onClick={() => { setRoleFilter(r); applyFilter(r, wardFilter, search); }}
                style={{ display: "flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer", border: `1px solid ${active ? portal.brand : portal.border}`, background: active ? portal.brandSubtlest : portal.canvas, color: active ? portal.brandText : portal.label }}
              >
                {label}
              </div>
            );
          })}
          <span style={{ width: 1, height: 20, background: portal.border, margin: "0 4px" }} />
          <select
            value={wardFilter}
            onChange={(e) => { setWardFilter(e.target.value); applyFilter(roleFilter, e.target.value, search); }}
            style={{ height: 32, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 8px", fontSize: 13, color: portal.label, fontFamily: "inherit", background: portal.canvas }}
          >
            <option value="">All wards</option>
            {wards.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          {canAssign && checked.size > 0 && (
            <button
              onClick={handleBulkApprove}
              style={{ display: "flex", alignItems: "center", height: 32, padding: "0 14px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}
            >
              Approve {checkedEligible.length} selected{checkedBlocked > 0 ? ` (${checkedBlocked} blocked)` : ""}
            </button>
          )}
        </div>

        {/* Table */}
        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 20px", background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}` }}>
            <Checkbox checked={pageAllChecked} onClick={toggleAllPage} />
            <span style={{ flex: 1, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: portal.textSubtlest }}>Applicant</span>
            <span style={{ width: 130, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: portal.textSubtlest }}>Source</span>
            <span style={{ width: 90,  fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.4px", color: portal.textSubtlest, textAlign: "right" }}>Waiting</span>
            <span style={{ width: canAssign ? 88 : 0 }} />
          </div>

          {/* Rows */}
          {loading ? (
            <div style={{ padding: "24px 20px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
          ) : agents.length === 0 ? (
            <div style={{ padding: "32px 20px", fontSize: 14, color: portal.textSubtle, textAlign: "center" }}>
              No pending applications match your filters.
            </div>
          ) : (
            agents.map((a) => {
              const meta = a.role === "agent"
                ? [a.station_name, a.ward_name && `${a.ward_name} Ward`].filter(Boolean).join(" · ")
                : [a.ward_name && `${a.ward_name} Ward`, a.constituency_name].filter(Boolean).join(" · ");
              return (
                <div key={a.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                  <Checkbox checked={checked.has(a.id)} onClick={() => toggleCheck(a.id)} />
                  {/* Avatar */}
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: portal.neutral, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: portal.label }}>
                    {a.first_name[0]}{a.last_name[0]}
                  </div>
                  {/* Name + badges + meta */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                      <RoleTag role={a.role} />
                      {a.duplicate && <DupBadge />}
                      {!a.phone_verified && <Toggle2 on={false} />}
                    </div>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>{meta}</div>
                  </div>
                  <span style={{ width: 130, fontSize: 12, color: portal.textSubtle }}>{a.source}</span>
                  <span style={{ width: 90, fontSize: 12, fontWeight: 600, color: waitColor(a.wait_days), textAlign: "right" }}>{a.wait_days}d</span>
                  {canAssign && (
                    <div style={{ width: 88, flexShrink: 0, textAlign: "right" }}>
                      <button
                        onClick={() => setModal({ agent: a, stage: "detail" })}
                        style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Decide
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Footer */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 20px" }}>
            <span style={{ fontSize: 12, color: portal.textSubtle }}>
              Page {page} of {totalPages} · {total} matching
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <button
                onClick={() => { const np = Math.max(1, page - 1); setPage(np); applyFilter(roleFilter, wardFilter, search, np); }}
                disabled={page === 1}
                style={{ display: "flex", alignItems: "center", height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: page === 1 ? "default" : "pointer", background: portal.canvas, border: `1px solid ${portal.border}`, color: page === 1 ? "#B3BAC5" : portal.label, fontFamily: "inherit" }}
              >
                Prev
              </button>
              <span style={{ fontSize: 12, color: portal.label, padding: "0 4px" }}>{page} / {totalPages}</span>
              <button
                onClick={() => { const np = Math.min(totalPages, page + 1); setPage(np); applyFilter(roleFilter, wardFilter, search, np); }}
                disabled={page >= totalPages}
                style={{ display: "flex", alignItems: "center", height: 28, padding: "0 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: page >= totalPages ? "default" : "pointer", background: portal.canvas, border: `1px solid ${portal.border}`, color: page >= totalPages ? "#B3BAC5" : portal.label, fontFamily: "inherit" }}
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal?.stage === "detail" && (
        <DetailModal
          agent={modal.agent}
          onClose={() => setModal(null)}
          onApprove={() => openAssignStage(modal.agent)}
          onReject={() => setModal({ ...modal, stage: "reject" })}
        />
      )}
      {modal?.stage === "assign" && (
        <AssignModal
          agent={modal.agent}
          stations={stations}
          wardTotals={stationTotals}
          wardName={modal.agent.ward_name ?? "this ward"}
          loading={stationsLoading}
          onBack={() => setModal({ ...modal, stage: "detail" })}
          onConfirm={(stationId) => handleApprove(modal.agent, stationId)}
        />
      )}
      {modal?.stage === "reject" && (
        <RejectModal
          agent={modal.agent}
          onBack={() => setModal({ ...modal, stage: "detail" })}
          onConfirm={(reason) => handleReject(modal.agent, reason)}
        />
      )}
    </WorkspaceShell>
  );
}

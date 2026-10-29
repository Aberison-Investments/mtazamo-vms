import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type TierContext, type Workspace } from "../../api";
import { portal, seatLabel, segmentLabel } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../auth";

const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);

interface TopWard {
  id: string;
  name: string;
  total_stations: number;
}

interface Stats {
  total_stations: number | null;
  covered_stations: number | null;
  pending_applications: number;
  top_wards: TopWard[];
}

const STEPS = [
  {
    key: "seat",
    title: "Seat and segment selected",
    desc: "Seat, form set and election segment are locked for this workspace.",
    alwaysDone: true,
  },
  {
    key: "geo",
    title: "Geography scope confirmed",
    desc: "Polling station register loaded and ready.",
    alwaysDone: true,
  },
  {
    key: "tiers",
    title: "Tier display names set",
    desc: "Ward, constituency and county tiers named for your campaign.",
    alwaysDone: true,
  },
  {
    key: "managers",
    title: "Invite a campaign manager",
    desc: "Full access except billing and account deletion.",
    cta: "Invite",
    route: (id: string) => `/workspaces/${id}/managers/invite`,
  },
  {
    key: "agents",
    title: "Recruit and assign agents",
    desc: "Share the application link, vet by ID and phone OTP, assign to stations.",
    cta: "Open agents",
    route: (id: string) => `/workspaces/${id}/agents`,
  },
  {
    key: "volunteers",
    title: "Build the volunteer roster",
    desc: "Group by ward, tag by activity, set turnout targets.",
    cta: "Open volunteers",
  },
  {
    key: "alerts",
    title: "Set notification thresholds",
    desc: "Who is alerted on a query, an escalation or a station going silent.",
    cta: "Configure",
  },
  {
    key: "drill",
    title: "Run a capture rehearsal",
    desc: "A test submission from every ward before election day.",
    cta: "Open war room",
  },
];

export function WorkspaceOverview() {
  const { id } = useParams<{ id: string }>();
  const { workspace, myRole } = useWorkspaceContext();
  const [tierCtx,       setTierCtx]       = useState<TierContext | null>(null);
  const [stats,         setStats]         = useState<Stats | null>(null);
  const [hasManagers,   setHasManagers]   = useState(false);
  const [wardStations,  setWardStations]  = useState<import('../../api').AssignedStation[] | null>(null);

  useEffect(() => {
    if (!id) return;
    if (TIER_ROLES.has(myRole)) {
      api.getTierContext(id).then(setTierCtx).catch(() => {});
    } else {
      api.workspaceStats(workspace.id)
        .then(setStats)
        .catch(() => setStats({ total_stations: null, covered_stations: null, pending_applications: 0, top_wards: [] }));
      if (myRole === 'aspirant') {
        api.listManagers(id)
          .then(({ managers }) => setHasManagers(managers.some((m) => m.status === 'active')))
          .catch(() => {});
      }
      if (workspace.scope === 'ward' && workspace.ward_id) {
        api.getAssignedWard(id, workspace.ward_id)
          .then(({ stations }) => setWardStations(stations))
          .catch(() => setWardStations([]));
      }
    }
  }, [id, myRole]);

  const isTier = TIER_ROLES.has(myRole);

  return isTier
    ? <TierOverviewContent ctx={tierCtx} workspaceId={id!} />
    : <OverviewContent workspace={workspace} stats={stats} myRole={myRole} hasManagers={hasManagers} wardStations={wardStations} />;
}

// ---- Tier officer overview --------------------------------------------------

function TierOverviewContent({ ctx, workspaceId }: { ctx: TierContext | null; workspaceId: string }) {
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  if (!ctx) {
    return (
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", color: portal.textSubtle, fontSize: 14 }}>
        Loading overview…
      </div>
    );
  }

  const m = ctx.metrics;
  const coveragePct = m.total_stations > 0 ? Math.round((m.covered_stations / m.total_stations) * 100) : 0;

  function coverageColor(pct: number) {
    if (pct >= 65) return "#1F845A";
    if (pct >= 40) return "#E2B203";
    return "#AE2A19";
  }

  function daysUntil(d: string | null) {
    if (!d) return null;
    return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86400000));
  }

  const days = daysUntil(ctx.workspace.election_date);

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
      {/* Welcome banner */}
      {!dismissed && ctx.appointed_by && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 16px", borderRadius: 8, background: portal.brandSubtlest, marginBottom: 24 }}>
          <span style={{ width: 32, height: 32, borderRadius: "50%", background: portal.brand, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, flexShrink: 0 }}>
            {ctx.appointed_by.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#1A2E36", marginBottom: 2 }}>
              You&apos;re in, {user?.first_name ?? "there"}.
            </div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.brandText }}>
              {ctx.appointed_by.name} appointed you {ctx.role_label.toLowerCase()} on {ctx.appointed_by.at ?? "recently"}.
              {ctx.geo_scope ? ` Everything below covers ${ctx.geo_scope} only.` : ""}
            </div>
          </div>
          <span onClick={() => setDismissed(true)} style={{ fontSize: 12, color: portal.brandText, cursor: "pointer", flexShrink: 0 }}>Dismiss</span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
            {ctx.geo_scope ?? ctx.role_label} overview
          </div>
          <div style={{ fontSize: 14, color: portal.textSubtle }}>
            {ctx.workspace.election_date
              ? <>Election day is {new Date(ctx.workspace.election_date).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })} · <strong style={{ color: portal.ink, fontWeight: 600 }}>{days} days out</strong></>
              : "Election date not set"}
          </div>
        </div>
        <Link
          to={`/workspaces/${workspaceId}/agents`}
          style={{ display: "flex", alignItems: "center", height: 32, padding: "0 12px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, textDecoration: "none", flexShrink: 0 }}
        >
          {ctx.can_assign ? "Review pending agents" : "View pending agents"}
        </Link>
      </div>

      {/* Metrics */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 28 }}>
        {[
          { label: "Stations with a confirmed agent", value: m.covered_stations.toLocaleString(), suffix: `of ${m.total_stations.toLocaleString()}`, pct: coveragePct, note: `${(m.total_stations - m.covered_stations).toLocaleString()} still uncovered`, noteColor: "#AE2A19" },
          { label: ctx.can_assign ? "Awaiting your vetting" : "Awaiting CM review", value: String(m.pending_applications), suffix: "applications", pct: 40, note: m.pending_applications > 0 ? "Review the queue" : "Queue is clear", noteColor: m.pending_applications > 0 ? "#974F0C" : "#216E4E" },
          ...(m.ward_officers_total > 0 ? [{ label: "Ward officer posts", value: String(m.ward_officers_filled), suffix: `of ${m.ward_officers_total}`, pct: m.ward_officers_total > 0 ? Math.round(m.ward_officers_filled / m.ward_officers_total * 100) : 0, note: m.ward_officers_filled < m.ward_officers_total ? `${m.ward_officers_total - m.ward_officers_filled} open` : "All filled", noteColor: m.ward_officers_filled < m.ward_officers_total ? "#974F0C" : "#216E4E" }] : []),
          { label: "Volunteers active", value: String(m.volunteers), suffix: "approved", pct: Math.min(100, m.volunteers * 10), note: m.volunteers > 0 ? "On the roster" : "None yet", noteColor: m.volunteers > 0 ? "#216E4E" : portal.textSubtle },
        ].map((card) => (
          <div key={card.label} style={{ border: `1px solid ${portal.border}`, borderRadius: 8, padding: 16, background: portal.canvas, boxShadow: portal.cardShadow }}>
            <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>{card.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 10 }}>
              <span style={{ fontSize: 26, lineHeight: "28px", fontWeight: 700 }}>{card.value}</span>
              <span style={{ fontSize: 12, color: portal.textSubtle }}>{card.suffix}</span>
            </div>
            <div style={{ height: 4, borderRadius: 2, background: portal.neutral, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, card.pct)}%`, background: portal.brand, transition: "width 600ms ease" }} />
            </div>
            <div style={{ fontSize: 12, color: card.noteColor, marginTop: 8 }}>{card.note}</div>
          </div>
        ))}
      </div>

      {/* Two-column: coverage + wards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 360px), 1fr))", gap: 24, alignItems: "start" }}>
        {/* Coverage summary */}
        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}` }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>Area readiness</div>
              <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>{ctx.geo_scope ?? ctx.role_label}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 132, height: 6, borderRadius: 3, background: portal.neutral, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${coveragePct}%`, background: coverageColor(coveragePct), transition: "width 700ms ease" }} />
              </div>
              <span style={{ fontSize: 20, lineHeight: "22px", fontWeight: 700 }}>{coveragePct}<span style={{ fontSize: 13, fontWeight: 600, color: portal.textSubtle }}>%</span></span>
            </div>
          </div>
          {[
            ...(m.constituency_agents_total > 0 ? [{ title: "Appoint constituency agents", req: "1 per constituency", done: m.constituency_agents_filled, total: m.constituency_agents_total, unit: "constituencies filled", detail: `${m.constituency_agents_total - m.constituency_agents_filled} constituency${m.constituency_agents_total - m.constituency_agents_filled !== 1 ? " slots" : ""} still open.` }] : []),
            ...(m.ward_admins_total > 0 ? [{ title: "Appoint ward admins", req: "1 per ward", done: m.ward_admins_filled, total: m.ward_admins_total, unit: "wards filled", detail: `${m.ward_admins_total - m.ward_admins_filled} ward${m.ward_admins_total - m.ward_admins_filled !== 1 ? "s" : ""} still need an admin.` }] : []),
            { title: "Recruit polling agents", req: "1 per station + reserve", done: m.covered_stations, total: m.total_stations, unit: "stations covered", detail: `${(m.total_stations - m.covered_stations).toLocaleString()} stations still uncovered.` },
            ...(m.ward_officers_total > 0 ? [{ title: "Appoint ward officers", req: "1 per ward", done: m.ward_officers_filled, total: m.ward_officers_total, unit: "wards named", detail: `${m.ward_officers_total - m.ward_officers_filled} ward${m.ward_officers_total - m.ward_officers_filled !== 1 ? "s" : ""} still need an officer.` }] : []),
          ].map((item) => {
            const pct = item.total > 0 ? Math.round(item.done / item.total * 100) : 100;
            const done = item.total === 0 || pct === 100;
            return (
              <div key={item.title} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "13px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, background: done ? "#E3FCEF" : pct === 0 ? portal.neutral : "#FFF7D6", color: done ? "#164B35" : pct === 0 ? portal.textSubtlest : "#974F0C" }}>
                  {done ? "✓" : pct === 0 ? "·" : "↻"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{item.title}</span>
                    <span style={{ fontSize: 12, color: portal.textSubtle }}>{item.req}</span>
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 3 }}>{item.detail}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 7 }}>
                    <div style={{ flex: 1, maxWidth: 220, height: 4, borderRadius: 2, background: portal.neutral, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: done ? "#1F845A" : portal.brand, transition: "width 600ms ease" }} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: done ? "#216E4E" : portal.textSubtle, whiteSpace: "nowrap" }}>
                      {item.done.toLocaleString()} of {item.total.toLocaleString()} {item.unit}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ padding: "12px 20px", fontSize: 12, color: portal.textSubtle }}>Counts roll up to the campaign view automatically.</div>
        </div>

        {/* Right column: ward officers + access */}
        <div>
          {ctx.wards.length > 0 && (
            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 16, fontWeight: 600 }}>Ward officers</span>
                <span style={{ fontSize: 12, color: portal.textSubtle }}>{m.ward_officers_filled} of {m.ward_officers_total} named</span>
              </div>
              {ctx.wards.map((w) => {
                const tagStyles = { confirmed: { bg: "#E3FCEF", color: "#164B35", label: "Confirmed" }, pending: { bg: "#FFF7D6", color: "#974F0C", label: "Invite sent" }, open: { bg: "#FFECEB", color: "#AE2A19", label: "Open" } };
                const ts = tagStyles[w.state];
                return (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: w.state === "open" ? "#AE2A19" : portal.textSubtle }}>{w.person ?? "Nobody named"}</div>
                    </div>
                    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: ts.bg, color: ts.color, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap", flexShrink: 0 }}>
                      {ts.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {/* Access summary — hidden for constituency agents; their permissions are self-evident from the portal */}
          {ctx.role !== 'constituency' && <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8 }}>
            <div style={{ padding: "14px 18px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 16, fontWeight: 600 }}>Your access</div>
            {[
              { on: ctx.can_invite, label: `Invite ${ctx.roles_below.map((r) => r.label.toLowerCase()).join(", ") || "officers below you"}`, detail: ctx.can_invite ? "Send targeted invites to roles beneath you." : "Campaign manager sends invites for your area." },
              { on: ctx.can_assign, label: "Approve applications", detail: ctx.can_assign ? "Approve, reject and assign to stations." : "Review and flag — CM makes the final call." },
              { on: false, label: "Other areas in the workspace", detail: ctx.geo_scope ? `Your view is limited to ${ctx.geo_scope}.` : "Your view is limited to your assigned area." },
              { on: false, label: "Workspace settings", detail: "Set by your campaign manager for every tier." },
            ].map(({ on, label, detail }) => (
              <div key={label} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 18px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                <span style={{ width: 18, height: 18, borderRadius: "50%", marginTop: 1, background: on ? "#E3FCEF" : portal.neutral, color: on ? "#164B35" : portal.textSubtlest, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {on ? "✓" : "✕"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: on ? portal.ink : portal.textSubtle }}>{label}</div>
                  <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 1 }}>{detail}</div>
                </div>
              </div>
            ))}
            <div style={{ padding: "10px 18px", fontSize: 12, color: portal.textSubtle }}>
              {ctx.appointed_by ? `Set by ${ctx.appointed_by.name}.` : "Set by your campaign manager."} Every action is logged under your name.
            </div>
          </div>}
        </div>
      </div>
    </div>
  );
}

// ---- Aspirant / CM overview -------------------------------------------------

function OverviewContent({
  workspace,
  stats,
  myRole,
  hasManagers,
  wardStations,
}: {
  workspace: Workspace;
  stats: Stats | null;
  myRole: string;
  hasManagers: boolean;
  wardStations: import('../../api').AssignedStation[] | null;
}) {
  const rawSteps = myRole === 'campaign_manager'
    ? STEPS.filter((s) => s.key !== 'managers')
    : STEPS;

  const totalStations   = stats?.total_stations ?? 0;
  const coveredStations = stats?.covered_stations ?? 0;
  const agentsDone = totalStations > 0 && coveredStations >= totalStations;

  const visibleSteps = rawSteps.map((s) => ({
    ...s,
    done: s.alwaysDone || (s.key === 'managers' && hasManagers) || (s.key === 'agents' && agentsDone),
    progress: s.key === 'agents' && totalStations > 0
      ? { covered: coveredStations, total: totalStations }
      : undefined,
  }));

  const doneCount = visibleSteps.filter((s) => s.done).length;
  const progressPct = Math.round((doneCount / visibleSteps.length) * 100);
  const firstPendingKey = visibleSteps.find((s) => !s.done)?.key;

  const countdown = useCountdown(workspace.election_date);

  const scopeDesc = buildScopeDesc(workspace);

  return (
    <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
      <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
        {myRole === 'aspirant' ? (
          <Link to="/workspaces" style={{ color: portal.textSubtle, textDecoration: "none" }}>
            Workspaces
          </Link>
        ) : (
          <span>Workspaces</span>
        )}
        {" / "}
        {workspace.name}
        {" / Overview"}
      </div>

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
          <div
            style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 4 }}
          >
            <span style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700 }}>{workspace.name}</span>
            <PillBadge label={seatLabel(workspace.seat)} tone="brand" />
            <PillBadge label={segmentLabel(workspace.segment)} tone="neutral" />
          </div>
          <div style={{ fontSize: 14, color: portal.textSubtle }}>{scopeDesc}</div>
        </div>
        <button
          style={{
            height: 32,
            padding: "0 12px",
            border: "none",
            borderRadius: 8,
            background: portal.neutral,
            color: portal.ink,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            flexShrink: 0,
            fontFamily: "inherit",
          }}
        >
          Open war room
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <StatCard
          label="Polling stations"
          value={stats === null ? "…" : stats.total_stations !== null ? stats.total_stations.toLocaleString() : "—"}
        />
        <StatCard
          label="Stations covered"
          value={stats === null ? "…" : (stats.covered_stations ?? 0).toLocaleString()}
          sub={stats?.total_stations != null ? `/ ${stats.total_stations.toLocaleString()}` : undefined}
        />
        <StatCard
          label="Applications in review"
          value={stats === null ? "…" : (stats.pending_applications ?? 0).toLocaleString()}
        />
        <StatCard label="Countdown to election" value={countdown} highlight />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) minmax(0, 1fr)",
          gap: 20,
          alignItems: "start",
        }}
      >
        <SetupGuide
          steps={visibleSteps}
          doneCount={doneCount}
          progressPct={progressPct}
          firstPendingKey={firstPendingKey}
          workspaceId={workspace.id}
        />

        <div>
          {workspace.scope === 'ward'
            ? <StationReadinessCard stations={wardStations} workspaceId={workspace.id} />
            : <ReadinessCard workspace={workspace} topWards={stats?.top_wards ?? null} />}
          {myRole === 'aspirant' && <SegmentPanel segment={workspace.segment} />}
        </div>
      </div>
    </div>
  );
}

// ---- countdown hook --------------------------------------------------------

function useCountdown(electionDate: string | null): string {
  const [days, setDays] = useState(() => calcDays(electionDate));
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDays(calcDays(electionDate));
    timerRef.current = setInterval(() => setDays(calcDays(electionDate)), 60_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [electionDate]);

  return days;
}

function calcDays(electionDate: string | null): string {
  if (!electionDate) return "—";
  const [y, m, d] = electionDate.split("-").map(Number);
  const target = new Date(y, m - 1, d, 6, 0, 0);
  const remaining = target.getTime() - Date.now();
  if (remaining <= 0) return "0";
  return String(Math.floor(remaining / 86_400_000));
}

// ---- scope description -----------------------------------------------------

function buildScopeDesc(w: Workspace): string {
  const chain = TALLY_CHAIN[w.seat] ?? "station → ward → constituency → county";
  const forms = FORMS[w.seat] ?? "";
  const geo = [w.ward, w.constituency, w.county ? `${w.county} County` : null].filter(Boolean).join(" · ");
  const parts = [geo || "All 47 counties", chain, forms].filter(Boolean);
  return parts.join(" · ");
}

// Tally path per seat — describes how completed forms travel up to declaration.
// MCA:       36A at station → 36B/36C at the constituency tallying centre
// MP:        35A at station → 35B at the constituency tallying centre
// Governor:  37A at station → 37B at constituency → 37C at county centre
// Senator:   38A at station → 38B at constituency → 38C at county centre
// President: 34A at station → 34B at constituency → 34C/34D at Bomas
const TALLY_CHAIN: Record<string, string> = {
  president: "station → constituency → Bomas",
  governor: "station → constituency → county",
  senator: "station → constituency → county",
  mp: "station → constituency",
  mca: "station → constituency",
};

const FORMS: Record<string, string> = {
  president: "Forms 34A / 34B / 34C / 34D",
  governor: "Forms 37A / 37B / 37C",
  senator: "Forms 38A / 38B / 38C",
  mp: "Forms 35A / 35B",
  mca: "Forms 36A / 36B / 36C",
};

// ---- sub-components --------------------------------------------------------

function StatCard({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      style={{
        border: `1px solid ${highlight ? portal.brand : portal.border}`,
        borderRadius: 8,
        padding: "14px 16px",
        background: highlight ? portal.brandSubtlest : portal.canvas,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: highlight ? portal.brandText : portal.textSubtle,
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{value}</span>
        {sub && <span style={{ fontSize: 12, color: portal.textSubtle }}>{sub}</span>}
      </div>
    </div>
  );
}

type EnhancedStep = typeof STEPS[number] & { done?: boolean; progress?: { covered: number; total: number } };

function SetupGuide({
  steps,
  doneCount,
  progressPct,
  firstPendingKey,
  workspaceId,
}: {
  steps: EnhancedStep[];
  doneCount: number;
  progressPct: number;
  firstPendingKey: string | undefined;
  workspaceId: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${portal.border}`,
        borderRadius: 8,
        boxShadow: portal.cardShadow,
      }}
    >
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 600 }}>Workspace setup guide</div>
          <div style={{ fontSize: 12, color: portal.textSubtle }}>
            {doneCount} of {steps.length} done
          </div>
        </div>
        <div
          style={{
            height: 4,
            background: portal.neutral,
            borderRadius: 3,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              borderRadius: 3,
              background: portal.brand,
              width: `${progressPct}%`,
              transition: "width 0.3s ease",
            }}
          />
        </div>
      </div>

      {steps.map((step, i) => {
        const done = !!(step.done ?? step.alwaysDone);
        const isPrimary = step.key === firstPendingKey;
        const isLast = i === steps.length - 1;
        return (
          <div
            key={step.key}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 12,
              padding: "14px 20px",
              borderBottom: isLast ? "none" : `1px solid ${portal.borderSubtle}`,
              background: isPrimary ? portal.brandSubtlest : "transparent",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                flexShrink: 0,
                marginTop: 2,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                color: portal.inverse,
                boxSizing: "border-box",
                background: done ? portal.successBold : "transparent",
                border: done ? "none" : isPrimary ? `1.5px solid ${portal.brand}` : `1.5px solid ${portal.border}`,
              }}
            >
              {done ? "✓" : ""}
            </span>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{step.title}</div>
              <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2, lineHeight: "16px" }}>
                {step.desc}
              </div>
              {step.progress && (
                <div style={{ marginTop: 8, maxWidth: 200 }}>
                  <div style={{ height: 4, borderRadius: 2, background: portal.neutral, overflow: "hidden" }}>
                    <div style={{
                      height: "100%",
                      borderRadius: 2,
                      background: (step.progress.covered >= step.progress.total) ? portal.successBold : portal.brand,
                      width: `${Math.min(100, Math.round((step.progress.covered / step.progress.total) * 100))}%`,
                      transition: "width 0.4s ease",
                    }} />
                  </div>
                </div>
              )}
            </div>

            {done && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 20,
                  padding: "0 8px",
                  borderRadius: 3,
                  background: portal.successBg,
                  color: portal.successText,
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.3px",
                  flexShrink: 0,
                  marginTop: 2,
                }}
              >
                Done
              </span>
            )}

            {!done && step.cta && step.route && (
              <Link
                to={step.route(workspaceId)}
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                  background: isPrimary ? portal.brand : portal.neutral,
                  color: isPrimary ? portal.inverse : portal.ink,
                }}
              >
                {step.cta}
              </Link>
            )}
            {!done && step.cta && !step.route && (
              <button
                disabled
                title="Coming soon"
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                  height: 32,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 8,
                  cursor: "not-allowed",
                  fontSize: 14,
                  fontWeight: 500,
                  background: portal.neutral,
                  color: portal.ink,
                  opacity: 0.5,
                  fontFamily: "inherit",
                }}
              >
                {step.cta}
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---- Station readiness card (MCA / ward-scoped) ----------------------------

function StationReadinessCard({
  stations,
  workspaceId,
}: {
  stations: import('../../api').AssignedStation[] | null;
  workspaceId: string;
}) {
  const STATE_CONFIG = {
    assigned: { bg: "#E3FCEF", color: "#164B35", dot: "#1F845A", label: "Confirmed" },
    pending:  { bg: "#FFF7D6", color: "#974F0C", dot: "#E2B203", label: "Invite sent" },
    gap:      { bg: "#FFECEB", color: "#AE2A19", dot: "#C9372C", label: "Uncovered"  },
  };

  const sorted = stations
    ? [...stations].sort((a, b) => {
        const order = { assigned: 0, pending: 1, gap: 2 };
        return order[a.state] - order[b.state] || a.name.localeCompare(b.name);
      })
    : null;

  const covered  = stations?.filter((s) => s.state === "assigned").length ?? 0;
  const total    = stations?.length ?? 0;
  const pct      = total > 0 ? Math.round((covered / total) * 100) : 0;

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 20 }}>
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${portal.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>Readiness by polling station</span>
        <Link to={`/workspaces/${workspaceId}/agents`} style={{ fontSize: 12, fontWeight: 500, color: portal.brandText, textDecoration: "none" }}>
          View all →
        </Link>
      </div>

      {sorted === null && (
        <div style={{ padding: "12px 20px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
      )}

      {sorted !== null && sorted.length === 0 && (
        <div style={{ padding: "12px 20px", fontSize: 13, color: portal.textSubtle }}>No stations found.</div>
      )}

      {sorted !== null && sorted.length > 0 && (
        <>
          {/* Summary bar */}
          <div style={{ padding: "10px 20px 12px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: portal.textSubtle }}>{covered} of {total} stations confirmed</span>
              <span style={{ fontWeight: 600, color: pct === 100 ? "#216E4E" : portal.textSubtle }}>{pct}%</span>
            </div>
            <div style={{ height: 5, background: portal.neutral, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: pct === 100 ? "#1F845A" : portal.brand, width: `${pct}%`, transition: "width 0.4s ease" }} />
            </div>
          </div>

          {/* Station rows */}
          {sorted.map((s) => {
            const cfg = STATE_CONFIG[s.state];
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</div>
                  {s.agent && (
                    <div style={{ fontSize: 11, color: portal.textSubtle }}>{s.agent.name}</div>
                  )}
                </div>
                <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px", borderRadius: 3, background: cfg.bg, color: cfg.color, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </>
      )}

      <div style={{ padding: "10px 20px", fontSize: 12, color: portal.textSubtle }}>
        Coverage confirmed per station as agents are vetted and assigned.
      </div>
    </div>
  );
}

// Label for the readiness grouping based on seat scope.
const READINESS_LABEL: Record<string, string> = {
  ward:         "Readiness by polling station",
  constituency: "Readiness by ward",
  county:       "Readiness by constituency",
  national:     "Readiness by county",
};

const READINESS_FOOTER: Record<string, string> = {
  ward:         "Coverage confirmed per station as agents are vetted and assigned.",
  constituency: "Coverage confirmed per ward as agents are vetted and assigned.",
  county:       "Coverage confirmed per constituency as agents are vetted and assigned.",
  national:     "Coverage confirmed per county as agents are vetted and assigned.",
};

function ReadinessCard({
  workspace,
  topWards,
}: {
  workspace: Workspace;
  topWards: TopWard[] | null;
}) {
  const title  = READINESS_LABEL[workspace.scope]  ?? "Readiness";
  const footer = READINESS_FOOTER[workspace.scope] ?? "Coverage confirmed as agents are vetted and assigned.";
  const geoLink = `/workspaces/${workspace.id}/geography`;

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 20 }}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: `1px solid ${portal.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 600 }}>{title}</span>
        <Link
          to={geoLink}
          style={{ fontSize: 12, fontWeight: 500, color: portal.brandText, textDecoration: "none" }}
        >
          View all →
        </Link>
      </div>

      {topWards === null && (
        <div style={{ padding: "12px 20px", fontSize: 13, color: portal.textSubtle }}>Loading…</div>
      )}

      {topWards !== null && topWards.length === 0 && (
        <div style={{ padding: "12px 20px", fontSize: 13, color: portal.textSubtle }}>
          No data available yet.
        </div>
      )}

      {topWards !== null &&
        topWards.map((w) => (
          <div key={w.id} style={{ padding: "12px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span style={{ fontWeight: 500 }}>{w.name}</span>
              <span style={{ color: portal.textSubtle }}>0 / {w.total_stations} covered</span>
            </div>
            <div style={{ height: 4, background: portal.neutral, borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, background: portal.dangerText, width: "0%" }} />
            </div>
          </div>
        ))}

      <div style={{ padding: "12px 20px", fontSize: 12, color: portal.textSubtle }}>{footer}</div>
    </div>
  );
}

function SegmentPanel({ segment }: { segment: string }) {
  const isGeneral = segment === "general";
  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8 }}>
      <div
        style={{ padding: "14px 20px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 16, fontWeight: 600 }}
      >
        Segment
      </div>
      <div style={{ padding: "14px 20px", fontSize: 13, color: portal.label, lineHeight: "20px" }}>
        {isGeneral
          ? "This is the general-election segment. Your primary segment stays separate and read-only — nothing you do here changes it."
          : "This is the party-primary segment. Your general-election segment will be created separately when you're ready."}
      </div>
      <div style={{ padding: "0 20px 16px" }}>
        <button
          disabled
          title="Coming soon"
          style={{
            height: 32,
            padding: "0 12px",
            border: "none",
            borderRadius: 8,
            background: portal.neutral,
            color: portal.ink,
            fontSize: 14,
            fontWeight: 500,
            cursor: "not-allowed",
            opacity: 0.6,
            fontFamily: "inherit",
          }}
        >
          Carry roster forward
        </button>
      </div>
    </div>
  );
}

function PillBadge({ label, tone }: { label: string; tone: "brand" | "neutral" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 3,
        background: tone === "brand" ? portal.brandSubtlest : portal.neutral,
        color: tone === "brand" ? portal.brandText : portal.textSubtle,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

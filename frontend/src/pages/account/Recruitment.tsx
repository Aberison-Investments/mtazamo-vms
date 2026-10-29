
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  api,
  type ApiError,
  type RecruitmentLink,
  type RecruitmentStation,
  type RecruitmentWard,
  type SeatRole,
  type TierContext,
  type Ward,
  type Constituency,
  type AgentInviteSent,
} from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { useAuth } from "../../auth";
import { useNotifications } from "../../notifications";

const EXPIRY_OPTIONS = [
  { hours: 48, label: "48 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];

function buildPhone(raw: string): string {
  const digits = raw.trim().replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length >= 12) return "+" + digits;
  if (digits.startsWith("0") && digits.length === 10) return "+254" + digits.slice(1);
  return "+254" + digits;
}

const ROLE_LABELS: Record<string, string> = {
  national: "National agent",
  county: "County agent",
  constituency: "Constituency agent",
  ward: "Ward admin",
  agent: "Polling agent",
  volunteer: "Volunteer",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  pending:  { bg: portal.warnBg,     text: portal.warnText,    label: "Pending" },
  accepted: { bg: portal.successBg,  text: portal.successText, label: "Accepted" },
  declined: { bg: portal.dangerBg,   text: portal.dangerText,  label: "Declined" },
  expired:  { bg: portal.neutral,    text: portal.textSubtle,  label: "Expired" },
};

export function Recruitment() {
  const { id } = useParams<{ id: string }>();
  const { workspace, myRole } = useWorkspaceContext();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get("tab") ?? "public") as "public" | "targeted";

  const [seatRoles, setSeatRoles] = useState<SeatRole[]>([]);
  const [recruitmentMyRole, setRecruitmentMyRole] = useState<string | null>(null);
  const [filledConstituencyIds, setFilledConstituencyIds] = useState<Set<string>>(new Set());
  const [filledWardIds, setFilledWardIds] = useState<Set<string>>(new Set());
  const [refreshKey, setRefreshKey] = useState(0);
  const [tierCtx, setTierCtx] = useState<TierContext | null>(null);

  const [linkDrawerOpen, setLinkDrawerOpen] = useState(false);
  const [linkDrawerWardId, setLinkDrawerWardId] = useState<string | null>(null);
  const [linkDrawerWardName, setLinkDrawerWardName] = useState<string | null>(null);

  const [inviteDrawerOpen, setInviteDrawerOpen] = useState(false);

  const [counties, setCounties] = useState<import("../../api").County[]>([]);

  const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);
  useEffect(() => {
    if (!id) return;
    api.getRecruitment(id, { page: 1, per_page: 1 }).then((res) => {
      setSeatRoles(res.seat_roles);
      setRecruitmentMyRole(res.my_role ?? null);
      setFilledConstituencyIds(new Set(res.filled_constituency_ids));
      setFilledWardIds(new Set(res.filled_ward_ids));
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!id || !myRole || !TIER_ROLES.has(myRole)) return;
    api.getTierContext(id)
      .then((ctx) => {
        setTierCtx(ctx);
        if (!ctx.can_assign && tab === "targeted") {
          navigate(`/workspaces/${id}/recruitment?tab=public`, { replace: true });
        }
      })
      .catch(() => {});
  }, [id, myRole]);

  useEffect(() => {
    if (!workspace) return;
    if (workspace.scope === "national") {
      api.listCounties().then((res) => setCounties(res.counties)).catch(() => {});
    }
  }, [workspace]);

  function handleLinkSaved(_wardId: string, _link: RecruitmentLink) {
    setRefreshKey((k) => k + 1);
  }

  const TIER_ORDER = ["national", "county", "constituency", "ward", "agent", "volunteer"];
  const invitableRoles = (() => {
    const roles = seatRoles.filter((r) => r.id !== "volunteer");
    if (!recruitmentMyRole || recruitmentMyRole === "aspirant" || recruitmentMyRole === "campaign_manager") return roles;
    const myPos = TIER_ORDER.indexOf(recruitmentMyRole);
    return roles.filter((r) => TIER_ORDER.indexOf(r.id) > myPos);
  })();

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to={`/workspaces/${workspace.id}`} style={{ color: portal.textSubtle, textDecoration: "none" }}>
            {workspace.name}
          </Link>
          {" / Recruitment"}
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
              {tab === "public" ? "Public application links" : "Targeted invites"}
            </div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              {tab === "public"
                ? "One link per ward. Share with anyone — applicants land in the pending queue."
                : "Send a named invite by SMS to a specific person for a specific role."}
            </div>
          </div>
          {tab === "public" && (
            <button
              onClick={() => { setLinkDrawerWardId(null); setLinkDrawerOpen(true); }}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M8 3v10M3 8h10" /></svg>
              Create public link
            </button>
          )}
          {tab === "targeted" && (
            <button
              onClick={() => setInviteDrawerOpen(true)}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 32, padding: "0 14px", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 500, border: "none", cursor: "pointer", flexShrink: 0, fontFamily: "inherit" }}
            >
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}><path d="M8 3v10M3 8h10" /></svg>
              Send invite
            </button>
          )}
        </div>

        {tab === "public" && (
          <PublicLinksTable
            workspaceId={id!}
            refreshKey={refreshKey}
            onConfigure={(wardId, wardName) => { setLinkDrawerWardId(wardId); setLinkDrawerWardName(wardName); setLinkDrawerOpen(true); }}
          />
        )}

        {tab === "targeted" && (
          <TargetedInvitesTable
            workspaceId={id!}
            refreshKey={refreshKey}
          />
        )}
      </div>

      {linkDrawerOpen && (
        <PublicLinkDrawer
          workspaceId={id!}
          preselectedWardId={linkDrawerWardId}
          preselectedWardName={linkDrawerWardName}
          onClose={() => setLinkDrawerOpen(false)}
          onSaved={handleLinkSaved}
        />
      )}

      {inviteDrawerOpen && workspace && (
        <SendInviteDrawer
          workspaceId={id!}
          workspace={workspace}
          invitableRoles={invitableRoles}
          counties={counties}
          filledConstituencyIds={filledConstituencyIds}
          filledWardIds={filledWardIds}
          aspirantName={user?.name ?? "Aspirant"}
          tierCtx={tierCtx}
          onClose={() => setInviteDrawerOpen(false)}
          onSent={() => setRefreshKey((k) => k + 1)}
        />
      )}
    </>
  );
}

// ---- TargetedInvitesTable ----------------------------------------------------

function TargetedInvitesTable({
  workspaceId,
  refreshKey,
}: {
  workspaceId: string;
  refreshKey: number;
}) {
  const [invites, setInvites] = useState<AgentInviteSent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.listAgentInvites(workspaceId)
      .then((res) => setInvites(res.invites))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, refreshKey]);

  function geoLabel(inv: AgentInviteSent): string {
    if (inv.station_name) return inv.station_name;
    if (inv.ward_name) return inv.ward_name;
    if (inv.constituency_name) return inv.constituency_name;
    if (inv.county_name) return inv.county_name;
    return "—";
  }

  const cols = "minmax(160px,1fr) 130px 100px minmax(140px,1fr) 120px 110px";

  if (loading && invites.length === 0) {
    return <div style={{ padding: "48px 0", textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>Loading…</div>;
  }

  if (!loading && invites.length === 0) {
    return (
      <div style={{ padding: "64px 0", textAlign: "center" }}>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 4 }}>No invites sent yet.</div>
        <div style={{ fontSize: 13, color: portal.textSubtlest }}>Click "Send invite" to invite a named person to a specific role.</div>
      </div>
    );
  }

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}>
      {/* Header */}
      <div style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 16px", background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`, gap: 12, alignItems: "center" }}>
        {(["Name", "Role", "Status", "Geographic scope", "Sent", "Expires"] as const).map((h) => (
          <span key={h} style={{ fontSize: 11, fontWeight: 700, color: portal.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
        ))}
      </div>

      {invites.map((inv, i) => {
        const st = STATUS_STYLES[inv.status] ?? STATUS_STYLES.pending;
        return (
          <div key={inv.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 16px", borderBottom: i < invites.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", gap: 12, alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 500, color: portal.ink }}>{inv.name}</div>
              <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 1 }}>{inv.phone}</div>
            </div>

            <div>
              <span style={{ fontSize: 12, color: portal.label }}>
                {ROLE_LABELS[inv.role] ?? inv.role}
              </span>
            </div>

            <div>
              <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: st.bg, color: st.text, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {st.label}
              </span>
            </div>

            <div style={{ fontSize: 13, color: portal.label, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {geoLabel(inv)}
            </div>

            <div style={{ fontSize: 12, color: portal.textSubtle }}>
              {inv.invited_at ? new Date(inv.invited_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </div>

            <div style={{ fontSize: 12, color: inv.status === "expired" ? portal.dangerText : portal.textSubtle }}>
              {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" }) : "—"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- SendInviteDrawer --------------------------------------------------------

// Roles that have a geo-scoped assignment (not national-level or management)
const GEO_LOCKED_ROLES = new Set(["county", "constituency", "ward"]);

function SendInviteDrawer({
  workspaceId,
  workspace,
  invitableRoles,
  counties,
  filledConstituencyIds,
  filledWardIds,
  aspirantName,
  tierCtx,
  onClose,
  onSent,
}: {
  workspaceId: string;
  workspace: import("../../api").Workspace;
  invitableRoles: SeatRole[];
  counties: import("../../api").County[];
  filledConstituencyIds: Set<string>;
  filledWardIds: Set<string>;
  aspirantName: string;
  tierCtx: TierContext | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const { add: addToast, update: updateToast } = useNotifications();

  const [visible, setVisible] = useState(false);
  const [inviteRole, setInviteRole] = useState("");
  const [inviteCountyId, setInviteCountyId] = useState("");
  const [inviteConstituencyId, setInviteConstituencyId] = useState("");
  const [inviteWardId, setInviteWardId] = useState("");
  const [inviteStationId, setInviteStationId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState(168);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [cascadeWards, setCascadeWards] = useState<Ward[]>([]);
  const [cascadeStations, setCascadeStations] = useState<RecruitmentStation[]>([]);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);

  // Derive which geo levels are locked to the current officer's assignment.
  // Only applies to county, constituency, ward officers — not national / CM / aspirant.
  const isGeoLocked = tierCtx && GEO_LOCKED_ROLES.has(tierCtx.role);
  const lockedCountyId       = isGeoLocked ? (tierCtx.county_id ?? null)       : null;
  const lockedConstituencyId = isGeoLocked ? (tierCtx.constituency_id ?? null) : null;
  const lockedWardId         = isGeoLocked ? (tierCtx.ward_id ?? null)         : null;

  // Resolved display names for locked fields
  const lockedCountyName       = lockedCountyId       ? (counties.find(c => c.id === lockedCountyId)?.name ?? workspace.county ?? null) : null;
  const lockedConstituencyName = lockedConstituencyId ? (constituencies.find(c => c.id === lockedConstituencyId)?.name ?? workspace.constituency ?? null) : null;
  const lockedWardName         = lockedWardId         ? (cascadeWards.find(w => w.id === lockedWardId)?.name ?? workspace.ward ?? null) : null;

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // Seed locked geo IDs into the form state on mount
  useEffect(() => {
    if (lockedCountyId)       setInviteCountyId(lockedCountyId);
    if (lockedConstituencyId) setInviteConstituencyId(lockedConstituencyId);
    if (lockedWardId)         setInviteWardId(lockedWardId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!workspace.county_id) return;
    if (workspace.scope !== "national") {
      api.countyTree(workspace.county_id).then((res) => setConstituencies(res.constituencies)).catch(() => {});
    }
  }, [workspace]);

  useEffect(() => {
    if (!inviteCountyId || workspace.scope !== "national") return;
    api.countyTree(inviteCountyId).then((res) => { setConstituencies(res.constituencies); setInviteConstituencyId(""); }).catch(() => {});
  }, [inviteCountyId, workspace.scope]);

  useEffect(() => {
    if (!inviteConstituencyId) { setCascadeWards([]); setInviteWardId(""); return; }
    api.constituencyWards(inviteConstituencyId).then((res) => { setCascadeWards(res.wards); setInviteWardId(""); }).catch(() => {});
  }, [inviteConstituencyId]);

  useEffect(() => {
    const effectiveWard = inviteWardId || (workspace.scope === "ward" ? workspace.ward_id ?? "" : "");
    if (!effectiveWard || !workspaceId) { setCascadeStations([]); setInviteStationId(""); return; }
    if (inviteRole !== "agent") { setCascadeStations([]); setInviteStationId(""); return; }
    api.getRecruitmentWard(workspaceId, effectiveWard).then((res) => { setCascadeStations(res.stations); setInviteStationId(""); }).catch(() => {});
  }, [inviteWardId, inviteRole, workspaceId, workspace]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  const selectedRole = invitableRoles.find((r) => r.id === inviteRole);
  const geoLevel =
    inviteRole === "agent" ? "station" :
    inviteRole === "ward" ? "ward" :
    inviteRole === "constituency" ? "constituency" :
    inviteRole === "county" ? "county" : "";

  const inviteDisabled =
    !inviteRole || !inviteName.trim() || !invitePhone.trim() ||
    (inviteRole === "agent" && !inviteStationId) || sending;

  function buildGeoSummary(): string {
    const parts: string[] = [];
    if (inviteRole === "agent" && cascadeStations.find((s) => s.id === inviteStationId)?.name) {
      parts.push(cascadeStations.find((s) => s.id === inviteStationId)!.name);
    }
    const ward = cascadeWards.find((w) => w.id === inviteWardId)?.name ?? (workspace.scope === "ward" ? workspace.ward : null);
    if (ward) parts.push(ward);
    const con = constituencies.find((c) => c.id === inviteConstituencyId)?.name ?? (workspace.scope === "constituency" || workspace.scope === "ward" ? workspace.constituency : null);
    if (con && inviteRole !== "constituency") parts.push(con);
    const cty = counties.find((c) => c.id === inviteCountyId)?.name ?? workspace.county;
    if (cty && inviteRole === "county") parts.push(cty + " County");
    return parts.filter(Boolean).join(" · ") || "—";
  }

  async function doSend() {
    if (!inviteRole || !inviteName.trim() || !invitePhone.trim()) return;
    setSending(true);
    setConfirmOpen(false);
    setInviteErrors({});
    const toastId = addToast("Sending invite…", "loading");
    try {
      const payload: Parameters<typeof api.sendAgentInvite>[1] = {
        role: inviteRole,
        name: inviteName.trim(),
        phone: buildPhone(invitePhone),
        expiry_hours: inviteExpiry,
      };
      const effectiveWardId = inviteWardId || (workspace.scope === "ward" ? workspace.ward_id ?? "" : "");
      const effectiveConstituencyId =
        inviteConstituencyId ||
        ((workspace.scope === "constituency" || workspace.scope === "ward") ? workspace.constituency_id ?? "" : "");
      const effectiveCountyId = inviteCountyId || (workspace.county_id ?? "");

      if (inviteStationId) payload.station_id = inviteStationId;
      if (effectiveWardId) payload.ward_id = effectiveWardId;
      if (effectiveConstituencyId) payload.constituency_id = effectiveConstituencyId;
      if (effectiveCountyId) payload.county_id = effectiveCountyId;

      await api.sendAgentInvite(workspaceId, payload);
      updateToast(toastId, `Invite sent to ${inviteName.trim()}.`, "success");
      onSent();
      handleClose();
    } catch (err) {
      const e = err as ApiError;
      const errs: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) { errs[k] = msgs[0]; }
      if (!Object.keys(errs).length) errs._general = e.message;
      setInviteErrors(errs);
      updateToast(toastId, e.message ?? "Could not send invite.", "error");
    } finally {
      setSending(false);
    }
  }

  const aspirantFirst = aspirantName.split(" ")[0];

  return (
    <>
      <div
        onClick={handleClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: `rgba(9,30,66,${visible ? 0.28 : 0})`, transition: "background 220ms ease-out" }}
      />

      <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 520, background: portal.canvas, boxShadow: "-4px 0 32px rgba(9,30,66,0.16)", transform: `translateX(${visible ? "0" : "100%"})`, transition: "transform 220ms ease-out", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: portal.font }}>
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${portal.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: portal.ink }}>Send targeted invite</div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginTop: 3 }}>Named person, specific role — one SMS, usable once.</div>
          </div>
          <button
            onClick={handleClose}
            style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: portal.neutral, color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: "inherit", fontSize: 20, lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {inviteErrors._general && (
            <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>
              {inviteErrors._general}
            </div>
          )}

          {/* Role picker */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Role <span style={{ color: portal.dangerText }}>*</span></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8 }}>
              {invitableRoles.map((r) => {
                const on = inviteRole === r.id;
                const disabled = r.filled;
                return (
                  <div
                    key={r.id}
                    title={disabled ? `${r.label} is already filled for this workspace.` : undefined}
                    onClick={() => {
                      if (disabled) return;
                      setInviteRole(r.id);
                      setInviteStationId("");
                      if (!lockedWardId)         setInviteWardId("");
                      if (!lockedConstituencyId) setInviteConstituencyId("");
                      if (!lockedCountyId)       setInviteCountyId("");
                    }}
                    style={{ padding: "10px 12px", border: `1px solid ${disabled ? portal.borderSubtle : on ? portal.brand : portal.border}`, borderRadius: 8, background: disabled ? portal.canvasSubtle : on ? portal.brandSubtlest : portal.canvas, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.6 : 1 }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: disabled ? portal.textSubtle : on ? portal.brandText : portal.ink }}>
                        {r.label}
                      </span>
                      {disabled && (
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 3, background: portal.neutral, color: portal.textSubtle, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                          Filled
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, lineHeight: "15px", color: portal.textSubtle }}>{r.blurb}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Geo scope */}
          {inviteRole && (
            <>
              <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 18 }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>
                Geographic scope <span style={{ color: portal.dangerText }}>*</span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 10 }}>
                {/* County field */}
                {workspace.scope === "national" && geoLevel !== "" && (
                  <div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>County</div>
                    {lockedCountyId ? (
                      <LockedGeoField label={lockedCountyName ? `${lockedCountyName} County` : "—"} />
                    ) : (
                      <SearchableSelect
                        items={counties.map((c) => ({ id: c.id, name: c.name }))}
                        value={inviteCountyId}
                        onChange={(cid) => { setInviteCountyId(cid); setInviteConstituencyId(""); setInviteWardId(""); setInviteStationId(""); }}
                        placeholder="Select county…"
                      />
                    )}
                  </div>
                )}

                {(workspace.scope === "county" || workspace.scope === "constituency") && (
                  <div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>County</div>
                    <LockedGeoField label={`${workspace.county} County`} />
                  </div>
                )}

                {/* Constituency field */}
                {(geoLevel === "constituency" || geoLevel === "ward" || geoLevel === "station") &&
                 (workspace.scope !== "ward" || geoLevel === "constituency") && (
                  <div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Constituency</div>
                    {(workspace.scope === "constituency" || workspace.scope === "ward" || lockedConstituencyId) ? (
                      <LockedGeoField label={lockedConstituencyName ?? workspace.constituency ?? "—"} />
                    ) : (
                      <SearchableSelect
                        items={constituencies}
                        value={inviteConstituencyId}
                        onChange={setInviteConstituencyId}
                        placeholder="Select constituency…"
                        filledIds={filledConstituencyIds}
                        disabled={workspace.scope === "national" && !inviteCountyId}
                      />
                    )}
                  </div>
                )}

                {/* Ward field */}
                {(geoLevel === "ward" || geoLevel === "station") && workspace.scope === "ward" && (
                  <div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Ward</div>
                    <LockedGeoField label={workspace.ward ?? "—"} />
                  </div>
                )}
                {(geoLevel === "ward" || geoLevel === "station") && (workspace.scope === "national" || workspace.scope === "county" || workspace.scope === "constituency") && (
                  <div>
                    <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Ward</div>
                    {lockedWardId ? (
                      <LockedGeoField label={lockedWardName ?? "—"} />
                    ) : (
                      <SearchableSelect
                        items={workspace.scope === "constituency"
                          ? constituencies.filter((c) => !workspace.constituency_id || c.id === workspace.constituency_id).flatMap((c) => c.wards)
                          : cascadeWards}
                        value={inviteWardId}
                        onChange={setInviteWardId}
                        placeholder="Select ward…"
                        disabled={!inviteConstituencyId && workspace.scope !== "constituency"}
                        filledIds={filledWardIds}
                      />
                    )}
                  </div>
                )}
              </div>

              {geoLevel === "station" && (inviteWardId || workspace.scope === "ward") && cascadeStations.length > 0 && (
                <>
                  <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 6 }}>
                    {cascadeStations.map((st, i) => {
                      const sel = inviteStationId === st.id;
                      const full = st.coverage === "full";
                      return (
                        <div
                          key={st.id}
                          onClick={() => setInviteStationId(st.id)}
                          style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < cascadeStations.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", cursor: "pointer", background: sel ? portal.brandSubtlest : portal.canvas }}
                        >
                          <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: portal.inverse, background: sel ? portal.brand : portal.canvas, border: `1px solid ${sel ? portal.brand : portal.textSubtlest}` }}>
                            {sel ? "●" : ""}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{st.name}</div>
                            <div style={{ fontSize: 11, color: portal.textSubtle }}>{st.code && `Station ${st.code} · `}{st.registered_voters?.toLocaleString()} voters</div>
                          </div>
                          {full && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: portal.successBg, color: portal.successText, fontWeight: 600 }}>Filled</span>}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>Filled stations already have an agent — you can still invite a second as backup.</div>
                </>
              )}
            </>
          )}

          {/* Person details */}
          <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 18 }} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Full name <span style={{ color: portal.dangerText }}>*</span></div>
              <input
                value={inviteName}
                onChange={(e) => setInviteName(e.target.value)}
                placeholder="Grace Njeri"
                style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${inviteErrors.name ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
              />
              {inviteErrors.name && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{inviteErrors.name}</div>}
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Phone <span style={{ color: portal.dangerText }}>*</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", height: 36, padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, color: portal.label, fontSize: 14, flexShrink: 0 }}>+254</span>
                <input
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  placeholder="7xx xxx xxx"
                  inputMode="numeric"
                  style={{ flex: 1, minWidth: 0, height: 36, boxSizing: "border-box" as const, border: `1px solid ${inviteErrors.phone ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
                />
              </div>
              {inviteErrors.phone && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{inviteErrors.phone}</div>}
            </div>
          </div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 18 }}>They still verify this number by OTP before the role takes effect.</div>

          {/* Expiry */}
          <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>Link expires</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
            {EXPIRY_OPTIONS.map((o) => {
              const on = inviteExpiry === o.hours;
              return (
                <div key={o.hours} onClick={() => setInviteExpiry(o.hours)} style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, border: `1px solid ${on ? portal.brand : portal.border}`, background: on ? portal.brandSubtlest : portal.canvas, color: on ? portal.brandText : portal.label }}>
                  {o.label}
                </div>
              );
            })}
          </div>

          {/* SMS preview */}
          <div style={{ padding: "12px 14px", borderRadius: 8, background: portal.canvasSubtle, border: `1px solid ${portal.borderSubtle}`, fontSize: 12, lineHeight: "18px", color: portal.label }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: portal.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>SMS preview</div>
            Hi {inviteName.trim() ? inviteName.trim().split(" ")[0] : "there"}, {aspirantFirst} has invited you as {selectedRole?.label ?? "a team member"} for the {workspace.name} campaign on Mtazamo Votes. Accept here: mtz.vote/ja/XXXXX
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "16px 24px", borderTop: `1px solid ${portal.border}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleClose}
            style={{ height: 36, padding: "0 16px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
          >
            Cancel
          </button>
          <button
            onClick={() => setConfirmOpen(true)}
            disabled={inviteDisabled}
            style={{ height: 36, padding: "0 20px", border: 0, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: inviteDisabled ? "default" : "pointer", background: inviteDisabled ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
          >
            {sending ? "Sending…" : "Review & send"}
          </button>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmInviteModal
          name={inviteName.trim()}
          phone={buildPhone(invitePhone)}
          roleLabel={selectedRole?.label ?? inviteRole}
          geoSummary={buildGeoSummary()}
          expiryLabel={EXPIRY_OPTIONS.find((o) => o.hours === inviteExpiry)?.label ?? `${inviteExpiry}h`}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={doSend}
        />
      )}
    </>
  );
}

// ---- ConfirmInviteModal ------------------------------------------------------

function ConfirmInviteModal({
  name,
  phone,
  roleLabel,
  geoSummary,
  expiryLabel,
  onCancel,
  onConfirm,
}: {
  name: string;
  phone: string;
  roleLabel: string;
  geoSummary: string;
  expiryLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const rows: [string, string][] = [
    ["Name", name],
    ["Phone", phone],
    ["Role", roleLabel],
    ["Scope", geoSummary],
    ["Link expires", expiryLabel],
  ];
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(9,30,66,0.22)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301, width: 380, background: portal.canvas, borderRadius: 10, boxShadow: "0 8px 32px rgba(9,30,66,0.2)", padding: "22px 22px 18px", fontFamily: portal.font }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: portal.ink, marginBottom: 4 }}>Send invite to {name}?</div>
        <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 18 }}>An SMS will be sent immediately. The link is single-use.</div>

        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
          {rows.map(([label, value], i) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, padding: "9px 12px", background: i % 2 === 0 ? portal.canvas : portal.canvasSubtle, borderBottom: i < rows.length - 1 ? `1px solid ${portal.borderSubtle}` : "none" }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: portal.textSubtle }}>{label}</span>
              <span style={{ fontSize: 13, color: portal.ink, wordBreak: "break-all" }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ height: 34, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Go back
          </button>
          <button onClick={onConfirm} style={{ height: 34, padding: "0 18px", border: "none", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Send SMS invite
          </button>
        </div>
      </div>
    </>
  );
}

// ---- PublicLinksTable --------------------------------------------------------

const PAGE_SIZE = 10;

type WardsMeta = { total: number; per_page: number; current_page: number; last_page: number };

function PublicLinksTable({
  workspaceId,
  refreshKey,
  onConfigure,
}: {
  workspaceId: string;
  refreshKey: number;
  onConfigure: (wardId: string, wardName: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [wards, setWards] = useState<RecruitmentWard[]>([]);
  const [meta, setMeta] = useState<WardsMeta | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setLoading(true);
    api.getRecruitment(workspaceId, { page, per_page: PAGE_SIZE, search: debouncedSearch || undefined })
      .then((res) => { setWards(res.wards); setMeta(res.wards_meta); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workspaceId, page, debouncedSearch, refreshKey]);

  async function handleCopy(link: RecruitmentLink) {
    const url = `${window.location.origin}/apply/${link.token}`;
    await navigator.clipboard.writeText(url);
    setCopiedId(link.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  const cols = "minmax(180px,1fr) 120px 110px minmax(140px,1fr) 40px";
  const totalPages = meta?.last_page ?? 1;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <div style={{ position: "relative", flex: 1, maxWidth: 340 }}>
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
            style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: portal.textSubtle, pointerEvents: "none" }}>
            <circle cx="6.5" cy="6.5" r="4" /><path d="M11 11l2.5 2.5" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search wards or constituencies…"
            style={{ width: "100%", height: 36, boxSizing: "border-box", paddingLeft: 32, paddingRight: 10, border: `1px solid ${portal.border}`, borderRadius: 8, fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
          />
        </div>
        {meta && (
          <span style={{ fontSize: 13, color: portal.textSubtle, flexShrink: 0 }}>
            {meta.total.toLocaleString()} ward{meta.total !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading && !meta ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>Loading…</div>
      ) : meta?.total === 0 ? (
        <div style={{ padding: "48px 0", textAlign: "center", color: portal.textSubtle, fontSize: 14 }}>
          {debouncedSearch ? `No wards match "${debouncedSearch}".` : "No wards configured for this workspace yet."}
        </div>
      ) : (
        <>
          <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", opacity: loading ? 0.6 : 1, transition: "opacity 150ms" }}>
            <div style={{ display: "grid", gridTemplateColumns: cols, padding: "9px 16px", background: portal.canvasSubtle, borderBottom: `1px solid ${portal.border}`, gap: 12, alignItems: "center" }}>
              {(["Ward", "Status", "Applications", "Link", ""] as const).map((h) => (
                <span key={h} style={{ fontSize: 11, fontWeight: 700, color: portal.textSubtle, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
              ))}
            </div>

            {wards.map((ward, i) => {
              const link = ward.link;
              const isCopied = link && copiedId === link.id;
              return (
                <div key={ward.id} style={{ display: "grid", gridTemplateColumns: cols, padding: "12px 16px", borderBottom: i < wards.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", gap: 12, alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: portal.ink }}>{ward.name}</div>
                    {ward.constituency_name && <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 1 }}>{ward.constituency_name}</div>}
                  </div>

                  <div>
                    {!link ? (
                      <span style={{ fontSize: 12, color: portal.textSubtle }}>No link</span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: link.is_active ? portal.successBg : portal.neutral, color: link.is_active ? portal.successText : portal.label, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                        {link.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 14, fontWeight: link?.application_count ? 600 : 400, color: link?.application_count ? portal.ink : portal.textSubtle }}>
                    {link ? link.application_count : "—"}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {link ? (
                      <>
                        <span style={{ fontSize: 12, color: portal.textSubtle, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                          {window.location.origin}/apply/{link.token}
                        </span>
                        <button
                          onClick={() => handleCopy(link)}
                          style={{ display: "inline-flex", alignItems: "center", height: 26, padding: "0 10px", borderRadius: 6, background: isCopied ? portal.successBg : portal.neutral, color: isCopied ? portal.successText : portal.label, fontSize: 12, fontWeight: 500, border: 0, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
                        >
                          {isCopied ? "Copied!" : "Copy"}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: portal.textSubtle }}>—</span>
                    )}
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => onConfigure(ward.id, ward.name)} title="Configure link"
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: portal.label, cursor: "pointer", fontFamily: "inherit" }}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 13, height: 13 }}>
                        <circle cx="8" cy="8" r="2" /><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M3.8 12.2l.7-.7M11.5 4.5l.7-.7" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14, fontSize: 13, color: portal.textSubtle }}>
              <span>
                Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, meta?.total ?? 0)} of {(meta?.total ?? 0).toLocaleString()}
              </span>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                  style={{ height: 30, padding: "0 12px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: page === 1 ? portal.textSubtlest : portal.ink, fontSize: 13, cursor: page === 1 ? "default" : "pointer", fontFamily: "inherit" }}>
                  Previous
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const pageNum = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)}
                      style={{ width: 30, height: 30, borderRadius: 6, border: `1px solid ${pageNum === page ? portal.brand : portal.border}`, background: pageNum === page ? portal.brandSubtlest : portal.canvas, color: pageNum === page ? portal.brandText : portal.ink, fontSize: 13, fontWeight: pageNum === page ? 600 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                      {pageNum}
                    </button>
                  );
                })}
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                  style={{ height: 30, padding: "0 12px", borderRadius: 6, border: `1px solid ${portal.border}`, background: portal.canvas, color: page === totalPages ? portal.textSubtlest : portal.ink, fontSize: 13, cursor: page === totalPages ? "default" : "pointer", fontFamily: "inherit" }}>
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- PublicLinkDrawer --------------------------------------------------------

function PublicLinkDrawer({
  workspaceId,
  preselectedWardId,
  preselectedWardName,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  preselectedWardId: string | null;
  preselectedWardName: string | null;
  onClose: () => void;
  onSaved: (wardId: string, link: RecruitmentLink) => void;
}) {
  const { add: addToast, update: updateToast } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [selectedWardId, setSelectedWardId] = useState(preselectedWardId ?? "");
  const [loadingWard, setLoadingWard] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [link, setLink] = useState<RecruitmentLink | null>(null);
  const [copied, setCopied] = useState(false);

  const [isActive, setIsActive] = useState(true);
  const [openRoles, setOpenRoles] = useState<string[]>(["agent", "volunteer"]);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!selectedWardId || !workspaceId) return;
    setLoadingWard(true);
    api.getRecruitmentWard(workspaceId, selectedWardId)
      .then((res) => {
        setLink(res.link);
        setIsActive(res.link.is_active);
        setOpenRoles(res.link.open_roles);
      })
      .catch(() => {
        setLink(null);
        setIsActive(true);
        setOpenRoles(["agent", "volunteer"]);
      })
      .finally(() => setLoadingWard(false));
  }, [selectedWardId, workspaceId]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  async function handleSave() {
    if (!selectedWardId) return;
    setSaving(true);
    const toastId = addToast("Saving link settings…", "loading");
    try {
      const res = await api.updateRecruitmentWard(workspaceId, selectedWardId, {
        is_active: isActive,
        open_roles: openRoles,
      });
      setLink(res.link);
      onSaved(selectedWardId, res.link);
      updateToast(toastId, "Link settings saved.", "success");
    } catch {
      updateToast(toastId, "Could not save settings. Try again.", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!selectedWardId) return;
    setConfirmRegenerate(false);
    const toastId = addToast("Regenerating link…", "loading");
    try {
      const res = await api.regenerateRecruitmentLink(workspaceId, selectedWardId);
      setLink(res.link);
      onSaved(selectedWardId, res.link);
      updateToast(toastId, "New link is live. The old one is now dead.", "success");
    } catch {
      updateToast(toastId, "Could not regenerate the link. Try again.", "error");
    }
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(`${window.location.origin}/apply/${link.token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleRole(role: string) {
    setOpenRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  }

  const [selectedWardName, setSelectedWardName] = useState<string | null>(preselectedWardName);
  const isLocked = !!preselectedWardId;
  const saveDisabled = !selectedWardId || saving;
  const wardName = selectedWardName ?? "this ward";

  return (
    <>
      <div
        onClick={handleClose}
        style={{ position: "fixed", inset: 0, zIndex: 200, background: `rgba(9,30,66,${visible ? 0.28 : 0})`, transition: "background 220ms ease-out" }}
      />

      <div
        style={{ position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 201, width: 480, background: portal.canvas, boxShadow: "-4px 0 32px rgba(9,30,66,0.16)", transform: `translateX(${visible ? "0" : "100%"})`, transition: "transform 220ms ease-out", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: portal.font }}
      >
        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${portal.border}`, display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: portal.ink }}>
              {isLocked ? "Configure public link" : "Create public link"}
            </div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginTop: 3 }}>
              {selectedWardName ?? "Select a ward to configure its application link"}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{ width: 32, height: 32, border: 0, borderRadius: 8, background: portal.neutral, color: portal.label, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontFamily: "inherit", fontSize: 20, lineHeight: 1, flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>Ward <span style={{ color: portal.dangerText }}>*</span></div>
            {isLocked ? (
              <div style={{ height: 38, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 12px", display: "flex", alignItems: "center", fontSize: 14, color: portal.ink, background: portal.canvasSubtle }}>
                {selectedWardName ?? "—"}
              </div>
            ) : (
              <DrawerWardSelect
                workspaceId={workspaceId}
                value={selectedWardId}
                onChange={(id, name) => { setSelectedWardId(id); setSelectedWardName(name); }}
              />
            )}
          </div>

          {selectedWardId && loadingWard && (
            <div style={{ fontSize: 14, color: portal.textSubtle, padding: "8px 0" }}>Loading…</div>
          )}

          {selectedWardId && !loadingWard && (
            <>
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: portal.ink }}>Link active</div>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>Turn off to stop accepting new applications without deleting the link.</div>
                  </div>
                  <Toggle value={isActive} onChange={setIsActive} />
                </div>
              </div>

              <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 20 }} />

              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 10 }}>Who can apply via this link</div>
                {(["agent", "volunteer"] as const).map((role) => {
                  const on = openRoles.includes(role);
                  const label = role === "agent" ? "Polling agent" : "Volunteer";
                  const desc = role === "agent" ? "Assigned to one polling station on election day." : "Mobilisation support, no station assignment.";
                  return (
                    <div
                      key={role}
                      onClick={() => toggleRole(role)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: `1px solid ${on ? portal.brand : portal.border}`, background: on ? portal.brandSubtlest : portal.canvas, marginBottom: 8, cursor: "pointer" }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: on ? portal.brandText : portal.ink }}>{label}</div>
                        <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 1 }}>{desc}</div>
                      </div>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${on ? portal.brand : portal.border}`, background: on ? portal.brand : portal.canvas, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {on && <svg viewBox="0 0 16 16" fill="none" stroke={portal.inverse} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 10, height: 10 }}><path d="M3 8l3.5 3.5L13 5" /></svg>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {link && (
                <>
                  <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 20 }} />
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Application link</div>
                    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, padding: "10px 12px", fontSize: 13, color: portal.ink, wordBreak: "break-all", marginBottom: 8 }}>
                      {`${window.location.origin}/apply/${link.token}`}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={handleCopy}
                        style={{ height: 30, padding: "0 14px", borderRadius: 6, background: copied ? portal.successBold : portal.brand, color: portal.inverse, fontSize: 13, fontWeight: 500, border: 0, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        {copied ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        onClick={() => setConfirmRegenerate(true)}
                        style={{ height: 30, padding: "0 14px", borderRadius: 6, background: portal.canvas, border: `1px solid ${portal.border}`, color: portal.label, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        Regenerate
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 6 }}>
                      Regenerating issues a new token. The current link stops accepting applications immediately — anyone with the old URL will see an error.
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "16px 24px", borderTop: `1px solid ${portal.border}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0 }}>
          <button
            onClick={handleClose}
            style={{ height: 36, padding: "0 16px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saveDisabled}
            style={{ height: 36, padding: "0 20px", border: 0, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saveDisabled ? "default" : "pointer", background: saveDisabled ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
        </div>
      </div>

      {confirmRegenerate && (
        <RegenerateConfirmModal
          wardName={wardName}
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={handleRegenerate}
        />
      )}
    </>
  );
}

// ---- RegenerateConfirmModal --------------------------------------------------

function RegenerateConfirmModal({
  wardName,
  onCancel,
  onConfirm,
}: {
  wardName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div onClick={onCancel} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(9,30,66,0.22)" }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 301, width: 360, background: portal.canvas, borderRadius: 10, boxShadow: "0 8px 32px rgba(9,30,66,0.2)", padding: "20px 20px 16px", fontFamily: portal.font }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: portal.ink, marginBottom: 6 }}>Regenerate link for {wardName}?</div>
        <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "19px", marginBottom: 8 }}>
          A new token will be created. <strong style={{ color: portal.ink }}>The current link stops accepting new applications immediately</strong> — anyone with the old URL will see an error when they try to open it.
        </div>
        <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "19px", marginBottom: 20 }}>
          Applications already submitted are not affected.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onCancel} style={{ height: 32, padding: "0 14px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, color: portal.ink, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
          <button onClick={onConfirm} style={{ height: 32, padding: "0 14px", border: "none", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            Regenerate link
          </button>
        </div>
      </div>
    </>
  );
}

// ---- LockedGeoField ----------------------------------------------------------

function LockedGeoField({ label }: { label: string }) {
  return (
    <div style={{ height: 36, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: portal.label, background: portal.canvasSubtle }}>
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 12, height: 12, flexShrink: 0, color: portal.textSubtlest }}>
        <rect x="4" y="7" width="8" height="7" rx="1" /><path d="M6 7V5a2 2 0 0 1 4 0v2" />
      </svg>
      {label}
    </div>
  );
}

// ---- Toggle ------------------------------------------------------------------

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      style={{ width: 40, height: 22, borderRadius: 11, border: 0, background: value ? portal.brand : portal.neutralHover, cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 150ms" }}
    >
      <span style={{ position: "absolute", top: 3, left: value ? 21 : 3, width: 16, height: 16, borderRadius: "50%", background: portal.canvas, boxShadow: "0 1px 3px rgba(0,0,0,0.2)", transition: "left 150ms" }} />
    </button>
  );
}


// ---- DrawerWardSelect --------------------------------------------------------

function DrawerWardSelect({
  workspaceId,
  value,
  onChange,
}: {
  workspaceId: string;
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [wards, setWards] = useState<RecruitmentWard[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    api.getRecruitment(workspaceId, { page: 1, per_page: 30, search: debouncedSearch || undefined })
      .then((res) => setWards(res.wards))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, debouncedSearch, workspaceId]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false); setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() {
    setOpen(true);
    setSearch("");
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleSelect(ward: RecruitmentWard) {
    setSelectedName(ward.name);
    onChange(ward.id, ward.name);
    setOpen(false);
    setSearch("");
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={open ? () => { setOpen(false); setSearch(""); } : handleOpen}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 38, padding: "0 10px 0 12px", border: `1px solid ${open ? portal.brand : portal.border}`, borderRadius: open ? "8px 8px 0 0" : 8, background: portal.canvas, cursor: "pointer", boxShadow: open ? `0 0 0 1px ${portal.brand}` : "none", boxSizing: "border-box" }}
      >
        <span style={{ fontSize: 14, color: selectedName ? portal.ink : portal.textSubtlest, flex: 1 }}>
          {selectedName ?? "Search and select a ward…"}
        </span>
        <span style={{ color: portal.textSubtlest, fontSize: 12, marginLeft: 8, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: portal.canvas, border: `1px solid ${portal.brand}`, borderTop: "none", borderRadius: "0 0 8px 8px", boxShadow: portal.cardShadow, zIndex: 20 }}>
          <div style={{ padding: "7px 8px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search wards…"
              style={{ width: "100%", height: 30, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 6, padding: "0 10px", fontSize: 13, color: portal.ink, background: portal.canvasSubtle, fontFamily: "inherit", outline: "none" }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {loading && <div style={{ padding: "10px 12px", fontSize: 13, color: portal.textSubtle }}>Searching…</div>}
            {!loading && wards.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: portal.textSubtle }}>{search ? "No wards match." : "Start typing to search."}</div>}
            {!loading && wards.map((w, i) => {
              const isSel = w.id === value;
              return (
                <div key={w.id} onClick={() => handleSelect(w)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: i < wards.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", cursor: "pointer", background: isSel ? portal.brandSubtlest : portal.canvas }}
                  onMouseEnter={(e) => { if (!isSel) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSel ? portal.brandSubtlest : portal.canvas; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 400, color: isSel ? portal.brandText : portal.ink }}>{w.name}</div>
                    {w.constituency_name && <div style={{ fontSize: 11, color: portal.textSubtle }}>{w.constituency_name}</div>}
                  </div>
                  {w.link?.is_active && <span style={{ width: 7, height: 7, borderRadius: "50%", background: portal.brand, flexShrink: 0 }} />}
                  {isSel && <span style={{ fontSize: 12, color: portal.brand }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- SearchableSelect --------------------------------------------------------

function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  disabled,
  filledIds,
}: {
  items: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  filledIds?: Set<string>;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = items.find((i) => i.id === value) ?? null;
  const filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) { setOpen(false); setSearch(""); }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleOpen() { if (disabled) return; setOpen(true); setSearch(""); setTimeout(() => inputRef.current?.focus(), 0); }
  function handleSelect(id: string) { onChange(id); setOpen(false); setSearch(""); }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div
        onClick={open ? () => { setOpen(false); setSearch(""); } : handleOpen}
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 36, padding: "0 10px 0 12px", border: `1px solid ${open ? portal.brand : portal.border}`, borderRadius: open ? "8px 8px 0 0" : 8, background: disabled ? portal.canvasSubtle : portal.canvas, cursor: disabled ? "not-allowed" : "pointer", boxShadow: open ? `0 0 0 1px ${portal.brand}` : "none", boxSizing: "border-box", opacity: disabled ? 0.7 : 1 }}
      >
        <span style={{ fontSize: 14, color: selected ? portal.ink : portal.textSubtlest, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {selected ? selected.name : (placeholder ?? "Select…")}
        </span>
        <span style={{ color: portal.textSubtlest, fontSize: 12, marginLeft: 8, flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>▾</span>
      </div>

      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: portal.canvas, border: `1px solid ${portal.brand}`, borderTop: "none", borderRadius: "0 0 8px 8px", boxShadow: portal.cardShadow, zIndex: 30 }}>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
            <input ref={inputRef} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" style={{ width: "100%", height: 30, boxSizing: "border-box", border: `1px solid ${portal.border}`, borderRadius: 6, padding: "0 8px", fontSize: 13, color: portal.ink, background: portal.canvasSubtle, fontFamily: "inherit", outline: "none" }} />
          </div>
          <div style={{ maxHeight: 220, overflowY: "auto" }}>
            {filtered.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: portal.textSubtle }}>No results.</div>}
            {filtered.map((item, i) => {
              const isSelected = item.id === value;
              const isFilled = filledIds?.has(item.id) ?? false;
              return (
                <div key={item.id} onClick={() => handleSelect(item.id)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: i < filtered.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", cursor: "pointer", background: isSelected ? portal.brandSubtlest : portal.canvas, fontSize: 13, fontWeight: isSelected ? 600 : 400, color: isSelected ? portal.brandText : portal.ink }}
                  onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = portal.canvasSubtle; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = isSelected ? portal.brandSubtlest : portal.canvas; }}
                >
                  <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
                  {isFilled && <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: portal.successBg, color: portal.successText, textTransform: "uppercase", letterSpacing: "0.3px", flexShrink: 0 }}>Filled</span>}
                  {isSelected && <span style={{ fontSize: 12, color: portal.brand, flexShrink: 0 }}>✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  api,
  type ApiError,
  type RecruitmentLink,
  type RecruitmentStation,
  type RecruitmentWard,
  type SeatRole,
  type Workspace,
  type Ward,
  type Constituency,
  type AgentInviteSent,
} from "../../api";
import { portal } from "../../portalTheme";
import { WorkspaceShell } from "../../components/portal/WorkspaceShell";
import { useAuth } from "../../auth";

const EXPIRY_OPTIONS = [
  { hours: 48, label: "48 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];


export function Recruitment() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [myRole, setMyRole] = useState<string>('campaign_manager');
  const [canAssign, setCanAssign] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<"public" | "targeted">("public");

  const [wards, setWards] = useState<RecruitmentWard[]>([]);
  const [seatRoles, setSeatRoles] = useState<SeatRole[]>([]);
  const [recruitmentMyRole, setRecruitmentMyRole] = useState<string | null>(null);
  const [selectedWardId, setSelectedWardId] = useState<string | null>(null);
  const [wardLink, setWardLink] = useState<RecruitmentLink | null>(null);
  const [wardStations, setWardStations] = useState<RecruitmentStation[]>([]);
  const [loadingWard, setLoadingWard] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

  const [inviteRole, setInviteRole] = useState("");
  const [inviteConstituencyId, setInviteConstituencyId] = useState("");
  const [inviteWardId, setInviteWardId] = useState("");
  const [inviteStationId, setInviteStationId] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteExpiry, setInviteExpiry] = useState(168);
  const [inviteSending, setInviteSending] = useState(false);
  const [inviteSent, setInviteSent] = useState<AgentInviteSent | null>(null);
  const [inviteDevToken, setInviteDevToken] = useState<string | null>(null);
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [recentInvites, setRecentInvites] = useState<AgentInviteSent[]>([]);

  const [constituencies, setConstituencies] = useState<Constituency[]>([]);
  const [cascadeWards, setCascadeWards] = useState<Ward[]>([]);
  const [cascadeStations, setCascadeStations] = useState<RecruitmentStation[]>([]);

  useEffect(() => {
    if (!id) return;
    api.getWorkspace(id).then(({ workspace: w, my_role }) => {
      setWorkspace(w);
      setMyRole(my_role);
    }).catch(() => setNotFound(true));
  }, [id]);

  useEffect(() => {
    if (!id || !workspace) return;
    api.getRecruitment(id).then((res) => {
      setWards(res.wards);
      setSeatRoles(res.seat_roles);
      setRecruitmentMyRole(res.my_role ?? null);
      if (res.wards.length === 1) setSelectedWardId(res.wards[0].id);
    }).catch(() => {});
  }, [id, workspace]);

  const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);
  useEffect(() => {
    if (!id || !myRole || !TIER_ROLES.has(myRole)) return;
    api.getTierContext(id)
      .then((ctx) => {
        setCanAssign(ctx.can_assign);
        if (!ctx.can_assign) setTab("public");
      })
      .catch(() => {});
  }, [id, myRole]);

  useEffect(() => {
    if (!id) return;
    api.listAgentInvites(id).then((res) => setRecentInvites(res.invites)).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!selectedWardId || !id) return;
    setLoadingWard(true);
    api.getRecruitmentWard(id, selectedWardId).then((res) => {
      setWardLink(res.link);
      setWardStations(res.stations);
    }).catch(() => {}).finally(() => setLoadingWard(false));
  }, [selectedWardId, id]);

  useEffect(() => {
    if (!workspace) return;
    if (workspace.scope === "constituency" || workspace.scope === "ward") {
      if (workspace.county_id) {
        api.countyTree(workspace.county_id).then((res) => {
          setConstituencies(res.constituencies);
        }).catch(() => {});
      }
    }
    if (workspace.scope === "national") {
      api.listCounties().then(() => {}).catch(() => {});
    }
  }, [workspace]);

  useEffect(() => {
    if (!inviteConstituencyId) {
      setCascadeWards([]);
      setInviteWardId("");
      return;
    }
    api.constituencyWards(inviteConstituencyId).then((res) => {
      setCascadeWards(res.wards);
      setInviteWardId("");
    }).catch(() => {});
  }, [inviteConstituencyId]);

  useEffect(() => {
    const effectiveWard = inviteWardId || (workspace?.scope === "ward" ? workspace?.ward_id ?? "" : "");
    if (!effectiveWard || !id) return;
    if (inviteRole !== "agent") {
      setCascadeStations([]);
      setInviteStationId("");
      return;
    }
    api.getRecruitmentWard(id, effectiveWard).then((res) => {
      setCascadeStations(res.stations);
      setInviteStationId("");
    }).catch(() => {});
  }, [inviteWardId, inviteRole, id, workspace]);

  async function handleSaveSettings() {
    if (!id || !selectedWardId || !wardLink) return;
    setSaving(true);
    setSaveOk(false);
    try {
      const res = await api.updateRecruitmentWard(id, selectedWardId, {
        open_roles: wardLink.open_roles,
      });
      setWardLink(res.link);
      setSaveOk(true);
      setTimeout(() => setSaveOk(false), 3000);
    } catch {
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!id || !selectedWardId) return;
    const res = await api.regenerateRecruitmentLink(id, selectedWardId);
    setWardLink(res.link);
  }

  function applyUrl(token: string) {
    return `${window.location.origin}/apply/${token}`;
  }

  async function handleCopy() {
    if (!wardLink) return;
    await navigator.clipboard.writeText(applyUrl(wardLink.token));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSendInvite() {
    if (!id || !inviteRole || !inviteName.trim() || !invitePhone.trim()) return;
    setInviteSending(true);
    setInviteErrors({});
    setInviteSent(null);
    setInviteDevToken(null);
    try {
      const payload: Parameters<typeof api.sendAgentInvite>[1] = {
        role: inviteRole,
        name: inviteName.trim(),
        phone: invitePhone.trim(),
        expiry_hours: inviteExpiry,
      };
      // For constituency-scoped workspaces the constituency field is locked (not a dropdown),
      // so fall back to the workspace's own constituency_id.
      const effectiveWardId =
        inviteWardId || (workspace?.scope === "ward" ? workspace?.ward_id ?? "" : "");
      const effectiveConstituencyId =
        inviteConstituencyId ||
        ((workspace?.scope === "constituency" || workspace?.scope === "ward") ? workspace?.constituency_id ?? "" : "");
      const effectiveCountyId = workspace?.county_id ?? "";

      if (inviteStationId) payload.station_id = inviteStationId;
      if (effectiveWardId) payload.ward_id = effectiveWardId;
      if (effectiveConstituencyId) payload.constituency_id = effectiveConstituencyId;
      if (effectiveCountyId) payload.county_id = effectiveCountyId;

      const res = await api.sendAgentInvite(id, payload);
      setInviteSent(res.invite);
      if (res.invite.dev_token) setInviteDevToken(res.invite.dev_token);
      setInviteName("");
      setInvitePhone("");
      setInviteRole("");
      api.listAgentInvites(id).then((r) => setRecentInvites(r.invites)).catch(() => {});
    } catch (err) {
      const e = err as ApiError;
      const errs: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) {
        errs[k] = msgs[0];
      }
      if (!Object.keys(errs).length) errs._general = e.message;
      setInviteErrors(errs);
    } finally {
      setInviteSending(false);
    }
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

  // Roles the current caller is allowed to invite (roles strictly below them in the chain).
  const TIER_ORDER = ["national", "county", "constituency", "ward", "agent", "volunteer"];
  const invitableRoles = (() => {
    const roles = seatRoles.filter((r) => r.id !== "volunteer");
    if (!recruitmentMyRole || recruitmentMyRole === "aspirant" || recruitmentMyRole === "campaign_manager") {
      return roles;
    }
    const myPos = TIER_ORDER.indexOf(recruitmentMyRole);
    return roles.filter((r) => TIER_ORDER.indexOf(r.id) > myPos);
  })();

  const selectedRole = seatRoles.find((r) => r.id === inviteRole);
  const geoLevel = inviteRole === "agent" ? "station" : inviteRole === "ward" ? "ward" : inviteRole === "constituency" ? "constituency" : inviteRole === "county" ? "county" : "";

  const inviteDisabled =
    !inviteRole ||
    !inviteName.trim() ||
    !invitePhone.trim() ||
    (inviteRole === "agent" && !inviteStationId) ||
    inviteSending;

  const aspirantFirst = user?.name?.split(" ")[0] ?? "Aspirant";

  return (
    <WorkspaceShell workspace={workspace} active="recruitment" myRole={myRole}>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to={`/workspaces/${workspace.id}`} style={{ color: portal.textSubtle, textDecoration: "none" }}>
            {workspace.name}
          </Link>
          {" / Recruitment"}
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>Recruitment</div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 20 }}>
          One public application link per ward, or send a named invite to a specific person.
        </div>

        <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${portal.border}`, marginBottom: 24 }}>
          {(["public", "targeted"] as const)
            .filter((t) => t === "public" || canAssign)
            .map((t) => {
              const active = tab === t;
              return (
                <div
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "10px 16px",
                    fontSize: 14,
                    fontWeight: active ? 600 : 400,
                    color: active ? portal.brandText : portal.label,
                    borderBottom: active ? `2px solid ${portal.brand}` : "2px solid transparent",
                    cursor: "pointer",
                    marginBottom: -1,
                  }}
                >
                  {t === "public" ? "Public application link" : "Targeted invite"}
                </div>
              );
            })}
        </div>

        {tab === "public" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow, padding: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Wards open for applications</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                {wards.map((w) => {
                  const active = w.id === selectedWardId;
                  const hasLink = w.link?.is_active;
                  return (
                    <div
                      key={w.id}
                      onClick={() => setSelectedWardId(w.id)}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        height: 28,
                        padding: "0 10px",
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: "pointer",
                        border: `1px solid ${active ? portal.brand : hasLink ? portal.brand : portal.border}`,
                        background: active ? portal.brandSubtlest : hasLink ? "#EEF6F8" : portal.neutral,
                        color: active ? portal.brandText : hasLink ? portal.brandText : portal.label,
                      }}
                    >
                      {w.name}
                      {w.link && (
                        <span style={{ fontSize: 11, color: hasLink ? portal.successBold : portal.textSubtlest }}>
                          {w.link.application_count}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>
                Active wards show in teal. Click to configure.
              </div>

              {!selectedWardId && (
                <div style={{ fontSize: 14, color: portal.textSubtle, padding: "24px 0", textAlign: "center" }}>
                  Select a ward above to configure its application link.
                </div>
              )}

              {selectedWardId && loadingWard && (
                <div style={{ fontSize: 14, color: portal.textSubtle, padding: "16px 0" }}>Loading…</div>
              )}

              {selectedWardId && !loadingWard && wardLink && (
                <>
                  <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 18 }} />

                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: wardLink.is_active ? portal.successBg : portal.neutral, color: wardLink.is_active ? portal.successText : portal.label, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      {wardLink.is_active ? "Active" : "Inactive"}
                    </span>
                    <span style={{ fontSize: 12, color: portal.textSubtle }}>{selectedWard?.name} Ward</span>
                  </div>

                  <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, padding: "12px 14px", fontSize: 13, color: portal.ink, wordBreak: "break-all", marginBottom: 10 }}>
                    {applyUrl(wardLink.token)}
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                    <button
                      onClick={handleCopy}
                      style={{ display: "flex", alignItems: "center", height: 32, padding: "0 14px", borderRadius: 8, background: copied ? portal.successBold : portal.brand, color: portal.inverse, fontSize: 13, fontWeight: 600, cursor: "pointer", border: 0, fontFamily: "inherit" }}
                    >
                      {copied ? "Copied!" : "Copy link"}
                    </button>
                    <button
                      onClick={handleRegenerate}
                      style={{ display: "flex", alignItems: "center", height: 32, padding: "0 14px", borderRadius: 8, background: portal.canvas, border: `1px solid ${portal.border}`, color: portal.label, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}
                    >
                      Regenerate
                    </button>
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>
                    Regenerating kills the old link immediately.
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button
                      onClick={handleSaveSettings}
                      disabled={saving}
                      style={{ height: 36, padding: "0 20px", border: 0, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: saving ? "default" : "pointer", background: saveOk ? portal.successBold : saving ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
                    >
                      {saving ? "Saving…" : saveOk ? "Saved" : "Save settings"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div>
              {wardLink && (
                <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ padding: "14px 18px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 16, fontWeight: 600 }}>Since the link went out</div>
                  {[
                    { label: "Total applications", value: String(wardLink.application_count), color: portal.ink },
                    { label: "Stations in ward", value: String(wardStations.length), color: portal.ink },
                    { label: "Stations covered", value: String(wardStations.filter((s) => s.coverage === "full").length), color: portal.successText },
                    { label: "Stations still open", value: String(wardStations.filter((s) => s.coverage === "gap").length), color: portal.dangerText },
                  ].map((s) => (
                    <div key={s.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "11px 18px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                      <span style={{ fontSize: 13, color: portal.label }}>{s.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: s.color }}>{s.value}</span>
                    </div>
                  ))}
                  <div style={{ padding: "12px 18px", fontSize: 12 }}>
                    <Link to={`/workspaces/${workspace.id}/agents/pending`} style={{ textDecoration: "none", fontWeight: 500 }}>Open the review queue</Link>
                  </div>
                </div>
              )}

              <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, padding: "14px 18px", fontSize: 12, lineHeight: "18px", color: portal.textSubtle }}>
                Applicants are not assigned anywhere by this link. After approval you place them from the ward coverage board, individually or in bulk.
              </div>
            </div>
          </div>
        )}

        {tab === "targeted" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 24, alignItems: "start" }}>
            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow, padding: 24 }}>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Invite a named person to a role</div>
              <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 20 }}>
                For people you already know. Sent by SMS to one number, usable once.
              </div>

              {inviteErrors._general && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>
                  {inviteErrors._general}
                </div>
              )}

              {inviteSent && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.successBg, color: portal.successText, fontSize: 13, marginBottom: inviteDevToken ? 6 : 16 }}>
                  Invite sent to {inviteSent.name}.
                </div>
              )}

              {inviteDevToken && (
                <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.warnBg, color: portal.warnText, fontSize: 13, marginBottom: 16 }}>
                  Dev mode — Join link:{" "}
                  <a href={`${window.location.origin}/join/agent/${inviteDevToken}`} style={{ fontFamily: "monospace", color: "inherit" }}>
                    {window.location.origin}/join/agent/{inviteDevToken}
                  </a>
                </div>
              )}

              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>Role <span style={{ color: portal.dangerText }}>*</span></div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 8, marginBottom: 20 }}>
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
                        setInviteWardId("");
                        setInviteConstituencyId("");
                      }}
                      style={{
                        padding: "10px 12px",
                        border: `1px solid ${disabled ? portal.borderSubtle : on ? portal.brand : portal.border}`,
                        borderRadius: 8,
                        background: disabled ? portal.canvasSubtle : on ? portal.brandSubtlest : portal.canvas,
                        cursor: disabled ? "not-allowed" : "pointer",
                        opacity: disabled ? 0.6 : 1,
                      }}
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

              {inviteRole && (
                <>
                  <div style={{ height: 1, background: portal.borderSubtle, marginBottom: 18 }} />
                  <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>
                    Geographic scope <span style={{ color: portal.dangerText }}>*</span>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 10 }}>
                    {(workspace.scope === "county" || workspace.scope === "constituency") && (
                      <div>
                        <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>County</div>
                        <div style={{ height: 36, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 14, color: portal.label, background: portal.canvasSubtle }}>
                          {workspace.county} County
                        </div>
                      </div>
                    )}

                    {(geoLevel === "constituency" || geoLevel === "ward" || geoLevel === "station") &&
                     (workspace.scope !== "ward" || geoLevel === "constituency") && (
                      <div>
                        <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Constituency</div>
                        {(workspace.scope === "constituency" || workspace.scope === "ward") ? (
                          <div style={{ height: 36, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 14, color: portal.label, background: portal.canvasSubtle }}>
                            {workspace.constituency}
                          </div>
                        ) : (
                          <select
                            value={inviteConstituencyId}
                            onChange={(e) => setInviteConstituencyId(e.target.value)}
                            style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 8px", fontSize: 14, fontFamily: "inherit" }}
                          >
                            <option value="">Select…</option>
                            {constituencies.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {(geoLevel === "ward" || geoLevel === "station") && workspace.scope === "ward" && (
                      <div>
                        <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Ward</div>
                        <div style={{ height: 36, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", display: "flex", alignItems: "center", fontSize: 14, color: portal.label, background: portal.canvasSubtle }}>
                          {workspace.ward}
                        </div>
                      </div>
                    )}
                    {(geoLevel === "ward" || geoLevel === "station") && (workspace.scope === "national" || workspace.scope === "county" || workspace.scope === "constituency") && (
                      <div>
                        <div style={{ fontSize: 11, color: portal.textSubtle, marginBottom: 3 }}>Ward</div>
                        <select
                          value={inviteWardId}
                          onChange={(e) => setInviteWardId(e.target.value)}
                          disabled={!inviteConstituencyId && workspace.scope !== "constituency"}
                          style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 8px", fontSize: 14, fontFamily: "inherit", background: (!inviteConstituencyId && workspace.scope !== "constituency") ? portal.canvasSubtle : portal.canvas, color: portal.ink }}
                        >
                          <option value="">Select…</option>
                          {(workspace.scope === "constituency"
                            ? constituencies
                                .filter((c) => !workspace.constituency_id || c.id === workspace.constituency_id)
                                .flatMap((c) => c.wards)
                            : cascadeWards
                          ).map((w) => (
                            <option key={w.id} value={w.id}>{w.name}</option>
                          ))}
                        </select>
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
                              onClick={() => !full && setInviteStationId(st.id)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < cascadeStations.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", cursor: full ? "default" : "pointer", background: sel ? portal.brandSubtlest : portal.canvas, opacity: full ? 0.5 : 1 }}
                            >
                              <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: portal.inverse, background: sel ? portal.brand : portal.canvas, border: `1px solid ${sel ? portal.brand : portal.textSubtlest}` }}>
                                {sel ? "●" : ""}
                              </span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 500 }}>{st.name}</div>
                                <div style={{ fontSize: 11, color: portal.textSubtle }}>{st.code && `Station ${st.code} · `}{st.registered_voters?.toLocaleString()} voters</div>
                              </div>
                              {full && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: portal.successBg, color: portal.successText }}>Covered</span>}
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>Covered stations cannot be selected.</div>
                    </>
                  )}
                </>
              )}

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

              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>Link expires</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>
                {EXPIRY_OPTIONS.map((o) => {
                  const on = inviteExpiry === o.hours;
                  return (
                    <div
                      key={o.hours}
                      onClick={() => setInviteExpiry(o.hours)}
                      style={{ display: "inline-flex", alignItems: "center", height: 30, padding: "0 12px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500, border: `1px solid ${on ? portal.brand : portal.border}`, background: on ? portal.brandSubtlest : portal.canvas, color: on ? portal.brandText : portal.label }}
                    >
                      {o.label}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <Link
                  to={`/workspaces/${workspace.id}`}
                  style={{ display: "flex", alignItems: "center", height: 36, padding: "0 14px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 500, textDecoration: "none" }}
                >
                  Cancel
                </Link>
                <button
                  onClick={handleSendInvite}
                  disabled={inviteDisabled}
                  style={{ height: 36, padding: "0 20px", border: 0, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: inviteDisabled ? "default" : "pointer", background: inviteDisabled ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
                >
                  {inviteSending ? "Sending…" : "Send SMS invite"}
                </button>
              </div>
            </div>

            <div>
              <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 16, fontWeight: 600 }}>Invite preview</div>
                <div style={{ padding: "16px 18px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: portal.brandSubtlest, color: portal.brandText, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.3px" }}>
                      {selectedRole?.label ?? "—"}
                    </span>
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                    {inviteName.trim() ? `${inviteName.trim()} is invited` : "Person's name"}
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 14 }}>
                    {selectedRole?.blurb ?? "Select a role to see the description."}
                  </div>
                  <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, padding: "10px 12px", fontSize: 12, lineHeight: "18px", color: portal.label }}>
                    Hi {inviteName.trim() ? inviteName.trim().split(" ")[0] : "there"}, {aspirantFirst} has invited you as {selectedRole?.label ?? "a team member"} for the {workspace.name} campaign on Mtazamo Votes. Accept here: mtz.vote/ja/XXXXX
                  </div>
                </div>
              </div>

              <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8 }}>
                <div style={{ padding: "14px 18px", borderBottom: `1px solid ${portal.borderSubtle}`, fontSize: 16, fontWeight: 600 }}>Outstanding invites</div>
                {recentInvites.length === 0 && (
                  <div style={{ padding: "16px 18px", fontSize: 13, color: portal.textSubtle }}>No invites sent yet.</div>
                )}
                {recentInvites.map((inv) => (
                  <div key={inv.id} style={{ padding: "11px 18px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{inv.name}</div>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
                      {inv.role} · {inv.status} · {inv.expires_at ? new Date(inv.expires_at).toLocaleDateString() : "—"}
                    </div>
                  </div>
                ))}
                {recentInvites.length > 0 && (
                  <div style={{ padding: "12px 18px", fontSize: 12 }}>
                    <a href="#" style={{ textDecoration: "none", fontWeight: 500 }}>See all outstanding invites</a>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}

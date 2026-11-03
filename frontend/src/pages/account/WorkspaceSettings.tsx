import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type DelegationRules, type DelegationSettings, type Workspace } from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

// ---- seat chain helpers -----------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  national:      "National agent",
  county:        "County agent",
  constituency:  "Constituency agent",
  ward:          "Ward admin",
  agent:         "Polling agent",
};

const ROLE_SCOPE: Record<string, string> = {
  national:      "National tallying centre · presidential chain only",
  county:        "County-wide across all constituencies",
  constituency:  "Constituency tallying centre · all wards",
  ward:          "All stations within the ward",
};

// All tier-officer roles (can receive delegation), derived from the spec's seat chains.
const SEAT_OFFICER_ROLES: Record<string, string[]> = {
  president: ["national", "county", "constituency", "ward"],
  governor:  ["county", "constituency", "ward"],
  senator:   ["county", "constituency", "ward"],
  mp:        ["constituency", "ward"],
  mca:       ["constituency", "ward"],
};

// Full chain including agent (for "tiers they can invite" display).
const SEAT_FULL_CHAIN: Record<string, string[]> = {
  president: ["national", "county", "constituency", "ward", "agent"],
  governor:  ["county", "constituency", "ward", "agent"],
  senator:   ["county", "constituency", "ward", "agent"],
  mp:        ["constituency", "ward", "agent"],
  mca:       ["constituency", "ward", "agent"],
};

// ---- Toggle component -------------------------------------------------------

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{
        width: 34,
        height: 20,
        borderRadius: 9999,
        flexShrink: 0,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        padding: 2,
        boxSizing: "border-box",
        justifyContent: on ? "flex-end" : "flex-start",
        background: on ? portal.brand : "#B3B9C4",
        transition: "background 0.15s",
      }}
    >
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: portal.inverse,
          display: "block",
        }}
      />
    </div>
  );
}

// ---- Delegation tab ---------------------------------------------------------

function DelegationTab({
  workspace,
  delegation,
  onSaved,
}: {
  workspace: Workspace;
  delegation: DelegationSettings;
  onSaved: (d: DelegationSettings) => void;
}) {
  const officerRoles = SEAT_OFFICER_ROLES[workspace.seat] ?? [];
  const fullChain    = SEAT_FULL_CHAIN[workspace.seat] ?? [];

  const [rules, setRules] = useState<DelegationRules>(() => {
    const init: DelegationRules = {};
    for (const r of officerRoles) init[r] = { invite: false, assign: false };
    return { ...init, ...delegation.rules };
  });

  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  function toggleInvite(role: string) {
    setRules((prev) => {
      const wasOn = prev[role]?.invite ?? false;
      return {
        ...prev,
        [role]: {
          invite: !wasOn,
          // turn off assign too when invite is switched off
          assign: wasOn ? false : (prev[role]?.assign ?? false),
        },
      };
    });
    setSaved(false);
  }

  function toggleAssign(role: string) {
    setRules((prev) => ({
      ...prev,
      [role]: { ...prev[role], assign: !(prev[role]?.assign ?? false) },
    }));
    setSaved(false);
  }

  function reset() {
    const defaults: DelegationRules = {};
    for (const r of officerRoles) defaults[r] = { invite: false, assign: false };
    setRules(defaults);
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveDelegation(workspace.id, rules);
      onSaved(res.delegation);
      setSaved(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  // Tier ladder chips
  const ladderChips = fullChain.map((role, i) => (
    <span key={role} style={{ display: "inline-flex", alignItems: "center", gap: 8, whiteSpace: "nowrap" }}>
      {i > 0 && (
        <span style={{ fontSize: 12, color: portal.textSubtlest }}>→</span>
      )}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          height: 26,
          padding: "0 10px",
          borderRadius: 13,
          background: portal.brandSubtlest,
          color: portal.brandText,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {ROLE_LABELS[role] ?? role}
      </span>
    </span>
  ));

  return (
    <div>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
        Who can invite and approve whom
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: "19px",
          color: portal.label,
          marginBottom: 20,
          maxWidth: 640,
        }}
      >
        A tier officer can be allowed to invite everyone beneath them within their
        own area. Approving applications is a separate permission. Turn a tier off
        and that work comes back to you.
      </div>

      {/* Seat + tier ladder summary */}
      <div
        style={{
          border: `1px solid ${portal.border}`,
          borderRadius: 8,
          padding: "16px 20px",
          marginBottom: 20,
          display: "flex",
          gap: 20,
          flexWrap: "wrap",
          alignItems: "flex-start",
        }}
      >
        <div style={{ flex: 1, minWidth: 180 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>
            Seat
          </div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{workspace.name}</div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
            {workspace.seat.charAt(0).toUpperCase() + workspace.seat.slice(1)}
            {workspace.county ? ` · ${workspace.county} County` : ""}
          </div>
        </div>
        <div style={{ flex: 2, minWidth: 260 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>
            Tiers in this workspace
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {ladderChips}
          </div>
        </div>
      </div>

      {/* Tier cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 24 }}>
        {officerRoles.map((role) => {
          const inviteOn  = rules[role]?.invite ?? false;
          const assignOn  = rules[role]?.assign ?? false;
          const belowRoles = fullChain.slice(fullChain.indexOf(role) + 1);

          return (
            <div
              key={role}
              style={{
                border: `1px solid ${inviteOn ? portal.border : "#EBECF0"}`,
                borderRadius: 8,
                background: inviteOn ? portal.canvas : portal.canvasSubtle,
                overflow: "hidden",
              }}
            >
              {/* Card header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 14,
                  flexWrap: "wrap",
                  padding: "16px 20px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 2 }}>
                    {ROLE_LABELS[role] ?? role}
                  </div>
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>
                    {ROLE_SCOPE[role] ?? ""}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: portal.label }}>Can send invites</span>
                  <Toggle on={inviteOn} onToggle={() => toggleInvite(role)} />
                </div>
              </div>

              {/* Expanded panel — invite is ON */}
              {inviteOn && (
                <div style={{ padding: "16px 20px" }}>
                  {/* Tiers they can invite */}
                  <div
                    style={{
                      display: "flex",
                      gap: 14,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                      padding: "12px 14px",
                      borderRadius: 8,
                      background: portal.canvasSubtle,
                      marginBottom: 16,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                          color: portal.textSubtle,
                          marginBottom: 6,
                        }}
                      >
                        Tiers they can invite
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {belowRoles.map((t) => (
                          <span
                            key={t}
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              height: 26,
                              padding: "0 10px",
                              borderRadius: 13,
                              background: portal.canvas,
                              border: `1px solid ${portal.border}`,
                              color: portal.label,
                              fontSize: 12,
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {ROLE_LABELS[t] ?? t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ minWidth: 140 }}>
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                          color: portal.textSubtle,
                          marginBottom: 6,
                        }}
                      >
                        Where
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Their own area only</div>
                    </div>
                  </div>

                  {/* Approve applications toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500 }}>Can approve applications</div>
                      <div style={{ fontSize: 11, lineHeight: "16px", color: portal.textSubtle }}>
                        Applications from their own area — they can accept or decline without asking you.
                      </div>
                    </div>
                    <Toggle on={assignOn} onToggle={() => toggleAssign(role)} />
                  </div>

                  {/* Summary */}
                  <div
                    style={{
                      marginTop: 14,
                      padding: "10px 12px",
                      borderRadius: 8,
                      background: portal.brandSubtlest,
                      fontSize: 12,
                      lineHeight: "18px",
                      color: portal.brandText,
                    }}
                  >
                    A {ROLE_LABELS[role]?.toLowerCase() ?? role} can invite{" "}
                    {belowRoles.map((t) => (ROLE_LABELS[t] ?? t).toLowerCase() + "s").join(", ")}{" "}
                    within their own area
                    {assignOn
                      ? ", and can approve applications from there without asking you."
                      : ", but applications from there still come to you for approval."}
                  </div>
                </div>
              )}

              {/* Collapsed note — invite is OFF */}
              {!inviteOn && (
                <div style={{ padding: "14px 20px", fontSize: 12, color: portal.textSubtle }}>
                  Invites at this level come from you.{" "}
                  {ROLE_LABELS[role] ?? role}s can still view their area and flag gaps.
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && (
        <div
          style={{
            marginBottom: 12,
            padding: "10px 14px",
            borderRadius: 8,
            background: portal.dangerBg,
            color: portal.dangerText,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <button
          onClick={reset}
          style={{
            height: 36,
            padding: "0 14px",
            border: "none",
            borderRadius: 8,
            background: portal.neutral,
            color: portal.ink,
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Reset to defaults
        </button>
        <button
          onClick={save}
          disabled={saving}
          style={{
            height: 36,
            padding: "0 16px",
            border: "none",
            borderRadius: 8,
            background: saved ? portal.successBold : portal.brand,
            color: portal.inverse,
            fontSize: 14,
            fontWeight: 600,
            cursor: saving ? "default" : "pointer",
            fontFamily: "inherit",
            opacity: saving ? 0.7 : 1,
          }}
        >
          {saved ? "Saved" : saving ? "Saving…" : "Save delegation rules"}
        </button>
      </div>
    </div>
  );
}

// ---- Page -------------------------------------------------------------------

type SettingsTab = "general" | "delegation" | "thresholds" | "notifications";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general",       label: "General" },
  { id: "delegation",    label: "Delegation" },
  { id: "thresholds",    label: "Result thresholds" },
  { id: "notifications", label: "Notifications" },
];

const TIER_ROLES = new Set(["national", "county", "constituency", "ward"]);

export function WorkspaceSettings() {
  const { id } = useParams<{ id: string }>();
  const { workspace, myRole } = useWorkspaceContext();
  const [delegation,      setDelegation]      = useState<DelegationSettings | null>(null);
  const [delegationError, setDelegationError] = useState<string | null>(null);
  const [tab,             setTab]             = useState<SettingsTab>("delegation");

  useEffect(() => {
    if (!id) return;
    api.getDelegation(id)
      .then(({ delegation: d }) => setDelegation(d))
      .catch((e: unknown) => setDelegationError(e instanceof Error ? e.message : "Failed to load delegation settings."));
  }, [id]);

  const isTier = TIER_ROLES.has(myRole);

  return (
    <>
      <div style={{ flex: 1, padding: "28px 40px 56px", maxWidth: 900 }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          Workspace / Settings
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 16 }}>
          Settings
        </div>

        {isTier ? (
          <TierAccessPanel myRole={myRole} />
        ) : (
          <>
            {/* Tabs */}
            <div
              style={{
                display: "flex",
                gap: 20,
                borderBottom: `1px solid ${portal.border}`,
                marginBottom: 24,
                flexWrap: "wrap",
              }}
            >
              {TABS.map((t) => (
                <TabItem
                  key={t.id}
                  label={t.label}
                  active={tab === t.id}
                  onClick={() => setTab(t.id)}
                />
              ))}
            </div>

            {tab === "delegation" && delegation && (
              <DelegationTab
                workspace={workspace}
                delegation={delegation}
                onSaved={setDelegation}
              />
            )}

            {tab === "delegation" && !delegation && !delegationError && (
              <div style={{ fontSize: 14, color: portal.textSubtle }}>Loading delegation rules…</div>
            )}

            {tab === "delegation" && delegationError && (
              <div style={{ fontSize: 14, color: portal.dangerText }}>{delegationError}</div>
            )}

            {tab !== "delegation" && (
              <div style={{ fontSize: 14, color: portal.textSubtle }}>
                {TABS.find((t) => t.id === tab)?.label} settings coming soon.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TierAccessPanel({ myRole }: { myRole: string }) {
  const roleLabels: Record<string, string> = {
    national: "National officer",
    county: "County officer",
    constituency: "Constituency officer",
    ward: "Ward admin",
  };
  const label = roleLabels[myRole] ?? myRole;

  return (
    <div>
      <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 20, maxWidth: 560, lineHeight: "20px" }}>
        Your campaign manager configures delegation settings. These are read-only here — contact your campaign manager if something needs to change.
      </div>
      <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, padding: "14px 20px", marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase", color: portal.textSubtle, marginBottom: 4 }}>Your post</div>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{label}</div>
      </div>
      <div style={{ fontSize: 13, color: portal.textSubtle }}>
        To see your specific permissions (invite, approve, assign), go to the <strong>Overview</strong> page — the "Your access" panel shows what your campaign manager has granted.
      </div>
    </div>
  );
}

function TabItem({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: "0 2px 10px",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: active ? 600 : 400,
        color: active ? portal.brandText : portal.label,
        borderBottom: `2px solid ${active ? portal.brand : "transparent"}`,
        marginBottom: -1,
        userSelect: "none",
      }}
    >
      {label}
    </div>
  );
}

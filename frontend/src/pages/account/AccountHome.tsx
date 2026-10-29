import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Workspace } from "../../api";
import { portal, geoScopeLabel, seatLabel, segmentLabel } from "../../portalTheme";
import { useAuth } from "../../auth";
import { PortalShell } from "../../components/portal/PortalShell";

export function AccountHome() {
  const { user } = useAuth();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

  useEffect(() => {
    api
      .listWorkspaces()
      .then(({ workspaces }) => setWorkspaces(workspaces))
      .catch(() => setWorkspaces([]));
  }, []);

  const hasWorkspace = workspaces.length > 0;

  const steps = [
    { title: "Create your account", desc: "Name, age, gender, phone and email captured.", done: true },
    {
      title: "Verify your phone",
      desc: `${user?.phone_masked ?? "Your phone"} — used as your second factor at every log-in.`,
      done: !!user?.phone_verified,
    },
    {
      title: "Verify your email address",
      desc: `Open the link sent to ${user?.email ?? "your inbox"}. Needed for exports, evidence packs and recovery.`,
      done: !!user?.email_verified,
      action: "Verify email",
      to: "/account/verify-email",
    },
    {
      title: "Create your first workspace",
      desc: "One workspace per election you contest.",
      done: hasWorkspace,
      action: hasWorkspace ? undefined : "Create",
      to: "/workspaces",
      state: { openDrawer: true },
    },
    {
      title: "Add a recovery contact",
      desc: "A second phone that can restore access if yours is lost on election night.",
      done: false,
      action: "Add",
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <PortalShell active="overview" workspaceCount={workspaces.length}>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>Account / Overview</div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
          Welcome back, {user?.first_name ?? "Aspirant"}
        </div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 20 }}>
          Your account settings and every election workspace you run live here.
        </div>

        {!user?.email_verified && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: portal.warnBg,
              color: portal.warnText,
              marginBottom: 24,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: portal.warnBold, marginTop: 6, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              Your email address is not verified yet. Exports and evidence packs can't be emailed until it is.
            </span>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.35fr) minmax(0,1fr)", gap: 20, alignItems: "start" }}>
          <div>
            {/* Setup guide */}
            <div
              style={{
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                background: portal.canvas,
                boxShadow: portal.cardShadow,
                marginBottom: 20,
              }}
            >
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>Account setup guide</div>
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>
                    {doneCount} of {steps.length} done
                  </div>
                </div>
                <div style={{ height: 4, background: portal.neutral, borderRadius: 3, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(doneCount / steps.length) * 100}%`,
                      background: portal.brand,
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
              {steps.map((step, i) => (
                <StepRow key={i} step={step} last={i === steps.length - 1} />
              ))}
            </div>

            {/* Your workspaces */}
            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "14px 20px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                }}
              >
                <div style={{ fontSize: 16, fontWeight: 600 }}>Your workspaces</div>
                <Link to="/workspaces" style={{ fontSize: 13, fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
                  View all
                </Link>
              </div>
              {workspaces.length === 0 ? (
                <div style={{ padding: "18px 20px", fontSize: 14, color: portal.textSubtle }}>
                  No workspaces yet.{" "}
                  <Link to="/workspaces" state={{ openDrawer: true }} style={{ color: portal.brandText, fontWeight: 500, textDecoration: "none" }}>
                    Create your first
                  </Link>
                  .
                </div>
              ) : (
                workspaces.slice(0, 3).map((w, i) => (
                  <Link
                    key={w.id}
                    to="/geography"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      padding: "14px 20px",
                      borderBottom: i < Math.min(workspaces.length, 3) - 1 ? `1px solid ${portal.borderSubtle}` : "none",
                      textDecoration: "none",
                      color: "inherit",
                    }}
                  >
                    <span
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 5,
                        background: portal.avatarDark,
                        color: portal.inverse,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 12,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {String(w.year).slice(-2)}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600 }}>{w.name}</div>
                      <div style={{ fontSize: 12, color: portal.textSubtle }}>
                        {seatLabel(w.seat)} · {segmentLabel(w.segment)} · {geoScopeLabel(w)}
                      </div>
                    </div>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        height: 20,
                        padding: "0 8px",
                        borderRadius: 3,
                        background: portal.brandSubtlest,
                        color: portal.brandText,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.3px",
                      }}
                    >
                      Active
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* General settings snapshot */}
          <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "14px 20px",
                borderBottom: `1px solid ${portal.borderSubtle}`,
              }}
            >
              <div style={{ fontSize: 16, fontWeight: 600 }}>General settings</div>
              <Link to="/account/settings" style={{ fontSize: 13, fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
                Edit
              </Link>
            </div>
            <div style={{ padding: "6px 20px 14px" }}>
              <SettingRow label="Full name" value={user?.name ?? "—"} />
              <SettingRow label="Age" value={user?.age ? String(user.age) : "—"} />
              <SettingRow label="Gender" value={user?.gender ?? "—"} />
              <SettingRow
                label="Phone"
                value={user?.phone_masked ?? "—"}
                tag={user?.phone_verified ? { text: "Verified", tone: "success" } : { text: "Pending", tone: "warning" }}
              />
              <SettingRow
                label="Email"
                value={user?.email ?? "—"}
                tag={user?.email_verified ? { text: "Verified", tone: "success" } : { text: "Pending", tone: "warning" }}
              />
              <SettingRow label="Two-factor" value="SMS to verified phone" last />
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

interface Step {
  title: string;
  desc: string;
  done: boolean;
  action?: string;
  to?: string;
  state?: Record<string, unknown>;
}

function StepRow({ step, last }: { step: Step; last: boolean }) {
  const actionable = !step.done && step.action;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "14px 20px",
        borderBottom: last ? "none" : `1px solid ${portal.borderSubtle}`,
        background: actionable ? portal.brandSubtlest : "transparent",
      }}
    >
      {step.done ? (
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: portal.successBold,
            color: portal.inverse,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          ✓
        </span>
      ) : (
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: "50%",
            background: portal.canvas,
            border: `1.5px solid ${actionable ? portal.brand : portal.neutralHover}`,
            flexShrink: 0,
            marginTop: 2,
            boxSizing: "border-box",
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{step.title}</div>
        <div style={{ fontSize: 12, color: actionable ? portal.label : portal.textSubtle, marginTop: 2 }}>{step.desc}</div>
      </div>
      {step.done ? (
        <StatusTag text="Done" tone="success" />
      ) : step.action ? (
        step.to ? (
          <Link
            to={step.to}
            state={step.state}
            style={{
              display: "flex",
              alignItems: "center",
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              background: actionable ? portal.brand : portal.neutral,
              color: actionable ? portal.inverse : portal.ink,
              fontSize: 14,
              fontWeight: 500,
              textDecoration: "none",
              flexShrink: 0,
            }}
          >
            {step.action}
          </Link>
        ) : (
          <button
            style={{
              height: 32,
              padding: "0 12px",
              border: 0,
              borderRadius: 8,
              background: actionable ? portal.brand : portal.neutral,
              color: actionable ? portal.inverse : portal.ink,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            {step.action}
          </button>
        )
      ) : null}
    </div>
  );
}

function SettingRow({
  label,
  value,
  tag,
  last,
}: {
  label: string;
  value: string;
  tag?: { text: string; tone: "success" | "warning" };
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 16,
        alignItems: "center",
        padding: "10px 0",
        borderBottom: last ? "none" : `1px solid ${portal.borderSubtle}`,
      }}
    >
      <span style={{ fontSize: 13, color: portal.textSubtle }}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            textAlign: "right",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {value}
        </span>
        {tag && <StatusTag text={tag.text} tone={tag.tone} />}
      </span>
    </div>
  );
}

function StatusTag({ text, tone }: { text: string; tone: "success" | "warning" }) {
  const bg = tone === "success" ? portal.successBg : portal.warnBg;
  const fg = tone === "success" ? portal.successText : portal.warnText;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 3,
        background: bg,
        color: fg,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

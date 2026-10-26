import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { api, type Workspace, type WorkspaceManager } from "../../api";
import { useAuth } from "../../auth";
import { portal } from "../../portalTheme";
import { WorkspaceShell } from "../../components/portal/WorkspaceShell";

const PERMISSIONS = [
  { label: "Recruit, vet and assign agents and volunteers", ok: true },
  { label: "Verify submissions and sign off tiers", ok: true },
  { label: "Resolve and escalate discrepancies", ok: true },
  { label: "Export tally, evidence packs and payment schedules", ok: true },
  { label: "Invite further campaign managers", ok: false },
  { label: "Billing and deleting the workspace", ok: false },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

function hoursUntil(iso: string | null): string {
  if (!iso) return "?";
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.ceil(ms / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${Math.ceil(hours / 24)} days`;
}

function managerMeta(m: WorkspaceManager): string {
  if (m.status === "active") {
    return `Accepted ${shortDate(m.accepted_at)} · ${m.phone_masked}`;
  }
  return `Invite sent by SMS ${shortDate(m.invited_at)} · expires in ${hoursUntil(m.expires_at)}`;
}

export function CampaignManagers() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [managers, setManagers] = useState<WorkspaceManager[]>([]);
  const [notFound, setNotFound] = useState(false);
  const [devBanner, setDevBanner] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .getWorkspace(id)
      .then(({ workspace: w }) => {
        setWorkspace(w);
        return api.listManagers(w.id);
      })
      .then(({ managers: ms }) => setManagers(ms))
      .catch(() => setNotFound(true));
  }, [id]);

  async function handleResend(managerId: string) {
    if (!workspace) return;
    const { manager } = await api.resendManagerInvite(workspace.id, managerId);
    setManagers((prev) => prev.map((m) => (m.id === managerId ? manager : m)));
    if (manager.dev_token) {
      setDevBanner(`Dev mode — no SMS sent. Join link: ${window.location.origin}/join/${manager.dev_token}`);
    }
  }

  async function handleRemove(managerId: string) {
    if (!workspace) return;
    await api.removeManager(workspace.id, managerId);
    setManagers((prev) => prev.filter((m) => m.id !== managerId));
  }

  if (notFound) return <Navigate to="/workspaces" replace />;

  if (!workspace) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: portal.font,
          color: portal.textSubtle,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  const activeCount = managers.filter((m) => m.status === "active").length;
  const pendingCount = managers.filter((m) => m.status === "pending").length;
  const accessSummary = `1 aspirant · ${activeCount} active manager${activeCount === 1 ? "" : "s"} · ${pendingCount} pending`;

  return (
    <WorkspaceShell workspace={workspace} active="managers" managerCount={managers.length}>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to="/workspaces" style={{ color: portal.textSubtle, textDecoration: "none" }}>
            Workspaces
          </Link>
          {" / "}
          <Link
            to={`/workspaces/${workspace.id}`}
            style={{ color: portal.textSubtle, textDecoration: "none" }}
          >
            {workspace.name}
          </Link>
          {" / Campaign managers"}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
              Campaign managers
            </div>
            <div style={{ fontSize: 14, color: portal.textSubtle }}>
              The only role you invite directly. Agents and volunteers join through the recruitment
              link instead.
            </div>
          </div>
          <Link
            to={`/workspaces/${workspace.id}/managers/invite`}
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
            Invite campaign manager
          </Link>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 14px",
            borderRadius: 8,
            background: portal.brandSubtlest,
            color: portal.brandText,
            marginBottom: 24,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: portal.brand,
              marginTop: 6,
              flexShrink: 0,
            }}
          />
          <span>
            A campaign manager can do everything in this workspace — recruit, verify, sign off
            tiers, export — except billing and deleting the account. Access is limited to this
            workspace only.
          </span>
        </div>

        {devBanner && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: portal.warnBg,
              color: portal.warnText,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: portal.warnBold,
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <span>
              <strong style={{ fontFamily: "monospace" }}>{devBanner}</strong>
            </span>
            <button
              onClick={() => setDevBanner(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: portal.warnText,
                fontSize: 16,
                lineHeight: 1,
                padding: 0,
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>
        )}

        <div
          style={{
            border: `1px solid ${portal.border}`,
            borderRadius: 8,
            boxShadow: portal.cardShadow,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              padding: "14px 20px",
              borderBottom: `1px solid ${portal.border}`,
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 600 }}>People with access</div>
            <div style={{ fontSize: 12, color: portal.textSubtle }}>{accessSummary}</div>
          </div>

          {/* Aspirant row */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "14px 20px",
              borderBottom: `1px solid ${portal.borderSubtle}`,
            }}
          >
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "50%",
                background: portal.brand,
                color: portal.inverse,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              {user?.initials ?? "··"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {user?.name ?? "You"}{" "}
                <span style={{ fontSize: 12, color: portal.textSubtle, fontWeight: 400 }}>
                  (you)
                </span>
              </div>
              <div style={{ fontSize: 12, color: portal.textSubtle }}>
                {user?.email} · full access including billing
              </div>
            </div>
            <Lozenge label="Aspirant" tone="brand" />
          </div>

          {managers.map((m) => (
            <ManagerRow
              key={m.id}
              manager={m}
              onResend={() => handleResend(m.id)}
              onRemove={() => handleRemove(m.id)}
            />
          ))}

          {managers.length === 0 && (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                No campaign managers yet
              </div>
              <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 16 }}>
                Invite the person who runs the campaign day to day so you aren't the only one who
                can verify and sign off.
              </div>
              <Link
                to={`/workspaces/${workspace.id}/managers/invite`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  background: portal.brand,
                  color: portal.inverse,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Invite campaign manager
              </Link>
            </div>
          )}

          <div style={{ padding: "12px 20px", fontSize: 12, color: portal.textSubtle }}>
            Invite links expire after 72 hours. Every accept, resend and removal is written to the
            workspace audit log.
          </div>
        </div>

        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8 }}>
          <div
            style={{
              padding: "14px 20px",
              borderBottom: `1px solid ${portal.borderSubtle}`,
              fontSize: 16,
              fontWeight: 600,
            }}
          >
            What a campaign manager can do
          </div>
          {PERMISSIONS.map((p, i) => (
            <div
              key={p.label}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "12px 20px",
                borderBottom:
                  i < PERMISSIONS.length - 1 ? `1px solid ${portal.borderSubtle}` : "none",
              }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 11,
                  fontWeight: 700,
                  color: portal.inverse,
                  background: p.ok ? portal.successBold : "#B3B9C4",
                }}
              >
                {p.ok ? "✓" : "—"}
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 14 }}>{p.label}</span>
              <Lozenge
                label={p.ok ? "Yes" : "Aspirant only"}
                tone={p.ok ? "success" : "neutral"}
              />
            </div>
          ))}
        </div>
      </div>
    </WorkspaceShell>
  );
}

function ManagerRow({
  manager: m,
  onResend,
  onRemove,
}: {
  manager: WorkspaceManager;
  onResend: () => void;
  onRemove: () => void;
}) {
  const isActive = m.status === "active";
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 20px",
        borderBottom: `1px solid ${portal.borderSubtle}`,
      }}
    >
      <span
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 600,
          flexShrink: 0,
          background: isActive ? portal.avatarDark : portal.neutralHover,
          color: isActive ? portal.inverse : portal.label,
        }}
      >
        {initials(m.name)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
        <div style={{ fontSize: 12, color: portal.textSubtle }}>{managerMeta(m)}</div>
      </div>
      <Lozenge label={isActive ? "Active" : "Pending"} tone={isActive ? "success" : "warn"} />
      <HoverBtn
        label={isActive ? "Manage" : "Resend"}
        onClick={onResend}
        hoverBg={portal.neutralHover}
        fg={portal.ink}
      />
      <HoverBtn
        label="Remove"
        onClick={onRemove}
        hoverBg={portal.dangerBg}
        fg={portal.dangerText}
      />
    </div>
  );
}

function HoverBtn({
  label,
  onClick,
  hoverBg,
  fg,
}: {
  label: string;
  onClick: () => void;
  hoverBg: string;
  fg: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 32,
        padding: "0 12px",
        border: "none",
        borderRadius: 8,
        background: hover ? hoverBg : portal.neutral,
        color: fg,
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function Lozenge({
  label,
  tone,
}: {
  label: string;
  tone: "brand" | "success" | "warn" | "neutral";
}) {
  const styles: Record<string, { bg: string; fg: string }> = {
    brand:   { bg: portal.brandSubtlest, fg: portal.brandText },
    success: { bg: portal.successBg,     fg: portal.successText },
    warn:    { bg: portal.warnBg,         fg: portal.warnText },
    neutral: { bg: portal.neutral,        fg: portal.textSubtle },
  };
  const { bg, fg } = styles[tone];
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
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

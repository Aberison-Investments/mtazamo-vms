import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { api, type WorkspaceManager, type ApiError } from "../../api";
import { useAuth } from "../../auth";
import { portal, seatLabel } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { useNotifications } from "../../notifications";
import type { Workspace } from "../../api";

const PERMISSIONS = [
  { label: "Recruit, vet and assign agents and volunteers", ok: true },
  { label: "Verify submissions and sign off tiers", ok: true },
  { label: "Resolve and escalate discrepancies", ok: true },
  { label: "Export tally, evidence packs and payment schedules", ok: true },
  { label: "Invite further campaign managers", ok: false },
  { label: "Billing and deleting the workspace", ok: false },
];

const EXPIRY_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "72 hours" },
  { hours: 168, label: "7 days" },
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
  const { workspace } = useWorkspaceContext();
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { add: addToast, update: updateToast } = useNotifications();
  const [managers, setManagers] = useState<WorkspaceManager[]>([]);
  const [aspirant, setAspirant] = useState<{ name: string; email: string; initials: string } | null>(null);
  const [devBanner, setDevBanner] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSentBanner, setInviteSentBanner] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if ((location.state as { openInvite?: boolean } | null)?.openInvite) {
      setInviteOpen(true);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    api.listManagers(id)
      .then(({ managers: ms, aspirant: asp }) => {
        setManagers(ms);
        setAspirant(asp);
      })
      .catch(() => {});
  }, [id]);

  async function handleResend(managerId: string) {
    const { manager } = await api.resendManagerInvite(workspace.id, managerId);
    setManagers((prev) => prev.map((m) => (m.id === managerId ? manager : m)));
    if (manager.dev_token) {
      setDevBanner(`Dev mode — no SMS sent. Join link: ${window.location.origin}/join/${manager.dev_token}`);
    }
  }

  async function handleRemove(managerId: string, name: string) {
    setConfirmRemove(null);
    const toastId = addToast(`Removing ${name}…`, "loading");
    try {
      await api.removeManager(workspace.id, managerId);
      setManagers((prev) => prev.filter((m) => m.id !== managerId));
      updateToast(toastId, `${name} has been removed.`, "success");
    } catch {
      updateToast(toastId, `Could not remove ${name}. Try again.`, "error");
    }
  }

  function handleInviteSent(name: string, devToken: string | null) {
    setInviteSentBanner(`Invite sent to ${name}. Check their phone for the SMS link.`);
    if (devToken) {
      setDevBanner(`Dev mode — no SMS sent. Join link: ${window.location.origin}/join/${devToken}`);
    }
    if (id) {
      api.listManagers(id)
        .then(({ managers: ms }) => setManagers(ms))
        .catch(() => {});
    }
    setInviteOpen(false);
  }

  const activeCount = managers.filter((m) => m.status === "active").length;
  const pendingCount = managers.filter((m) => m.status === "pending").length;
  const accessSummary = `1 aspirant · ${activeCount} active manager${activeCount === 1 ? "" : "s"} · ${pendingCount} pending`;

  return (
    <>
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
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700 }}>
              Campaign managers
            </div>
          </div>
          <button
            onClick={() => setInviteOpen(true)}
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
              border: "none",
              cursor: "pointer",
              flexShrink: 0,
              fontFamily: "inherit",
            }}
          >
            Invite campaign manager
          </button>
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

        {inviteSentBanner && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 14px",
              borderRadius: 8,
              background: portal.successBg,
              color: portal.successText,
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: portal.successBold,
                marginTop: 5,
                flexShrink: 0,
              }}
            />
            <span>{inviteSentBanner}</span>
            <button
              onClick={() => setInviteSentBanner(null)}
              style={{
                marginLeft: "auto",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: portal.successText,
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
              {aspirant?.initials ?? "··"}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>
                {aspirant?.name ?? "Aspirant"}{" "}
                {user && aspirant?.email === user.email && (
                  <span style={{ fontSize: 12, color: portal.textSubtle, fontWeight: 400 }}>(you)</span>
                )}
              </div>
              <div style={{ fontSize: 12, color: portal.textSubtle }}>
                {aspirant?.email}
              </div>
            </div>
            <Lozenge label="Aspirant" tone="brand" />
          </div>

          {managers.map((m) => (
            <ManagerRow
              key={m.id}
              manager={m}
              onResend={() => handleResend(m.id)}
              onRemove={() => setConfirmRemove({ id: m.id, name: m.name })}
            />
          ))}

          {managers.length === 0 && (
            <div style={{ padding: "28px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
                No campaign managers yet
              </div>
              <button
                onClick={() => setInviteOpen(true)}
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
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Invite campaign manager
              </button>
            </div>
          )}

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

      {inviteOpen && (
        <InvitePanel
          workspace={workspace}
          onClose={() => setInviteOpen(false)}
          onSent={handleInviteSent}
        />
      )}

      {confirmRemove && (
        <ConfirmRemoveDialog
          name={confirmRemove.name}
          onCancel={() => setConfirmRemove(null)}
          onConfirm={() => handleRemove(confirmRemove.id, confirmRemove.name)}
        />
      )}
    </>
  );
}

// ---- ConfirmRemoveDialog -------------------------------------------------------

function ConfirmRemoveDialog({
  name,
  onCancel,
  onConfirm,
}: {
  name: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(9,30,66,0.22)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 301,
          width: 320,
          background: portal.canvas,
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(9,30,66,0.2)",
          padding: "20px 20px 16px",
          fontFamily: portal.font,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: portal.ink, marginBottom: 6 }}>
          Remove campaign manager?
        </div>
        <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "18px", marginBottom: 20 }}>
          <strong style={{ color: portal.ink, fontWeight: 600 }}>{name}</strong> will lose access
          to this workspace immediately. You can invite them again later.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: "0 14px", border: `1px solid ${portal.border}`,
              borderRadius: 8, background: portal.canvas, color: portal.ink,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: "0 14px", border: "none",
              borderRadius: 8, background: portal.dangerBg, color: portal.dangerText,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Remove
          </button>
        </div>
      </div>
    </>
  );
}

// ---- ConfirmSendDialog ---------------------------------------------------------

function ConfirmSendDialog({
  name,
  phone,
  expiryLabel,
  onCancel,
  onConfirm,
}: {
  name: string;
  phone: string;
  expiryLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, zIndex: 300,
          background: "rgba(9,30,66,0.22)",
        }}
      />
      <div
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          zIndex: 301,
          width: 320,
          background: portal.canvas,
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(9,30,66,0.2)",
          padding: "20px 20px 16px",
          fontFamily: portal.font,
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, color: portal.ink, marginBottom: 6 }}>
          Send SMS invite?
        </div>
        <div style={{ fontSize: 13, color: portal.textSubtle, lineHeight: "18px", marginBottom: 12 }}>
          An invite SMS will be sent to{" "}
          <strong style={{ color: portal.ink, fontWeight: 600 }}>{name}</strong> at{" "}
          <span style={{ fontFamily: "monospace", color: portal.ink }}>{phone}</span>.
          The link expires in {expiryLabel}.
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            onClick={onCancel}
            style={{
              height: 32, padding: "0 14px", border: `1px solid ${portal.border}`,
              borderRadius: 8, background: portal.canvas, color: portal.ink,
              fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              height: 32, padding: "0 14px", border: "none",
              borderRadius: 8, background: portal.brand, color: portal.inverse,
              fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
            }}
          >
            Send invite
          </button>
        </div>
      </div>
    </>
  );
}

// ---- InvitePanel ---------------------------------------------------------------

function InvitePanel({
  workspace,
  onClose,
  onSent,
}: {
  workspace: Workspace;
  onClose: () => void;
  onSent: (name: string, devToken: string | null) => void;
}) {
  const { user } = useAuth();
  const { add: addToast, update: updateToast } = useNotifications();
  const [visible, setVisible] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [expiryHours, setExpiryHours] = useState(72);
  const [sending, setSending] = useState(false);
  const [phoneError, setPhoneError] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 220);
  }

  const disabled = !name.trim() || !phone.trim() || sending;

  function handleSendClick() {
    if (disabled) return;
    const normalized = toE164(phone);
    if (!normalized) {
      setPhoneError("Enter the 9-digit number after +254 — e.g. 712 345 678.");
      return;
    }
    setPhoneError("");
    setFormError(null);
    setShowConfirm(true);
  }

  async function handleConfirmedSend() {
    const normalized = toE164(phone)!;
    setShowConfirm(false);
    setSending(true);
    const toastId = addToast(`Sending invite to ${name.trim()}…`, "loading");
    try {
      const { manager } = await api.inviteManager(workspace.id, {
        name: name.trim(),
        phone: normalized,
        email: email.trim() || null,
        note: note.trim() || null,
        expiry_hours: expiryHours,
      });
      updateToast(toastId, `Invite sent to ${name.trim()}.`, "success");
      onSent(name.trim(), manager.dev_token ?? null);
    } catch (err) {
      const e = err as ApiError;
      if (e.fields?.phone) {
        setPhoneError(e.fields.phone[0]);
        updateToast(toastId, "Could not send the invite — check the phone number.", "error");
      } else {
        setFormError(e.message ?? "Could not send the invite. Please try again.");
        updateToast(toastId, "Could not send the invite.", "error");
      }
    } finally {
      setSending(false);
    }
  }

  const who = name.trim() ? name.trim().split(" ")[0] : "there";
  const aspirantName = user?.name ?? "Aspirant";
  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.label ?? "";
  const smsPreview = `Hi ${who}, ${aspirantName} has invited you as campaign manager for the ${workspace.name} on Mtazamo Votes.${note.trim() ? ` "${note.trim()}"` : ""} Join: mtz.vote/j/XXXXX — expires in ${expiryLabel}.`;

  const locationLine = [
    seatLabel(workspace.seat),
    workspace.county ? `${workspace.county} County` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 200,
          background: `rgba(9,30,66,${visible ? 0.28 : 0})`,
          transition: "background 220ms ease-out",
        }}
      />

      {/* Panel */}
      <div
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          zIndex: 201,
          width: 520,
          background: portal.canvas,
          boxShadow: "-4px 0 32px rgba(9,30,66,0.16)",
          transform: `translateX(${visible ? "0" : "100%"})`,
          transition: "transform 220ms ease-out",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          fontFamily: portal.font,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "20px 24px",
            borderBottom: `1px solid ${portal.border}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: portal.ink }}>
              Invite a campaign manager
            </div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginTop: 3 }}>
              {workspace.name}
              {locationLine ? ` · ${locationLine}` : ""}
            </div>
          </div>
          <button
            onClick={handleClose}
            style={{
              width: 32,
              height: 32,
              border: 0,
              borderRadius: 8,
              background: portal.neutral,
              color: portal.label,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 20,
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* Role badge strip */}
        <div
          style={{
            padding: "12px 24px",
            borderBottom: `1px solid ${portal.borderSubtle}`,
            background: portal.brandSubtlest,
            display: "flex",
            alignItems: "center",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 20,
              padding: "0 8px",
              borderRadius: 3,
              background: portal.canvas,
              color: portal.brandText,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              whiteSpace: "nowrap",
            }}
          >
            Campaign manager
          </span>
          <span style={{ fontSize: 13, color: portal.brandText }}>
            Full workspace access · cannot invite other managers or access billing
          </span>
        </div>

        {/* Scrollable form body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
          <PanelFieldLabel label="Full name" required />
          <input
            value={name}
            onChange={(e) => { setName(e.target.value); setFormError(null); }}
            placeholder="Daniel Mutiso"
            style={panelInput}
          />

          <PanelFieldLabel label="Phone number" required />
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            <span
              style={{
                display: "flex",
                alignItems: "center",
                height: 36,
                padding: "0 10px",
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                background: portal.canvasSubtle,
                color: portal.label,
                fontSize: 14,
                flexShrink: 0,
              }}
            >
              +254
            </span>
            <input
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(""); setFormError(null); }}
              placeholder="7xx xxx xxx"
              style={{ ...panelInput, marginBottom: 0, flex: 1, minWidth: 0 }}
            />
          </div>
          {phoneError ? (
            <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 14 }}>
              {phoneError}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 14 }}>
              The join link is sent here by SMS. A number already on this workspace is rejected.
            </div>
          )}

          <PanelFieldLabel label="Email" optional />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="daniel@example.com"
            style={panelInput}
          />

          <PanelFieldLabel label="Message in the invite" optional />
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="You'll be running the Nairobi war room on election night."
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: `1px solid ${portal.border}`,
              borderRadius: 8,
              padding: "8px 10px",
              fontSize: 14,
              lineHeight: "20px",
              color: portal.ink,
              background: portal.canvas,
              resize: "vertical",
              marginBottom: 18,
              fontFamily: "inherit",
              outline: "none",
            }}
          />

          <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>
            Invite link validity
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
            {EXPIRY_OPTIONS.map((o) => {
              const on = expiryHours === o.hours;
              return (
                <div
                  key={o.hours}
                  onClick={() => setExpiryHours(o.hours)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    height: 32,
                    padding: "0 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    fontWeight: 500,
                    boxSizing: "border-box",
                    border: `1px solid ${on ? portal.brand : portal.border}`,
                    background: on ? portal.brandSubtlest : portal.canvas,
                    color: on ? portal.brandText : portal.label,
                  }}
                >
                  {o.label}
                </div>
              );
            })}
          </div>

          <div style={{ borderTop: `1px solid ${portal.borderSubtle}`, paddingTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}>
              SMS preview
            </div>
            <div
              style={{
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                background: portal.canvasSubtle,
                padding: "12px 14px",
                fontSize: 13,
                lineHeight: "20px",
                color: portal.label,
              }}
            >
              {smsPreview}
            </div>
          </div>

          {formError && (
            <div style={{ fontSize: 13, color: portal.dangerText, marginTop: 16 }}>
              {formError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: `1px solid ${portal.border}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            flexShrink: 0,
            background: portal.canvas,
          }}
        >
          <button
            onClick={handleClose}
            style={{
              display: "flex",
              alignItems: "center",
              height: 32,
              padding: "0 12px",
              borderRadius: 8,
              border: `1px solid ${portal.border}`,
              background: portal.canvas,
              color: portal.ink,
              fontSize: 14,
              fontWeight: 500,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSendClick}
            disabled={disabled}
            style={{
              height: 32,
              padding: "0 16px",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              cursor: disabled ? "not-allowed" : "pointer",
              background: sending
                ? portal.neutralHover
                : disabled
                ? portal.neutral
                : portal.brand,
              color: disabled ? portal.textSubtlest : portal.inverse,
              fontFamily: "inherit",
            }}
          >
            {sending ? "Sending…" : "Send SMS invite"}
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmSendDialog
          name={name.trim()}
          phone={toE164(phone) ?? ""}
          expiryLabel={EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.label ?? ""}
          onCancel={() => setShowConfirm(false)}
          onConfirm={handleConfirmedSend}
        />
      )}
    </>
  );
}

// ---- helpers ------------------------------------------------------------------

function toE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 9) return `+254${digits}`;
  if (digits.length === 10 && digits.startsWith("0")) return `+254${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("254")) return `+${digits}`;
  if (digits.length === 13 && digits.startsWith("2547")) return `+${digits.slice(1)}`;
  return null;
}

function PanelFieldLabel({
  label,
  required,
  optional,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>
      {label}{" "}
      {required && <span style={{ color: portal.dangerText }}>*</span>}
      {optional && (
        <span style={{ fontWeight: 400, color: portal.textSubtle }}>(optional)</span>
      )}
    </div>
  );
}

const panelInput: React.CSSProperties = {
  width: "100%",
  height: 36,
  boxSizing: "border-box",
  border: `1px solid ${portal.border}`,
  borderRadius: 8,
  padding: "0 10px",
  fontSize: 14,
  color: portal.ink,
  background: portal.canvas,
  marginBottom: 14,
  fontFamily: "inherit",
  outline: "none",
};

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

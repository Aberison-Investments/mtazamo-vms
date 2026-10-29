import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type ApiError } from "../../api";
import { useAuth } from "../../auth";
import { portal, seatLabel } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";

const EXPIRY_OPTIONS = [
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "72 hours" },
  { hours: 168, label: "7 days" },
];

const SCOPE_ROWS = [
  { label: "Recruit, vet and assign agents and volunteers", ok: true },
  { label: "Verify submissions and sign off tiers", ok: true },
  { label: "Resolve and escalate discrepancies", ok: true },
  { label: "Export tally, evidence packs and payment schedules", ok: true },
  { label: "Billing, account deletion, inviting other managers", ok: false },
];

export function InviteCampaignManager() {
  const { workspace } = useWorkspaceContext();
  const { user } = useAuth();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [expiryHours, setExpiryHours] = useState(72);
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState("");

  const disabled = !name.trim() || !phone.trim() || sending;

  async function handleSend() {
    if (disabled) return;
    setSending(true);
    setPhoneError("");
    try {
      const { manager } = await api.inviteManager(workspace.id, {
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        note: note.trim() || null,
        expiry_hours: expiryHours,
      });
      const expiryLabel = EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.label ?? "";
      setSentMessage(
        `Invite sent to ${name.trim()} on +254 ${phone.trim()} — the link expires in ${expiryLabel}.`,
      );
      setDevToken(manager.dev_token ?? null);
      setName("");
      setPhone("");
      setEmail("");
      setNote("");
      setExpiryHours(72);
    } catch (err) {
      const e = err as ApiError;
      if (e.fields?.phone) {
        setPhoneError(e.fields.phone[0]);
      }
    } finally {
      setSending(false);
    }
  }

  const who = name.trim() ? name.trim().split(" ")[0] : "there";
  const aspirantName = user?.name ?? "Aspirant";
  const expiryLabel = EXPIRY_OPTIONS.find((o) => o.hours === expiryHours)?.label ?? "";
  const smsPreview = `Hi ${who}, ${aspirantName} has invited you as campaign manager for the ${workspace?.name ?? "workspace"} on Mtazamo Votes.${note.trim() ? ` "${note.trim()}"` : ""} Join: mtz.vote/j/XXXXX — expires in ${expiryLabel}.`;

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link
            to={`/workspaces/${workspace.id}/managers`}
            style={{ color: portal.textSubtle, textDecoration: "none" }}
          >
            Campaign managers
          </Link>
          {" / Invite"}
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
          Invite a campaign manager
        </div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 24 }}>
          They join this workspace only, with everything except billing and account deletion.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left: form */}
          <div
            style={{
              border: `1px solid ${portal.border}`,
              borderRadius: 8,
              boxShadow: portal.cardShadow,
              padding: 24,
            }}
          >
            {sentMessage && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: portal.successBg,
                  color: portal.successText,
                  marginBottom: devToken ? 8 : 20,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: portal.successBold,
                    marginTop: 6,
                    flexShrink: 0,
                  }}
                />
                <span>{sentMessage}</span>
              </div>
            )}

            {devToken && (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: portal.warnBg,
                  color: portal.warnText,
                  marginBottom: 20,
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
                  Dev mode — no SMS was sent. Join link:{" "}
                  <a href={`${window.location.origin}/join/${devToken}`} style={{ fontFamily: "monospace", color: "inherit" }}>
                    {window.location.origin}/join/{devToken}
                  </a>
                </span>
              </div>
            )}

            <FieldLabel label="Full name" required />
            <input
              value={name}
              onChange={(e) => { setName(e.target.value); setSentMessage(""); }}
              placeholder="Daniel Mutiso"
              style={inputStyle}
            />

            <FieldLabel label="Phone number" required />
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
                onChange={(e) => { setPhone(e.target.value); setPhoneError(""); setSentMessage(""); }}
                placeholder="7xx xxx xxx"
                style={{ ...inputStyle, marginBottom: 0, flex: 1, minWidth: 0 }}
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

            <FieldLabel label="Email" optional />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="daniel@example.com"
              style={inputStyle}
            />

            <FieldLabel label="Message in the invite" optional />
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
              <div
                style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 8 }}
              >
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

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 20,
              }}
            >
              <Link
                to={`/workspaces/${workspace.id}/managers`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: 32,
                  padding: "0 12px",
                  borderRadius: 8,
                  background: portal.neutral,
                  color: portal.ink,
                  fontSize: 14,
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Cancel
              </Link>
              <button
                onClick={handleSend}
                disabled={disabled}
                style={{
                  height: 32,
                  padding: "0 12px",
                  border: "none",
                  borderRadius: 8,
                  fontSize: 14,
                  fontWeight: 500,
                  cursor: disabled ? "not-allowed" : "pointer",
                  background: disabled ? portal.neutral : portal.brand,
                  color: disabled ? portal.textSubtlest : portal.inverse,
                  fontFamily: "inherit",
                }}
              >
                {sending ? "Sending…" : "Send SMS invite"}
              </button>
            </div>
          </div>

          {/* Right: role/scope info */}
          <div>
            <div
              style={{
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                Role and scope
              </div>
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                }}
              >
                <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 4 }}>
                  Role
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
                  Campaign manager
                </span>
              </div>
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                }}
              >
                <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 4 }}>
                  Workspace
                </div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{workspace.name}</div>
                <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
                  {[seatLabel(workspace.seat), workspace.county ? `${workspace.county} County` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              {SCOPE_ROWS.map((r, i) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 18px",
                    borderBottom:
                      i < SCOPE_ROWS.length - 1 ? `1px solid ${portal.borderSubtle}` : "none",
                  }}
                >
                  <span
                    style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      flexShrink: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 10,
                      fontWeight: 700,
                      color: portal.inverse,
                      background: r.ok ? portal.successBold : "#B3B9C4",
                    }}
                  >
                    {r.ok ? "✓" : "—"}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13 }}>{r.label}</span>
                </div>
              ))}
              <div style={{ padding: "12px 18px", fontSize: 12, color: portal.textSubtle }}>
                Every invite, accept and removal is written to the workspace audit log.
              </div>
            </div>

            <div
              style={{
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                padding: "14px 18px",
                fontSize: 12,
                color: portal.textSubtle,
                lineHeight: "18px",
              }}
            >
              Only campaign managers are invited this way. Agents and volunteers apply through the
              public recruitment link and are vetted by national ID and phone OTP.
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function FieldLabel({ label, required, optional }: { label: string; required?: boolean; optional?: boolean }) {
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

const inputStyle: React.CSSProperties = {
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

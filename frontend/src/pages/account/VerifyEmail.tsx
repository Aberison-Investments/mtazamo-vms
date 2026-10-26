import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../../api";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { PortalShell } from "../../components/portal/PortalShell";

const STEPS = [
  {
    title: "Open your inbox",
    desc: 'Look for "Verify your Mtazamo Votes email" from no-reply@mtazamo.vote.',
  },
  {
    title: "Tap the verification link",
    desc: "It works on any device and expires 24 hours after sending.",
  },
  {
    title: "Come back here",
    desc: "This page updates automatically once the link is opened.",
  },
];

const UNLOCKS = [
  "Emailing tally exports, evidence packs and the audit log",
  "Account recovery if your phone is lost on election night",
  "Copies of discrepancy escalations raised to you",
  "Weekly readiness digests across your workspaces",
];

export function VerifyEmail() {
  const { user, refresh } = useAuth();
  const verified = !!user?.email_verified;

  const [resendCount, setResendCount] = useState(0);
  const [showChange, setShowChange] = useState(false);
  const [draftEmail, setDraftEmail] = useState("");
  const [devToken, setDevToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sentOnce = useRef(false);

  // On first visit while pending, issue a verification link so the "we sent a
  // link" copy is truthful. Guarded so React's double-invoke doesn't double-send.
  useEffect(() => {
    if (verified || sentOnce.current) return;
    sentOnce.current = true;
    api
      .sendEmailVerification()
      .then((res) => setDevToken(res.dev_token))
      .catch(() => {});
  }, [verified]);

  async function handleResend() {
    setError(null);
    try {
      const res = await api.sendEmailVerification();
      setDevToken(res.dev_token);
      setResendCount((c) => c + 1);
    } catch {
      setError("Could not resend the link. Try again.");
    }
  }

  async function handleOpenedLink() {
    setChecking(true);
    setError(null);
    try {
      await refresh();
    } catch {
      setError("Could not refresh your status. Try again.");
    } finally {
      setChecking(false);
    }
  }

  async function handleSaveEmail() {
    const next = draftEmail.trim();
    if (!next) return;
    setError(null);
    try {
      const res = await api.changeEmail(next);
      setDevToken(res.dev_token);
      setDraftEmail("");
      setShowChange(false);
      setResendCount(1);
      await refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(err.fields.email?.[0] ?? err.message);
      } else {
        setError("Could not update the address. Try again.");
      }
    }
  }

  const email = user?.email ?? "your inbox";
  const devLink = devToken ? `${window.location.origin}/verify-email?token=${devToken}` : null;
  const saveDisabled = !draftEmail.trim();

  const resendNote =
    resendCount > 0
      ? `Link re-sent ${resendCount} time${resendCount === 1 ? "" : "s"} — check the spam folder if it hasn't arrived.`
      : "Not in your inbox? Resend it, or change the address if it was mistyped.";

  return (
    <PortalShell active="overview">
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to="/account" style={{ textDecoration: "none", color: portal.textSubtle }}>
            Overview
          </Link>{" "}
          / Verify email address
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>
          Verify your email address
        </div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 24 }}>
          Your phone is already verified and handles log-in. Email is verified once, here.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)",
            gap: 24,
            alignItems: "start",
          }}
        >
          {/* Left card */}
          <div
            style={{
              border: `1px solid ${portal.border}`,
              borderRadius: 8,
              boxShadow: portal.cardShadow,
              padding: 24,
            }}
          >
            {verified ? (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: portal.successBg,
                    color: portal.successText,
                    marginBottom: 18,
                  }}
                >
                  <Dot color={portal.successBold} />
                  <span>
                    <strong style={{ fontWeight: 600 }}>Email verified.</strong> {email} can now
                    receive exports, evidence packs and recovery codes.
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <Link
                    to="/account"
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
                    }}
                  >
                    Back to overview
                  </Link>
                  <Link
                    to="/account/settings"
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
                    Manage contacts
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "12px 14px",
                    borderRadius: 8,
                    background: portal.warnBg,
                    color: portal.warnText,
                    marginBottom: devLink ? 10 : 20,
                  }}
                >
                  <Dot color={portal.warnBold} />
                  <span>
                    We sent a verification link to <strong style={{ fontWeight: 600 }}>{email}</strong>.
                    Open it on any device — the link is valid for 24 hours.
                  </span>
                </div>

                {devLink && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 10,
                      padding: "10px 14px",
                      borderRadius: 8,
                      background: portal.brandSubtlest,
                      color: portal.brandText,
                      marginBottom: 20,
                      fontSize: 13,
                    }}
                  >
                    <Dot color={portal.brand} />
                    <span style={{ minWidth: 0 }}>
                      Dev mode — no email is sent. Open your verification link:{" "}
                      <a href={devLink} style={{ fontWeight: 600, wordBreak: "break-all" }}>
                        {devLink}
                      </a>
                    </span>
                  </div>
                )}

                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                    color: "#758195",
                    marginBottom: 10,
                  }}
                >
                  How to finish
                </div>
                {STEPS.map((s, i) => (
                  <div
                    key={s.title}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "10px 0",
                      borderBottom: `1px solid ${portal.borderSubtle}`,
                    }}
                  >
                    <span
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: portal.brandSubtlest,
                        color: portal.brandText,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        fontWeight: 700,
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      {i + 1}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 500 }}>{s.title}</div>
                      <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
                        {s.desc}
                      </div>
                    </div>
                  </div>
                ))}

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "20px 0 6px" }}>
                  <button onClick={handleOpenedLink} disabled={checking} style={primaryBtn(checking)}>
                    {checking ? "Checking…" : "I've opened the link"}
                  </button>
                  <button onClick={handleResend} style={neutralBtn}>
                    Resend link
                  </button>
                  <button
                    onClick={() => {
                      setShowChange((v) => !v);
                      setDraftEmail("");
                      setError(null);
                    }}
                    style={ghostBtn}
                  >
                    {showChange ? "Keep this address" : "Change email address"}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: portal.textSubtle }}>{resendNote}</div>

                {error && (
                  <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 8 }}>{error}</div>
                )}

                {showChange && (
                  <div
                    style={{
                      borderTop: `1px solid ${portal.borderSubtle}`,
                      marginTop: 18,
                      paddingTop: 18,
                    }}
                  >
                    <div
                      style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}
                    >
                      New email address
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      <input
                        value={draftEmail}
                        onChange={(e) => setDraftEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={{
                          flex: 1,
                          minWidth: 220,
                          height: 36,
                          boxSizing: "border-box",
                          border: `1px solid ${portal.border}`,
                          borderRadius: 8,
                          padding: "0 10px",
                          fontSize: 14,
                          color: portal.ink,
                          background: portal.canvas,
                          fontFamily: "inherit",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={handleSaveEmail}
                        disabled={saveDisabled}
                        style={{
                          height: 36,
                          padding: "0 14px",
                          border: "none",
                          borderRadius: 8,
                          fontSize: 14,
                          fontWeight: 500,
                          flexShrink: 0,
                          cursor: saveDisabled ? "not-allowed" : "pointer",
                          background: saveDisabled ? portal.neutral : portal.brand,
                          color: saveDisabled ? portal.textSubtlest : portal.inverse,
                          fontFamily: "inherit",
                        }}
                      >
                        Save and resend
                      </button>
                    </div>
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 6 }}>
                      Changing the address cancels the old link and sends a new one.
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right column */}
          <div>
            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, marginBottom: 16 }}>
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                Verification status
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Phone</div>
                  <div style={{ fontSize: 12, color: portal.textSubtle }}>
                    {user?.phone_masked ?? "—"} · second factor
                  </div>
                </div>
                <StatusLoz text={user?.phone_verified ? "Verified" : "Pending"} ok={!!user?.phone_verified} />
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>Email</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: portal.textSubtle,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {email}
                  </div>
                </div>
                <StatusLoz text={verified ? "Verified" : "Pending"} ok={verified} />
              </div>
            </div>

            <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8 }}>
              <div
                style={{
                  padding: "14px 18px",
                  borderBottom: `1px solid ${portal.borderSubtle}`,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              >
                What this unlocks
              </div>
              {UNLOCKS.map((u) => (
                <div
                  key={u}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    padding: "10px 18px",
                    borderBottom: `1px solid ${portal.borderSubtle}`,
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: portal.brand,
                      flexShrink: 0,
                      marginTop: 7,
                    }}
                  />
                  <span style={{ fontSize: 13, color: portal.label }}>{u}</span>
                </div>
              ))}
              <div style={{ padding: "12px 18px", fontSize: 12, color: portal.textSubtle }}>
                Log-in codes always go to your phone — email is never used as a second factor.
              </div>
            </div>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      style={{ width: 8, height: 8, borderRadius: "50%", background: color, marginTop: 6, flexShrink: 0 }}
    />
  );
}

function StatusLoz({ text, ok }: { text: string; ok: boolean }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 20,
        padding: "0 8px",
        borderRadius: 3,
        background: ok ? portal.successBg : portal.warnBg,
        color: ok ? portal.successText : portal.warnText,
        fontSize: 11,
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: "0.3px",
        whiteSpace: "nowrap",
        flexShrink: 0,
      }}
    >
      {text}
    </span>
  );
}

const primaryBtn = (busy: boolean): React.CSSProperties => ({
  height: 32,
  padding: "0 12px",
  border: "none",
  borderRadius: 8,
  background: portal.brand,
  color: portal.inverse,
  fontSize: 14,
  fontWeight: 500,
  cursor: busy ? "wait" : "pointer",
  fontFamily: "inherit",
});

const neutralBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "none",
  borderRadius: 8,
  background: portal.neutral,
  color: portal.ink,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostBtn: React.CSSProperties = {
  height: 32,
  padding: "0 12px",
  border: "none",
  borderRadius: 8,
  background: portal.canvas,
  color: portal.brandText,
  fontSize: 14,
  fontWeight: 500,
  cursor: "pointer",
  fontFamily: "inherit",
};

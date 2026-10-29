import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, type ApiError, type AgentInviteInfo } from "../../api";
import { useAuth } from "../../auth";
import { portal } from "../../portalTheme";

type Step = "landing" | "details" | "otp" | "setup" | "done";

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
      <span style={{ width: 22, height: 22, borderRadius: 5, background: portal.brand, display: "inline-flex", alignItems: "center", justifyContent: "center", color: portal.inverse, fontSize: 12, fontWeight: 700 }}>M</span>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.2px" }}>Mtazamo</span>
      <span style={{ fontSize: 14, color: portal.textSubtle }}>Votes</span>
    </div>
  );
}

export function AgentJoin() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { signIn } = useAuth();

  const [invite, setInvite] = useState<AgentInviteInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("landing");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [verifiedToken, setVerifiedToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!token) return;
    api.getAgentInvite(token).then((res) => {
      setInvite(res.invite);
      const name = res.invite.name;
      const parts = name.trim().split(" ");
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" ") ?? "");
    }).catch(() => setNotFound(true));
  }, [token]);

  async function handleRequestOtp() {
    if (!token) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.agentInviteRequestOtp(token);
      if (res.dev_otp) setDevOtp(res.dev_otp);
      setStep("otp");
    } catch (err) {
      const e = err as ApiError;
      setErrors({ _general: e.message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAccept() {
    if (!token) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.agentInviteAccept(token, otp);
      setVerifiedToken(res.verified_token);
      setStep("setup");
    } catch (err) {
      const e = err as ApiError;
      const errs: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) errs[k] = msgs[0];
      if (!Object.keys(errs).length) errs._general = e.message;
      setErrors(errs);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSetup() {
    if (!token || !verifiedToken) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.agentInviteSetup(token, {
        verified_token: verifiedToken,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirmPassword,
      });
      signIn(res.token, res.user, res.refresh_token);
      navigate("/workspaces", { replace: true });
    } catch (err) {
      const e = err as ApiError;
      const errs: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) errs[k] = msgs[0];
      if (!Object.keys(errs).length) errs._general = e.message;
      setErrors(errs);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!token) return;
    try {
      const res = await api.agentInviteRequestOtp(token);
      if (res.dev_otp) setDevOtp(res.dev_otp);
    } catch {}
  }

  const otpInvalid = otp.trim().length < 6;
  const detailsInvalid = !firstName.trim() || !lastName.trim() || !age || parseInt(age, 10) < 18;
  const setupDisabled =
    submitting ||
    !firstName.trim() ||
    !lastName.trim() ||
    !email.trim() ||
    password.length < 10 ||
    password !== confirmPassword;

  const continueStyle: React.CSSProperties = {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 40,
    border: 0,
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    cursor: "pointer",
    background: portal.brand,
    color: portal.inverse,
  };

  const disabledContinueStyle: React.CSSProperties = {
    ...continueStyle,
    background: portal.neutral,
    color: portal.textSubtlest,
    cursor: "not-allowed",
  };

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
        <Wordmark />
        <div style={{ width: "100%", maxWidth: 400, background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Invite not found</div>
          <div style={{ fontSize: 14, color: portal.textSubtle }}>This invite link is invalid, has expired, or has already been used.</div>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const aspirantFirst = invite.workspace.aspirant_name?.split(" ")[0] ?? "The campaign";

  return (
    <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, color: portal.ink, fontSize: 14, lineHeight: "20px", display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px 56px" }}>
      <Wordmark />

      <div style={{ width: "100%", maxWidth: 400, background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, padding: 32 }}>

        {step === "landing" && (
          <>
            <span style={{ display: "inline-flex", alignItems: "center", height: 20, padding: "0 8px", borderRadius: 3, background: portal.brandSubtlest, color: portal.brandText, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.3px", marginBottom: 12 }}>
              Named invite
            </span>
            <div style={{ fontSize: 18, lineHeight: "24px", fontWeight: 700, marginBottom: 6 }}>
              {aspirantFirst} named you {invite.role_label} for {invite.geo_scope}
            </div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.label, marginBottom: 18 }}>
              This link is tied to <strong style={{ color: portal.ink }}>{invite.phone_masked}</strong>. Continuing confirms you're the person that number belongs to.
              {invite.expires_at && ` This invite expires ${new Date(invite.expires_at).toLocaleDateString()}.`}
            </div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 18, padding: "10px 12px", borderRadius: 8, background: portal.canvasSubtle }}>
              <strong style={{ color: portal.ink }}>{invite.role_label}:</strong> {invite.role_blurb}
            </div>
            <button onClick={() => setStep("details")} style={{ ...continueStyle, width: "100%" }}>Continue</button>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <button
                onClick={async () => { await api.agentInviteDecline(token ?? ""); }}
                style={{ background: "transparent", border: 0, fontSize: 13, color: portal.textSubtle, cursor: "pointer", fontFamily: "inherit" }}
              >
                Decline this invite
              </button>
            </div>
          </>
        )}

        {step === "details" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Your details</div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 18 }}>As they appear on your national ID.</div>

            {errors._general && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>{errors._general}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 0 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>First name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Grace" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none", marginBottom: 12 }} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Last name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Njeri" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none", marginBottom: 12 }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Age <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="29" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 3 }}>Must be 18+</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Email</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="grace@example.com" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 3 }}>Optional</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Phone number</div>
              <div style={{ height: 36, border: `1px solid ${portal.border}`, borderRadius: 8, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 14, color: portal.label, background: portal.canvasSubtle }}>
                {invite.phone_masked}
              </div>
              <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 3 }}>Pre-filled from your invite — we'll send the verification code here.</div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div onClick={() => setStep("landing")} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40, padding: "0 16px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Back</div>
              <button onClick={handleRequestOtp} disabled={detailsInvalid || submitting} style={detailsInvalid || submitting ? disabledContinueStyle : continueStyle}>
                {submitting ? "Sending…" : "Send verification code"}
              </button>
            </div>
          </>
        )}

        {step === "otp" && (
          <>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Verify your number</div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.textSubtle, marginBottom: 18 }}>
              We sent a 6-digit code by SMS to {invite.phone_masked}.
            </div>

            {devOtp && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.warnBg, color: portal.warnText, fontSize: 13, marginBottom: 16 }}>
                Dev mode — OTP: <strong style={{ fontFamily: "monospace" }}>{devOtp}</strong>
              </div>
            )}

            {errors._general && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>{errors._general}</div>
            )}

            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="000000"
              style={{ width: "100%", height: 48, boxSizing: "border-box" as const, border: `1px solid ${errors.code ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 14px", fontSize: 22, letterSpacing: 6, textAlign: "center", color: portal.ink, background: portal.canvas, marginBottom: 14, fontFamily: "inherit", outline: "none" }}
            />
            {errors.code && <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 10, marginTop: -8 }}>{errors.code}</div>}
            <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>
              Didn't get it?{" "}
              <a href="#" onClick={(e) => { e.preventDefault(); handleResend(); }} style={{ fontWeight: 500 }}>Resend code</a>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div onClick={() => { setStep("details"); setOtp(""); setErrors({}); }} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40, padding: "0 16px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Back</div>
              <button onClick={handleAccept} disabled={otpInvalid || submitting} style={otpInvalid || submitting ? disabledContinueStyle : continueStyle}>
                {submitting ? "Verifying…" : "Verify"}
              </button>
            </div>
          </>
        )}

        {step === "setup" && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: portal.textSubtle, marginBottom: 18 }}>
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.brand }} />
              <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.brand }} />
              <span style={{ whiteSpace: "nowrap" }}>Step 2 of 2</span>
            </div>

            <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", color: portal.label, marginBottom: 6 }}>Set up your account</div>
            <div style={{ fontSize: 14, color: portal.textSubtle, textAlign: "center", marginBottom: 24 }}>
              You'll use these details to log in to your workspace.
            </div>

            {errors._general && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>{errors._general}</div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 0 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>First name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Grace" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.first_name ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              </div>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Last name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Njeri" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.last_name ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Email <span style={{ color: portal.dangerText }}>*</span></div>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="grace@example.com" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.email ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              {errors.email && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{errors.email}</div>}
            </div>

            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Password <span style={{ color: portal.dangerText }}>*</span></div>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="At least 10 characters" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.password ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              {password.length > 0 && password.length < 10 && <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 4 }}>Must be at least 10 characters</div>}
              {errors.password && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{errors.password}</div>}
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Confirm password <span style={{ color: portal.dangerText }}>*</span></div>
              <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Repeat your password" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.password_confirmation ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              {confirmPassword.length > 0 && password !== confirmPassword && <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 4 }}>Passwords don't match</div>}
            </div>

            <button
              onClick={handleSetup}
              disabled={setupDisabled}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", height: 36, border: 0, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: setupDisabled ? "default" : "pointer", background: setupDisabled ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

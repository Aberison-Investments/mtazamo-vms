import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api";
import { useAuth } from "../../auth";
import { portal } from "../../portalTheme";
import { Field } from "../../components/portal/ui";

interface SetupState {
  verified_token?: string;
  name?: string;
  email?: string | null;
  inviter_name?: string | null;
}

export function JoinSetupAccount() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const state = (location.state ?? {}) as SetupState;

  const [firstName, setFirstName] = useState(() => state.name?.split(" ")[0] ?? "");
  const [lastName, setLastName] = useState(() => {
    const parts = state.name?.split(" ") ?? [];
    return parts.length > 1 ? parts.slice(1).join(" ") : "";
  });
  const [email, setEmail] = useState(state.email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!state.verified_token) {
    return (
      <CenteredCard>
        <div style={{ textAlign: "center", fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
          Session expired
        </div>
        <div style={{ textAlign: "center", fontSize: 14, color: portal.textSubtle, marginBottom: 16 }}>
          Your phone verification session has expired.
        </div>
        <a
          href={`/join/${token}`}
          style={{ display: "block", textAlign: "center", fontSize: 14, fontWeight: 500, color: portal.brandText }}
        >
          ← Back to the invite link
        </a>
      </CenteredCard>
    );
  }

  const disabled =
    submitting ||
    !firstName.trim() ||
    !lastName.trim() ||
    !email.trim() ||
    password.length < 10 ||
    password !== confirmPassword;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || !token || !state.verified_token) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.setupManagerAccount(token, {
        verified_token: state.verified_token,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        email: email.trim(),
        password,
        password_confirmation: confirmPassword,
      });
      signIn(res.token, res.user);
      navigate(`/workspaces/${res.workspace_id}`, { replace: true });
    } catch (err) {
      const e = err as ApiError;
      const fieldErrors: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) {
        fieldErrors[k] = msgs[0];
      }
      // verified_token errors have no visible field — surface as the general banner
      if (fieldErrors.verified_token) {
        fieldErrors._general = fieldErrors.verified_token;
        delete fieldErrors.verified_token;
      }
      if (!Object.keys(fieldErrors).length) {
        fieldErrors._general = e.message;
      }
      setErrors(fieldErrors);
    } finally {
      setSubmitting(false);
    }
  }

  const inviterFirst = state.inviter_name?.split(" ")[0] ?? "the aspirant";

  return (
    <CenteredCard
      footer={
        <div style={{ fontSize: 14, color: portal.textSubtle, marginTop: 20, textAlign: "center" }}>
          Already have an account?{" "}
          <a href="/login" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Log in
          </a>
        </div>
      }
    >
      {/* Step bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: portal.textSubtle, marginBottom: 18 }}>
        <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.brand }} />
        <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.brand }} />
        <span style={{ whiteSpace: "nowrap" }}>Step 2 of 2</span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", color: portal.label, marginBottom: 6 }}>
        Set up your account
      </div>
      <div style={{ fontSize: 14, color: portal.textSubtle, textAlign: "center", marginBottom: 24 }}>
        You'll use these details to log in to your workspace.
      </div>

      {errors._general && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            background: portal.dangerBg,
            color: portal.dangerText,
            fontSize: 13,
            marginBottom: 16,
          }}
        >
          {errors._general}
          {errors._general.toLowerCase().includes("expired") && (
            <div style={{ marginTop: 6 }}>
              <a href={`/join/${token}`} style={{ color: portal.dangerText, fontWeight: 600 }}>
                ← Go back and verify your phone again
              </a>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 0 }}>
          <Field
            label="First name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            placeholder="Daniel"
            autoComplete="given-name"
            error={errors.first_name}
          />
          <Field
            label="Last name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            placeholder="Mutiso"
            autoComplete="family-name"
            error={errors.last_name}
          />
        </div>

        <Field
          label="Email"
          required
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="daniel@example.com"
          autoComplete="email"
          error={errors.email}
        />

        <Field
          label="Password"
          required
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="At least 10 characters"
          autoComplete="new-password"
          hint={password.length > 0 && password.length < 10 ? "Must be at least 10 characters" : undefined}
          error={errors.password}
        />

        <Field
          label="Confirm password"
          required
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Repeat your password"
          autoComplete="new-password"
          hint={
            confirmPassword.length > 0 && password !== confirmPassword
              ? "Passwords don't match"
              : undefined
          }
          error={errors.password_confirmation}
          style={{ marginBottom: 20 }}
        />

        <CreateButton disabled={disabled} submitting={submitting} />

        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: 10,
            padding: "10px 12px",
            borderRadius: 8,
            background: portal.brandSubtlest,
            color: portal.brandText,
            fontSize: 12,
            marginTop: 16,
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: portal.brand,
              marginTop: 5,
              flexShrink: 0,
            }}
          />
          <span>
            Your phone is your second factor at every log-in. {inviterFirst} can see your name and
            phone on the workspace — your password is never shared.
          </span>
        </div>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: portal.canvasSubtle,
        fontFamily: portal.font,
        color: portal.ink,
        fontSize: 14,
        lineHeight: "20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "48px 16px 56px",
      }}
    >
      <Wordmark />
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: portal.canvas,
          borderRadius: 8,
          boxShadow: portal.cardShadow,
          padding: 32,
        }}
      >
        {children}
      </div>
      {footer}
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 24 }}>
      <span
        style={{
          width: 22,
          height: 22,
          borderRadius: 5,
          background: portal.brand,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: portal.inverse,
          fontSize: 12,
          fontWeight: 700,
        }}
      >
        M
      </span>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.2px" }}>Mtazamo</span>
      <span style={{ fontSize: 14, color: portal.textSubtle }}>Votes</span>
    </div>
  );
}

function CreateButton({ disabled, submitting }: { disabled: boolean; submitting: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="submit"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: 36,
        borderRadius: 8,
        border: 0,
        background: disabled ? portal.neutral : hover ? portal.brandHover : portal.brand,
        color: disabled ? portal.textSubtle : portal.inverse,
        fontSize: 14,
        fontWeight: 500,
        cursor: disabled ? "default" : "pointer",
        fontFamily: "inherit",
        opacity: 1,
      }}
    >
      {submitting ? "Creating account…" : "Create account and join"}
    </button>
  );
}

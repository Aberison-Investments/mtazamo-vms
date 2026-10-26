import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api";
import { portal } from "../../portalTheme";
import { AuthLayout, Banner, CardTitle, Field, Label, PrimaryButton } from "../../components/portal/ui";

interface LoginLocationState {
  justRegistered?: boolean;
  identifier?: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as LoginLocationState;

  const [identifier, setIdentifier] = useState(state.identifier ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const challenge = await api.login(identifier, password);
      // Password accepted → SMS OTP second factor.
      navigate("/verify", {
        state: {
          identifier: challenge.identifier,
          phone_hint: challenge.phone_hint,
          dev_otp: challenge.dev_otp,
        },
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(err.fields.identifier?.[0] ?? err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      footer={
        <>
          New aspirant?{" "}
          <Link to="/create-account" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Create an account
          </Link>
        </>
      }
    >
      <CardTitle>Log in to Mtazamo Votes</CardTitle>

      {state.justRegistered && <Banner tone="success">Account created. Log in to continue.</Banner>}

      <form onSubmit={submit} noValidate>
        <Field
          label="Email or phone"
          placeholder="wanjiru.kamau@example.com"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
        />

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <Label>Password</Label>
            <a href="#" style={{ fontSize: 12, textDecoration: "none", color: portal.brandText }}>
              Forgot password?
            </a>
          </div>
          <Field
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginBottom: 0 }}
          />
        </div>

        {error && <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 12 }}>{error}</div>}

        <PrimaryButton type="submit" disabled={submitting}>
          {submitting ? "Checking…" : "Log in"}
        </PrimaryButton>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 12, textAlign: "center" }}>
          A six-digit code will be sent to your registered phone.
        </div>
      </form>
    </AuthLayout>
  );
}

import { useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { api, ApiError } from "../../api";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { AuthLayout, Banner, PrimaryButton } from "../../components/portal/ui";

interface VerifyState {
  identifier?: string;
  phone_hint?: string | null;
  dev_otp?: string | null;
}

export function VerifyPhone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const state = (location.state ?? {}) as VerifyState;

  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [devOtp, setDevOtp] = useState<string | null>(state.dev_otp ?? null);
  const [resendCount, setResendCount] = useState(0);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const code = useMemo(() => digits.join(""), [digits]);

  // Reached directly without a login challenge — send them back.
  if (!state.identifier) return <Navigate to="/login" replace />;

  function onChange(i: number, val: string) {
    const digit = (val || "").replace(/[^0-9]/g, "").slice(-1);
    setDigits((d) => {
      const next = [...d];
      next[i] = digit;
      return next;
    });
    if (digit && refs.current[i + 1]) refs.current[i + 1]?.focus();
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && refs.current[i - 1]) {
      refs.current[i - 1]?.focus();
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { token, user } = await api.verifyOtp(state.identifier!, code);
      signIn(token, user);
      navigate("/account", { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 422) {
        setError(err.fields.code?.[0] ?? err.message);
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    try {
      const res = await api.resendOtp(state.identifier!);
      setResendCount((c) => c + 1);
      setDevOtp(res.dev_otp ?? null);
      setError(null);
    } catch {
      setError("Could not resend the code. Try again.");
    }
  }

  return (
    <AuthLayout
      footer={
        <Link to="/login" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
          Back to log in
        </Link>
      }
    >
      <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", color: portal.label, marginBottom: 6 }}>
        Enter your log-in code
      </div>
      <div style={{ fontSize: 14, color: portal.textSubtle, textAlign: "center", marginBottom: 24 }}>
        We sent a six-digit code by SMS to{" "}
        <strong style={{ color: portal.ink, fontWeight: 600 }}>{state.phone_hint ?? "your phone"}</strong>.
      </div>

      {devOtp && (
        <Banner tone="warning">
          Dev mode — no SMS is sent. Your code is <strong>{devOtp}</strong>.
        </Banner>
      )}

      <form onSubmit={verify}>
        <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
          {digits.map((d, i) => (
            <OtpBox
              key={i}
              value={d}
              inputRef={(el) => (refs.current[i] = el)}
              onChange={(v) => onChange(i, v)}
              onKeyDown={(e) => onKeyDown(i, e)}
            />
          ))}
        </div>

        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>
          Didn't get it?{" "}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              resend();
            }}
            style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}
          >
            Resend code{resendCount > 0 ? ` · sent ${resendCount + 1}×` : ""}
          </a>{" "}
          · <a href="#" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>Call me instead</a>
        </div>

        {error && <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 12 }}>{error}</div>}

        <PrimaryButton type="submit" disabled={submitting || code.length < 6}>
          {submitting ? "Verifying…" : "Verify and continue"}
        </PrimaryButton>

        <Banner tone="info">
          Phone is your second factor at every log-in. Email verification is handled once, from the
          setup guide.
        </Banner>
      </form>
    </AuthLayout>
  );
}

function OtpBox({
  value,
  onChange,
  onKeyDown,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  inputRef: (el: HTMLInputElement | null) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      maxLength={1}
      inputMode="numeric"
      style={{
        width: "100%",
        minWidth: 0,
        height: 44,
        textAlign: "center",
        fontSize: 18,
        fontWeight: 600,
        boxSizing: "border-box",
        border: `1px solid ${focus ? portal.brand : portal.border}`,
        boxShadow: focus ? `0 0 0 1px ${portal.brand}` : "none",
        borderRadius: 8,
        color: portal.ink,
        background: portal.canvas,
        outline: "none",
        fontFamily: "inherit",
      }}
    />
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../../api";
import { portal } from "../../portalTheme";
import { Banner } from "../../components/portal/ui";

export function JoinVerifyPhone() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [phoneHint, setPhoneHint] = useState<string | null>(null);
  const [inviterName, setInviterName] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendCount, setResendCount] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const code = useMemo(() => digits.join(""), [digits]);

  useEffect(() => {
    if (!token) return;
    // Load inviter name for the info note, then request OTP.
    api.getInvite(token)
      .then(({ invite }) => {
        setInviterName(invite.inviter_name);
        return api.requestInviteOtp(token);
      })
      .then((res) => {
        setPhoneHint(res.phone_hint);
        setDevOtp(res.dev_otp ?? null);
      })
      .catch(() => setInvalid(true));
  }, [token]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || submitting || code.length < 6) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.acceptInvite(token, code);
      navigate(`/join/${token}/setup`, {
        replace: true,
        state: {
          verified_token: res.verified_token,
          name: res.name,
          email: res.email,
          inviter_name: inviterName,
        },
      });
    } catch (err) {
      const e = err as ApiError;
      setError(e.fields?.code?.[0] ?? e.message);
      setSubmitting(false);
    }
  }

  async function resend() {
    if (!token) return;
    try {
      const res = await api.requestInviteOtp(token);
      setResendCount((c) => c + 1);
      setDevOtp(res.dev_otp ?? null);
      setError(null);
    } catch {
      setError("Could not resend the code. Try again.");
    }
  }

  if (invalid) {
    return <CenteredCard><InvalidState /></CenteredCard>;
  }

  return (
    <CenteredCard>
      {/* Step bar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: portal.textSubtle, marginBottom: 18 }}>
        <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.brand }} />
        <span style={{ flex: 1, height: 3, borderRadius: 2, background: portal.border }} />
        <span style={{ whiteSpace: "nowrap" }}>Step 1 of 2</span>
      </div>

      <div style={{ fontSize: 16, fontWeight: 600, textAlign: "center", color: portal.label, marginBottom: 6 }}>
        Confirm it's you
      </div>
      <div style={{ fontSize: 14, color: portal.textSubtle, textAlign: "center", marginBottom: 24 }}>
        {phoneHint ? (
          <>
            We sent a six-digit code to the number the invite was sent to,{" "}
            <strong style={{ color: portal.ink, fontWeight: 600 }}>{phoneHint}</strong>.
          </>
        ) : (
          "Sending code…"
        )}
      </div>

      {devOtp && (
        <Banner tone="warning">
          Dev mode — no SMS sent. Your code is <strong>{devOtp}</strong>.
        </Banner>
      )}

      <form onSubmit={handleSubmit}>
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
            onClick={(e) => { e.preventDefault(); resend(); }}
            style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}
          >
            Resend code{resendCount > 0 ? ` · sent ${resendCount + 1}×` : ""}
          </a>
          {" · "}
          <a href="#" style={{ fontWeight: 500, textDecoration: "none", color: portal.brandText }}>
            Call me instead
          </a>
        </div>

        {error && (
          <div style={{ fontSize: 12, color: portal.dangerText, marginBottom: 12 }}>{error}</div>
        )}

        <VerifyButton disabled={submitting || code.length < 6} submitting={submitting} />

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
            This number becomes your log-in and your second factor. It cannot be changed without{" "}
            {inviterName ? `${inviterName.split(" ")[0]}'s` : "the aspirant's"} approval.
          </span>
        </div>
      </form>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
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

function InvalidState() {
  return (
    <>
      <div style={{ textAlign: "center", fontWeight: 600, fontSize: 16, marginBottom: 8 }}>
        Invite not found
      </div>
      <div style={{ textAlign: "center", fontSize: 14, color: portal.textSubtle }}>
        This invite link is invalid or has expired.
      </div>
    </>
  );
}

function VerifyButton({ disabled, submitting }: { disabled: boolean; submitting: boolean }) {
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
      {submitting ? "Verifying…" : "Verify and continue"}
    </button>
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

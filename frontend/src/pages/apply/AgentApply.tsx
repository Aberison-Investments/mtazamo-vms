import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type ApiError, type PublicLinkInfo } from "../../api";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";

type Step = "landing" | "details" | "otp" | "setup" | "done";

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("254") && digits.length >= 12) return "+" + digits;
  if (digits.length === 10 && digits.startsWith("0")) return "+254" + digits.slice(1);
  if (digits.length === 9) return "+254" + digits;
  return "+254" + digits.replace(/^0+/, "");
}

function StationSearchSelect({
  stations,
  value,
  onChange,
}: {
  stations: Array<{ id: string; code: string | null; name: string; registered_voters: number | null; coverage: string }>;
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = stations.filter((s) =>
    !search.trim() ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.code && s.code.includes(search.trim()))
  );

  const selected = stations.find((s) => s.id === value) ?? null;

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ position: "relative", marginBottom: 8 }}>
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", width: 14, height: 14, color: portal.textSubtle, pointerEvents: "none" }}>
          <circle cx="6.5" cy="6.5" r="4" /><path d="M11 11l2.5 2.5" />
        </svg>
        <input
          ref={inputRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or station code…"
          style={{ width: "100%", height: 38, boxSizing: "border-box" as const, paddingLeft: 32, paddingRight: 10, border: `1px solid ${portal.border}`, borderRadius: 8, fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
        />
      </div>

      {selected && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, background: portal.brandSubtlest, border: `1px solid ${portal.brand}`, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: portal.brand, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: portal.brandText }}>{selected.name}</span>
            {selected.code && <span style={{ fontSize: 12, color: portal.brandText, marginLeft: 6 }}>· {selected.code}</span>}
          </div>
          <button onClick={() => onChange("")} style={{ border: "none", background: "none", cursor: "pointer", color: portal.brandText, fontSize: 16, lineHeight: 1, padding: "0 2px", fontFamily: "inherit" }}>×</button>
        </div>
      )}

      <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, overflow: "hidden", maxHeight: 240, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ padding: "12px 14px", fontSize: 13, color: portal.textSubtle }}>No stations match "{search}".</div>
        ) : (
          filtered.map((st, i) => {
            const sel = value === st.id;
            return (
              <div
                key={st.id}
                onClick={() => { onChange(st.id); setSearch(""); }}
                style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: i < filtered.length - 1 ? `1px solid ${portal.borderSubtle}` : "none", cursor: "pointer", background: sel ? portal.brandSubtlest : portal.canvas }}
              >
                <span style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: portal.inverse, background: sel ? portal.brand : portal.canvas, border: `1px solid ${sel ? portal.brand : portal.textSubtlest}` }}>
                  {sel ? "●" : ""}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: sel ? portal.brandText : portal.ink }}>{st.name}</div>
                  {st.code && <div style={{ fontSize: 11, color: portal.textSubtle }}>{st.code}</div>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ width: 22, height: 22, borderRadius: 5, background: portal.brand, display: "inline-flex", alignItems: "center", justifyContent: "center", color: portal.inverse, fontSize: 12, fontWeight: 700 }}>M</span>
      <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.2px" }}>Mtazamo</span>
      <span style={{ fontSize: 14, color: portal.textSubtle }}>Votes</span>
    </div>
  );
}

export function AgentApply() {
  const { token } = useParams<{ token: string }>();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [info, setInfo] = useState<PublicLinkInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [step, setStep] = useState<Step>("landing");
  const role = "agent";
  const [stationId, setStationId] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [age, setAge] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [agentId, setAgentId] = useState<string | null>(null);
  const [setupToken, setSetupToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");

  useEffect(() => {
    if (!token) return;
    api.getApplyLink(token).then((res) => {
      setInfo(res);
    }).catch(() => setNotFound(true));
  }, [token]);

  async function handleRequestOtp() {
    if (!token) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.applyRequestOtp(token, normalizePhone(phone), email.trim() || undefined);
      if (res.dev_otp) setDevOtp(res.dev_otp);
      setStep("otp");
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

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.applySubmit(token, {
        code: otp,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        phone: normalizePhone(phone),
        age: parseInt(age, 10),
        role,
        email: email.trim() || undefined,
        station_id: stationId || undefined,
      });
      setAgentId(res.id);
      setSetupToken(res.setup_token);
      setStep("setup");
    } catch (err) {
      const e = err as ApiError;
      const errs: Record<string, string> = {};
      for (const [k, msgs] of Object.entries(e.fields ?? {})) errs[k] = msgs[0];
      if (!Object.keys(errs).length) errs._general = e.message;
      setErrors(errs);
      if (errs.code) setStep("otp");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (!token) return;
    try {
      const res = await api.applyRequestOtp(token, normalizePhone(phone));
      if (res.dev_otp) setDevOtp(res.dev_otp);
    } catch {
    }
  }

  async function handleSetup() {
    if (!agentId || !setupToken) return;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await api.applyAgentSetup(agentId, {
        setup_token: setupToken,
        password,
        password_confirmation: passwordConfirm,
      });
      signIn(res.token, res.user, res.refresh_token);
      navigate(`/workspaces/${res.workspace_id}`);
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

  const detailsInvalid = !firstName.trim() || !lastName.trim() || !age || parseInt(age, 10) < 18 || !phone.trim();
  const otpInvalid = otp.trim().length < 6;

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, display: "flex", flexDirection: "column", alignItems: "center", padding: "48px 16px" }}>
        <Wordmark />
        <div style={{ width: "100%", maxWidth: 460, background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, padding: 32, textAlign: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Link not found</div>
          <div style={{ fontSize: 14, color: portal.textSubtle }}>This application link is invalid or has been closed by the campaign.</div>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, display: "flex", alignItems: "center", justifyContent: "center", color: portal.textSubtle, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  const workspace = info.workspace;
  const ward = info.ward;
  const stations = info.stations;
  const aspirantFirst = workspace.aspirant_name?.split(" ")[0] ?? "The campaign";

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

  return (
    <div style={{ minHeight: "100vh", background: portal.canvasSubtle, fontFamily: portal.font, color: portal.ink, fontSize: 14, lineHeight: "20px", display: "flex", flexDirection: "column", alignItems: "center", padding: "32px 16px 56px" }}>
      <Wordmark />

      <div style={{ width: "100%", maxWidth: 460, background: portal.canvas, borderRadius: 8, boxShadow: portal.cardShadow, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: `1px solid ${portal.borderSubtle}` }}>
          <span style={{ width: 32, height: 32, borderRadius: 5, background: portal.avatarDark, color: portal.inverse, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
            {String(workspace.year).slice(-2)}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{workspace.name}</div>
            <div style={{ fontSize: 12, color: portal.textSubtle }}>{workspace.year} General Election</div>
          </div>
        </div>

        {step === "landing" && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Apply to be a polling agent</div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.label, marginBottom: 18 }}>
              Sit at one polling station on election day, watch the count, and send the signed form through the app. Approval takes a day or two.
            </div>

            {ward && (
              <>
                <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 14 }}>
                  Applying for <strong style={{ color: portal.ink }}>{ward.name} Ward</strong> — the campaign has opened this ward for applications.
                </div>
                {info.link.require_preferred_station && (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 6 }}>
                      Polling station you'd like to apply for <span style={{ color: portal.dangerText }}>*</span>
                    </div>
                    <StationSearchSelect
                      stations={stations}
                      value={stationId}
                      onChange={setStationId}
                    />
                    <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 20 }}>Your preference — the campaign confirms your station after vetting.</div>
                  </>
                )}
              </>
            )}

            <button onClick={() => setStep("details")} style={continueStyle}>Continue</button>
          </div>
        )}

        {step === "details" && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Your details</div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 18 }}>As they appear on your national ID.</div>

            {errors._general && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>{errors._general}</div>
            )}

            <div style={{ display: "flex", gap: 16, marginBottom: 18, alignItems: "flex-start" }}>
              <div style={{ width: 76, height: 76, flexShrink: 0, borderRadius: "50%", background: portal.neutral, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: portal.textSubtle, cursor: "pointer", border: `1px dashed ${portal.border}` }}>
                Photo
              </div>
              <div style={{ fontSize: 12, lineHeight: "17px", color: portal.textSubtle, paddingTop: 6 }}>A clear photo of your face. Used on your agent badge and to confirm your identity at the station.</div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>First name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Grace" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.first_name ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                {errors.first_name && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 3 }}>{errors.first_name}</div>}
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Last name <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Njeri" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.last_name ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                {errors.last_name && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 3 }}>{errors.last_name}</div>}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Age <span style={{ color: portal.dangerText }}>*</span></div>
                <input value={age} onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="29" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.age ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 3 }}>Must be 18 or older to serve as an agent.</div>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Email</div>
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="grace@example.com" style={{ width: "100%", height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.email ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
                {errors.email && <div style={{ fontSize: 11, color: portal.dangerText, marginTop: 3 }}>{errors.email}</div>}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Phone number <span style={{ color: portal.dangerText }}>*</span></div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ display: "flex", alignItems: "center", height: 36, padding: "0 10px", border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvasSubtle, color: portal.label, fontSize: 14, flexShrink: 0 }}>+254</span>
                <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^0-9 ]/g, ""))} inputMode="numeric" placeholder="7xx xxx xxx" style={{ flex: 1, minWidth: 0, height: 36, boxSizing: "border-box" as const, border: `1px solid ${errors.phone ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 10px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }} />
              </div>
              {errors.phone ? (
                <div style={{ fontSize: 11, color: portal.dangerText, marginTop: 3 }}>{errors.phone}</div>
              ) : (
                <div style={{ fontSize: 11, color: portal.textSubtlest, marginTop: 3 }}>We'll send a one-time code to this number next.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <div onClick={() => setStep("landing")} style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 40, padding: "0 16px", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Back</div>
              <button onClick={handleRequestOtp} disabled={detailsInvalid || submitting} style={detailsInvalid || submitting ? disabledContinueStyle : continueStyle}>
                {submitting ? "Sending…" : "Send verification code"}
              </button>
            </div>
          </div>
        )}

        {step === "otp" && (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Verify your number</div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.textSubtle, marginBottom: 18 }}>
              We sent a 6-digit code by SMS to +254 {phone}.
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
              <button onClick={handleSubmit} disabled={otpInvalid || submitting} style={otpInvalid || submitting ? disabledContinueStyle : continueStyle}>
                {submitting ? "Submitting…" : "Verify and submit"}
              </button>
            </div>
          </div>
        )}

        {step === "setup" && (
          <div style={{ padding: "24px 24px 28px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Create your account</div>
            <div style={{ fontSize: 13, color: portal.textSubtle, marginBottom: 20, lineHeight: "18px" }}>
              Your application is in. Set a password to access your portal and track your assignment.
            </div>

            {errors._general && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: portal.dangerBg, color: portal.dangerText, fontSize: 13, marginBottom: 16 }}>{errors._general}</div>
            )}

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Password <span style={{ color: portal.dangerText }}>*</span></div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                style={{ width: "100%", height: 40, boxSizing: "border-box" as const, border: `1px solid ${errors.password ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 12px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
              />
              {errors.password && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{errors.password}</div>}
            </div>

            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: portal.label, marginBottom: 4 }}>Confirm password <span style={{ color: portal.dangerText }}>*</span></div>
              <input
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                placeholder="Repeat your password"
                style={{ width: "100%", height: 40, boxSizing: "border-box" as const, border: `1px solid ${errors.password_confirmation ? portal.dangerText : portal.border}`, borderRadius: 8, padding: "0 12px", fontSize: 14, color: portal.ink, background: portal.canvas, fontFamily: "inherit", outline: "none" }}
              />
              {errors.password_confirmation && <div style={{ fontSize: 12, color: portal.dangerText, marginTop: 4 }}>{errors.password_confirmation}</div>}
            </div>

            <button
              onClick={handleSetup}
              disabled={submitting || password.length < 8 || password !== passwordConfirm}
              style={{ width: "100%", height: 44, border: "none", borderRadius: 8, fontSize: 15, fontWeight: 600, cursor: submitting || password.length < 8 || password !== passwordConfirm ? "default" : "pointer", background: submitting || password.length < 8 || password !== passwordConfirm ? portal.neutralHover : portal.brand, color: portal.inverse, fontFamily: "inherit" }}
            >
              {submitting ? "Creating account…" : "Create account & sign in"}
            </button>
          </div>
        )}

        {step === "done" && (
          <div style={{ padding: "28px 24px", textAlign: "center" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: portal.successBg, color: portal.successText, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, margin: "0 auto 14px" }}>✓</div>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Application received</div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: portal.textSubtle }}>
              {aspirantFirst}'s campaign will review your application and let you know within a day or two. You'll get an SMS either way.
            </div>
          </div>
        )}
      </div>

      <div style={{ width: "100%", maxWidth: 460, marginTop: 16, fontSize: 12, lineHeight: "18px", color: portal.textSubtle, textAlign: "center" }}>
        Mtazamo will never ask you for a voter's ID number or a result form by SMS.
      </div>
    </div>
  );
}

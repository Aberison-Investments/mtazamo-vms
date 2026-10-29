import { useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { api, type ApiError, type ActiveRunInfo, type StationContext, type StationResultData } from "../../api";

// ---- constants ---------------------------------------------------------------

const SEAT_LABELS: Record<string, string> = {
  president: "Presidential",
  governor:  "Governor",
  senator:   "Senator",
  mp:        "Member of Parliament",
  mca:       "MCA",
};

// ---- helpers -----------------------------------------------------------------

function fmt(n: number) {
  return n.toLocaleString("en-KE");
}

function clean(v: string) {
  return v.replace(/[^0-9]/g, "").slice(0, 6);
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---- sub-components ----------------------------------------------------------

function Stepper({
  step,
  step1Ok,
  step2Ok,
  onStep,
}: {
  step: number;
  step1Ok: boolean;
  step2Ok: boolean;
  onStep: (n: number) => void;
}) {
  const STEPS = [
    { id: 1, label: "Numbers" },
    { id: 2, label: "Form photo" },
    { id: 3, label: "Send" },
  ];
  const done: Record<number, boolean> = { 1: step1Ok && step !== 1, 2: step2Ok && step !== 2, 3: false };

  return (
    <div style={{ display: "flex", gap: 6, background: "#FFFFFF", borderRadius: 10, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: 4 }}>
      {STEPS.map(({ id, label }) => {
        const active = step === id;
        const isDone = done[id];
        return (
          <div
            key={id}
            onClick={() => onStep(id)}
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              height: 38,
              borderRadius: 7,
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              background: active ? "#EEF6F8" : "transparent",
              color: active ? "#294854" : "#626F86",
            }}
          >
            <span
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                background: isDone ? "#22A06B" : active ? "#599BAE" : "#EBECF0",
                color: isDone || active ? "#FFFFFF" : "#626F86",
                flexShrink: 0,
              }}
            >
              {isDone ? "✓" : String(id)}
            </span>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  fullWidth?: boolean;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value}
      onChange={(e) => onChange(clean(e.target.value))}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      inputMode="numeric"
      placeholder={placeholder ?? "0"}
      style={{
        width: fullWidth ? "100%" : 96,
        height: 40,
        boxSizing: "border-box",
        border: `1px solid ${focus ? "#599BAE" : "#DCDFE4"}`,
        borderRadius: 8,
        padding: "0 12px",
        fontSize: 16,
        fontWeight: 600,
        textAlign: fullWidth ? "left" : "right",
        color: "#172B4D",
        background: "#FFFFFF",
        fontFamily: "inherit",
        fontVariantNumeric: "tabular-nums",
        outline: "none",
        boxShadow: focus ? "0 0 0 1px #599BAE" : "none",
      }}
    />
  );
}

function NextBtn({ ok, grow, onClick, label }: { ok: boolean; grow?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: grow ? 1 : "none" as unknown as number,
        height: 44,
        padding: "0 20px",
        border: "none",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: ok ? "pointer" : "not-allowed",
        background: ok ? "#599BAE" : "#DCDFE4",
        color: ok ? "#FFFFFF" : "#626F86",
        fontFamily: "inherit",
      }}
    >
      {label}
    </button>
  );
}

function BackBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ height: 44, padding: "0 18px", border: "none", borderRadius: 8, background: "#F1F2F4", color: "#172B4D", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
    >
      Back
    </button>
  );
}

function ValidationDot({ ok, warn }: { ok: boolean; warn?: boolean }) {
  return (
    <span
      style={{
        width: 16,
        height: 16,
        borderRadius: "50%",
        flexShrink: 0,
        marginTop: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: 700,
        color: "#FFFFFF",
        background: ok ? "#22A06B" : warn ? "#C9372C" : "#FFFFFF",
        border: `1px solid ${ok ? "#22A06B" : warn ? "#C9372C" : "#B3B9C4"}`,
      }}
    >
      {ok ? "✓" : warn ? "!" : ""}
    </span>
  );
}

// ---- main component ----------------------------------------------------------

export function StationResults() {
  const { id } = useParams<{ id: string }>();

  const [context, setContext] = useState<StationContext | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveRunInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [submittedResult, setSubmittedResult] = useState<StationResultData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Confirmation modal state
  const [showConfirm, setShowConfirm] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [phoneHint, setPhoneHint] = useState<string | null>(null);
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [otp, setOtp] = useState("");

  // Form state
  const [registered, setRegistered] = useState("");
  const [votes, setVotes] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState("");
  const [disputed, setDisputed] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Load station context
  useEffect(() => {
    if (!id) return;
    api.getStationContext(id)
      .then((res) => {
        setContext(res);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setActiveRun((res as any).active_run ?? null);
        // Pre-populate from existing result
        const ex = res.existing_result;
        if (ex) {
          setRegistered(String(ex.registered_voters));
          const vMap: Record<string, string> = {};
          ex.votes.forEach((v) => { vMap[v.candidate_id] = String(v.votes); });
          setVotes(vMap);
          setRejected(String(ex.rejected_ballots));
          setDisputed(String(ex.disputed_votes));
          if (ex.photo_url) setPhotoPreview(ex.photo_url);
          setSubmittedResult(ex);
          setSubmitted(true);
        }
      })
      .catch((err: ApiError) => {
        if (err.status === 403) setForbidden(true);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (!id) return <Navigate to="/workspaces" replace />;
  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", color: "#626F86", fontSize: 14 }}>
        Loading…
      </div>
    );
  }
  if (forbidden || !context) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", color: "#BF2600", fontSize: 14 }}>
        You don't have an approved polling station assignment in this workspace.
      </div>
    );
  }

  const { workspace, station, candidates, manager } = context;
  const noRun = !activeRun;
  const formName = workspace.form_name; // e.g. "Form 37A"
  const seatLabel = SEAT_LABELS[workspace.seat] ?? workspace.seat;
  const stationLabel = [station.code && `Station ${station.code}`, station.name].filter(Boolean).join(", ");
  const geoLine = [seatLabel, station.county_name].filter(Boolean).join(", ");

  // Computed vote totals
  const n = (v: string) => (v === "" || isNaN(+v) ? 0 : +v);
  const totalVotes = candidates.reduce((sum, c) => sum + n(votes[c.id] ?? ""), 0);
  const totalCast = totalVotes + n(rejected) + n(disputed);
  const REG = n(registered);
  const regOk = REG > 0;
  const allFilled = candidates.every((c) => (votes[c.id] ?? "") !== "");
  const overReg = regOk && totalCast > REG;
  const pct = regOk && totalCast > 0 ? Math.min(100, Math.round((totalCast / REG) * 100)) : 0;

  const step1Ok = regOk && allFilled && !overReg;
  const step2Ok = photoPreview !== null;
  const canSubmit = step1Ok && step2Ok;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  function openConfirmModal() {
    if (!canSubmit) return;
    setShowConfirm(true);
    setOtpSent(false);
    setOtp("");
    setSubmitError(null);
    setDevOtp(null);
  }

  async function handleRequestOtp() {
    if (!id || otpSending) return;
    setOtpSending(true);
    setSubmitError(null);
    try {
      const res = await api.requestResultOtp(id);
      setPhoneHint(res.phone_hint);
      setDevOtp(res.dev_otp);
      setOtpSent(true);
    } catch (err) {
      setSubmitError((err as ApiError).message ?? "Could not send code. Try again.");
    } finally {
      setOtpSending(false);
    }
  }

  async function handleSubmit() {
    if (!canSubmit || submitting || !id || !otp.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      let photoBase64: string | null = null;
      if (photo) photoBase64 = await readFileAsBase64(photo);
      const votePayload = candidates.map((c) => ({
        candidate_id: c.id,
        votes: n(votes[c.id] ?? ""),
      }));
      const res = await api.submitStationResult(id, {
        otp: otp.trim(),
        registered_voters: REG,
        votes: votePayload,
        rejected_ballots: n(rejected),
        disputed_votes: n(disputed),
        photo_base64: photoBase64,
      });
      setSubmittedResult(res.result);
      setSubmitted(true);
      setShowConfirm(false);
    } catch (err) {
      setSubmitError((err as ApiError).message ?? "Submission failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- Review rows for step 3 ------------------------------------------------
  const reviewRows = [
    { label: "Registered voters", value: fmt(REG), total: false, ours: false },
    ...candidates.map((c) => ({ label: c.name, value: fmt(n(votes[c.id] ?? "")), total: false, ours: c.is_ours })),
    { label: "Rejected ballots", value: fmt(n(rejected)), total: false, ours: false },
    { label: "Disputed votes", value: fmt(n(disputed)), total: false, ours: false },
    { label: "Total cast", value: fmt(totalCast), total: true, ours: false },
  ];

  // ---- Validations -----------------------------------------------------------
  const validations = [
    { ok: regOk, warn: false, text: "Registered voters entered" },
    { ok: allFilled, warn: false, text: allFilled ? `All ${candidates.length} candidates entered` : `Enter a number for every candidate — use 0 if none` },
    { ok: regOk && !overReg && totalCast > 0, warn: overReg, text: overReg ? `Total cast is ${fmt(totalCast - REG)} more than registered voters. Recheck the form.` : "Total is within registered voters" },
    { ok: step2Ok, warn: false, text: `${formName} photo added` },
  ];

  // ---- Render ----------------------------------------------------------------
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "#F7F8F9", fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Text','SF Pro Display','Segoe UI',Roboto,Helvetica,Arial,sans-serif", color: "#172B4D", fontSize: 14, lineHeight: "20px" }}>

      {/* Header */}
      <div style={{ background: "#294854", color: "#FFFFFF" }}>
        <div style={{ maxWidth: 1120, margin: "0 auto", padding: "16px 20px 24px", boxSizing: "border-box" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 22, height: 22, borderRadius: 5, background: "#599BAE", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>M</span>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Mtazamo Votes</span>
            </div>
            <span style={{ display: "inline-flex", alignItems: "center", height: 28, padding: "0 10px", borderRadius: 14, background: "rgba(255,255,255,0.14)", fontSize: 11, fontWeight: 600, letterSpacing: "0.3px" }}>Polling agent</span>
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#C3D5DB", marginBottom: 8 }}>{formName} · Station results</div>
            <div style={{ fontSize: "clamp(20px,3.4vw,28px)", lineHeight: 1.2, fontWeight: 700, letterSpacing: "-0.4px", marginBottom: 6 }}>
              Submit station results
            </div>
            <div style={{ fontSize: 14, lineHeight: "21px", color: "#C3D5DB" }}>
              {geoLine} · <strong style={{ color: "#FFFFFF", fontWeight: 600 }}>{stationLabel}</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Submitted state */}
      {submitted && submittedResult && (
        <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box", padding: "28px 20px" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 14, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: "26px 24px 24px" }}>
            <div style={{ width: 44, height: 44, borderRadius: "50%", background: "#E3FCEF", color: "#164B35", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 700, marginBottom: 14 }}>✓</div>
            <div style={{ fontSize: 20, lineHeight: "26px", fontWeight: 700, letterSpacing: "-0.2px", marginBottom: 8 }}>
              Results submitted
            </div>
            <div style={{ fontSize: 13, lineHeight: "19px", color: "#44546F", marginBottom: 18 }}>
              {manager
                ? `${manager.name} and the tally team received ${stationLabel}. They'll compare your photo with the numbers.`
                : `Your results for ${stationLabel} have been recorded.`}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 10 }}>
              {candidates.filter((c) => c.is_ours).map((c) => (
                <div key={c.id} style={{ background: "#F7F8F9", borderRadius: 8, padding: "11px 13px" }}>
                  <div style={{ fontSize: 11, color: "#626F86", marginBottom: 2 }}>{c.name}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(n(votes[c.id] ?? ""))}</div>
                </div>
              ))}
              <div style={{ background: "#F7F8F9", borderRadius: 8, padding: "11px 13px" }}>
                <div style={{ fontSize: 11, color: "#626F86", marginBottom: 2 }}>Total cast</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(totalCast)}</div>
              </div>
              <div style={{ background: "#F7F8F9", borderRadius: 8, padding: "11px 13px" }}>
                <div style={{ fontSize: 11, color: "#626F86", marginBottom: 2 }}>Reference</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{submittedResult.reference_code}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation modal */}
      {showConfirm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }}>
          <div style={{ background: "#FFFFFF", borderRadius: 14, boxShadow: "0 8px 32px rgba(9,30,66,0.3)", padding: "28px 24px", width: "100%", maxWidth: 440 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Confirm and submit results</div>
            <div style={{ fontSize: 13, color: "#626F86", marginBottom: 20, lineHeight: "19px" }}>
              Once submitted these numbers are final. Make sure they match the signed {formName}.
            </div>

            {/* Summary */}
            <div style={{ border: "1px solid #DCDFE4", borderRadius: 8, overflow: "hidden", marginBottom: 20 }}>
              {reviewRows.map((r, i) => (
                <div key={r.label} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 14px", fontSize: 13, borderTop: i ? "1px solid #F1F2F4" : "none", background: r.total ? "#F7F8F9" : r.ours ? "#F5FAFB" : "#FFFFFF", fontWeight: r.total || r.ours ? 600 : 400 }}>
                  <span>{r.label}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* OTP section */}
            {!otpSent ? (
              <button
                onClick={handleRequestOtp}
                disabled={otpSending}
                style={{ width: "100%", height: 44, border: "none", borderRadius: 8, background: otpSending ? "#DCDFE4" : "#599BAE", color: "#FFFFFF", fontSize: 14, fontWeight: 600, cursor: otpSending ? "default" : "pointer", fontFamily: "inherit", marginBottom: 12 }}
              >
                {otpSending ? "Sending code…" : "Send verification code to my phone"}
              </button>
            ) : (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 13, color: "#44546F", marginBottom: 10 }}>
                  A 6-digit code was sent to <strong>{phoneHint}</strong>. Enter it below to submit.
                </div>
                {devOtp && (
                  <div style={{ padding: "8px 12px", borderRadius: 8, background: "#FFF7D6", color: "#7F5F01", fontSize: 13, marginBottom: 10 }}>
                    Dev mode — code: <strong style={{ fontFamily: "monospace" }}>{devOtp}</strong>
                  </div>
                )}
                <input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="000000"
                  inputMode="numeric"
                  autoFocus
                  style={{ width: "100%", height: 48, boxSizing: "border-box", border: "1px solid #DCDFE4", borderRadius: 8, padding: "0 16px", fontSize: 22, fontWeight: 700, textAlign: "center", fontFamily: "monospace", letterSpacing: 8, color: "#172B4D", outline: "none" }}
                />
              </div>
            )}

            {submitError && (
              <div style={{ padding: "10px 12px", borderRadius: 8, background: "#FFEBE6", color: "#BF2600", fontSize: 13, marginBottom: 12 }}>
                {submitError}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => { setShowConfirm(false); setOtp(""); setSubmitError(null); }}
                style={{ flex: 1, height: 44, border: "none", borderRadius: 8, background: "#F1F2F4", color: "#172B4D", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              {otpSent && (
                <button
                  onClick={handleSubmit}
                  disabled={otp.length !== 6 || submitting}
                  style={{ flex: 2, height: 44, border: "none", borderRadius: 8, background: otp.length === 6 && !submitting ? "#599BAE" : "#DCDFE4", color: otp.length === 6 && !submitting ? "#FFFFFF" : "#626F86", fontSize: 14, fontWeight: 600, cursor: otp.length === 6 && !submitting ? "pointer" : "default", fontFamily: "inherit" }}
                >
                  {submitting ? "Submitting…" : "Submit results"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No active run banner */}
      {noRun && !submitted && (
        <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", boxSizing: "border-box", padding: "28px 20px" }}>
          <div style={{ background: "#FFF7D6", borderRadius: 14, border: "1px solid #FFAB00", padding: "24px 24px 22px" }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, color: "#172B4D" }}>Results not open yet</div>
            <div style={{ fontSize: 14, lineHeight: "21px", color: "#44546F" }}>
              No counting run is active in this workspace. Your campaign manager needs to open a run before you can submit results. Check back later.
            </div>
          </div>
        </div>
      )}

      {/* Entry form */}
      {!submitted && !noRun && (
        <div style={{ width: "100%", maxWidth: 1120, margin: "0 auto", boxSizing: "border-box", padding: "20px 20px 40px", display: "flex", flexWrap: "wrap", gap: 16, alignItems: "flex-start" }}>

          {/* Left: form steps */}
          <div style={{ flex: "2 1 460px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
            <Stepper step={step} step1Ok={step1Ok} step2Ok={step2Ok} onStep={setStep} />

            {/* Step 1: Numbers */}
            {step === 1 && (
              <div style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Copy the numbers from {formName}</div>
                <div style={{ fontSize: 12, lineHeight: "17px", color: "#626F86", marginBottom: 16 }}>
                  Type exactly what the presiding officer wrote on the signed form — even if you think it's wrong.
                </div>

                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#44546F", marginBottom: 4 }}>
                    Registered voters at this station <span style={{ color: "#BF2600" }}>*</span>
                  </div>
                  <NumInput value={registered} onChange={setRegistered} fullWidth />
                  <div style={{ fontSize: 11, color: "#8590A2", marginTop: 3 }}>As printed at the top of {formName}.</div>
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "#626F86", marginBottom: 6 }}>
                  Votes per candidate
                </div>
                <div style={{ border: "1px solid #DCDFE4", borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
                  {candidates.map((c, i) => (
                    <div
                      key={c.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 12,
                        padding: "10px 12px",
                        borderTop: i ? "1px solid #F1F2F4" : "none",
                        background: c.is_ours ? "#F5FAFB" : "#FFFFFF",
                      }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: c.is_ours ? "#599BAE" : "#DCDFE4" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#626F86" }}>{c.party}</div>
                      </div>
                      <NumInput
                        value={votes[c.id] ?? ""}
                        onChange={(v) => setVotes((prev) => ({ ...prev, [c.id]: v }))}
                      />
                    </div>
                  ))}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "#626F86", marginBottom: 6 }}>
                  Other ballots
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12, marginBottom: 20 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#44546F", marginBottom: 4 }}>Rejected ballots</div>
                    <NumInput value={rejected} onChange={setRejected} fullWidth />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#44546F", marginBottom: 4 }}>Disputed votes</div>
                    <NumInput value={disputed} onChange={setDisputed} fullWidth />
                  </div>
                </div>

                <NextBtn ok={step1Ok} onClick={() => step1Ok && setStep(2)} label="Next: photograph the form" />
              </div>
            )}

            {/* Step 2: Photo */}
            {step === 2 && (
              <div style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Photograph {formName}</div>
                <div style={{ fontSize: 12, lineHeight: "17px", color: "#626F86", marginBottom: 16 }}>
                  All four corners in frame, IEBC stamp visible, no flash glare. The photo must be legible.
                </div>

                {/* Photo area */}
                <div
                  onClick={() => photoInputRef.current?.click()}
                  style={{
                    width: "100%",
                    maxWidth: 420,
                    aspectRatio: "3/4",
                    borderRadius: 8,
                    overflow: "hidden",
                    marginBottom: 20,
                    border: `2px ${photoPreview ? "solid #22A06B" : "dashed #DCDFE4"}`,
                    background: "#F7F8F9",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    position: "relative",
                  }}
                >
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Form photo"
                      style={{ width: "100%", height: "100%", objectFit: "contain" }}
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: 20, color: "#626F86" }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>📷</div>
                      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Tap to take a photo</div>
                      <div style={{ fontSize: 12 }}>of the signed {formName}</div>
                    </div>
                  )}
                </div>

                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhotoChange}
                  style={{ display: "none" }}
                />

                {photoPreview && (
                  <div
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, height: 28, padding: "0 10px", borderRadius: 14, background: "#E3FCEF", color: "#164B35", fontSize: 12, fontWeight: 600, marginBottom: 16 }}
                  >
                    ✓ Photo added
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <BackBtn onClick={() => setStep(1)} />
                  <NextBtn ok={step2Ok} grow onClick={() => step2Ok && setStep(3)} label="Next: review" />
                </div>
              </div>
            )}

            {/* Step 3: Review & send */}
            {step === 3 && (
              <div style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Review and send</div>
                <div style={{ fontSize: 12, lineHeight: "17px", color: "#626F86", marginBottom: 16 }}>
                  Check each number against your photo of the form.
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start", marginBottom: 16 }}>
                  {/* Numbers */}
                  <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" as const, color: "#626F86" }}>Your numbers</span>
                      <span onClick={() => setStep(1)} style={{ fontSize: 12, fontWeight: 600, color: "#386271", cursor: "pointer" }}>Edit</span>
                    </div>
                    <div style={{ border: "1px solid #DCDFE4", borderRadius: 8, overflow: "hidden" }}>
                      {reviewRows.map((r, i) => (
                        <div
                          key={r.label}
                          style={{
                            display: "flex",
                            gap: 12,
                            padding: "10px 14px",
                            fontSize: 14,
                            borderTop: i ? "1px solid #F1F2F4" : "none",
                            background: r.total ? "#F7F8F9" : r.ours ? "#F5FAFB" : "#FFFFFF",
                            fontWeight: r.total || r.ours ? 600 : 400,
                          }}
                        >
                          <span style={{ flex: 1, minWidth: 0 }}>{r.label}</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{r.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Photo */}
                  <div style={{ flex: "1 1 200px", minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase" as const, color: "#626F86" }}>{formName} photo</span>
                      <span onClick={() => setStep(2)} style={{ fontSize: 12, fontWeight: 600, color: "#386271", cursor: "pointer" }}>Retake</span>
                    </div>
                    <div style={{ width: "100%", aspectRatio: "3/4", borderRadius: 8, overflow: "hidden", border: "1px solid #DCDFE4", background: "#F7F8F9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {photoPreview ? (
                        <img src={photoPreview} alt={`${formName} photo`} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                      ) : (
                        <span style={{ fontSize: 12, color: "#626F86", padding: 12, textAlign: "center" }}>No photo — go back to add one</span>
                      )}
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div style={{ padding: "10px 12px", borderRadius: 8, background: "#FFEBE6", color: "#BF2600", fontSize: 13, marginBottom: 14 }}>
                    {submitError}
                  </div>
                )}

                <div style={{ display: "flex", gap: 10 }}>
                  <BackBtn onClick={() => setStep(2)} />
                  <NextBtn
                    ok={canSubmit}
                    grow
                    onClick={openConfirmModal}
                    label="Send results"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Right: live tally sidebar */}
          <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 16, minWidth: 0, position: "sticky", top: 16 }}>

            {/* Station tally */}
            <div style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "#626F86", marginBottom: 12 }}>Station tally</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                <span style={{ fontSize: 28, lineHeight: "34px", fontWeight: 700, letterSpacing: "-0.4px", fontVariantNumeric: "tabular-nums" }}>{fmt(totalCast)}</span>
                <span style={{ fontSize: 13, color: "#626F86" }}>{regOk ? `of ${fmt(REG)} registered` : "votes cast"}</span>
              </div>
              <div style={{ fontSize: 12, color: "#626F86", marginBottom: 12 }}>
                {!regOk ? "Enter registered voters to see turnout" : totalCast ? `${pct}% turnout` : "Fills in as you type"}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "#EBECF0", overflow: "hidden", marginBottom: 16 }}>
                <div style={{ height: "100%", width: `${pct}%`, background: overReg ? "#C9372C" : "#599BAE", borderRadius: 3, transition: "width 200ms ease-out" }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                  <span style={{ color: "#44546F" }}>Valid votes</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(totalVotes)}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                  <span style={{ color: "#44546F" }}>Rejected + disputed</span>
                  <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(n(rejected) + n(disputed))}</span>
                </div>
                {candidates.filter((c) => c.is_ours).map((c) => (
                  <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13 }}>
                    <span style={{ color: "#44546F" }}>{c.name.split(" ")[0]}'s share</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {totalVotes ? `${Math.round((n(votes[c.id] ?? "") / totalVotes) * 100)}%` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Checks */}
            <div style={{ background: "#FFFFFF", borderRadius: 12, boxShadow: "0 1px 1px rgba(9,30,66,0.25),0 0 1px rgba(9,30,66,0.31)", padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.6px", textTransform: "uppercase", color: "#626F86", marginBottom: 8 }}>Checks</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {validations.map((v, i) => (
                  <div key={i} style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
                    <ValidationDot ok={v.ok} warn={v.warn} />
                    <span style={{ fontSize: 12, lineHeight: "17px", color: "#44546F" }}>{v.text}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ fontSize: 11, lineHeight: "16px", color: "#8590A2", padding: "0 4px" }}>
              Keep the paper form safe until {manager?.name ?? "your campaign manager"} confirms they have it. Never send result forms by SMS or WhatsApp.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

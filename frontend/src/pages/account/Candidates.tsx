import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { api, type CandidateListResponse } from "../../api";
import { portal } from "../../portalTheme";
import { useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { useNotifications } from "../../notifications";

// ---- types ------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  party: string;
  is_ours: boolean;
}

type ApiStatus = CandidateListResponse["status"];

// ---- helpers ----------------------------------------------------------------

function statusBadge(apiStatus: ApiStatus, localDirty: boolean) {
  if (localDirty) {
    return { label: "Unsaved changes", bg: portal.warnBg, color: portal.warnText };
  }
  if (apiStatus === "published") {
    return { label: "Published to agents", bg: portal.successBg, color: portal.successText };
  }
  if (apiStatus === "unpublished_changes") {
    return { label: "Unpublished changes", bg: portal.warnBg, color: portal.warnText };
  }
  return { label: "Draft", bg: portal.neutral, color: portal.label };
}

function IconButton({
  onClick,
  title,
  label,
  danger,
  disabled,
  hidden,
}: {
  onClick: () => void;
  title: string;
  label: string;
  danger?: boolean;
  disabled?: boolean;
  hidden?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: 28,
        height: 28,
        border: "none",
        borderRadius: 6,
        background: hover && !disabled ? (danger ? portal.dangerBg : portal.neutral) : "transparent",
        fontSize: 13,
        fontWeight: 600,
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "#C1C7D0" : danger ? portal.dangerText : portal.label,
        fontFamily: "inherit",
        visibility: hidden ? "hidden" : "visible",
      }}
    >
      {label}
    </button>
  );
}

// ---- main component ---------------------------------------------------------

export function Candidates() {
  const { id } = useParams<{ id: string }>();
  useWorkspaceContext(); // ensures we're inside a workspace layout
  const { add: addNotif, update: updateNotif } = useNotifications();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("draft");
  const [localDirty, setLocalDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveHint, setSaveHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getCandidates(id).then((candRes) => {
      setRows(candRes.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, is_ours: c.is_ours })));
      setApiStatus(candRes.status);
    }).catch((e) => setError(String(e)));
  }, [id]);

  if (error && rows === null) {
    return (
      <div style={{ padding: 40, fontFamily: portal.font, color: portal.dangerText }}>{error}</div>
    );
  }
  if (rows === null) {
    return (
      <div style={{ padding: 40, fontFamily: portal.font, color: portal.textSubtle, fontSize: 14 }}>
        Loading…
      </div>
    );
  }

  // TypeScript doesn't narrow state variables through closures even after early-return guards.
  const safeRows = rows as Row[];
  const safeId = id as string;

  const otherRows = safeRows.filter((r) => !r.is_ours);
  const incomplete = otherRows.filter((r) => !r.name.trim() || !r.party.trim());
  const ready = otherRows.length >= 1 && incomplete.length === 0;
  const isLive = apiStatus === "published" && !localDirty;
  const badge = statusBadge(apiStatus, localDirty);

  function markDirty(next: Row[]) {
    setRows(next);
    setLocalDirty(true);
    setSaveHint(null);
    if (hintTimer.current) clearTimeout(hintTimer.current);
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= safeRows.length) return;
    const next = safeRows.slice();
    [next[i], next[j]] = [next[j], next[i]];
    markDirty(next);
  }

  function editRow(rowId: string, field: "name" | "party", value: string) {
    markDirty(safeRows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r)));
  }

  function removeRow(rowId: string) {
    markDirty(safeRows.filter((r) => r.id !== rowId));
  }

  function addRow() {
    markDirty([...safeRows, { id: "c" + Date.now(), name: "", party: "", is_ours: false }]);
  }

  function showHint(msg: string) {
    setSaveHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setSaveHint(null), 3000);
  }

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await api.saveCandidates(
        safeId,
        safeRows.map((r) => ({ name: r.name, party: r.party, is_ours: r.is_ours })),
      );
      setRows(res.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, is_ours: c.is_ours })));
      setApiStatus(res.status);
      setLocalDirty(false);
      showHint("Saved.");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!ready || isLive || publishing) return;
    setConfirmPublish(false);
    setPublishing(true);
    setError(null);
    const toastId = addNotif("Publishing candidates to agents…", "loading");
    try {
      if (localDirty) {
        const saveRes = await api.saveCandidates(
          safeId,
          safeRows.map((r) => ({ name: r.name, party: r.party, is_ours: r.is_ours })),
        );
        setRows(saveRes.candidates.map((c) => ({ id: c.id, name: c.name, party: c.party, is_ours: c.is_ours })));
        setLocalDirty(false);
      }
      const res = await api.publishCandidates(safeId);
      setApiStatus(res.status);
      updateNotif(toastId, "Candidates published to agents", "success");
    } catch (e) {
      setError(String(e));
      updateNotif(toastId, "Failed to publish candidates", "error");
    } finally {
      setPublishing(false);
    }
  }

  let hint = "";
  let hintColor: string = portal.textSubtle;
  if (saveHint) {
    hint = saveHint;
    hintColor = portal.successText;
  } else if (otherRows.length === 0) {
    hint = "Add every other candidate in this race.";
  } else if (incomplete.length > 0) {
    hint = `${incomplete.length} ${incomplete.length === 1 ? "candidate needs" : "candidates need"} a name and party.`;
    hintColor = portal.warnText;
  } else {
    hint = `${safeRows.length} candidates · order matches the ballot paper`;
  }

  const canPublish = ready && !isLive && !saving && !publishing;

  return (
    <>
      {confirmPublish && (
        <>
          <div
            onClick={() => setConfirmPublish(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(9,30,66,0.54)", zIndex: 99 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
            background: portal.canvas, borderRadius: 14, boxShadow: "0 20px 48px rgba(9,30,66,0.22)",
            padding: "28px 24px", width: "100%", maxWidth: 420, zIndex: 100,
            fontFamily: portal.font,
          }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: portal.brandSubtlest, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <svg viewBox="0 0 16 16" fill="none" stroke={portal.brandText} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ width: 20, height: 20 }}>
                <path d="M3 8.5l3 3 7-7" />
              </svg>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 8 }}>Publish candidates to agents?</div>
            <div style={{ fontSize: 13, color: portal.label, lineHeight: "20px", marginBottom: 24 }}>
              This will make the candidate list visible to all agents in this workspace. They will see every candidate's name and party when submitting results.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setConfirmPublish(false)}
                style={{ flex: 1, height: 42, border: "none", borderRadius: 8, background: portal.neutral, color: portal.ink, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
              <button
                onClick={handlePublish}
                style={{ flex: 2, height: 42, border: "none", borderRadius: 8, background: portal.brand, color: portal.inverse, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
              >
                Publish to agents
              </button>
            </div>
          </div>
        </>
      )}
      <div style={{ flex: 1, padding: "24px 40px 56px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
        >
          <div style={{ maxWidth: 620 }}>
            <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 6 }}>
              Candidates on the ballot
            </div>
          </div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: 24,
              padding: "0 10px",
              borderRadius: 3,
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.3px",
              background: badge.bg,
              color: badge.color,
            }}
          >
            {badge.label}
          </span>
        </div>

        {error && (
          <div
            style={{
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 8,
              background: portal.dangerBg,
              color: portal.dangerText,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ flex: "2 1 480px", minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Candidate table */}
            <div
              style={{
                border: `1px solid ${portal.border}`,
                borderRadius: 8,
                boxShadow: portal.cardShadow,
                overflow: "hidden",
              }}
            >
              {/* Header row */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px minmax(0,1.3fr) minmax(0,1fr) 96px",
                  gap: 12,
                  padding: "10px 16px",
                  background: portal.canvasSubtle,
                  borderBottom: `1px solid ${portal.border}`,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                  color: portal.textSubtle,
                }}
              >
                <span>Order</span>
                <span>Full name</span>
                <span>Party</span>
                <span style={{ textAlign: "right" }}>Actions</span>
              </div>

              {/* Candidate rows */}
              {safeRows.map((row, i) => (
                <CandidateRow
                  key={row.id}
                  row={row}
                  index={i}
                  total={safeRows.length}
                  onMoveUp={() => move(i, -1)}
                  onMoveDown={() => move(i, 1)}
                  onRemove={() => removeRow(row.id)}
                  onName={(v) => editRow(row.id, "name", v)}
                  onParty={(v) => editRow(row.id, "party", v)}
                />
              ))}

              {/* Add row */}
              <div style={{ padding: "12px 16px", borderTop: `1px solid ${portal.borderSubtle}` }}>
                <AddCandidateButton onClick={addRow} />
              </div>
            </div>

            {/* Footer: hint + action buttons */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div style={{ fontSize: 12, color: hintColor }}>{hint}</div>
              <div style={{ display: "flex", gap: 8 }}>
                <SaveDraftButton onClick={handleSave} saving={saving} />
                <PublishButton
                  onClick={() => setConfirmPublish(true)}
                  enabled={canPublish}
                  publishing={publishing}
                  isLive={isLive}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- sub-components ---------------------------------------------------------

function CandidateRow({
  row,
  index,
  total,
  onMoveUp,
  onMoveDown,
  onRemove,
  onName,
  onParty,
}: {
  row: Row;
  index: number;
  total: number;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onName: (v: string) => void;
  onParty: (v: string) => void;
}) {
  const nameBad = !row.is_ours && !row.name.trim();
  const partyBad = !row.is_ours && !row.party.trim();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px minmax(0,1.3fr) minmax(0,1fr) 96px",
        gap: 12,
        alignItems: "center",
        padding: "10px 16px",
        borderTop: index > 0 ? `1px solid ${portal.borderSubtle}` : "none",
        background: row.is_ours ? portal.brandSubtlest : portal.canvas,
      }}
    >
      {/* Ballot order number */}
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: "50%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          fontWeight: 700,
          background: row.is_ours ? portal.brand : portal.neutral,
          color: row.is_ours ? portal.inverse : portal.label,
          flexShrink: 0,
        }}
      >
        {index + 1}
      </span>

      {/* Name cell */}
      <div style={{ minWidth: 0 }}>
        {row.is_ours ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "4px 8px",
              flexWrap: "wrap",
              minHeight: 36,
              padding: "4px 0",
              boxSizing: "border-box",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>{row.name || "—"}</span>
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
              Your aspirant
            </span>
          </div>
        ) : (
          <FieldInput
            value={row.name}
            placeholder="As on the ballot paper"
            invalid={nameBad}
            onChange={onName}
          />
        )}
      </div>

      {/* Party cell */}
      <div style={{ minWidth: 0 }}>
        {row.is_ours ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 36,
              fontSize: 14,
              color: portal.label,
            }}
          >
            {row.party || "—"}
          </div>
        ) : (
          <FieldInput
            value={row.party}
            placeholder="Party or Independent"
            invalid={partyBad}
            onChange={onParty}
          />
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 2 }}>
        <IconButton onClick={onMoveUp} title="Move up" label="↑" disabled={index === 0} />
        <IconButton onClick={onMoveDown} title="Move down" label="↓" disabled={index === total - 1} />
        <IconButton
          onClick={onRemove}
          title="Remove"
          label="✕"
          danger
          disabled={row.is_ours}
          hidden={row.is_ours}
        />
      </div>
    </div>
  );
}

function FieldInput({
  value,
  placeholder,
  invalid,
  onChange,
}: {
  value: string;
  placeholder: string;
  invalid: boolean;
  onChange: (v: string) => void;
}) {
  const [focus, setFocus] = useState(false);
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={{
        width: "100%",
        height: 36,
        boxSizing: "border-box",
        border: `1px solid ${focus ? portal.brand : invalid ? portal.warnBold : portal.border}`,
        borderRadius: 8,
        padding: "0 10px",
        fontSize: 14,
        color: portal.ink,
        background: portal.canvas,
        fontFamily: "inherit",
        outline: "none",
        boxShadow: focus ? `0 0 0 1px ${portal.brand}` : "none",
      }}
    />
  );
}

function AddCandidateButton({ onClick }: { onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        height: 32,
        padding: "0 12px",
        border: `1px dashed ${hover ? portal.brand : portal.neutralHover}`,
        borderRadius: 8,
        background: hover ? portal.brandSubtlest : portal.canvas,
        color: portal.brandText,
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        fontFamily: "inherit",
      }}
    >
      + Add candidate
    </button>
  );
}

function SaveDraftButton({ onClick, saving }: { onClick: () => void; saving: boolean }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={saving}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        height: 36,
        padding: "0 14px",
        borderRadius: 8,
        border: "none",
        background: hover && !saving ? portal.neutralHover : portal.neutral,
        color: portal.ink,
        fontSize: 14,
        fontWeight: 500,
        cursor: saving ? "default" : "pointer",
        fontFamily: "inherit",
      }}
    >
      {saving ? "Saving…" : "Save draft"}
    </button>
  );
}

function PublishButton({
  onClick,
  enabled,
  publishing,
  isLive,
}: {
  onClick: () => void;
  enabled: boolean;
  publishing: boolean;
  isLive: boolean;
}) {
  const [hover, setHover] = useState(false);
  const active = enabled && !publishing;
  return (
    <button
      onClick={active ? onClick : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        height: 36,
        padding: "0 16px",
        border: "none",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: active ? "pointer" : "default",
        background: active
          ? hover
            ? portal.brandHover
            : portal.brand
          : portal.neutralHover,
        color: active ? portal.inverse : portal.textSubtle,
        fontFamily: "inherit",
        transition: "background 120ms",
      }}
    >
      {publishing ? "Publishing…" : isLive ? "Published" : "Publish to agents"}
    </button>
  );
}

import { useState, type FormEvent } from "react";
import { colors } from "../theme";
import { api, type Station } from "../api";

interface AddStationModalProps {
  wardId: string;
  wardName: string;
  onClose: () => void;
  onAdded: (station: Station) => void;
}

const fieldStyle = {
  height: 34,
  boxSizing: "border-box" as const,
  padding: "0 10px",
  fontSize: 14,
  fontFamily: "inherit",
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: 2,
  width: "100%",
};

const labelStyle = {
  fontSize: 12,
  fontWeight: 600,
  color: colors.textSecondary,
  marginBottom: 5,
  display: "block",
};

export function AddStationModal({ wardId, wardName, onClose, onAdded }: AddStationModalProps) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [voters, setVoters] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Station name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { station } = await api.addStation(wardId, {
        code: code.trim() || undefined,
        name: name.trim(),
        registered_voters: voters.trim() === "" ? null : Number(voters),
      });
      onAdded(station);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add station");
      setSaving(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Add a missing station"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(32,31,30,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        style={{
          width: 440,
          background: colors.panelBg,
          borderRadius: 3,
          boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: 17, fontWeight: 600 }}>Add a missing station</h2>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: colors.textMuted }}>
            Adding to <strong style={{ color: colors.textPrimary }}>{wardName}</strong>. Use this
            only when a station is absent from the register.
          </p>
        </div>

        <div>
          <label style={labelStyle} htmlFor="st-code">
            Code
          </label>
          <input
            id="st-code"
            style={fieldStyle}
            value={code}
            maxLength={8}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. 045"
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="st-name">
            Station name <span style={{ color: "#a4262c" }}>*</span>
          </label>
          <input
            id="st-name"
            style={fieldStyle}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Kaptembwo Primary School"
            autoFocus
          />
        </div>

        <div>
          <label style={labelStyle} htmlFor="st-voters">
            Registered voters
          </label>
          <input
            id="st-voters"
            style={fieldStyle}
            value={voters}
            inputMode="numeric"
            onChange={(e) => setVoters(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="Optional"
          />
        </div>

        {error && (
          <div
            style={{
              background: "#FDE7E9",
              color: "#a4262c",
              fontSize: 13,
              padding: "9px 12px",
              borderRadius: 2,
            }}
          >
            {error}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 4 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 36,
              padding: "0 16px",
              fontSize: 14,
              background: "transparent",
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: 2,
              cursor: "pointer",
              color: colors.textSecondary,
            }}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            style={{
              height: 36,
              padding: "0 18px",
              fontSize: 14,
              fontWeight: 600,
              background: saving ? colors.accentDark : colors.accent,
              border: 0,
              borderRadius: 2,
              color: "#fff",
              cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "Adding…" : "Add station"}
          </button>
        </div>
      </form>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { api, type SessionInfo } from "../../api";
import { PortalShell } from "../../components/portal/PortalShell";

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60)    return "Just now";
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function absoluteTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-KE", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ---- Sessions panel ---------------------------------------------------------

function SessionsPanel() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  useEffect(() => {
    api.listSessions()
      .then((r) => setSessions(r.sessions))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleRevoke(id: number, isCurrent: boolean) {
    setRevoking(id);
    try {
      await api.revokeSession(id);
      if (isCurrent) {
        await signOut();
        navigate("/login", { replace: true });
      } else {
        setSessions((s) => s.filter((x) => x.id !== id));
      }
    } catch { /* ignore */ }
    finally { setRevoking(null); }
  }

  async function handleRevokeAll() {
    setRevokingAll(true);
    try {
      await api.revokeAllSessions();
      await signOut();
      navigate("/login", { replace: true });
    } catch { /* ignore */ }
    finally { setRevokingAll(false); }
  }

  const otherSessions = sessions.filter((s) => !s.is_current);

  return (
    <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas, marginTop: 24 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${portal.border}` }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Active sessions</div>
          <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2 }}>
            Devices and browsers where you're currently signed in.
          </div>
        </div>
        {otherSessions.length > 0 && (
          !confirmAll ? (
            <button
              onClick={() => setConfirmAll(true)}
              style={{ height: 32, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, color: portal.dangerText, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            >
              Sign out all other sessions
            </button>
          ) : (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 13, color: portal.textSubtle }}>Are you sure?</span>
              <button
                onClick={handleRevokeAll}
                disabled={revokingAll}
                style={{ height: 32, padding: "0 12px", border: "none", borderRadius: 6, background: "#C9372C", color: "#FFFFFF", fontSize: 13, fontWeight: 600, cursor: revokingAll ? "default" : "pointer", fontFamily: "inherit" }}
              >
                {revokingAll ? "Signing out…" : "Yes, sign out all"}
              </button>
              <button
                onClick={() => setConfirmAll(false)}
                style={{ height: 32, padding: "0 12px", border: `1px solid ${portal.border}`, borderRadius: 6, background: portal.canvas, color: portal.ink, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Cancel
              </button>
            </div>
          )
        )}
      </div>

      {/* Session rows */}
      {loading && (
        <div style={{ padding: "16px 20px", fontSize: 13, color: portal.textSubtle }}>Loading sessions…</div>
      )}

      {!loading && sessions.length === 0 && (
        <div style={{ padding: "16px 20px", fontSize: 13, color: portal.textSubtle }}>No active sessions found.</div>
      )}

      {sessions.map((s) => (
        <div
          key={s.id}
          style={{
            display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
            borderBottom: `1px solid ${portal.borderSubtle}`,
            background: s.is_current ? portal.brandSubtlest : portal.canvas,
          }}
        >
          {/* Device icon */}
          <div style={{ width: 36, height: 36, borderRadius: 8, background: s.is_current ? portal.brand : portal.neutral, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg viewBox="0 0 16 16" fill="none" stroke={s.is_current ? "#FFFFFF" : portal.label} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              {s.device_label?.includes("mobile")
                ? <><rect x="4.5" y="1" width="7" height="14" rx="1.5" /><circle cx="8" cy="12.5" r="0.8" fill="currentColor" stroke="none" /></>
                : <><rect x="1" y="3" width="14" height="9" rx="1.5" /><path d="M5 12h6M8 12v2" /></>
              }
            </svg>
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>{s.device_label}</span>
              {s.is_current && (
                <span style={{ display: "inline-flex", alignItems: "center", height: 18, padding: "0 7px", borderRadius: 3, background: portal.brand, color: portal.inverse, fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.3px" }}>
                  This session
                </span>
              )}
              {!s.access_valid && !s.is_current && (
                <span style={{ fontSize: 11, color: portal.textSubtle }}>(access expired — refresh pending)</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: portal.textSubtle, marginTop: 2, display: "flex", gap: 12 }}>
              <span title={s.ip_address ?? ""} style={{ fontFamily: "monospace" }}>{s.ip_address ?? "—"}</span>
              <span title={absoluteTime(s.last_used_at)}>Last active {relativeTime(s.last_used_at)}</span>
              <span title={absoluteTime(s.created_at)}>Signed in {relativeTime(s.created_at)}</span>
            </div>
          </div>

          {/* Revoke button */}
          <button
            onClick={() => handleRevoke(s.id, s.is_current)}
            disabled={revoking === s.id}
            style={{
              height: 30, padding: "0 10px", border: `1px solid ${portal.border}`,
              borderRadius: 6, background: portal.canvas,
              color: s.is_current ? portal.dangerText : portal.label,
              fontSize: 12, fontWeight: 600, cursor: revoking === s.id ? "default" : "pointer",
              fontFamily: "inherit", flexShrink: 0,
            }}
          >
            {revoking === s.id ? "…" : s.is_current ? "Sign out" : "Revoke"}
          </button>
        </div>
      ))}

      <div style={{ padding: "10px 20px", fontSize: 12, color: portal.textSubtle }}>
        Sessions expire automatically after 30 days of inactivity.
      </div>
    </div>
  );
}

// ---- main page --------------------------------------------------------------

export function AccountSettings() {
  const { user } = useAuth();

  const rows: [string, string][] = [
    ["Full name",    user?.name ?? "—"],
    ["Age",          user?.age ? String(user.age) : "—"],
    ["Gender",       user?.gender ?? "—"],
    ["Phone",        user?.phone_masked ?? "—"],
    ["Email",        user?.email ?? "—"],
    ["Two-factor",   "SMS OTP to verified phone"],
    ["Phone status", user?.phone_verified ? "Verified" : "Not verified"],
    ["Email status", user?.email_verified  ? "Verified" : "Not verified"],
  ];

  return (
    <PortalShell active="settings">
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", maxWidth: 640, overflowY: "auto" }}>

        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>Account / Settings</div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>Account settings</div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 24 }}>
          Your profile details and active sessions.
        </div>

        {/* Profile */}
        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas }}>
          <div style={{ padding: "14px 20px", borderBottom: `1px solid ${portal.border}`, fontSize: 16, fontWeight: 600 }}>
            Profile
          </div>
          {rows.map(([label, value], i) => (
            <div
              key={label}
              style={{
                display: "flex", justifyContent: "space-between", gap: 16,
                padding: "12px 20px",
                borderBottom: i < rows.length - 1 ? `1px solid ${portal.borderSubtle}` : "none",
              }}
            >
              <span style={{ fontSize: 13, color: portal.textSubtle }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Sessions */}
        <SessionsPanel />
      </div>
    </PortalShell>
  );
}

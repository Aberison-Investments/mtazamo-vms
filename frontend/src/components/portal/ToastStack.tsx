import { useEffect, useState } from "react";
import { useNotifications, type Notification, type NotifStatus } from "../../notifications";
import { portal } from "../../portalTheme";
import { LoadingAnimation } from "./LoadingAnimation";

export function ToastStack() {
  const { notifications } = useNotifications();
  return (
    <div style={{
      position: "fixed", top: 68, right: 16, zIndex: 1100,
      display: "flex", flexDirection: "column", gap: 8,
      pointerEvents: "none",
    }}>
      {notifications.slice(0, 4).map((n) => (
        <ToastItem key={n.id} notification={n} />
      ))}
    </div>
  );
}

function ToastItem({ notification: n }: { notification: Notification }) {
  const { dismiss } = useNotifications();
  const [visible, setVisible] = useState(true);

  // Auto-dismiss success/error after 5 s with a fade-out
  useEffect(() => {
    if (n.status === "loading") return;
    const hide = setTimeout(() => setVisible(false), 4500);
    const remove = setTimeout(() => dismiss(n.id), 5000);
    return () => { clearTimeout(hide); clearTimeout(remove); };
  }, [n.status, n.id, dismiss]);

  const borderColor =
    n.status === "success" ? portal.successBold :
    n.status === "error"   ? portal.dangerText  :
    portal.border;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "10px 14px",
      borderRadius: 6,
      background: portal.canvas,
      border: `1px solid ${borderColor}`,
      borderLeft: `3px solid ${borderColor}`,
      boxShadow: "0 4px 12px rgba(9,30,66,0.15)",
      fontSize: 13, color: portal.ink,
      minWidth: 240, maxWidth: 320,
      pointerEvents: "auto",
      opacity: visible ? 1 : 0,
      transition: "opacity 0.4s ease",
      animation: "mtazamo-fade-in 0.2s ease",
    }}>
      <StatusIcon status={n.status} />
      <span style={{ flex: 1 }}>{n.message}</span>
      {n.status !== "loading" && (
        <button
          onClick={() => dismiss(n.id)}
          style={{ background: "none", border: 0, cursor: "pointer", color: portal.textSubtle, fontSize: 16, padding: 0, lineHeight: 1 }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: NotifStatus }) {
  if (status === "loading") return <LoadingAnimation size={20} />;
  if (status === "success") return <span style={{ color: portal.successBold, fontSize: 15, flexShrink: 0 }}>✓</span>;
  return <span style={{ color: portal.dangerText, fontSize: 15, flexShrink: 0 }}>✕</span>;
}

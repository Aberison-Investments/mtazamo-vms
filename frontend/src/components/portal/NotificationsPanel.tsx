import { useNotifications, type Notification } from "../../notifications";
import { portal } from "../../portalTheme";
import { LoadingAnimation } from "./LoadingAnimation";

export function NotificationsPanel() {
  const { notifications, dismiss, panelOpen, closePanel } = useNotifications();

  if (!panelOpen) return null;

  return (
    <>
      {/* backdrop — clicking outside closes the panel */}
      <div
        onClick={closePanel}
        style={{ position: "fixed", inset: 0, zIndex: 199 }}
      />

      {/* panel */}
      <div style={{
        position: "fixed", top: 56, right: 0, bottom: 0,
        width: 380,
        background: portal.canvas,
        borderLeft: `1px solid ${portal.border}`,
        boxShadow: "-4px 0 16px rgba(9,30,66,0.12)",
        zIndex: 200,
        display: "flex", flexDirection: "column",
        animation: "mtazamo-slide-in-right 0.2s ease",
      }}>
        {/* Header */}
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: `1px solid ${portal.border}`,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: portal.ink }}>Notifications</span>
          <button
            onClick={closePanel}
            style={{ background: "none", border: 0, cursor: "pointer", color: portal.textSubtle, fontSize: 20, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "12px 0" }}>
          {notifications.length === 0 ? (
            <EmptyState />
          ) : (
            notifications.map((n) => (
              <NotifRow key={n.id} notification={n} onDismiss={() => dismiss(n.id)} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function NotifRow({ notification: n, onDismiss }: { notification: Notification; onDismiss: () => void }) {
  const dotColor =
    n.status === "success" ? portal.successBold :
    n.status === "error"   ? portal.dangerText  :
    portal.brand;

  const time = n.createdAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{
      display: "flex", alignItems: "flex-start", gap: 12,
      padding: "12px 20px",
      borderBottom: `1px solid ${portal.borderSubtle}`,
    }}>
      <div style={{ paddingTop: 4, flexShrink: 0 }}>
        {n.status === "loading" ? (
          <LoadingAnimation size={16} />
        ) : (
          <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor, marginTop: 2 }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: portal.ink }}>{n.message}</div>
        <div style={{ fontSize: 11, color: portal.textSubtle, marginTop: 2 }}>{time}</div>
      </div>
      <button
        onClick={onDismiss}
        style={{ background: "none", border: 0, cursor: "pointer", color: portal.textSubtle, fontSize: 16, padding: 0, flexShrink: 0 }}
      >
        ×
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "60px 24px", color: portal.textSubtle, textAlign: "center" }}>
      <BellIllustration />
      <div style={{ fontSize: 14, fontWeight: 600, color: portal.ink, marginTop: 16 }}>No notifications</div>
    </div>
  );
}

function BellIllustration() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" style={{ opacity: 0.35 }}>
      <path d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2z" fill={portal.textSubtle} />
    </svg>
  );
}

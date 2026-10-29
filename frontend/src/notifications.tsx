import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type NotifStatus = "loading" | "success" | "error";

export interface Notification {
  id: string;
  message: string;
  status: NotifStatus;
  createdAt: Date;
}

interface NotificationsContextValue {
  notifications: Notification[];
  add: (message: string, status: NotifStatus) => string;
  update: (id: string, message: string, status: NotifStatus) => void;
  dismiss: (id: string) => void;
  panelOpen: boolean;
  togglePanel: () => void;
  closePanel: () => void;
}

const Ctx = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);

  function add(message: string, status: NotifStatus): string {
    const id = Math.random().toString(36).slice(2);
    setNotifications((n) => [{ id, message, status, createdAt: new Date() }, ...n]);
    return id;
  }

  function update(id: string, message: string, status: NotifStatus) {
    setNotifications((n) =>
      n.map((item) => (item.id === id ? { ...item, message, status } : item))
    );
  }

  function dismiss(id: string) {
    setNotifications((n) => n.filter((item) => item.id !== id));
  }

  return (
    <Ctx.Provider value={{
      notifications, add, update, dismiss,
      panelOpen,
      togglePanel: () => setPanelOpen((o) => !o),
      closePanel: () => setPanelOpen(false),
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

// Auto-dismisses a finished (success/error) notification after a delay.
export function useAutoDismiss(id: string, status: NotifStatus, delayMs = 5000) {
  const { dismiss } = useNotifications();
  useEffect(() => {
    if (status === "loading") return;
    const t = setTimeout(() => dismiss(id), delayMs);
    return () => clearTimeout(t);
  }, [id, status, delayMs, dismiss]);
}

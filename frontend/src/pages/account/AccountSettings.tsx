import { portal } from "../../portalTheme";
import { useAuth } from "../../auth";
import { PortalShell } from "../../components/portal/PortalShell";

// Placeholder — the full editable settings screen is a later subsection. For now
// this shows the captured account details read-only so the nav link isn't dead.
export function AccountSettings() {
  const { user } = useAuth();
  const rows: [string, string][] = [
    ["Full name", user?.name ?? "—"],
    ["Age", user?.age ? String(user.age) : "—"],
    ["Gender", user?.gender ?? "—"],
    ["Phone", user?.phone_masked ?? "—"],
    ["Email", user?.email ?? "—"],
    ["Two-factor", "SMS to verified phone"],
  ];

  return (
    <PortalShell active="settings">
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", maxWidth: 640 }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>Account / Settings</div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 4 }}>Settings</div>
        <div style={{ fontSize: 14, color: portal.textSubtle, marginBottom: 24 }}>
          Editing account details arrives in a later subsection.
        </div>
        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, background: portal.canvas }}>
          {rows.map(([label, value], i) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 16,
                padding: "12px 20px",
                borderBottom: i < rows.length - 1 ? `1px solid ${portal.borderSubtle}` : "none",
              }}
            >
              <span style={{ fontSize: 13, color: portal.textSubtle }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
            </div>
          ))}
        </div>
      </div>
    </PortalShell>
  );
}

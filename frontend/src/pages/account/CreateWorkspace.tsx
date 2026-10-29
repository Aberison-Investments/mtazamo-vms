import { Link, useNavigate } from "react-router-dom";
import { portal } from "../../portalTheme";
import { PortalShell } from "../../components/portal/PortalShell";
import { WorkspaceFormBody } from "../../components/portal/WorkspaceFormBody";

export function CreateWorkspace() {
  const navigate = useNavigate();

  return (
    <PortalShell active="workspaces">
      <div style={{ flex: 1, minWidth: 0, padding: "28px 40px 56px", width: "100%", maxWidth: 640, margin: "0 auto" }}>
        <div style={{ fontSize: 12, color: portal.textSubtle, marginBottom: 6 }}>
          <Link to="/workspaces" style={{ textDecoration: "none", color: portal.textSubtle }}>Workspaces</Link>{" "}/ Create workspace
        </div>
        <div style={{ fontSize: 24, lineHeight: "28px", fontWeight: 700, marginBottom: 24 }}>Create a workspace</div>

        <div style={{ border: `1px solid ${portal.border}`, borderRadius: 8, boxShadow: portal.cardShadow, padding: 24 }}>
          <WorkspaceFormBody
            onSuccess={() => navigate("/workspaces")}
            onCancel={() => navigate("/workspaces")}
          />
        </div>
      </div>
    </PortalShell>
  );
}

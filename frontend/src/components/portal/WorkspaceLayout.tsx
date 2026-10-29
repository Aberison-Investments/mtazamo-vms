import { Outlet, useLocation } from "react-router-dom";
import { Navigate } from "react-router-dom";
import { WorkspaceProvider, useWorkspaceContext } from "../../contexts/WorkspaceContext";
import { WorkspaceShell, type WorkspaceNavKey } from "./WorkspaceShell";

function Layout() {
  const { workspace, myRole } = useWorkspaceContext();
  const { pathname } = useLocation();

  if (myRole === "agent") {
    return <Navigate to={`/workspaces/${workspace.id}/station/results`} replace />;
  }

  return (
    <WorkspaceShell workspace={workspace} active={deriveActive(pathname, workspace.id)} myRole={myRole}>
      <Outlet />
    </WorkspaceShell>
  );
}

export function WorkspaceLayout() {
  return (
    <WorkspaceProvider>
      <Layout />
    </WorkspaceProvider>
  );
}

function deriveActive(pathname: string, id: string): WorkspaceNavKey {
  const base = `/workspaces/${id}`;
  if (pathname === base || pathname === base + "/") return "overview";
  if (pathname.startsWith(`${base}/candidates`)) return "candidates";
  if (pathname.startsWith(`${base}/managers`)) return "managers";
  if (pathname.startsWith(`${base}/recruitment`)) return "recruitment";
  if (pathname.startsWith(`${base}/geography`)) return "geography";
  if (pathname.startsWith(`${base}/settings`)) return "settings";
  if (pathname.startsWith(`${base}/agents`)) return "agents";
  if (pathname.startsWith(`${base}/warroom`)) return "warroom";
  if (pathname.startsWith(`${base}/audit`))   return "audit";
  return "overview";
}

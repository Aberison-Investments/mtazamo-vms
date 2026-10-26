import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { Geography } from "./pages/Geography";
import { CreateAccount } from "./pages/account/CreateAccount";
import { Login } from "./pages/account/Login";
import { VerifyPhone } from "./pages/account/VerifyPhone";
import { AccountHome } from "./pages/account/AccountHome";
import { AccountSettings } from "./pages/account/AccountSettings";
import { VerifyEmail } from "./pages/account/VerifyEmail";
import { VerifyEmailLink } from "./pages/account/VerifyEmailLink";
import { Workspaces } from "./pages/account/Workspaces";
import { CreateWorkspace } from "./pages/account/CreateWorkspace";
import { WorkspaceOverview } from "./pages/account/WorkspaceOverview";
import { CampaignManagers } from "./pages/account/CampaignManagers";
import { InviteCampaignManager } from "./pages/account/InviteCampaignManager";
import { JoinInvite } from "./pages/join/JoinInvite";
import { JoinVerifyPhone } from "./pages/join/JoinVerifyPhone";
import { JoinSetupAccount } from "./pages/join/JoinSetupAccount";
import { Candidates } from "./pages/account/Candidates";
import { Recruitment } from "./pages/account/Recruitment";
import { WorkspaceGeography } from "./pages/account/WorkspaceGeography";
import { WorkspaceSettings } from "./pages/account/WorkspaceSettings";
import { ReviewPendingAgents } from "./pages/account/ReviewPendingAgents";
import { AssignedAgents } from "./pages/account/AssignedAgents";
import { AgentApply } from "./pages/apply/AgentApply";
import { AgentJoin } from "./pages/apply/AgentJoin";
import { StationResults } from "./pages/station/StationResults";
import { portal } from "./portalTheme";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public: account & log-in flow */}
          <Route path="/create-account" element={<CreateAccount />} />
          <Route path="/login" element={<Login />} />
          <Route path="/verify" element={<VerifyPhone />} />
          {/* Opened from the emailed verification link — token-authenticated, no session needed. */}
          <Route path="/verify-email" element={<VerifyEmailLink />} />
          {/* Campaign manager invite accept — public, no auth. */}
          <Route path="/join/:token" element={<JoinInvite />} />
          <Route path="/join/:token/verify" element={<JoinVerifyPhone />} />
          <Route path="/join/:token/setup" element={<JoinSetupAccount />} />
          {/* Agent targeted invite accept — public, no auth. */}
          <Route path="/join/agent/:token" element={<AgentJoin />} />
          {/* Agent public-link apply — public, no auth. */}
          <Route path="/apply/:token" element={<AgentApply />} />

          {/* Authenticated: account & workspace portal */}
          <Route path="/account" element={<RequireAspirant><AccountHome /></RequireAspirant>} />
          <Route path="/account/settings" element={<RequireAuth><AccountSettings /></RequireAuth>} />
          <Route path="/account/verify-email" element={<RequireAuth><VerifyEmail /></RequireAuth>} />
          <Route path="/workspaces" element={<RequireAspirant><Workspaces /></RequireAspirant>} />
          <Route path="/workspaces/new" element={<RequireAspirant><CreateWorkspace /></RequireAspirant>} />
          <Route path="/workspaces/:id" element={<RequireAuth><WorkspaceOverview /></RequireAuth>} />
          <Route path="/workspaces/:id/candidates" element={<RequireAuth><Candidates /></RequireAuth>} />
          <Route path="/workspaces/:id/managers" element={<RequireAuth><CampaignManagers /></RequireAuth>} />
          <Route path="/workspaces/:id/managers/invite" element={<RequireAuth><InviteCampaignManager /></RequireAuth>} />
          <Route path="/workspaces/:id/recruitment" element={<RequireAuth><Recruitment /></RequireAuth>} />
          <Route path="/workspaces/:id/geography" element={<RequireAuth><WorkspaceGeography /></RequireAuth>} />
          <Route path="/workspaces/:id/settings" element={<RequireAuth><WorkspaceSettings /></RequireAuth>} />
          <Route path="/workspaces/:id/agents"         element={<RequireAuth><AssignedAgents /></RequireAuth>} />
          <Route path="/workspaces/:id/agents/pending" element={<RequireAuth><ReviewPendingAgents /></RequireAuth>} />
          <Route path="/workspaces/:id/station/results" element={<RequireAuth><StationResults /></RequireAuth>} />

          {/* Workspace interior (3.3 Geography). The interior is scoped to a
              single county; the workspace-selection subsection will pass this
              through — for now it stays fixed to Nakuru. */}
          <Route
            path="/geography"
            element={
              <RequireAuth>
                <Shell workspaceName="Nakuru Governor 2027" activeKey="geography">
                  <Geography county="Nakuru" workspaceName="Nakuru Governor 2027" />
                </Shell>
              </RequireAuth>
            }
          />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

function RequireAuth({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RequireAspirant({ children }: { children: React.ReactElement }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_aspirant) {
    const dest = user.primary_workspace_id ? `/workspaces/${user.primary_workspace_id}` : "/login";
    return <Navigate to={dest} replace />;
  }
  return children;
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoading />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.is_aspirant && user.primary_workspace_id) {
    return <Navigate to={`/workspaces/${user.primary_workspace_id}`} replace />;
  }
  return <Navigate to="/account" replace />;
}

function FullScreenLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: portal.font,
        color: portal.textSubtle,
        fontSize: 14,
      }}
    >
      Loading…
    </div>
  );
}

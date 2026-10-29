import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { WorkspaceLayout } from "./components/portal/WorkspaceLayout";
import { AuthProvider, useAuth } from "./auth";
import { NotificationsProvider } from "./notifications";
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
import { WarRoom } from "./pages/warroom/WarRoom";
import { AuditLog } from "./pages/account/AuditLog";
import { portal } from "./portalTheme";

export function App() {
  return (
    <NotificationsProvider>
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
          <Route path="/account/settings" element={<RequireAspirant><AccountSettings /></RequireAspirant>} />
          <Route path="/account/verify-email" element={<RequireAuth><VerifyEmail /></RequireAuth>} />
          <Route path="/workspaces" element={<RequireAspirant><Workspaces /></RequireAspirant>} />
          <Route path="/workspaces/new" element={<RequireAspirant><CreateWorkspace /></RequireAspirant>} />
          <Route path="/workspaces/:id" element={<RequireAuth><WorkspaceLayout /></RequireAuth>}>
            <Route index element={<WorkspaceOverview />} />
            <Route path="candidates" element={<Candidates />} />
            <Route path="managers" element={<CampaignManagers />} />
            <Route path="managers/invite" element={<ManagersInviteRedirect />} />
            <Route path="recruitment" element={<Recruitment />} />
            <Route path="geography" element={<WorkspaceGeography />} />
            <Route path="settings" element={<WorkspaceSettings />} />
            <Route path="agents" element={<AssignedAgents />} />
            <Route path="agents/pending" element={<ReviewPendingAgents />} />
            <Route path="warroom" element={<WarRoom />} />
            <Route path="audit" element={<AuditLog />} />
          </Route>
          <Route path="/workspaces/:id/station/results" element={<RequireAuth><StationResults /></RequireAuth>} />

          <Route path="/" element={<RootRedirect />} />
          <Route path="*" element={<RootRedirect />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </NotificationsProvider>
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
  if (user.primary_workspace_id) {
    // Polling agents go straight to their station results page
    if (user.primary_role === 'agent') {
      return <Navigate to={`/workspaces/${user.primary_workspace_id}/station/results`} replace />;
    }
    if (!user.is_aspirant) {
      return <Navigate to={`/workspaces/${user.primary_workspace_id}`} replace />;
    }
  }
  if (!user.is_aspirant) {
    // Pending agent with no approved workspace — should not reach here (login blocks them)
    return <Navigate to="/login" replace />;
  }
  return <Navigate to="/account" replace />;
}

function ManagersInviteRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/workspaces/${id}/managers`} state={{ openInvite: true }} replace />;
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

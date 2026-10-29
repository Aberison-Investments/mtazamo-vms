const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// ---- auth token storage ----------------------------------------------------
const TOKEN_KEY   = "mtazamo.token";
const REFRESH_KEY = "mtazamo.refresh_token";

export const tokenStore = {
  get:          ()        => localStorage.getItem(TOKEN_KEY),
  set:          (t: string) => localStorage.setItem(TOKEN_KEY, t),
  getRefresh:   ()        => localStorage.getItem(REFRESH_KEY),
  setRefresh:   (t: string) => localStorage.setItem(REFRESH_KEY, t),
  clear:        () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

// ---- transparent token refresh ----------------------------------------------
// When the server returns TOKEN_EXPIRED (401), we attempt a silent refresh
// using the stored refresh token. Concurrent requests are queued and retried
// once the refresh succeeds, or all fail if it doesn't.

let _isRefreshing = false;
let _refreshQueue: Array<{ resolve: (newToken: string) => void; reject: (err: unknown) => void }> = [];

async function attemptRefresh(): Promise<string | null> {
  const refreshToken = tokenStore.getRefresh();
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });
    if (!res.ok) { tokenStore.clear(); return null; }
    const data = await res.json() as { token: string; refresh_token: string };
    tokenStore.set(data.token);
    tokenStore.setRefresh(data.refresh_token);
    return data.token;
  } catch {
    tokenStore.clear();
    return null;
  }
}

// ---- account & workspace types --------------------------------------------
export interface AuthUser {
  id: number;
  name: string;
  first_name: string;
  last_name: string;
  age: number | null;
  gender: string | null;
  phone: string | null;
  phone_masked: string | null;
  phone_verified: boolean;
  email: string;
  email_verified: boolean;
  is_aspirant: boolean;
  primary_workspace_id: string | null;
  primary_role: string | null;
  initials: string;
}

export interface RegisterInput {
  first_name: string;
  last_name: string;
  age: number;
  gender: string;
  phone: string;
  email: string;
  password: string;
}

export interface LoginChallenge {
  challenge: "otp";
  identifier: string;
  phone_hint: string | null;
  dev_otp: string | null;
}

export interface VerifyResult {
  token: string;
  refresh_token: string;
  user: AuthUser;
}

export interface Workspace {
  id: string;
  name: string;
  seat: string;
  segment: string;
  scope: "national" | "county" | "constituency" | "ward";
  county: string | null;
  county_id: string | null;
  constituency: string | null;
  constituency_id: string | null;
  ward: string | null;
  ward_id: string | null;
  priority_counties: string[];
  year: number;
  election_date: string | null;
  party: string | null;
  status: "active" | "closed";
  created_at: string | null;
}

export interface CreateWorkspaceInput {
  name: string;
  seat: string;
  segment: string;
  county?: string | null;
  county_id?: string | null;
  constituency?: string | null;
  constituency_id?: string | null;
  ward?: string | null;
  ward_id?: string | null;
  priority_counties?: string[];
  year: number;
  election_date?: string | null;
  party?: string | null;
}

// Raised on 422 so callers can surface per-field validation messages.
export class ApiError extends Error {
  status: number;
  fields: Record<string, string[]>;
  constructor(message: string, status: number, fields: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export interface County {
  id: string;
  name: string;
}

export interface Ward {
  id: string;
  name: string;
}

export interface Constituency {
  id: string;
  name: string;
  wards: Ward[];
}

export interface CountyTree {
  county: County;
  constituencies: Constituency[];
}

export interface Station {
  id: string;
  code: string | null;          // IEBC station code
  name: string;                 // polling centre name
  stream_number: number | null;
  registered_voters: number | null;
  agent: string | null;
}

export interface WorkspaceManager {
  id: string;
  name: string;
  phone: string;
  phone_masked: string;
  email: string | null;
  status: "pending" | "active";
  expiry_hours: number;
  expires_at: string | null;
  accepted_at: string | null;
  invited_at: string | null;
  dev_token?: string | null;
}

export interface InviteManagerInput {
  name: string;
  phone: string;
  email?: string | null;
  note?: string | null;
  expiry_hours: number;
}

export interface ManagerInvite {
  name: string;
  phone_masked: string;
  inviter_name: string | null;
  expires_at: string | null;
  workspace: {
    name: string;
    seat: string;
    county: string | null;
  };
}

export interface WardStations {
  ward: { id: string; name: string; constituency: { id: string; name: string } | null };
  stations: Station[];
}

async function request<T>(path: string, init?: RequestInit, _isRetry = false): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401 && !_isRetry) {
    // If we have a refresh token, try a silent refresh first.
    if (tokenStore.getRefresh()) {
      if (_isRefreshing) {
        return new Promise<T>((resolve, reject) => {
          _refreshQueue.push({
            resolve: (newToken) => { request<T>(path, init, true).then(resolve).catch(reject); void newToken; },
            reject,
          });
        });
      }
      _isRefreshing = true;
      const newToken = await attemptRefresh();
      _isRefreshing = false;
      if (newToken) {
        const queue = _refreshQueue;
        _refreshQueue = [];
        queue.forEach(({ resolve }) => resolve(newToken));
        return request<T>(path, init, true);
      }
      // Refresh failed — reject all queued requests so their callers don't hang.
      const expiredErr = new ApiError("Session expired. Please log in again.", 401);
      const queue = _refreshQueue;
      _refreshQueue = [];
      queue.forEach(({ reject }) => reject(expiredErr));
    }

    // No refresh token, or refresh failed — clear state and redirect to login.
    tokenStore.clear();
    window.dispatchEvent(new CustomEvent("mtazamo:session-expired"));
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let fields: Record<string, string[]> = {};
    try {
      const body = (await res.json()) as {
        error?: string;
        message?: string;
        errors?: Record<string, string[]>;
      };
      if (body?.errors) fields = body.errors;
      message = body?.error ?? body?.message ?? message;
    } catch {
      /* ignore */
    }
    throw new ApiError(message, res.status, fields);
  }
  return res.json() as Promise<T>;
}

export const api = {
  base: API_BASE,

  // ---- account & workspace flow -------------------------------------------
  register: (data: RegisterInput) =>
    request<{ ok: true; user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (identifier: string, password: string) =>
    request<LoginChallenge>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    }),

  verifyOtp: (identifier: string, code: string) =>
    request<VerifyResult>("/api/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ identifier, code }),
    }),

  resendOtp: (identifier: string) =>
    request<{ ok: true; phone_hint: string | null; dev_otp: string | null }>(
      "/api/auth/resend-otp",
      { method: "POST", body: JSON.stringify({ identifier }) },
    ),

  me: () => request<{ user: AuthUser }>("/api/auth/me"),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  // ---- session management --------------------------------------------------
  listSessions: () =>
    request<{ sessions: SessionInfo[] }>("/api/auth/sessions"),

  revokeSession: (tokenId: number) =>
    request<{ ok: true }>(`/api/auth/sessions/${tokenId}`, { method: "DELETE" }),

  revokeAllSessions: () =>
    request<{ ok: true }>("/api/auth/sessions/revoke-all", { method: "POST" }),

  // ---- audit logs ----------------------------------------------------------
  getAuditLogs: (workspaceId: string, params?: { action?: string; actor_id?: number }) => {
    const qs = new URLSearchParams();
    if (params?.action)   qs.set("action",   params.action);
    if (params?.actor_id) qs.set("actor_id", String(params.actor_id));
    return request<{ logs: AuditLogEntry[] }>(
      `/api/workspaces/${workspaceId}/audit${qs.toString() ? `?${qs}` : ""}`,
    );
  },

  getMyActivity: () =>
    request<{ logs: AuditLogEntry[] }>("/api/auth/activity"),

  // ---- email verification --------------------------------------------------
  sendEmailVerification: () =>
    request<{ ok: true; email: string; already_verified?: boolean; dev_token: string | null }>(
      "/api/auth/email/send",
      { method: "POST" },
    ),

  verifyEmail: (token: string) =>
    request<{ ok: true; email: string }>("/api/auth/email/verify", {
      method: "POST",
      body: JSON.stringify({ token }),
    }),

  changeEmail: (email: string) =>
    request<{ ok: true; email: string; dev_token: string | null }>("/api/auth/email/change", {
      method: "POST",
      body: JSON.stringify({ email }),
    }),

  listWorkspaces: () => request<{ workspaces: Workspace[] }>("/api/workspaces"),

  getWorkspace: (id: string) =>
    request<{ workspace: Workspace; my_role: string }>(`/api/workspaces/${id}`),

  workspaceStats: (id: string) =>
    request<{ total_stations: number | null; covered_stations: number | null; pending_applications: number; top_wards: Array<{ id: string; name: string; total_stations: number }> }>(
      `/api/workspaces/${id}/stats`,
    ),

  createWorkspace: (data: CreateWorkspaceInput) =>
    request<{ workspace: Workspace }>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  // ---- geography (3.3) -----------------------------------------------------
  listCounties: () => request<{ counties: County[] }>("/api/geography/counties"),

  countyTree: (countyIdOrName: string) =>
    request<CountyTree>(`/api/geography/counties/${encodeURIComponent(countyIdOrName)}/tree`),

  wardStations: (wardId: string) =>
    request<WardStations>(`/api/geography/wards/${wardId}/stations`),

  workspaceWardStations: (workspaceId: string, wardId: string) =>
    request<WardStations>(`/api/workspaces/${workspaceId}/geography/wards/${wardId}/stations`),

  addStation: (
    wardId: string,
    data: { code?: string; name: string; registered_voters?: number | null },
  ) =>
    request<{ station: Station }>(`/api/geography/wards/${wardId}/stations`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  exportUrl: (wardId: string) => `${API_BASE}/api/geography/wards/${wardId}/stations.csv`,

  // ---- campaign managers ---------------------------------------------------
  listManagers: (workspaceId: string) =>
    request<{ managers: WorkspaceManager[]; aspirant: { name: string; email: string; initials: string } }>(`/api/workspaces/${workspaceId}/managers`),

  inviteManager: (workspaceId: string, data: InviteManagerInput) =>
    request<{ manager: WorkspaceManager }>(`/api/workspaces/${workspaceId}/managers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  resendManagerInvite: (workspaceId: string, managerId: string) =>
    request<{ manager: WorkspaceManager }>(
      `/api/workspaces/${workspaceId}/managers/${managerId}/resend`,
      { method: "POST" },
    ),

  removeManager: (workspaceId: string, managerId: string) =>
    request<{ ok: true }>(`/api/workspaces/${workspaceId}/managers/${managerId}`, {
      method: "DELETE",
    }),

  // ---- invite accept (public) ----------------------------------------------
  getInvite: (token: string) =>
    request<{ invite: ManagerInvite }>(`/api/join/${token}`),

  requestInviteOtp: (token: string) =>
    request<{ ok: true; phone_hint: string; dev_otp: string | null }>(
      `/api/join/${token}/request-otp`,
      { method: "POST" },
    ),

  acceptInvite: (token: string, code: string) =>
    request<
      | { ok: true; verified_token: string; name: string; email: string | null; skip_setup?: never }
      | { ok: true; skip_setup: true; token: string; user: AuthUser; refresh_token: string; workspace_id: string }
    >(
      `/api/join/${token}/accept`,
      { method: "POST", body: JSON.stringify({ code }) },
    ),

  setupManagerAccount: (
    token: string,
    data: {
      verified_token: string;
      first_name: string;
      last_name: string;
      email: string;
      password: string;
      password_confirmation: string;
    },
  ) =>
    request<{ token: string; refresh_token: string; user: AuthUser; workspace_id: string }>(`/api/join/${token}/setup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  declineInvite: (token: string) =>
    request<{ ok: true }>(`/api/join/${token}/decline`, { method: "POST" }),

  // ---- recruitment (CM) -------------------------------------------------------
  getRecruitment: (workspaceId: string, params?: { page?: number; per_page?: number; search?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page !== undefined) qs.set("page", String(params.page));
    if (params?.per_page !== undefined) qs.set("per_page", String(params.per_page));
    if (params?.search) qs.set("search", params.search);
    const q = qs.toString() ? `?${qs}` : "";
    return request<{
      workspace: { id: string; name: string; seat: string };
      wards: RecruitmentWard[];
      wards_meta: { total: number; per_page: number; current_page: number; last_page: number };
      seat_roles: SeatRole[];
      form_letter: string;
      my_role: string | null;
      filled_constituency_ids: string[];
      filled_ward_ids: string[];
    }>(`/api/workspaces/${workspaceId}/recruitment${q}`);
  },

  getRecruitmentWard: (workspaceId: string, wardId: string) =>
    request<{ link: RecruitmentLink; stations: RecruitmentStation[] }>(
      `/api/workspaces/${workspaceId}/recruitment/wards/${wardId}`,
    ),

  updateRecruitmentWard: (
    workspaceId: string,
    wardId: string,
    data: Partial<{
      open_roles: string[];
      require_preferred_station: boolean;
      show_walkthrough: boolean;
      close_when_full: boolean;
      is_active: boolean;
    }>,
  ) =>
    request<{ link: RecruitmentLink }>(
      `/api/workspaces/${workspaceId}/recruitment/wards/${wardId}`,
      { method: "PATCH", body: JSON.stringify(data) },
    ),

  regenerateRecruitmentLink: (workspaceId: string, wardId: string) =>
    request<{ link: RecruitmentLink }>(
      `/api/workspaces/${workspaceId}/recruitment/wards/${wardId}/regenerate`,
      { method: "POST" },
    ),

  recruitmentStats: (workspaceId: string) =>
    request<{
      total_applications: number;
      pending: number;
      approved: number;
      rejected: number;
      open_wards_count: number;
    }>(`/api/workspaces/${workspaceId}/recruitment/stats`),

  sendAgentInvite: (workspaceId: string, data: AgentInviteInput) =>
    request<{ invite: AgentInviteSent }>(
      `/api/workspaces/${workspaceId}/recruitment/invites`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  listAgentInvites: (workspaceId: string) =>
    request<{ invites: AgentInviteSent[] }>(
      `/api/workspaces/${workspaceId}/recruitment/invites`,
    ),

  // ---- public apply (agent public link) ---------------------------------------
  getApplyLink: (token: string) =>
    request<PublicLinkInfo>(`/api/apply/${token}`),

  applyRequestOtp: (token: string, phone: string, email?: string, nationalId?: string) =>
    request<{ ok: true; phone_hint: string; dev_otp: string | null }>(
      `/api/apply/${token}/request-otp`,
      { method: "POST", body: JSON.stringify({ phone, email: email || undefined, national_id: nationalId || undefined }) },
    ),

  applySubmit: (
    token: string,
    data: {
      code: string;
      first_name: string;
      last_name: string;
      national_id?: string;
      phone: string;
      age: number;
      role: string;
      email?: string;
      station_id?: string;
    },
  ) =>
    request<{ ok: true; id: string; setup_token: string }>(`/api/apply/${token}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  applyAgentSetup: (agentId: string, data: { setup_token: string; password: string; password_confirmation: string }) =>
    request<{ token: string; refresh_token: string; user: AuthUser; workspace_id: string }>(
      `/api/apply/agent/${agentId}/setup`,
      { method: "POST", body: JSON.stringify(data) },
    ),

  // ---- agent targeted invite (join) -------------------------------------------
  getAgentInvite: (token: string) =>
    request<{ invite: AgentInviteInfo }>(`/api/join/agent/${token}`),

  agentInviteRequestOtp: (token: string) =>
    request<{ ok: true; phone_hint: string; dev_otp: string | null }>(
      `/api/join/agent/${token}/request-otp`,
      { method: "POST" },
    ),

  agentInviteAccept: (token: string, code: string) =>
    request<{
      ok: true;
      verified_token: string;
      name: string;
      email: string | null;
      role: string;
      seat: string;
    }>(`/api/join/agent/${token}/accept`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  agentInviteSetup: (
    token: string,
    data: {
      verified_token: string;
      first_name: string;
      last_name: string;
      email: string;
      password: string;
      password_confirmation: string;
    },
  ) =>
    request<{ token: string; refresh_token: string; user: AuthUser }>(`/api/join/agent/${token}/setup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  agentInviteDecline: (token: string) =>
    request<{ ok: true }>(`/api/join/agent/${token}/decline`, { method: "POST" }),

  // ---- agent review queue -------------------------------------------------
  getPendingAgents: (
    workspaceId: string,
    params?: { page?: number; per_page?: number; role?: string; ward_id?: string; search?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.page)     qs.set('page',     String(params.page));
    if (params?.per_page) qs.set('per_page', String(params.per_page));
    if (params?.role)     qs.set('role',     params.role);
    if (params?.ward_id)  qs.set('ward_id',  params.ward_id);
    if (params?.search)   qs.set('search',   params.search);
    const q = qs.toString() ? `?${qs}` : '';
    return request<{
      agents: PendingAgent[];
      total: number;
      page: number;
      per_page: number;
      wards: ReviewWard[];
      can_assign: boolean;
      can_invite: boolean;
      my_role: string | null;
      metrics: ReviewMetrics;
    }>(`/api/workspaces/${workspaceId}/agents/pending${q}`);
  },

  getAgentStations: (workspaceId: string, agentId: string) =>
    request<{
      ward: { id: string; name: string } | null;
      stations: AssignStation[];
      totals: { total: number; covered: number; gap: number } | null;
    }>(`/api/workspaces/${workspaceId}/agents/${agentId}/stations`),

  approveAgent: (workspaceId: string, agentId: string, stationId?: string | null) =>
    request<{ agent: { id: string; status: string } }>(
      `/api/workspaces/${workspaceId}/agents/${agentId}/approve`,
      { method: 'POST', body: JSON.stringify({ station_id: stationId ?? null }) },
    ),

  rejectAgent: (workspaceId: string, agentId: string, reason: string) =>
    request<{ agent: { id: string; status: string } }>(
      `/api/workspaces/${workspaceId}/agents/${agentId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
    ),

  bulkApproveAgents: (workspaceId: string, ids: string[]) =>
    request<{ approved: number; skipped: number }>(
      `/api/workspaces/${workspaceId}/agents/bulk-approve`,
      { method: 'POST', body: JSON.stringify({ ids }) },
    ),

  // ---- assigned agents (coverage view) ---------------------------------------
  getAssignedWards: (workspaceId: string) =>
    request<{ wards: AssignedWardSummary[]; my_role: string; can_assign: boolean; pending_count: number }>(
      `/api/workspaces/${workspaceId}/agents/assigned`,
    ),

  getAssignedWard: (workspaceId: string, wardId: string) =>
    request<{ ward: { id: string; name: string }; stations: AssignedStation[]; bench: BenchAgent[]; can_assign: boolean }>(
      `/api/workspaces/${workspaceId}/agents/assigned/wards/${wardId}`,
    ),

  deployBenchAgent: (workspaceId: string, agentId: string, stationId: string) =>
    request<{ ok: true; agent_id: string; station_id: string }>(
      `/api/workspaces/${workspaceId}/agents/${agentId}/deploy`,
      { method: 'POST', body: JSON.stringify({ station_id: stationId }) },
    ),

  reassignAgent: (workspaceId: string, agentId: string, stationId: string | null) =>
    request<{ ok: true; agent_id: string; station_id: string | null }>(
      `/api/workspaces/${workspaceId}/agents/${agentId}/reassign`,
      { method: 'POST', body: JSON.stringify({ station_id: stationId }) },
    ),

  // ---- tier officer portal ---------------------------------------------------
  getTierContext: (workspaceId: string) =>
    request<TierContext>(`/api/workspaces/${workspaceId}/tier/context`),

  // ---- candidates (ballot list) -----------------------------------------------
  getCandidates: (workspaceId: string) =>
    request<CandidateListResponse>(`/api/workspaces/${workspaceId}/candidates`),

  saveCandidates: (
    workspaceId: string,
    candidates: Array<{ name: string; party: string; is_ours: boolean }>,
  ) =>
    request<CandidateListResponse>(`/api/workspaces/${workspaceId}/candidates`, {
      method: 'PUT',
      body: JSON.stringify({ candidates }),
    }),

  publishCandidates: (workspaceId: string) =>
    request<CandidateListResponse>(`/api/workspaces/${workspaceId}/candidates/publish`, {
      method: 'POST',
    }),

  // ---- station results (polling agent) ----------------------------------------
  getStationContext: (workspaceId: string) =>
    request<StationContext>(`/api/workspaces/${workspaceId}/station/context`),

  requestResultOtp: (workspaceId: string) =>
    request<{ ok: true; phone_hint: string; dev_otp: string | null }>(
      `/api/workspaces/${workspaceId}/station/result-otp`,
      { method: 'POST' },
    ),

  submitStationResult: (
    workspaceId: string,
    data: {
      otp: string;
      registered_voters: number;
      votes: Array<{ candidate_id: string; votes: number }>;
      rejected_ballots: number;
      disputed_votes: number;
      photo_base64: string | null;
    },
  ) =>
    request<{ result: StationResultData }>(
      `/api/workspaces/${workspaceId}/station/results`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // ---- election runs ----------------------------------------------------------
  listRuns: (workspaceId: string) =>
    request<{ runs: ElectionRun[]; active_run: ElectionRun | null }>(
      `/api/workspaces/${workspaceId}/runs`,
    ),

  createRun: (
    workspaceId: string,
    data: { name: string; type: 'live' | 'rehearsal'; run_date?: string | null; start_time?: string | null; end_time?: string | null },
  ) =>
    request<{ run: ElectionRun }>(`/api/workspaces/${workspaceId}/runs`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRun: (
    workspaceId: string,
    runId: string,
    data: { action?: 'activate' | 'deactivate' | 'certify' | 'archive'; name?: string; run_date?: string | null; start_time?: string | null; end_time?: string | null },
  ) =>
    request<{ run: ElectionRun }>(`/api/workspaces/${workspaceId}/runs/${runId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  // ---- war room ---------------------------------------------------------------
  getWarRoomSummary: (
    workspaceId: string,
    params: { run_id?: string; scope?: string; scope_id?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params.run_id)   qs.set('run_id',   params.run_id);
    if (params.scope)    qs.set('scope',    params.scope);
    if (params.scope_id) qs.set('scope_id', params.scope_id);
    return request<WarRoomSummary>(
      `/api/workspaces/${workspaceId}/warroom/summary?${qs}`,
    );
  },

  verifyResult: (workspaceId: string, runId: string, resultId: string) =>
    request<{ result: { id: string; status: string } }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/results/${resultId}/verify`,
      { method: 'POST' },
    ),

  queryResult: (workspaceId: string, runId: string, resultId: string, note: string) =>
    request<{ result: { id: string; status: string; query_note: string } }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/results/${resultId}/query`,
      { method: 'POST', body: JSON.stringify({ note }) },
    ),

  amendResult: (
    workspaceId: string,
    runId: string,
    resultId: string,
    payload: { candidates: Array<{ candidate_id: string; votes: number }>; rejected_ballots: number; note: string },
  ) =>
    request<{ result: { id: string; status: string } }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/results/${resultId}/amend`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  // ---- tier form (Form 34B / 37B etc.) ----------------------------------------
  getTierForm: (workspaceId: string, runId: string, tier: string, geoId?: string | null) => {
    const qs = new URLSearchParams({ tier });
    if (geoId) qs.set('geo_id', geoId);
    return request<TierFormContext>(`/api/workspaces/${workspaceId}/runs/${runId}/tier-form?${qs}`);
  },

  saveTierFormDraft: (workspaceId: string, runId: string, payload: TierFormSavePayload) =>
    request<{ form: TierFormSubmission }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/tier-form/save`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  submitTierForm: (workspaceId: string, runId: string, payload: TierFormSavePayload) =>
    request<{ form: TierFormSubmission }>(
      `/api/workspaces/${workspaceId}/runs/${runId}/tier-form/submit`,
      { method: 'POST', body: JSON.stringify(payload) },
    ),

  uploadTierFormImage: async (workspaceId: string, file: File): Promise<{ path: string; url: string }> => {
    const token = tokenStore.get();
    const form = new FormData();
    form.append('image', file);
    const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/tier-form/upload-image`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept: 'application/json',
      },
      body: form,
    });
    if (!res.ok) throw new Error('Image upload failed');
    return res.json() as Promise<{ path: string; url: string }>;
  },

  // ---- workspace delegation settings -----------------------------------------
  getDelegation: (workspaceId: string) =>
    request<{ delegation: DelegationSettings }>(
      `/api/workspaces/${workspaceId}/settings/delegation`,
    ),

  saveDelegation: (workspaceId: string, rules: DelegationRules) =>
    request<{ delegation: DelegationSettings }>(
      `/api/workspaces/${workspaceId}/settings/delegation`,
      { method: 'PUT', body: JSON.stringify({ rules }) },
    ),

  // ---- geography (constituencies → wards cascade) ----------------------------
  constituencyWards: (constituencyId: string) =>
    request<{ wards: Ward[] }>(
      `/api/geography/constituencies/${constituencyId}/wards`,
    ),

  // ---- geography GeoJSON (unauthenticated) ------------------------------------
  allCountiesGeojson: () =>
    request<GeoFeatureCollection>(`/api/geography/counties/geojson`),

  countyGeojson: (countyId: string) =>
    request<GeoFeatureCollection>(`/api/geography/counties/${countyId}/geojson`),

  constituencyGeojson: (constituencyId: string) =>
    request<GeoFeatureCollection>(`/api/geography/constituencies/${constituencyId}/geojson`),

  // ---- workspace geography coverage summary ----------------------------------
  workspaceGeography: (
    workspaceId: string,
    params?: { county_id?: string; constituency_id?: string },
  ) => {
    const qs = new URLSearchParams();
    if (params?.county_id) qs.set('county_id', params.county_id);
    if (params?.constituency_id) qs.set('constituency_id', params.constituency_id);
    const query = qs.toString() ? `?${qs}` : '';
    return request<WorkspaceGeoSummary>(`/api/workspaces/${workspaceId}/geography${query}`);
  },
};

// ---- recruitment types -------------------------------------------------------
export interface RecruitmentWard {
  id: string;
  name: string;
  constituency_name: string | null;
  county_name: string | null;
  link: RecruitmentLink | null;
}

export interface RecruitmentLink {
  id: string;
  ward_id: string;
  token: string;
  open_roles: string[];
  require_preferred_station: boolean;
  show_walkthrough: boolean;
  close_when_full: boolean;
  is_active: boolean;
  application_count: number;
  url: string;
}

export interface RecruitmentStation {
  id: string;
  code: string | null;
  name: string;
  registered_voters: number | null;
  coverage: "gap" | "partial" | "full";
  approved_count: number;
  pending_count: number;
}

export interface SeatRole {
  id: string;
  label: string;
  blurb: string;
  filled: boolean;
}

export interface AgentInviteInput {
  role: string;
  name: string;
  phone: string;
  expiry_hours: number;
  station_id?: string;
  ward_id?: string;
  constituency_id?: string;
  county_id?: string;
}

export interface AgentInviteSent {
  id: string;
  role: string;
  name: string;
  phone: string;
  station_id: string | null;
  station_name: string | null;
  ward_id: string | null;
  ward_name: string | null;
  constituency_name: string | null;
  county_name: string | null;
  status: string;
  expires_at: string | null;
  invited_at: string | null;
  dev_token?: string | null;
}

export interface PublicLinkInfo {
  link: {
    open_roles: string[];
    require_preferred_station: boolean;
    show_walkthrough: boolean;
  };
  workspace: {
    name: string;
    seat: string;
    aspirant_name: string | null;
    year: number;
  };
  ward: {
    id: string;
    name: string;
    constituency_name: string | null;
    county_name: string | null;
  } | null;
  stations: Array<{
    id: string;
    code: string | null;
    name: string;
    registered_voters: number | null;
    coverage: "gap" | "full";
  }>;
}

export interface AgentInviteInfo {
  name: string;
  phone_masked: string;
  role: string;
  role_label: string;
  role_blurb: string;
  geo_scope: string;
  expires_at: string | null;
  workspace: {
    name: string;
    seat: string;
    aspirant_name: string | null;
    year: number;
  };
}

// ---- agent review queue types -----------------------------------------------
export interface PendingAgent {
  id: string;
  name: string;
  first_name: string;
  last_name: string;
  national_id: string | null;
  phone_masked: string;
  role: string;
  role_label: string;
  ward_id: string | null;
  ward_name: string | null;
  constituency_name: string | null;
  county_name: string | null;
  station_id: string | null;
  station_name: string | null;
  station_occupied_by: string | null;
  source: string;
  phone_verified: boolean;
  duplicate: { type: 'id' | 'phone'; with: string } | null;
  age: number | null;
  email: string | null;
  wait_days: number;
  created_at: string;
}

export interface ReviewMetrics {
  pending: number;
  over_5_days: number;
  duplicates: number;
  approved_today: number;
}

export interface ReviewWard { id: string; name: string }

export interface AssignStation {
  id: string;
  name: string;
  code: string | null;
  registered_voters: number | null;
  coverage: 'gap' | 'full';
  approved_count: number;
  occupant: { id: string; name: string } | null;
}

// ---- workspace delegation settings -----------------------------------------
export interface DelegationRules {
  [role: string]: { invite: boolean; assign: boolean };
}

export interface DelegationSettings {
  seat: string;
  roles: string[];
  rules: DelegationRules;
}

// ---- geography GeoJSON & coverage types -------------------------------------

export interface GeoFeature {
  type: 'Feature';
  id: string;
  properties: { id: string; name: string };
  geometry: unknown;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export interface GeoItem {
  id: string;
  name: string;
  total_stations: number;
  covered_stations: number;
  coverage_pct: number;
}

export interface WorkspaceGeoSummary {
  level: 'counties' | 'constituencies' | 'wards' | 'ward';
  region: { id: string; name: string } | null;
  items: GeoItem[];
  totals: {
    total_stations: number;
    covered_stations: number;
    coverage_pct: number;
  };
}

// ---- assigned agents types --------------------------------------------------

export interface AssignedWardSummary {
  id: string;
  name: string;
  total_stations: number;
  assigned_count: number;
  pending_count: number;
  bench_count: number;
}

export interface AssignedStation {
  id: string;
  code: string | null;       // full IEBC station code
  centre_code: string | null; // short centre code within ward
  stream_number: number | null;
  name: string;              // polling centre name
  registered_voters: number | null;
  state: 'assigned' | 'pending' | 'gap';
  agent: { id: string; name: string; phone_masked: string } | null;
}

export interface BenchAgent {
  id: string;
  name: string;
  initials: string;
  phone_masked: string;
  approved_at: string | null;
}

// ---- candidates types --------------------------------------------------------

export interface WorkspaceCandidate {
  id: string;
  name: string;
  party: string;
  ballot_order: number;
  is_ours: boolean;
}

export interface CandidateListResponse {
  candidates: WorkspaceCandidate[];
  status: 'draft' | 'published' | 'unpublished_changes';
}

// ---- station results types ---------------------------------------------------

export interface StationResultVote {
  candidate_id: string;
  votes: number;
}

export interface StationResultData {
  id: string;
  registered_voters: number;
  votes: StationResultVote[];
  rejected_ballots: number;
  disputed_votes: number;
  photo_url: string | null;
  reference_code: string;
  submitted_at: string | null;
  version: number;
}

export interface StationContext {
  workspace: {
    id: string;
    name: string;
    seat: string;
    form_letter: string;
    form_name: string;
  };
  station: {
    id: string;
    code: string | null;
    name: string;
    registered_voters: number | null;
    ward_name: string | null;
    constituency_name: string | null;
    county_name: string | null;
  };
  candidates: Array<{
    id: string;
    name: string;
    party: string;
    is_ours: boolean;
  }>;
  existing_result: StationResultData | null;
  manager: { name: string; phone: string } | null;
}

// ---- tier officer context ----------------------------------------------------

export interface TierContext {
  role: string;
  role_label: string;
  geo_scope: string | null;
  constituency_id: string | null;
  ward_id: string | null;
  county_id: string | null;
  can_invite: boolean;
  can_assign: boolean;
  appointed_by: { name: string; at: string | null } | null;
  roles_below: Array<{ id: string; label: string; blurb: string }>;
  wards: Array<{ id: string; name: string; person: string | null; state: 'confirmed' | 'pending' | 'open' }>;
  metrics: {
    total_stations: number;
    covered_stations: number;
    pending_applications: number;
    ward_officers_filled: number;
    ward_officers_total: number;
    constituency_agents_filled: number;
    constituency_agents_total: number;
    ward_admins_filled: number;
    ward_admins_total: number;
    volunteers: number;
  };
  workspace: {
    id: string;
    name: string;
    seat: string;
    year: number;
    election_date: string | null;
  };
}

// ---- election run types -------------------------------------------------------

export interface ElectionRun {
  id: string;
  name: string;
  type: 'live' | 'rehearsal';
  status: 'open' | 'tallying' | 'certified' | 'archived';
  run_date: string | null;
  start_time: string | null;
  end_time: string | null;
  opened_at: string | null;
  closed_at: string | null;
  created_at: string | null;
}

// ---- war room types -----------------------------------------------------------

export interface WarRoomStation {
  id: string;
  code: string | null;
  name: string;
  centre_name: string;
  registered_voters: number | null;
  ward_id: string;
  ward_name: string;
  constituency_id: string;
  constituency_name: string;
  county_id: string;
  county_name: string;
  result_id: string | null;
  status: 'pending' | 'submitted' | 'queried' | 'verified';
  votes: Array<{ candidate_id: string; candidate_name: string | null; candidate_party: string | null; votes: number }>;
  total_votes: number | null;
  rejected_ballots: number | null;
  disputed_votes: number | null;
  submitted_at: string | null;
  reference_code: string | null;
  form_image_path: string | null;
  agent_name: string | null;
  agent_phone: string | null;
  query_note: string | null;
}

export interface WarRoomLeaderboardEntry {
  candidate_id: string;
  name: string;
  party: string;
  is_ours: boolean;
  votes: number;
  pct: number;
}

export interface WarRoomSummary {
  run: { id: string; name: string; type: string; status: string } | null;
  leaderboard: WarRoomLeaderboardEntry[];
  stations: WarRoomStation[];
  coverage: { total_stations: number; reporting_stations: number; pct: number } | null;
}

// ---- tier form types (Form 34B / 37B / 35B etc.) ----------------------------

export interface TierFormCandidateEntry {
  candidate_id: string;
  candidate_name?: string;
  form_votes: number;
  platform_votes: number;
}

export interface TierFormDiscrepancyFlag {
  station_id: string;
  station_name: string;
  ward_name?: string;
  platform_votes: number;
  form_votes: number;
  note?: string;
}

export interface TierFormSubmission {
  id: string;
  tier_level: 'constituency' | 'county' | 'national';
  geo_id: string | null;
  candidate_data: TierFormCandidateEntry[];
  total_valid_form: number | null;
  total_valid_platform: number | null;
  rejected_ballots_form: number | null;
  rejected_ballots_platform: number | null;
  discrepancy_flags: TierFormDiscrepancyFlag[];
  has_discrepancy: boolean;
  form_image_urls: string[];
  form_image_paths: string[];
  status: 'draft' | 'submitted';
  submitted_at: string | null;
}

export interface TierFormPlatformTotals {
  candidates: Array<{ candidate_id: string; candidate_name: string; platform_votes: number }>;
  total_valid: number;
  rejected_ballots: number;
  reporting_stations: number;
}

export interface TierFormContext {
  form: TierFormSubmission | null;
  platform_totals: TierFormPlatformTotals;
  candidates: Array<{ id: string; name: string; party: string }>;
}

export interface TierFormSavePayload {
  tier: 'constituency' | 'county' | 'national';
  geo_id?: string | null;
  candidate_data: TierFormCandidateEntry[];
  total_valid_form?: number | null;
  total_valid_platform?: number | null;
  rejected_ballots_form?: number | null;
  rejected_ballots_platform?: number | null;
  discrepancy_flags?: TierFormDiscrepancyFlag[];
  has_discrepancy?: boolean;
  form_image_paths?: string[];
}

// Extend StationContext to include active_run
export interface ActiveRunInfo {
  id: string;
  name: string;
  type: string;
  status: string;
}

// ---- session & audit types ---------------------------------------------------

export interface SessionInfo {
  id: number;
  device_label: string;
  ip_address: string | null;
  last_used_at: string | null;
  created_at: string | null;
  is_current: boolean;
  access_valid: boolean;
}

export interface AuditLogEntry {
  id: number;
  action: string;
  actor: { id: number; name: string } | null;
  actor_role: string | null;
  entity_type: string | null;
  entity_label: string | null;
  context: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string | null;
  workspace_id?: string | null;
}

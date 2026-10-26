const API_BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

// ---- auth token storage ----------------------------------------------------
const TOKEN_KEY = "mtazamo.token";

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

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
  code: string | null;
  name: string;
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
    request<{ managers: WorkspaceManager[] }>(`/api/workspaces/${workspaceId}/managers`),

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
    request<{ ok: true; verified_token: string; name: string; email: string | null }>(
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
    request<{ token: string; user: AuthUser; workspace_id: string }>(`/api/join/${token}/setup`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  declineInvite: (token: string) =>
    request<{ ok: true }>(`/api/join/${token}/decline`, { method: "POST" }),

  // ---- recruitment (CM) -------------------------------------------------------
  getRecruitment: (workspaceId: string) =>
    request<{
      workspace: { id: string; name: string; seat: string };
      wards: RecruitmentWard[];
      seat_roles: SeatRole[];
      form_letter: string;
      my_role: string | null;
    }>(`/api/workspaces/${workspaceId}/recruitment`),

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

  applyRequestOtp: (token: string, phone: string) =>
    request<{ ok: true; phone_hint: string; dev_otp: string | null }>(
      `/api/apply/${token}/request-otp`,
      { method: "POST", body: JSON.stringify({ phone }) },
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
    request<{ ok: true; id: string }>(`/api/apply/${token}/submit`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

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
    request<{ token: string; user: AuthUser }>(`/api/join/agent/${token}/setup`, {
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

  submitStationResult: (
    workspaceId: string,
    data: {
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
  ward_id: string | null;
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
  code: string | null;
  name: string;
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

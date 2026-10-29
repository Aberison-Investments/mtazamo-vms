<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceAgentPermission;
use App\Services\AuditService;
use App\Support\SeatRoles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkspaceAgentReviewController extends Controller
{
    // -------------------------------------------------------------------------
    // Access helpers
    // -------------------------------------------------------------------------

    /**
     * Find workspace visible to this user (aspirant owner, active CM, or approved tier officer).
     */
    private function resolveWorkspace(Request $request, string $id): Workspace
    {
        $user = $request->user();
        $workspace = Workspace::find($id);
        if (! $workspace) abort(404);

        if ($workspace->user_id === $user->id) return $workspace;

        $isCM = $workspace->managers()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
        if ($isCM) return $workspace;

        $isTier = WorkspaceAgent::where('workspace_id', $id)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->exists();
        if ($isTier) return $workspace;

        abort(403);
    }

    /** Return the tier officer's WorkspaceAgent record for this workspace, or null. */
    private function tierRecord(Request $request, string $workspaceId): ?WorkspaceAgent
    {
        return WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $request->user()->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->first();
    }

    /**
     * Returns [canAssign, myRole].
     *
     * Aspirant and active CMs always can assign.
     * Tier officers need the `assign` permission granted via delegation settings.
     */
    private function assignContext($user, Workspace $workspace): array
    {
        // Aspirant
        if ($workspace->user_id === $user->id) {
            return [true, 'aspirant'];
        }

        // Active campaign manager
        $isCM = $workspace->managers()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
        if ($isCM) {
            return [true, 'campaign_manager'];
        }

        // Tier officer — check delegation table
        $agentRecord = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->first();

        if (! $agentRecord) {
            return [false, null];
        }

        $hasAssign = WorkspaceAgentPermission::where('workspace_id', $workspace->id)
            ->where('grantee_role', $agentRecord->role)
            ->whereNull('grantee_geo_id')
            ->where('permission', 'assign')
            ->exists();

        return [$hasAssign, $agentRecord->role];
    }

    // -------------------------------------------------------------------------
    // Index — pending queue
    // -------------------------------------------------------------------------

    public function index(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign, $myRole] = $this->assignContext($request->user(), $workspace);

        // Base query with geography joins
        $query = DB::table('workspace_agents as wa')
            ->leftJoin('wards as w',           'w.id',  '=', 'wa.ward_id')
            ->leftJoin('constituencies as co',  'co.id', '=', 'wa.constituency_id')
            ->leftJoin('counties as cu',        'cu.id', '=', 'wa.county_id')
            ->leftJoin('polling_stations as ps', 'ps.id', '=', 'wa.station_id')
            ->leftJoin('polling_centres as psc', 'psc.id', '=', 'ps.polling_centre_id')
            ->where('wa.workspace_id', $id)
            ->where('wa.status', 'pending')
            ->select([
                'wa.id', 'wa.first_name', 'wa.last_name',
                'wa.national_id', 'wa.phone', 'wa.age', 'wa.email',
                'wa.role', 'wa.source', 'wa.phone_verified', 'wa.created_at',
                'wa.ward_id',           'w.name  as ward_name',
                'wa.constituency_id',   'co.name as constituency_name',
                'wa.county_id',         'cu.name as county_name',
                'wa.station_id',        'psc.name as station_name',
            ]);

        // Geo-scope for tier officers
        $tier = $this->tierRecord($request, $id);
        if ($tier && ! in_array($myRole, ['aspirant', 'campaign_manager'], true)) {
            // Ward-scoped workspace (MCA): constituency officers see only the workspace ward.
            if ($workspace->scope === 'ward' && $workspace->ward_id) {
                $query->where('wa.ward_id', $workspace->ward_id);
            } else {
                $this->applyAgentGeoScope($query, $tier, 'wa');
            }
        }

        // Filters
        if ($request->filled('role')) {
            $query->where('wa.role', $request->input('role'));
        }
        if ($request->filled('ward_id')) {
            $query->where('wa.ward_id', $request->input('ward_id'));
        }
        if ($request->filled('search')) {
            $term = '%' . $request->input('search') . '%';
            $query->where(function ($q) use ($term) {
                $q->where('wa.first_name', 'ilike', $term)
                  ->orWhere('wa.last_name',  'ilike', $term);
            });
        }

        $total    = $query->count();
        $perPage  = min(50, max(5, (int) $request->input('per_page', 20)));
        $page     = max(1, (int) $request->input('page', 1));
        $rows     = (clone $query)->orderBy('wa.created_at')->skip(($page - 1) * $perPage)->take($perPage)->get();

        // Duplicate detection against all non-rejected agents in workspace
        $dups = $this->detectDuplicates($id, $rows);

        // Map of station_id → occupant name (approved agents already placed)
        $stationOccupants = DB::table('workspace_agents')
            ->where('workspace_id', $id)
            ->where('status', 'approved')
            ->whereNotNull('station_id')
            ->select('station_id', DB::raw("TRIM(first_name || ' ' || last_name) AS occupant_name"))
            ->get()
            ->pluck('occupant_name', 'station_id');

        // Ward list for filter dropdown (wards that have pending agents)
        $wards = DB::table('workspace_agents as wa')
            ->join('wards as w', 'w.id', '=', 'wa.ward_id')
            ->where('wa.workspace_id', $id)
            ->where('wa.status', 'pending')
            ->select('w.id as ward_id', 'w.name as ward_name')
            ->distinct()
            ->orderBy('w.name')
            ->get()
            ->map(fn ($r) => ['id' => $r->ward_id, 'name' => $r->ward_name]);

        $agents = $rows->map(fn ($r) => $this->presentAgent($r, $dups[$r->id] ?? null, $stationOccupants));

        // can_invite: tier officers with the invite permission granted
        $canInvite = false;
        if ($myRole && ! in_array($myRole, ['aspirant', 'campaign_manager'], true)) {
            $agentRecord = WorkspaceAgent::where('workspace_id', $workspace->id)
                ->where('user_id', $request->user()->id)
                ->where('status', 'approved')
                ->whereNotIn('role', ['agent', 'volunteer'])
                ->first();
            if ($agentRecord) {
                $canInvite = WorkspaceAgentPermission::where('workspace_id', $workspace->id)
                    ->where('grantee_role', $agentRecord->role)
                    ->where('permission', 'invite')
                    ->exists();
            }
        } elseif (in_array($myRole, ['aspirant', 'campaign_manager'], true)) {
            $canInvite = true;
        }

        return response()->json([
            'agents'     => $agents,
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $perPage,
            'wards'      => $wards,
            'can_assign' => $canAssign,
            'can_invite' => $canInvite,
            'my_role'    => $myRole,
            'metrics'    => $this->buildMetrics($id, $workspace, $tier),
        ]);
    }

    // -------------------------------------------------------------------------
    // Approve
    // -------------------------------------------------------------------------

    public function approve(Request $request, string $id, string $agentId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403, 'You do not have permission to approve agents in this workspace.');

        $agent = WorkspaceAgent::where('workspace_id', $id)->where('status', 'pending')->findOrFail($agentId);

        // Can't approve if blocked
        if (! $agent->phone_verified) {
            return response()->json(['error' => 'Phone must be verified before approving.'], 422);
        }
        if ($this->hasDuplicate($id, $agent)) {
            return response()->json(['error' => 'Duplicate record — resolve before approving.'], 422);
        }

        $data = $request->validate([
            'station_id' => ['nullable', 'string'], // UUID or null (bench)
        ]);

        $stationId = null;
        if (! empty($data['station_id']) && $data['station_id'] !== 'bench') {
            // Validate the station (stream) belongs to the agent's ward via its centre
            $valid = DB::table('polling_stations as ps')
                ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
                ->where('ps.id', $data['station_id'])
                ->where('pc.ward_id', $agent->ward_id)
                ->exists();
            if (! $valid) {
                return response()->json(['error' => 'Station not found in this ward.'], 422);
            }
            $stationId = $data['station_id'];
        }

        $agent->update([
            'status'              => 'approved',
            'station_id'          => $stationId,
            'approved_by_user_id' => $request->user()->id,
            'approved_at'         => now(),
        ]);

        AuditService::log($request, 'agent.approved', $id,
            'WorkspaceAgent', $agent->id,
            trim($agent->first_name . ' ' . $agent->last_name),
            ['role' => $agent->role, 'station_id' => $stationId],
            $agent->ward_id, $agent->constituency_id, $agent->county_id,
        );

        return response()->json(['agent' => $this->presentApprovedAgent($agent)]);
    }

    // -------------------------------------------------------------------------
    // Reject
    // -------------------------------------------------------------------------

    public function reject(Request $request, string $id, string $agentId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403, 'You do not have permission to reject agents in this workspace.');

        $agent = WorkspaceAgent::where('workspace_id', $id)->where('status', 'pending')->findOrFail($agentId);

        $data = $request->validate([
            'reason' => ['required', 'string', 'min:5', 'max:500'],
        ]);

        $agent->update([
            'status'              => 'rejected',
            'rejection_reason'    => $data['reason'],
            'rejected_by_user_id' => $request->user()->id,
            'rejected_at'         => now(),
        ]);

        AuditService::log($request, 'agent.rejected', $id,
            'WorkspaceAgent', $agent->id,
            trim($agent->first_name . ' ' . $agent->last_name),
            ['reason' => $data['reason'], 'role' => $agent->role],
            $agent->ward_id, $agent->constituency_id, $agent->county_id,
        );

        return response()->json(['agent' => $this->presentApprovedAgent($agent)]);
    }

    // -------------------------------------------------------------------------
    // Bulk approve
    // -------------------------------------------------------------------------

    public function bulkApprove(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403);

        $data = $request->validate(['ids' => ['required', 'array', 'min:1', 'max:50'], 'ids.*' => ['uuid']]);

        $agents = WorkspaceAgent::where('workspace_id', $id)
            ->where('status', 'pending')
            ->whereIn('id', $data['ids'])
            ->get();

        $approved = 0;
        $skipped  = 0;
        $now      = now();
        $userId   = $request->user()->id;

        foreach ($agents as $agent) {
            if (! $agent->phone_verified || $this->hasDuplicate($id, $agent)) {
                $skipped++;
                continue;
            }
            $agent->update([
                'status'              => 'approved',
                'approved_by_user_id' => $userId,
                'approved_at'         => $now,
            ]);
            $approved++;
        }

        AuditService::log($request, 'agent.bulk_approved', $id,
            null, null, null,
            ['count' => $approved, 'skipped' => $skipped],
        );

        return response()->json(['approved' => $approved, 'skipped' => $skipped]);
    }

    // -------------------------------------------------------------------------
    // Station list for assign modal
    // -------------------------------------------------------------------------

    public function agentStations(Request $request, string $id, string $agentId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403);

        $agent = WorkspaceAgent::where('workspace_id', $id)->findOrFail($agentId);

        if (! $agent->ward_id) {
            return response()->json(['ward' => null, 'stations' => [], 'totals' => null]);
        }

        $ward = DB::table('wards')->where('id', $agent->ward_id)->select('id', 'name')->first();

        // Approved agents keyed by station_id (first one per station)
        $occupants = DB::table('workspace_agents')
            ->where('workspace_id', $id)
            ->where('status', 'approved')
            ->whereNotNull('station_id')
            ->select('id', 'station_id', 'first_name', 'last_name')
            ->get()
            ->groupBy('station_id')
            ->map(fn ($group) => $group->first());

        $stations = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('pc.ward_id', $agent->ward_id)
            ->select('ps.id', 'pc.name', 'ps.iebc_code as code', 'ps.registered_voters',
                     'ps.stream_number', 'pc.code as centre_code')
            ->orderBy('pc.code')
            ->orderBy('ps.stream_number')
            ->get()
            ->map(function ($s) use ($occupants) {
                $occ = $occupants[$s->id] ?? null;
                return [
                    'id'                => $s->id,
                    'name'              => $s->name,
                    'code'              => $s->code,
                    'registered_voters' => $s->registered_voters,
                    'coverage'          => $occ ? 'full' : 'gap',
                    'approved_count'    => $occ ? 1 : 0,
                    'occupant'          => $occ ? ['id' => $occ->id, 'name' => trim($occ->first_name . ' ' . $occ->last_name)] : null,
                ];
            });

        $total   = $stations->count();
        $covered = $stations->where('coverage', 'full')->count();

        return response()->json([
            'ward'     => $ward ? ['id' => $ward->id, 'name' => $ward->name] : null,
            'stations' => $stations->values(),
            'totals'   => ['total' => $total, 'covered' => $covered, 'gap' => $total - $covered],
        ]);
    }

    // -------------------------------------------------------------------------
    // Assigned agents — ward coverage view
    // -------------------------------------------------------------------------

    public function assignedWards(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign, $myRole] = $this->assignContext($request->user(), $workspace);
        $tier = $this->tierRecord($request, $id);

        $wardsQuery = DB::table('wards as w')->select('w.id', 'w.name');
        $this->applyWardScope($wardsQuery, $workspace, $tier);
        $wards = $wardsQuery->orderBy('w.name')->get();
        $wardIds = $wards->pluck('id');

        $assignedCounts = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('status', 'approved')
            ->where('role', 'agent')->whereNotNull('station_id')
            ->whereIn('ward_id', $wardIds)
            ->selectRaw('ward_id, COUNT(*) as cnt')->groupBy('ward_id')
            ->pluck('cnt', 'ward_id');

        $pendingCounts = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('status', 'pending')
            ->where('role', 'agent')->whereNotNull('station_id')
            ->whereIn('ward_id', $wardIds)
            ->selectRaw('ward_id, COUNT(*) as cnt')->groupBy('ward_id')
            ->pluck('cnt', 'ward_id');

        $benchCounts = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('status', 'approved')
            ->where('role', 'agent')->whereNull('station_id')
            ->whereIn('ward_id', $wardIds)
            ->selectRaw('ward_id, COUNT(*) as cnt')->groupBy('ward_id')
            ->pluck('cnt', 'ward_id');

        $stationCounts = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->whereIn('pc.ward_id', $wardIds)
            ->selectRaw('pc.ward_id, COUNT(ps.id) as cnt')->groupBy('pc.ward_id')
            ->pluck('cnt', 'ward_id');

        $pendingQuery = DB::table('workspace_agents as wa')
            ->where('wa.workspace_id', $id)->where('wa.status', 'pending');
        if ($tier) {
            if ($workspace->scope === 'ward' && $workspace->ward_id) {
                $pendingQuery->where('wa.ward_id', $workspace->ward_id);
            } else {
                $this->applyAgentGeoScope($pendingQuery, $tier, 'wa');
            }
        }
        $pendingCount = $pendingQuery->count();

        $result = $wards->map(fn ($w) => [
            'id'             => $w->id,
            'name'           => $w->name,
            'total_stations' => (int) ($stationCounts[$w->id] ?? 0),
            'assigned_count' => (int) ($assignedCounts[$w->id] ?? 0),
            'pending_count'  => (int) ($pendingCounts[$w->id] ?? 0),
            'bench_count'    => (int) ($benchCounts[$w->id] ?? 0),
        ]);

        return response()->json([
            'wards'         => $result,
            'my_role'       => $myRole,
            'can_assign'    => $canAssign,
            'pending_count' => $pendingCount,
        ]);
    }

    public function assignedWard(Request $request, string $id, string $wardId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        $tier = $this->tierRecord($request, $id);

        $ward = DB::table('wards')->where('id', $wardId)->first();
        if (! $ward) abort(404);

        // Validate the ward is within the viewer's scope
        if ($tier) {
            // Ward-scoped workspace (MCA): only the workspace's own ward is accessible.
            if ($workspace->scope === 'ward') {
                if ($wardId !== $workspace->ward_id) abort(403);
            } else {
                if ($tier->role === 'ward' && $tier->ward_id !== $wardId) abort(403);
                if ($tier->role === 'constituency' && $ward->constituency_id !== $tier->constituency_id) abort(403);
                if ($tier->role === 'county') {
                    $inCounty = DB::table('constituencies')
                        ->where('id', $ward->constituency_id)
                        ->where('county_id', $tier->county_id)
                        ->exists();
                    if (! $inCounty) abort(403);
                }
            }
        }

        $stations = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('pc.ward_id', $wardId)
            ->orderBy('pc.code')
            ->orderBy('ps.stream_number')
            ->get(['ps.id', 'ps.iebc_code as code', 'pc.name', 'ps.stream_number',
                   'ps.registered_voters', 'pc.code as centre_code']);

        $approvedAgents = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('ward_id', $wardId)
            ->where('status', 'approved')->where('role', 'agent')
            ->whereNotNull('station_id')
            ->get(['id', 'station_id', 'first_name', 'last_name', 'phone'])
            ->keyBy('station_id');

        $pendingAgents = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('ward_id', $wardId)
            ->where('status', 'pending')->where('role', 'agent')
            ->whereNotNull('station_id')
            ->get(['id', 'station_id', 'first_name', 'last_name', 'phone'])
            ->keyBy('station_id');

        $stationList = $stations->map(function ($s) use ($approvedAgents, $pendingAgents) {
            $a = $approvedAgents[$s->id] ?? null;
            $p = $pendingAgents[$s->id] ?? null;
            $state = $a ? 'assigned' : ($p ? 'pending' : 'gap');
            $src   = $a ?? $p;
            return [
                'id'                => $s->id,
                'code'              => $s->code,
                'name'              => $s->name,
                'registered_voters' => $s->registered_voters,
                'state'             => $state,
                'agent'             => $src ? [
                    'id'           => $src->id,
                    'name'         => "{$src->first_name} {$src->last_name}",
                    'phone_masked' => $this->maskPhone($src->phone),
                ] : null,
            ];
        });

        $bench = DB::table('workspace_agents')
            ->where('workspace_id', $id)->where('ward_id', $wardId)
            ->where('status', 'approved')->where('role', 'agent')
            ->whereNull('station_id')
            ->orderBy('approved_at')
            ->get(['id', 'first_name', 'last_name', 'phone', 'approved_at'])
            ->map(fn ($a) => [
                'id'           => $a->id,
                'name'         => "{$a->first_name} {$a->last_name}",
                'initials'     => strtoupper(substr($a->first_name, 0, 1) . substr($a->last_name, 0, 1)),
                'phone_masked' => $this->maskPhone($a->phone),
                'approved_at'  => $a->approved_at,
            ]);

        return response()->json([
            'ward'       => ['id' => $ward->id, 'name' => $ward->name],
            'stations'   => $stationList->values(),
            'bench'      => $bench->values(),
            'can_assign' => $canAssign,
        ]);
    }

    public function deployAgent(Request $request, string $id, string $agentId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403);

        $data = $request->validate(['station_id' => ['required', 'string']]);

        $agent = WorkspaceAgent::where('workspace_id', $id)
            ->where('status', 'approved')->where('role', 'agent')
            ->whereNull('station_id')->findOrFail($agentId);

        $valid = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('ps.id', $data['station_id'])
            ->where('pc.ward_id', $agent->ward_id)
            ->exists();
        if (! $valid) return response()->json(['error' => 'Station not in this agent\'s ward.'], 422);

        $agent->update(['station_id' => $data['station_id']]);

        AuditService::log($request, 'agent.deployed', $id,
            'WorkspaceAgent', $agent->id,
            trim($agent->first_name . ' ' . $agent->last_name),
            ['station_id' => $data['station_id']],
            $agent->ward_id, $agent->constituency_id, $agent->county_id,
        );

        return response()->json(['ok' => true, 'agent_id' => $agent->id, 'station_id' => $agent->station_id]);
    }

    public function reassignAgent(Request $request, string $id, string $agentId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        [$canAssign] = $this->assignContext($request->user(), $workspace);
        if (! $canAssign) abort(403);

        $data = $request->validate([
            'station_id' => ['nullable', 'string'], // null = move to bench
        ]);

        $agent = WorkspaceAgent::where('workspace_id', $id)
            ->where('status', 'approved')->where('role', 'agent')
            ->findOrFail($agentId);

        $stationId = null;
        if (! empty($data['station_id']) && $data['station_id'] !== 'bench') {
            $valid = DB::table('polling_stations as ps')
                ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
                ->where('ps.id', $data['station_id'])
                ->where('pc.ward_id', $agent->ward_id)
                ->exists();
            if (! $valid) return response()->json(['error' => 'Station not in this agent\'s ward.'], 422);
            $stationId = $data['station_id'];
        }

        $agent->update(['station_id' => $stationId]);

        AuditService::log($request, 'agent.reassigned', $id,
            'WorkspaceAgent', $agent->id,
            trim($agent->first_name . ' ' . $agent->last_name),
            ['station_id' => $stationId],
            $agent->ward_id, $agent->constituency_id, $agent->county_id,
        );

        return response()->json(['ok' => true, 'agent_id' => $agent->id, 'station_id' => $stationId]);
    }

    /**
     * Scope an agent query to the tier officer's geographic area,
     * filtering via ward_id (joined through ward → constituency) so it works
     * even when the denormalised county_id / constituency_id columns are null.
     */
    private function applyAgentGeoScope($query, WorkspaceAgent $tier, string $alias = 'wa'): void
    {
        match ($tier->role) {
            'ward' => $tier->ward_id
                ? $query->where("{$alias}.ward_id", $tier->ward_id)
                : null,
            'constituency' => $tier->constituency_id
                ? $query->whereIn("{$alias}.ward_id", function ($q) use ($tier) {
                    $q->select('id')->from('wards')->where('constituency_id', $tier->constituency_id);
                })
                : null,
            'county' => $tier->county_id
                ? $query->whereIn("{$alias}.ward_id", function ($q) use ($tier) {
                    $q->select('w.id')->from('wards as w')
                      ->join('constituencies as co', 'co.id', '=', 'w.constituency_id')
                      ->where('co.county_id', $tier->county_id);
                })
                : null,
            default => null,
        };
    }

    private function applyWardScope($query, Workspace $workspace, ?WorkspaceAgent $tier): void
    {
        match ($workspace->scope) {
            'ward'         => $workspace->ward_id
                ? $query->where('w.id', $workspace->ward_id) : null,
            'constituency' => $workspace->constituency_id
                ? $query->where('w.constituency_id', $workspace->constituency_id) : null,
            'county'       => $workspace->county_id
                ? $query->whereIn('w.constituency_id', function ($q) use ($workspace) {
                    $q->select('id')->from('constituencies')->where('county_id', $workspace->county_id);
                }) : null,
            default => null,
        };

        if (! $tier) return;

        // Ward-scoped workspace (MCA): all tier officers see only the workspace's ward.
        if ($workspace->scope === 'ward' && $workspace->ward_id) {
            $query->where('w.id', $workspace->ward_id);
            return;
        }

        match ($tier->role) {
            'ward'         => $tier->ward_id
                ? $query->where('w.id', $tier->ward_id) : null,
            'constituency' => $tier->constituency_id
                ? $query->where('w.constituency_id', $tier->constituency_id) : null,
            'county'       => $tier->county_id
                ? $query->whereIn('w.constituency_id', function ($q) use ($tier) {
                    $q->select('id')->from('constituencies')->where('county_id', $tier->county_id);
                }) : null,
            default => null,
        };
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private function presentAgent(object $r, ?array $dup, $stationOccupants = null): array
    {
        $waitDays = (int) now()->diffInDays($r->created_at);
        return [
            'id'                  => $r->id,
            'name'                => trim("{$r->first_name} {$r->last_name}"),
            'first_name'          => $r->first_name,
            'last_name'           => $r->last_name,
            'national_id'         => $r->national_id ? $this->maskNationalId($r->national_id) : null,
            'phone_masked'        => $this->maskPhone($r->phone),
            'role'                => $r->role,
            'role_label'          => SeatRoles::roleLabel($r->role),
            'ward_id'             => $r->ward_id,
            'ward_name'           => $r->ward_name,
            'constituency_name'   => $r->constituency_name,
            'county_name'         => $r->county_name,
            'station_id'          => $r->station_id,
            'station_name'        => $r->station_name,
            'station_occupied_by' => ($r->station_id && $stationOccupants)
                                     ? ($stationOccupants[$r->station_id] ?? null)
                                     : null,
            'source'              => $r->source === 'targeted_invite' ? 'Targeted invite' : 'Public link',
            'phone_verified'      => (bool) $r->phone_verified,
            'duplicate'           => $dup,
            'age'                 => $r->age,
            'email'               => $r->email,
            'wait_days'           => $waitDays,
            'created_at'          => $r->created_at,
        ];
    }

    private function presentApprovedAgent(WorkspaceAgent $a): array
    {
        return [
            'id'     => $a->id,
            'status' => $a->status,
            'role'   => $a->role,
        ];
    }

    private function detectDuplicates(string $workspaceId, $rows): array
    {
        if ($rows->isEmpty()) return [];

        // All non-rejected agents in workspace (id → national_id + phone + name)
        $all = DB::table('workspace_agents')
            ->where('workspace_id', $workspaceId)
            ->whereIn('status', ['pending', 'approved'])
            ->select('id', 'national_id', 'phone', 'first_name', 'last_name')
            ->get();

        $byNid   = $all->whereNotNull('national_id')->groupBy('national_id');
        $byPhone = $all->groupBy('phone');

        $result = [];
        foreach ($rows as $r) {
            $dup = null;

            if ($r->national_id) {
                $bucket = $byNid->get($r->national_id);
                if ($bucket && $bucket->count() > 1) {
                    $other = $bucket->first(fn ($x) => $x->id !== $r->id);
                    if ($other) {
                        $dup = ['type' => 'id', 'with' => "{$other->first_name} {$other->last_name}"];
                    }
                }
            }

            if (! $dup) {
                $bucket = $byPhone->get($r->phone);
                if ($bucket && $bucket->count() > 1) {
                    $other = $bucket->first(fn ($x) => $x->id !== $r->id);
                    if ($other) {
                        $dup = ['type' => 'phone', 'with' => "{$other->first_name} {$other->last_name}"];
                    }
                }
            }

            $result[$r->id] = $dup;
        }
        return $result;
    }

    private function hasDuplicate(string $workspaceId, WorkspaceAgent $agent): bool
    {
        $q = DB::table('workspace_agents')
            ->where('workspace_id', $workspaceId)
            ->whereIn('status', ['pending', 'approved'])
            ->where('id', '!=', $agent->id);

        return $q->clone()->where('phone', $agent->phone)->exists()
            || ($agent->national_id && $q->clone()->where('national_id', $agent->national_id)->exists());
    }

    private function buildMetrics(string $workspaceId, ?Workspace $workspace = null, ?WorkspaceAgent $tier = null): array
    {
        $base = DB::table('workspace_agents as wa')
            ->where('wa.workspace_id', $workspaceId);

        // Apply the same geo-scope used by the list query so metrics match what the user sees
        if ($tier && $workspace) {
            if ($workspace->scope === 'ward' && $workspace->ward_id) {
                $base->where('wa.ward_id', $workspace->ward_id);
            } else {
                $this->applyAgentGeoScope($base, $tier, 'wa');
            }
        }

        $pending = (clone $base)->where('wa.status', 'pending')->count();

        $over5 = (clone $base)
            ->where('wa.status', 'pending')
            ->where('wa.created_at', '<=', now()->subDays(5))
            ->count();

        $approvedToday = (clone $base)
            ->where('wa.status', 'approved')
            ->whereDate('wa.approved_at', today())
            ->count();

        $allPending = (clone $base)
            ->where('wa.status', 'pending')
            ->select('wa.id', 'wa.national_id', 'wa.phone')
            ->get();

        $dups = $this->detectDuplicates($workspaceId, $allPending);
        $dupCount = count(array_filter($dups));

        return [
            'pending'        => $pending,
            'over_5_days'    => $over5,
            'duplicates'     => $dupCount,
            'approved_today' => $approvedToday,
        ];
    }

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            $local = substr($digits, 3); // 9 digits: 7XXXXXXXX
            return '+254 ' . $local[0] . substr($local, 1, 2) . ' xxx ' . substr($local, -3);
        }
        return $phone;
    }

    private function maskNationalId(string $id): string
    {
        if (strlen($id) <= 5) return $id;
        return substr($id, 0, 4) . ' xxxx ' . substr($id, -2);
    }
}

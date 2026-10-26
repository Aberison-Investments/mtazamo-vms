<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceAgentPermission;
use App\Support\SeatRoles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TierOfficerController extends Controller
{
    public function context(Request $request, string $workspaceId): JsonResponse
    {
        $user = $request->user();
        $workspace = Workspace::find($workspaceId);
        if (! $workspace) abort(404);

        $record = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->first();

        if (! $record) abort(403, 'Not an active tier officer in this workspace.');

        $canInvite = WorkspaceAgentPermission::where('workspace_id', $workspaceId)
            ->where('grantee_role', $record->role)
            ->where('permission', 'invite')
            ->exists();

        $canAssign = WorkspaceAgentPermission::where('workspace_id', $workspaceId)
            ->where('grantee_role', $record->role)
            ->where('permission', 'assign')
            ->exists();

        $geoScope = $this->resolveGeoScope($workspace, $record);

        $appointedBy = null;
        if ($record->approved_by_user_id) {
            $appointer = DB::table('users')
                ->where('id', $record->approved_by_user_id)
                ->select('first_name', 'last_name')
                ->first();
            if ($appointer) {
                $appointedBy = [
                    'name' => "{$appointer->first_name} {$appointer->last_name}",
                    'at'   => $record->approved_at?->toDateString(),
                ];
            }
        }

        // Roles below this tier in the seat chain (excluding volunteer)
        $chain = SeatRoles::rolesForSeat($workspace->seat);
        $myPos = array_search($record->role, $chain, true);
        $rolesBelow = $myPos !== false ? array_slice($chain, $myPos + 1) : [];
        $rolesBelow = array_values(array_filter($rolesBelow, fn ($r) => $r !== 'volunteer'));
        $rolesBelowData = array_map(fn ($r) => [
            'id'    => $r,
            'label' => SeatRoles::roleLabel($r),
            'blurb' => SeatRoles::roleBlurb($r, $workspace->seat),
        ], $rolesBelow);

        $metrics = $this->buildMetrics($workspace, $record);
        // Ward-scoped workspaces (MCA): constituency officers behave like ward admins — no ward list.
        $wards = $record->role === 'constituency'
            && $record->constituency_id
            && $workspace->scope !== 'ward'
            ? $this->buildWardsList($workspace, $record->constituency_id)
            : [];

        return response()->json([
            'role'            => $record->role,
            'role_label'      => SeatRoles::roleLabel($record->role),
            'geo_scope'       => $geoScope,
            'constituency_id' => $record->constituency_id,
            'ward_id'         => $record->ward_id,
            'county_id'       => $record->county_id,
            'can_invite'      => $canInvite,
            'can_assign'      => $canAssign,
            'appointed_by'    => $appointedBy,
            'roles_below'     => $rolesBelowData,
            'wards'           => $wards,
            'metrics'         => $metrics,
            'workspace'       => [
                'id'            => $workspace->id,
                'name'          => $workspace->name,
                'seat'          => $workspace->seat,
                'year'          => $workspace->year,
                'election_date' => $workspace->election_date?->toDateString(),
            ],
        ]);
    }

    // -------------------------------------------------------------------------

    private function resolveGeoScope(Workspace $workspace, WorkspaceAgent $record): ?string
    {
        // Ward-scoped workspace (MCA): all tier officers are scoped to the single ward.
        if ($workspace->scope === 'ward' && $workspace->ward_id) {
            return $workspace->ward
                ?? DB::table('wards')->where('id', $workspace->ward_id)->value('name');
        }

        return match ($record->role) {
            'constituency' => $record->constituency_id
                ? DB::table('constituencies')->where('id', $record->constituency_id)->value('name')
                : null,
            'ward' => $record->ward_id
                ? DB::table('wards')->where('id', $record->ward_id)->value('name')
                : null,
            'county' => $record->county_id
                ? DB::table('counties')->where('id', $record->county_id)->value('name')
                : null,
            'national' => 'National',
            default    => null,
        };
    }

    private function buildMetrics(Workspace $workspace, WorkspaceAgent $record): array
    {
        // Polling stations in scope
        $stQ = DB::table('polling_stations as ps')
            ->join('wards as w', 'w.id', '=', 'ps.ward_id');
        $this->applyGeoFilter($stQ, $workspace, $record, 'ps', 'w');
        $totalStations = $stQ->count();

        // Covered stations (≥1 approved agent assigned)
        $covQ = DB::table('workspace_agents as wa')
            ->join('polling_stations as ps', 'ps.id', '=', 'wa.station_id')
            ->join('wards as w', 'w.id', '=', 'ps.ward_id')
            ->where('wa.workspace_id', $workspace->id)
            ->where('wa.status', 'approved')
            ->whereNotNull('wa.station_id');
        $this->applyGeoFilter($covQ, $workspace, $record, 'ps', 'w');
        $coveredStations = $covQ->distinct('wa.station_id')->count('wa.station_id');

        // Pending applications in scope
        $pendQ = DB::table('workspace_agents as wa')
            ->leftJoin('wards as w', 'w.id', '=', 'wa.ward_id')
            ->where('wa.workspace_id', $workspace->id)
            ->where('wa.status', 'pending');
        $this->applyGeoFilter($pendQ, $workspace, $record, 'wa', 'w');
        $pendingApplications = $pendQ->count();

        // Ward officers — not meaningful for ward-scoped workspaces (MCA)
        $wardOfficersFilled = 0;
        $wardOfficersTotal  = 0;
        if ($record->role === 'constituency' && $record->constituency_id && $workspace->scope !== 'ward') {
            $wardIds = DB::table('wards')
                ->where('constituency_id', $record->constituency_id)
                ->pluck('id');
            $wardOfficersTotal  = $wardIds->count();
            $wardOfficersFilled = WorkspaceAgent::where('workspace_id', $workspace->id)
                ->where('role', 'ward')
                ->where('status', 'approved')
                ->whereIn('ward_id', $wardIds)
                ->distinct('ward_id')
                ->count('ward_id');
        }

        // Volunteers in scope
        $volQ = DB::table('workspace_agents as wa')
            ->leftJoin('wards as w', 'w.id', '=', 'wa.ward_id')
            ->where('wa.workspace_id', $workspace->id)
            ->where('wa.role', 'volunteer')
            ->where('wa.status', 'approved');
        $this->applyGeoFilter($volQ, $workspace, $record, 'wa', 'w');
        $volunteers = $volQ->count();

        return [
            'total_stations'       => $totalStations,
            'covered_stations'     => $coveredStations,
            'pending_applications' => $pendingApplications,
            'ward_officers_filled' => $wardOfficersFilled,
            'ward_officers_total'  => $wardOfficersTotal,
            'volunteers'           => $volunteers,
        ];
    }

    private function applyGeoFilter(\Illuminate\Database\Query\Builder $q, Workspace $workspace, WorkspaceAgent $record, string $psAlias, string $wAlias): void
    {
        // Ward-scoped workspace (MCA): all tier officers are limited to that one ward.
        if ($workspace->scope === 'ward' && $workspace->ward_id) {
            $q->where("{$psAlias}.ward_id", $workspace->ward_id);
            return;
        }

        match ($record->role) {
            'constituency' => $record->constituency_id && $q->where("{$wAlias}.constituency_id", $record->constituency_id),
            'ward'         => $record->ward_id && $q->where("{$psAlias}.ward_id", $record->ward_id),
            'county'       => $record->county_id && $q->where("{$wAlias}.county_id", $record->county_id),
            default        => null,
        };
    }

    private function buildWardsList(Workspace $workspace, string $constituencyId): array
    {
        $wards = DB::table('wards')
            ->where('constituency_id', $constituencyId)
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        $wardIds = $wards->pluck('id');

        $officers = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', 'ward')
            ->where('status', 'approved')
            ->whereIn('ward_id', $wardIds)
            ->select('ward_id', 'first_name', 'last_name')
            ->get()
            ->groupBy('ward_id');

        $pendingInvites = DB::table('agent_invites')
            ->where('workspace_id', $workspace->id)
            ->where('role', 'ward')
            ->where('status', 'pending')
            ->whereIn('ward_id', $wardIds)
            ->select('ward_id', 'name')
            ->get()
            ->groupBy('ward_id');

        return $wards->map(function ($ward) use ($officers, $pendingInvites) {
            $confirmed = $officers->get($ward->id, collect());
            $invited   = $pendingInvites->get($ward->id, collect());

            if ($confirmed->count() > 0) {
                $o = $confirmed->first();
                return ['id' => $ward->id, 'name' => $ward->name, 'person' => "{$o->first_name} {$o->last_name}", 'state' => 'confirmed'];
            }
            if ($invited->count() > 0) {
                return ['id' => $ward->id, 'name' => $ward->name, 'person' => $invited->first()->name . ' (invited)', 'state' => 'pending'];
            }
            return ['id' => $ward->id, 'name' => $ward->name, 'person' => null, 'state' => 'open'];
        })->values()->toArray();
    }
}

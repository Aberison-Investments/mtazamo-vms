<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Election workspaces owned by the authenticated aspirant. One workspace per
 * election; the seat determines the geography scope and therefore how deep the
 * geography selection goes:
 *   president  → national   (no geography selection)
 *   governor   → county
 *   senator    → county
 *   mp         → constituency (county + constituency)
 *   mca        → ward         (county + constituency + ward)
 */
class WorkspaceController extends Controller
{
    private const SEGMENTS = ['primary', 'general'];

    /** Seat → geography scope. */
    private const SEAT_SCOPE = [
        'president' => 'national',
        'governor' => 'county',
        'senator' => 'county',
        'mp' => 'constituency',
        'mca' => 'ward',
    ];

    /** Geography levels required, ordered, for each scope. */
    private const SCOPE_LEVELS = [
        'national' => [],
        'county' => ['county'],
        'constituency' => ['county', 'constituency'],
        'ward' => ['county', 'constituency', 'ward'],
    ];

    public function index(Request $request): JsonResponse
    {
        $user = $request->user();

        $ownedIds   = $user->workspaces()->pluck('id');
        $managedIds = Workspace::whereHas('managers', fn ($q) => $q->where('user_id', $user->id)->where('status', 'active'))->pluck('id');
        $tierIds    = WorkspaceAgent::where('user_id', $user->id)->where('status', 'approved')->whereNotIn('role', ['agent', 'volunteer'])->pluck('workspace_id');

        $allIds = $ownedIds->merge($managedIds)->merge($tierIds)->unique();

        $workspaces = Workspace::whereIn('id', $allIds)
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Workspace $w) => $this->present($w));

        return response()->json(['workspaces' => $workspaces]);
    }

    public function store(Request $request): JsonResponse
    {
        // Seat is validated first so we know which geography levels to require.
        $request->validate([
            'seat' => ['required', Rule::in(array_keys(self::SEAT_SCOPE))],
        ]);

        $scope = self::SEAT_SCOPE[$request->input('seat')];
        $levels = self::SCOPE_LEVELS[$scope];

        $rules = [
            'name' => ['required', 'string', 'max:255'],
            'seat' => ['required', Rule::in(array_keys(self::SEAT_SCOPE))],
            'segment' => ['required', Rule::in(self::SEGMENTS)],
            'year' => ['required', 'integer', 'min:2013', 'max:2100'],
            'election_date' => ['nullable', 'date'],
            'party' => ['nullable', 'string', 'max:100'],
            'priority_counties' => ['nullable', 'array'],
            'priority_counties.*' => ['string', 'max:100'],
        ];

        // Each geography level is required only when the seat reaches it.
        foreach (['county', 'constituency', 'ward'] as $level) {
            $required = in_array($level, $levels, true);
            $rules[$level] = [$required ? 'required' : 'nullable', 'string', 'max:150'];
            $rules["{$level}_id"] = ['nullable', 'string', 'max:64'];
        }

        $data = $request->validate($rules);

        $national = $scope === 'national';

        $workspace = $request->user()->workspaces()->create([
            'name' => $data['name'],
            'seat' => $data['seat'],
            'segment' => $data['segment'],
            'scope' => $scope,
            // Keep only the levels this scope actually uses.
            'county' => in_array('county', $levels, true) ? ($data['county'] ?? null) : null,
            'county_id' => in_array('county', $levels, true) ? ($data['county_id'] ?? null) : null,
            'constituency' => in_array('constituency', $levels, true) ? ($data['constituency'] ?? null) : null,
            'constituency_id' => in_array('constituency', $levels, true) ? ($data['constituency_id'] ?? null) : null,
            'ward' => in_array('ward', $levels, true) ? ($data['ward'] ?? null) : null,
            'ward_id' => in_array('ward', $levels, true) ? ($data['ward_id'] ?? null) : null,
            'priority_counties' => $national ? ($data['priority_counties'] ?? []) : null,
            'year' => $data['year'],
            'election_date' => $data['election_date'] ?? null,
            'party' => $data['party'] ?? null,
            'status' => 'active',
        ]);

        return response()->json(['workspace' => $this->present($workspace)], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $user = $request->user();
        $workspace = Workspace::find($id);
        if (! $workspace) abort(404);

        if ($workspace->user_id === $user->id) {
            return response()->json(['workspace' => $this->present($workspace), 'my_role' => 'aspirant']);
        }

        $isCM = $workspace->managers()->where('user_id', $user->id)->where('status', 'active')->exists();
        if ($isCM) {
            return response()->json(['workspace' => $this->present($workspace), 'my_role' => 'campaign_manager']);
        }

        $tierRecord = WorkspaceAgent::where('workspace_id', $id)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->first();
        if ($tierRecord) {
            return response()->json(['workspace' => $this->present($workspace), 'my_role' => $tierRecord->role]);
        }

        abort(403);
    }

    public function stats(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveReadable($request, $id);

        $pendingApplications = \App\Models\WorkspaceAgent::where('workspace_id', $id)
            ->where('status', 'pending')
            ->count();

        if ($workspace->scope === 'national' || ! $workspace->county_id) {
            return response()->json(['total_stations' => null, 'covered_stations' => null, 'pending_applications' => $pendingApplications, 'top_wards' => []]);
        }

        [$geoField, $geoId] = match ($workspace->scope) {
            'ward' => ['ps.ward_id', $workspace->ward_id],
            'constituency' => ['w.constituency_id', $workspace->constituency_id],
            default => ['w.county_id', $workspace->county_id],
        };

        if (! $geoId) {
            return response()->json(['total_stations' => 0, 'covered_stations' => 0, 'pending_applications' => $pendingApplications, 'top_wards' => []]);
        }

        if ($workspace->scope === 'ward') {
            $total = DB::table('polling_stations as ps')->where('ps.ward_id', $geoId)->count();
            $covered = DB::table('workspace_agents as wa')
                ->join('polling_stations as ps', 'ps.id', '=', 'wa.station_id')
                ->where('wa.workspace_id', $id)
                ->where('wa.status', 'approved')
                ->where('ps.ward_id', $geoId)
                ->distinct('wa.station_id')->count('wa.station_id');
            $ward = DB::table('wards')->select('id', 'name')->where('id', $geoId)->first();
            return response()->json([
                'total_stations'      => $total,
                'covered_stations'    => $covered,
                'pending_applications'=> $pendingApplications,
                'top_wards'           => $ward ? [['id' => $ward->id, 'name' => $ward->name, 'total_stations' => $total]] : [],
            ]);
        }

        $total = DB::table('polling_stations as ps')
            ->join('wards as w', 'w.id', '=', 'ps.ward_id')
            ->where($geoField, $geoId)
            ->count();

        $covered = DB::table('workspace_agents as wa')
            ->join('polling_stations as ps', 'ps.id', '=', 'wa.station_id')
            ->join('wards as w', 'w.id', '=', 'ps.ward_id')
            ->where('wa.workspace_id', $id)
            ->where('wa.status', 'approved')
            ->where($geoField, $geoId)
            ->distinct('wa.station_id')->count('wa.station_id');

        $topWards = DB::table('wards as w')
            ->select('w.id', 'w.name', DB::raw('COUNT(ps.id) as total_stations'))
            ->leftJoin('polling_stations as ps', 'ps.ward_id', '=', 'w.id')
            ->where($geoField, $geoId)
            ->groupBy('w.id', 'w.name')
            ->orderByDesc(DB::raw('COUNT(ps.id)'))
            ->limit(5)
            ->get()
            ->map(fn ($w) => ['id' => $w->id, 'name' => $w->name, 'total_stations' => (int) $w->total_stations]);

        return response()->json([
            'total_stations'       => $total,
            'covered_stations'     => $covered,
            'pending_applications' => $pendingApplications,
            'top_wards'            => $topWards,
        ]);
    }

    private function resolveReadable(Request $request, string $id): Workspace
    {
        $user = $request->user();
        $workspace = Workspace::find($id);
        if (! $workspace) abort(404);

        if ($workspace->user_id === $user->id) return $workspace;

        $isCM = $workspace->managers()->where('user_id', $user->id)->where('status', 'active')->exists();
        if ($isCM) return $workspace;

        abort(403);
    }

    /** @return array<string, mixed> */
    private function present(Workspace $w): array
    {
        return [
            'id' => $w->id,
            'name' => $w->name,
            'seat' => $w->seat,
            'segment' => $w->segment,
            'scope' => $w->scope,
            'county' => $w->county,
            'county_id' => $w->county_id,
            'constituency' => $w->constituency,
            'constituency_id' => $w->constituency_id,
            'ward' => $w->ward,
            'ward_id' => $w->ward_id,
            'priority_counties' => $w->priority_counties ?? [],
            'year' => $w->year,
            'election_date' => $w->election_date?->toDateString(),
            'party' => $w->party,
            'status' => $w->status,
            'created_at' => $w->created_at?->toIso8601String(),
        ];
    }
}

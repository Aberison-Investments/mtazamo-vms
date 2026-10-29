<?php

namespace App\Http\Controllers;

use App\Models\ElectionRun;
use App\Models\StationResult;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceCandidate;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WarRoomController extends Controller
{
    // ---- helpers ---------------------------------------------------------------

    private function resolveRun(string $workspaceId, string $runId): ElectionRun
    {
        return ElectionRun::where('workspace_id', $workspaceId)->findOrFail($runId);
    }

    private function geoScopeFilter(
        \Illuminate\Database\Query\Builder $q,
        string $scope,
        ?string $scopeId,
    ): void {
        match ($scope) {
            'ward'          => $q->where('w.id', $scopeId),
            'constituency'  => $q->where('c.id', $scopeId),
            'county'        => $q->where('co.id', $scopeId),
            default         => null,
        };
    }

    private function stationRows(string $workspaceId, string $runId, string $scope, ?string $scopeId, array $candidates = []): array
    {
        $q = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->join('constituencies as c', 'c.id', '=', 'w.constituency_id')
            ->join('counties as co', 'co.id', '=', 'w.county_id')
            ->leftJoin('station_results as sr', function ($j) use ($workspaceId, $runId) {
                $j->on('sr.station_id', '=', 'ps.id')
                  ->where('sr.workspace_id', $workspaceId)
                  ->where('sr.run_id', $runId);
            })
            ->leftJoin('users as au', 'au.id', '=', 'sr.submitted_by_user_id')
            ->select(
                'ps.id', 'ps.iebc_code as code', 'ps.stream_number', 'ps.registered_voters',
                'pc.name as centre_name', 'pc.code as centre_code',
                'w.id as ward_id', 'w.name as ward_name',
                'c.id as constituency_id', 'c.name as constituency_name',
                'co.id as county_id', 'co.name as county_name',
                'sr.id as result_id', 'sr.votes', 'sr.rejected_ballots',
                'sr.disputed_votes', 'sr.status as result_status',
                'sr.submitted_at', 'sr.reference_code', 'sr.query_note',
                'sr.photo_path',
                'au.name as agent_name', 'au.phone as agent_phone',
            )
            ->orderBy('w.name')
            ->orderBy('ps.iebc_code');

        $this->geoScopeFilter($q, $scope, $scopeId);

        // Build a quick id→name lookup for embedding candidate names in vote rows.
        $candidateNames = collect($candidates)->keyBy('id')
            ->map(fn ($c) => ['name' => $c['name'] ?? $c->name, 'party' => $c['party'] ?? $c->party])
            ->toArray();

        return $q->get()->map(function ($row) use ($candidateNames) {
            $rawVotes = $row->votes ? json_decode($row->votes, true) : [];
            $votes = array_map(function ($v) use ($candidateNames) {
                return [
                    'candidate_id'   => $v['candidate_id'],
                    'candidate_name' => $candidateNames[$v['candidate_id']]['name'] ?? null,
                    'candidate_party'=> $candidateNames[$v['candidate_id']]['party'] ?? null,
                    'votes'          => $v['votes'],
                ];
            }, $rawVotes);
            $totalValid = array_sum(array_column($rawVotes, 'votes'));
            return [
                'id'               => $row->id,
                'code'             => $row->code,
                'stream_number'    => $row->stream_number,
                'name'             => trim($row->centre_name . ($row->stream_number ? ' · S' . $row->stream_number : '')),
                'centre_name'      => $row->centre_name,
                'registered_voters'=> $row->registered_voters,
                'ward_id'          => $row->ward_id,
                'ward_name'        => $row->ward_name,
                'constituency_id'  => $row->constituency_id,
                'constituency_name'=> $row->constituency_name,
                'county_id'        => $row->county_id,
                'county_name'      => $row->county_name,
                'result_id'        => $row->result_id,
                'status'           => $row->result_id ? ($row->result_status ?? 'submitted') : 'pending',
                'votes'            => $votes,
                'total_votes'      => $row->result_id ? $totalValid : null,
                'rejected_ballots' => $row->result_id ? $row->rejected_ballots : null,
                'disputed_votes'   => $row->result_id ? $row->disputed_votes : null,
                'submitted_at'     => $row->submitted_at,
                'reference_code'   => $row->reference_code,
                'query_note'       => $row->query_note,
                'form_image_path'  => $row->photo_path
                    ? \Storage::disk('public')->url($row->photo_path)
                    : null,
                'agent_name'       => $row->agent_name ?? null,
                'agent_phone'      => $row->agent_phone ?? null,
            ];
        })->toArray();
    }

    private function leaderboard(string $workspaceId, string $runId, string $scope, ?string $scopeId, array $candidates): array
    {
        // Aggregate votes from JSONB across all submitted/verified results in scope.
        $subQ = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->join('constituencies as c', 'c.id', '=', 'w.constituency_id')
            ->join('counties as co', 'co.id', '=', 'w.county_id')
            ->join('station_results as sr', function ($j) use ($workspaceId, $runId) {
                $j->on('sr.station_id', '=', 'ps.id')
                  ->where('sr.workspace_id', $workspaceId)
                  ->where('sr.run_id', $runId)
                  ->whereNotIn('sr.status', ['draft']);
            })
            ->select('sr.votes');

        $this->geoScopeFilter($subQ, $scope, $scopeId);

        $allVotes = $subQ->pluck('votes')
            ->flatMap(function ($json) {
                return json_decode($json, true) ?? [];
            });

        $totals = [];
        foreach ($allVotes as $entry) {
            $cid = $entry['candidate_id'];
            $totals[$cid] = ($totals[$cid] ?? 0) + ($entry['votes'] ?? 0);
        }

        $totalValid = array_sum($totals);

        $rows = collect($candidates)->map(function ($c) use ($totals, $totalValid) {
            $id  = is_array($c) ? $c['id']     : $c->id;
            $v   = $totals[$id] ?? 0;
            return [
                'candidate_id' => $id,
                'name'         => is_array($c) ? $c['name']   : $c->name,
                'party'        => is_array($c) ? ($c['party'] ?? '') : ($c->party ?? ''),
                'is_ours'      => (bool) (is_array($c) ? $c['is_ours'] : $c->is_ours),
                'votes'        => $v,
                'pct'          => $totalValid > 0 ? round($v / $totalValid * 100, 1) : 0,
            ];
        })->sortByDesc('votes')->values();

        return $rows->toArray();
    }

    private function coverage(array $stations): array
    {
        $total     = count($stations);
        $reporting = count(array_filter($stations, fn ($s) => $s['status'] !== 'pending'));
        return [
            'total_stations'     => $total,
            'reporting_stations' => $reporting,
            'pct'                => $total > 0 ? round($reporting / $total * 100) : 0,
        ];
    }

    private function countyAggregates(string $workspaceId, string $runId, array $candidates): array
    {
        $rows = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->join('counties as co', 'co.id', '=', 'w.county_id')
            ->leftJoin('station_results as sr', function ($j) use ($workspaceId, $runId) {
                $j->on('sr.station_id', '=', 'ps.id')
                  ->where('sr.workspace_id', $workspaceId)
                  ->where('sr.run_id', $runId)
                  ->whereNotIn('sr.status', ['draft']);
            })
            ->select(
                'co.id as county_id',
                'co.name as county_name',
                DB::raw('COUNT(DISTINCT ps.id) AS total_stations'),
                DB::raw('COUNT(DISTINCT sr.id) AS reporting_stations'),
                DB::raw("jsonb_agg(sr.votes) FILTER (WHERE sr.votes IS NOT NULL) AS all_votes"),
            )
            ->groupBy('co.id', 'co.name')
            ->orderBy('co.name')
            ->get();

        $candidateIds = array_column($candidates, 'id');
        $candidateNames = collect($candidates)->keyBy('id')
            ->map(fn ($c) => ['name' => $c['name'] ?? $c->name, 'party' => $c['party'] ?? $c->party])
            ->toArray();

        return $rows->map(function ($row) use ($candidateIds, $candidateNames) {
            $totals = [];
            if ($row->all_votes) {
                $stationVoteArrays = json_decode($row->all_votes, true) ?? [];
                foreach ($stationVoteArrays as $stationVotes) {
                    if (! is_array($stationVotes)) continue;
                    foreach ($stationVotes as $v) {
                        $cid = $v['candidate_id'] ?? null;
                        if ($cid) $totals[$cid] = ($totals[$cid] ?? 0) + ($v['votes'] ?? 0);
                    }
                }
            }

            $votes = array_map(fn ($cid) => [
                'candidate_id'    => $cid,
                'candidate_name'  => $candidateNames[$cid]['name'] ?? null,
                'candidate_party' => $candidateNames[$cid]['party'] ?? null,
                'votes'           => $totals[$cid] ?? 0,
            ], $candidateIds);

            return [
                'id'                 => $row->county_id,
                'name'               => $row->county_name,
                'total_stations'     => (int) $row->total_stations,
                'reporting_stations' => (int) $row->reporting_stations,
                'votes'              => $votes,
                'total_valid'        => array_sum($totals),
            ];
        })->toArray();
    }

    private function nationalCoverage(string $workspaceId, string $runId): array
    {
        $row = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->leftJoin('station_results as sr', function ($j) use ($workspaceId, $runId) {
                $j->on('sr.station_id', '=', 'ps.id')
                  ->where('sr.workspace_id', $workspaceId)
                  ->where('sr.run_id', $runId)
                  ->whereNotIn('sr.status', ['draft']);
            })
            ->selectRaw('COUNT(DISTINCT ps.id) AS total_stations, COUNT(DISTINCT sr.id) AS reporting_stations')
            ->first();

        $total     = (int) ($row->total_stations ?? 0);
        $reporting = (int) ($row->reporting_stations ?? 0);
        return [
            'total_stations'     => $total,
            'reporting_stations' => $reporting,
            'pct'                => $total > 0 ? round($reporting / $total * 100) : 0,
        ];
    }

    // ---- endpoints -------------------------------------------------------------

    public function summary(Request $request, string $workspaceId): JsonResponse
    {
        $runId   = $request->query('run_id');
        $scope   = $request->query('scope', 'national');
        $scopeId = $request->query('scope_id');

        if (! $runId) {
            // Fall back to the active run.
            $run = ElectionRun::where('workspace_id', $workspaceId)
                ->whereIn('status', ['open', 'tallying'])
                ->first();
            if (! $run) {
                return response()->json(['run' => null, 'stations' => [], 'leaderboard' => [], 'coverage' => null]);
            }
        } else {
            $run = $this->resolveRun($workspaceId, $runId);
        }

        $candidates = WorkspaceCandidate::where('workspace_id', $workspaceId)
            ->orderBy('ballot_order')
            ->get()
            ->toArray();

        $leaderboard = $this->leaderboard($workspaceId, $run->id, $scope, $scopeId, $candidates);

        if ($scope === 'national') {
            $countyRegions = $this->countyAggregates($workspaceId, $run->id, $candidates);
            $coverage      = $this->nationalCoverage($workspaceId, $run->id);
            return response()->json([
                'run'            => ['id' => $run->id, 'name' => $run->name, 'type' => $run->type, 'status' => $run->status],
                'leaderboard'    => $leaderboard,
                'stations'       => [],
                'coverage'       => $coverage,
                'county_regions' => $countyRegions,
            ]);
        }

        $stations = $this->stationRows($workspaceId, $run->id, $scope, $scopeId, $candidates);
        $coverage = $this->coverage($stations);

        return response()->json([
            'run'         => [
                'id'     => $run->id,
                'name'   => $run->name,
                'type'   => $run->type,
                'status' => $run->status,
            ],
            'leaderboard' => $leaderboard,
            'stations'    => $stations,
            'coverage'    => $coverage,
        ]);
    }

    public function verifyResult(Request $request, string $workspaceId, string $runId, string $resultId): JsonResponse
    {
        $this->resolveRun($workspaceId, $runId);

        $result = StationResult::where('workspace_id', $workspaceId)
            ->where('run_id', $runId)
            ->findOrFail($resultId);

        if ($result->status === 'verified') {
            return response()->json(['result' => ['id' => $result->id, 'status' => 'verified']]);
        }

        // Ward admin can only verify if the station is in their ward.
        $user  = $request->user();
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('role', 'ward')
            ->where('status', 'approved')
            ->first();

        // Also allow CM / aspirant.
        $isCMOrAspirant = $this->isCMOrAspirant($user, $workspaceId);

        if (! $agent && ! $isCMOrAspirant) {
            abort(403, 'Only a ward admin or campaign manager can verify results.');
        }

        if ($agent) {
            $stationWard = DB::table('polling_stations as ps')
                ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
                ->where('ps.id', $result->station_id)
                ->value('pc.ward_id');

            if ($stationWard !== $agent->ward_id) {
                abort(403, 'This station is not in your ward.');
            }
        }

        $wardId = $agent?->ward_id ?? DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('ps.id', $result->station_id)->value('pc.ward_id');

        $result->update([
            'status'               => 'verified',
            'verified_by_user_id'  => $user->id,
        ]);

        AuditService::log($request, 'result.verified', $workspaceId,
            'StationResult', $result->id, $result->reference_code,
            ['run_id' => $runId, 'station_id' => $result->station_id],
            $wardId,
        );

        return response()->json(['result' => ['id' => $result->id, 'status' => 'verified']]);
    }

    public function queryResult(Request $request, string $workspaceId, string $runId, string $resultId): JsonResponse
    {
        $this->resolveRun($workspaceId, $runId);

        $data = $request->validate(['note' => 'required|string|max:500']);

        $result = StationResult::where('workspace_id', $workspaceId)
            ->where('run_id', $runId)
            ->findOrFail($resultId);

        $user  = $request->user();
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('role', 'ward')
            ->where('status', 'approved')
            ->first();

        $isCMOrAspirant = $this->isCMOrAspirant($user, $workspaceId);

        if (! $agent && ! $isCMOrAspirant) {
            abort(403, 'Only a ward admin or campaign manager can query results.');
        }

        $wardId = $agent?->ward_id ?? DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('ps.id', $result->station_id)->value('pc.ward_id');

        $result->update(['status' => 'queried', 'query_note' => $data['note']]);

        AuditService::log($request, 'result.queried', $workspaceId,
            'StationResult', $result->id, $result->reference_code,
            ['run_id' => $runId, 'note' => $data['note']],
            $wardId,
        );

        return response()->json(['result' => ['id' => $result->id, 'status' => 'queried', 'query_note' => $data['note']]]);
    }

    public function amendResult(Request $request, string $workspaceId, string $runId, string $resultId): JsonResponse
    {
        $this->resolveRun($workspaceId, $runId);

        $data = $request->validate([
            'candidates'       => 'required|array|min:1',
            'candidates.*.candidate_id' => 'required|string',
            'candidates.*.votes'        => 'required|integer|min:0',
            'rejected_ballots' => 'required|integer|min:0',
            'note'             => 'required|string|max:1000',
        ]);

        $result = StationResult::where('workspace_id', $workspaceId)
            ->where('run_id', $runId)
            ->findOrFail($resultId);

        $user  = $request->user();
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('role', 'ward')
            ->where('status', 'approved')
            ->first();

        $isCMOrAspirant = $this->isCMOrAspirant($user, $workspaceId);

        if (! $agent && ! $isCMOrAspirant) {
            abort(403, 'Only a ward admin or campaign manager can amend results.');
        }

        if ($agent) {
            $stationWard = DB::table('polling_stations as ps')
                ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
                ->where('ps.id', $result->station_id)
                ->value('pc.ward_id');

            if ($stationWard !== $agent->ward_id) {
                abort(403, 'This station is not in your ward.');
            }
        }

        $totalVotes = array_sum(array_column($data['candidates'], 'votes'));

        $wardId = $agent?->ward_id ?? DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('ps.id', $result->station_id)->value('pc.ward_id');

        $result->update([
            'candidates'           => $data['candidates'],
            'total_votes'          => $totalVotes,
            'rejected_ballots'     => $data['rejected_ballots'],
            'status'               => 'verified',
            'verified_by_user_id'  => $user->id,
            'ward_amendment_note'  => $data['note'],
        ]);

        AuditService::log($request, 'result.amended', $workspaceId,
            'StationResult', $result->id, $result->reference_code,
            ['run_id' => $runId, 'note' => $data['note'], 'total_votes' => $totalVotes],
            $wardId,
        );

        return response()->json(['result' => ['id' => $result->id, 'status' => 'verified']]);
    }

    private function isCMOrAspirant(\App\Models\User $user, string $workspaceId): bool
    {
        $workspace = \App\Models\Workspace::find($workspaceId);
        if ($workspace?->user_id === $user->id) return true;

        return DB::table('workspace_managers')
            ->where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }
}

<?php

namespace App\Http\Controllers;

use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Geography is READ-ONLY, sourced from the pre-loaded IEBC station register
 * (counties -> constituencies -> wards -> polling_stations). There is no upload;
 * the only mutation is adding a single station that is missing from the register.
 *
 * These tables are introspected/managed outside Laravel (loaded from PostGIS
 * dumps), so we use the query builder and never touch the `boundary_polygon`
 * geometry columns.
 */
class GeographyController extends Controller
{
    private const UUID_RE = '/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i';

    /** GET /api/geography/counties */
    public function counties(): JsonResponse
    {
        $counties = DB::table('counties')
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return response()->json(['counties' => $counties]);
    }

    /**
     * GET /api/geography/counties/{countyId}/tree
     * `countyId` may be a UUID or a case-insensitive county name (e.g. "Nakuru").
     */
    public function tree(string $countyId): JsonResponse
    {
        $query = DB::table('counties')->select('id', 'name');
        if (preg_match(self::UUID_RE, $countyId)) {
            $query->where('id', $countyId);
        } else {
            $query->whereRaw('name ILIKE ?', [$countyId]);
        }
        $county = $query->first();

        if (! $county) {
            return response()->json(['error' => 'County not found'], 404);
        }

        $constituencies = DB::table('constituencies')
            ->select('id', 'name')
            ->where('county_id', $county->id)
            ->orderBy('name')
            ->get();

        $wards = DB::table('wards')
            ->select('id', 'name', 'constituency_id')
            ->where('county_id', $county->id)
            ->orderBy('name')
            ->get()
            ->groupBy('constituency_id');

        $constituencies = $constituencies->map(function ($con) use ($wards) {
            return [
                'id' => $con->id,
                'name' => $con->name,
                'wards' => ($wards->get($con->id) ?? collect())
                    ->map(fn ($w) => ['id' => $w->id, 'name' => $w->name])
                    ->values(),
            ];
        });

        return response()->json([
            'county' => $county,
            'constituencies' => $constituencies,
        ]);
    }

    /**
     * GET /api/geography/wards/{wardId}/stations
     * The `agent` field is always null here — agent assignments are owned by the
     * campaign manager's portal and only surfaced here.
     */
    public function stations(string $wardId): JsonResponse
    {
        if (! preg_match(self::UUID_RE, $wardId)) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        $ward = DB::table('wards as w')
            ->leftJoin('constituencies as c', 'c.id', '=', 'w.constituency_id')
            ->select('w.id', 'w.name', 'c.id as constituency_id', 'c.name as constituency_name')
            ->where('w.id', $wardId)
            ->first();

        if (! $ward) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        $stations = DB::table('polling_stations')
            ->select('id', 'code', 'name', 'registered_voters')
            ->where('ward_id', $wardId)
            ->orderBy('code')
            ->orderBy('name')
            ->get()
            ->map(fn ($s) => [
                'id' => $s->id,
                'code' => $s->code,
                'name' => $s->name,
                'registered_voters' => $s->registered_voters,
                'agent' => null,
            ]);

        return response()->json([
            'ward' => [
                'id' => $ward->id,
                'name' => $ward->name,
                'constituency' => $ward->constituency_id
                    ? ['id' => $ward->constituency_id, 'name' => $ward->constituency_name]
                    : null,
            ],
            'stations' => $stations,
        ]);
    }

    /**
     * GET /api/workspaces/{id}/geography/wards/{wardId}/stations
     * Same as stations() but enriches each row with the approved agent's name
     * from workspace_agents for the given workspace.
     */
    public function workspaceWardStations(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        if (! preg_match(self::UUID_RE, $wardId)) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        $ward = DB::table('wards as w')
            ->leftJoin('constituencies as c', 'c.id', '=', 'w.constituency_id')
            ->select('w.id', 'w.name', 'c.id as constituency_id', 'c.name as constituency_name')
            ->where('w.id', $wardId)
            ->first();

        if (! $ward) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        // Approved agents keyed by station_id — name comes from workspace_agents
        // directly so this works whether or not the agent has created an account yet.
        $agentsByStation = DB::table('workspace_agents as wa')
            ->where('wa.workspace_id', $workspaceId)
            ->where('wa.status', 'approved')
            ->where('wa.role', 'agent')
            ->whereNotNull('wa.station_id')
            ->select('wa.station_id', DB::raw("wa.first_name || ' ' || wa.last_name AS agent_name"))
            ->get()
            ->keyBy('station_id');

        $stations = DB::table('polling_stations')
            ->select('id', 'code', 'name', 'registered_voters')
            ->where('ward_id', $wardId)
            ->orderBy('code')
            ->orderBy('name')
            ->get()
            ->map(function ($s) use ($agentsByStation) {
                $agentRow = $agentsByStation->get($s->id);
                return [
                    'id'                => $s->id,
                    'code'              => $s->code,
                    'name'              => $s->name,
                    'registered_voters' => $s->registered_voters,
                    'agent'             => $agentRow?->agent_name ?? null,
                ];
            });

        return response()->json([
            'ward' => [
                'id'           => $ward->id,
                'name'         => $ward->name,
                'constituency' => $ward->constituency_id
                    ? ['id' => $ward->constituency_id, 'name' => $ward->constituency_name]
                    : null,
            ],
            'stations' => $stations,
        ]);
    }

    /**
     * GET /api/geography/constituencies/{constituencyId}/wards
     */
    public function wardsByConstituency(string $constituencyId): JsonResponse
    {
        $wards = DB::table('wards')
            ->select('id', 'name')
            ->where('constituency_id', $constituencyId)
            ->orderBy('name')
            ->get();

        return response()->json(['wards' => $wards]);
    }

    /**
     * POST /api/geography/wards/{wardId}/stations
     * "Add a missing station" — the single supported mutation.
     */
    public function addStation(Request $request, string $wardId): JsonResponse
    {
        if (! preg_match(self::UUID_RE, $wardId)) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        $name = trim((string) $request->input('name', ''));
        if ($name === '') {
            return response()->json(['error' => 'Station name is required'], 400);
        }

        $code = $request->input('code');
        $code = ($code !== null && trim((string) $code) !== '') ? trim((string) $code) : null;
        if ($code !== null && mb_strlen($code) > 8) {
            return response()->json(['error' => 'Code must be at most 8 characters'], 400);
        }

        $voters = null;
        $rawVoters = $request->input('registered_voters');
        if ($rawVoters !== null && $rawVoters !== '') {
            if (! ctype_digit((string) $rawVoters)) {
                return response()->json(['error' => 'Registered voters must be a non-negative integer'], 400);
            }
            $voters = (int) $rawVoters;
        }

        $wardExists = DB::table('wards')->where('id', $wardId)->exists();
        if (! $wardExists) {
            return response()->json(['error' => 'Ward not found'], 404);
        }

        $id = (string) Str::uuid();
        try {
            DB::table('polling_stations')->insert([
                'id' => $id,
                'ward_id' => $wardId,
                'name' => $name,
                'code' => $code,
                'registered_voters' => $voters,
                'created_at' => now(),
            ]);
        } catch (QueryException $e) {
            // Unique (ward_id, code) violation
            if ($e->getCode() === '23505') {
                return response()->json(['error' => 'A station with this code already exists in this ward'], 409);
            }
            throw $e;
        }

        $station = DB::table('polling_stations')
            ->select('id', 'code', 'name', 'registered_voters')
            ->where('id', $id)
            ->first();

        return response()->json([
            'station' => [
                'id' => $station->id,
                'code' => $station->code,
                'name' => $station->name,
                'registered_voters' => $station->registered_voters,
                'agent' => null,
            ],
        ], 201);
    }

    // ---- GeoJSON shape endpoints (unauthenticated) --------------------------

    /** GET /api/geography/counties/geojson — all 47 counties as GeoJSON */
    public function allCountiesGeojson(): JsonResponse
    {
        $rows = DB::select("
            SELECT id::text, name,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary_polygon, 0.005), 6) AS geom
            FROM counties
            WHERE boundary_polygon IS NOT NULL
            ORDER BY name
        ");
        return response()->json($this->buildFeatureCollection($rows));
    }

    /**
     * GET /api/geography/counties/{id}/geojson
     * Constituencies of a county as a GeoJSON FeatureCollection.
     */
    public function countyGeojson(string $countyId): JsonResponse
    {
        if (! DB::table('counties')->where('id', $countyId)->exists()) {
            return response()->json(['error' => 'County not found'], 404);
        }
        $rows = DB::select("
            SELECT id::text, name,
                   ST_AsGeoJSON(ST_SimplifyPreserveTopology(boundary_polygon, 0.001), 6) AS geom
            FROM constituencies
            WHERE county_id = ?
              AND boundary_polygon IS NOT NULL
            ORDER BY name
        ", [$countyId]);
        return response()->json($this->buildFeatureCollection($rows));
    }

    /**
     * GET /api/geography/constituencies/{id}/geojson
     * Wards of a constituency as a GeoJSON FeatureCollection.
     * No simplification here: adjacent wards share exact boundary coordinates,
     * so any simplification (even small) misaligns shared edges and makes
     * borders invisible at ward-level zoom. Raw boundaries are ~100KB total
     * for a constituency, which is acceptable.
     */
    public function constituencyGeojson(string $constituencyId): JsonResponse
    {
        if (! DB::table('constituencies')->where('id', $constituencyId)->exists()) {
            return response()->json(['error' => 'Constituency not found'], 404);
        }
        $rows = DB::select("
            SELECT id::text, name,
                   ST_AsGeoJSON(boundary_polygon, 6) AS geom
            FROM wards
            WHERE constituency_id = ?
              AND boundary_polygon IS NOT NULL
            ORDER BY name
        ", [$constituencyId]);
        return response()->json($this->buildFeatureCollection($rows));
    }

    private function buildFeatureCollection(array $rows): array
    {
        $features = array_map(fn ($r) => [
            'type' => 'Feature',
            'id' => $r->id,
            'properties' => ['id' => $r->id, 'name' => $r->name],
            'geometry' => json_decode($r->geom),
        ], $rows);
        return ['type' => 'FeatureCollection', 'features' => $features];
    }

    // ---- Workspace-scoped coverage summary (authenticated) ------------------

    /**
     * GET /api/workspaces/{id}/geography
     * Returns items at the appropriate geographic level for the workspace scope,
     * with station counts and agent coverage. Optional query params:
     *   ?county_id=X        drill into a county (national scope only)
     *   ?constituency_id=X  drill into a constituency
     */
    public function workspaceSummary(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = DB::table('workspaces')->where('id', $workspaceId)->first();
        if (! $workspace) {
            return response()->json(['error' => 'Workspace not found'], 404);
        }

        $countyId       = $request->query('county_id');
        $constituencyId = $request->query('constituency_id');

        switch ($workspace->scope) {
            case 'national':
                if ($constituencyId) {
                    return $this->wardSummary($workspaceId, $constituencyId);
                }
                if ($countyId) {
                    return $this->constituencySummary($workspaceId, $countyId);
                }
                return $this->countySummary($workspaceId);

            case 'county':
                if ($constituencyId) {
                    return $this->wardSummary($workspaceId, $constituencyId);
                }
                return $this->constituencySummary($workspaceId, $workspace->county_id);

            case 'constituency':
                return $this->wardSummary($workspaceId, $workspace->constituency_id);

            default: // ward
                return response()->json(['level' => 'ward', 'region' => null, 'items' => [], 'totals' => ['total_stations' => 0, 'covered_stations' => 0, 'coverage_pct' => 0]]);
        }
    }

    private function countySummary(string $workspaceId): JsonResponse
    {
        $rows = DB::select("
            SELECT co.id::text, co.name,
                   COUNT(DISTINCT ps.id) AS total_stations,
                   COUNT(DISTINCT CASE WHEN wa.status = 'approved' AND wa.role = 'agent' AND wa.station_id IS NOT NULL THEN wa.station_id END) AS covered_stations
            FROM counties co
            LEFT JOIN constituencies c ON c.county_id = co.id
            LEFT JOIN wards w ON w.constituency_id = c.id
            LEFT JOIN polling_stations ps ON ps.ward_id = w.id
            LEFT JOIN workspace_agents wa ON wa.workspace_id = ? AND wa.station_id = ps.id
            GROUP BY co.id, co.name
            ORDER BY co.name
        ", [$workspaceId]);
        return $this->summaryResponse('counties', null, $rows);
    }

    private function constituencySummary(string $workspaceId, string $countyId): JsonResponse
    {
        $county = DB::table('counties')->select('id', 'name')->where('id', $countyId)->first();
        $rows = DB::select("
            SELECT c.id::text, c.name,
                   COUNT(DISTINCT ps.id) AS total_stations,
                   COUNT(DISTINCT CASE WHEN wa.status = 'approved' AND wa.role = 'agent' AND wa.station_id IS NOT NULL THEN wa.station_id END) AS covered_stations
            FROM constituencies c
            LEFT JOIN wards w ON w.constituency_id = c.id
            LEFT JOIN polling_stations ps ON ps.ward_id = w.id
            LEFT JOIN workspace_agents wa ON wa.workspace_id = ? AND wa.station_id = ps.id
            WHERE c.county_id = ?
            GROUP BY c.id, c.name
            ORDER BY c.name
        ", [$workspaceId, $countyId]);
        return $this->summaryResponse('constituencies', $county, $rows);
    }

    private function wardSummary(string $workspaceId, string $constituencyId): JsonResponse
    {
        $constituency = DB::table('constituencies')->select('id', 'name')->where('id', $constituencyId)->first();
        $rows = DB::select("
            SELECT w.id::text, w.name,
                   COUNT(DISTINCT ps.id) AS total_stations,
                   COUNT(DISTINCT CASE WHEN wa.status = 'approved' AND wa.role = 'agent' AND wa.station_id IS NOT NULL THEN wa.station_id END) AS covered_stations
            FROM wards w
            LEFT JOIN polling_stations ps ON ps.ward_id = w.id
            LEFT JOIN workspace_agents wa ON wa.workspace_id = ? AND wa.station_id = ps.id
            WHERE w.constituency_id = ?
            GROUP BY w.id, w.name
            ORDER BY w.name
        ", [$workspaceId, $constituencyId]);
        return $this->summaryResponse('wards', $constituency, $rows);
    }

    private function summaryResponse(string $level, ?object $region, array $rows): JsonResponse
    {
        $items = array_map(fn ($r) => [
            'id'               => $r->id,
            'name'             => $r->name,
            'total_stations'   => (int) $r->total_stations,
            'covered_stations' => (int) $r->covered_stations,
            'coverage_pct'     => $r->total_stations > 0
                ? (int) round($r->covered_stations / $r->total_stations * 100)
                : 0,
        ], $rows);

        $totalStations = array_sum(array_column($items, 'total_stations'));
        $totalCovered  = array_sum(array_column($items, 'covered_stations'));

        return response()->json([
            'level'  => $level,
            'region' => $region ? ['id' => $region->id, 'name' => $region->name] : null,
            'items'  => $items,
            'totals' => [
                'total_stations'   => $totalStations,
                'covered_stations' => $totalCovered,
                'coverage_pct'     => $totalStations > 0
                    ? (int) round($totalCovered / $totalStations * 100)
                    : 0,
            ],
        ]);
    }

    /**
     * GET /api/geography/wards/{wardId}/stations.csv
     * "Export station list" — CSV of the ward's stations as shown in the table.
     */
    public function exportStations(string $wardId): Response
    {
        if (! preg_match(self::UUID_RE, $wardId)) {
            return response('Ward not found', 404);
        }

        $ward = DB::table('wards')->select('name')->where('id', $wardId)->first();
        if (! $ward) {
            return response('Ward not found', 404);
        }

        $stations = DB::table('polling_stations')
            ->select('code', 'name', 'registered_voters')
            ->where('ward_id', $wardId)
            ->orderBy('code')
            ->orderBy('name')
            ->get();

        $rows = [['Code', 'Station', 'Registered voters', 'Agent']];
        foreach ($stations as $s) {
            $rows[] = [$s->code ?? '', $s->name, $s->registered_voters ?? '', 'Unassigned'];
        }

        $handle = fopen('php://temp', 'r+');
        foreach ($rows as $row) {
            fputcsv($handle, $row);
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        $safeName = strtolower(trim(preg_replace('/[^a-z0-9]+/i', '-', $ward->name), '-'));

        return response($csv, 200, [
            'Content-Type' => 'text/csv; charset=utf-8',
            'Content-Disposition' => "attachment; filename=\"stations-{$safeName}.csv\"",
        ]);
    }
}

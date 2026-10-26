<?php

namespace App\Http\Controllers;

use App\Models\StationResult;
use App\Models\Workspace;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceCandidate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class StationResultController extends Controller
{
    private static array $FORM_LETTERS = [
        'president' => '34',
        'mp'        => '35',
        'mca'       => '36',
        'governor'  => '37',
        'senator'   => '38',
    ];

    private static array $SEAT_INITIALS = [
        'president' => 'P',
        'governor'  => 'G',
        'senator'   => 'S',
        'mp'        => 'M',
        'mca'       => 'A',
    ];

    private function resolveWorkspace(string $workspaceId): Workspace
    {
        return Workspace::findOrFail($workspaceId);
    }

    private function resolveAgent(Request $request, string $workspaceId): WorkspaceAgent
    {
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $request->user()->id)
            ->where('role', 'agent')
            ->where('status', 'approved')
            ->whereNotNull('station_id')
            ->first();

        if (! $agent) abort(403, 'Not an approved polling agent with a station assignment in this workspace.');
        return $agent;
    }

    private function loadStation(string $stationId): object
    {
        $station = DB::table('polling_stations')->where('id', $stationId)->first();
        if (! $station) abort(404, 'Station not found.');
        return $station;
    }

    private function formLetter(string $seat): string
    {
        return self::$FORM_LETTERS[$seat] ?? '??';
    }

    private function seatInitial(string $seat): string
    {
        return self::$SEAT_INITIALS[$seat] ?? 'X';
    }

    private function stationGeo(object $station): array
    {
        $ward = $station->ward_id
            ? DB::table('wards')->where('id', $station->ward_id)->first()
            : null;
        $constituency = $ward && $ward->constituency_id
            ? DB::table('constituencies')->where('id', $ward->constituency_id)->first()
            : null;
        $county = $ward && isset($ward->county_id)
            ? DB::table('counties')->where('id', $ward->county_id)->first()
            : null;

        return [
            'ward_name'          => $ward?->name,
            'constituency_name'  => $constituency?->name,
            'county_name'        => $county ? $county->name . ' County' : null,
        ];
    }

    private function formatResult(?StationResult $r): ?array
    {
        if (! $r) return null;
        return [
            'id'                => $r->id,
            'registered_voters' => $r->registered_voters,
            'votes'             => $r->votes,
            'rejected_ballots'  => $r->rejected_ballots,
            'disputed_votes'    => $r->disputed_votes,
            'photo_url'         => $r->photo_path ? Storage::disk('public')->url($r->photo_path) : null,
            'reference_code'    => $r->reference_code,
            'submitted_at'      => $r->submitted_at?->toIso8601String(),
            'version'           => $r->version,
        ];
    }

    public function context(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($workspaceId);
        $agent     = $this->resolveAgent($request, $workspaceId);
        $station   = $this->loadStation($agent->station_id);
        $geo       = $this->stationGeo($station);
        $letter    = $this->formLetter($workspace->seat);

        $candidates = WorkspaceCandidate::where('workspace_id', $workspaceId)
            ->orderBy('ballot_order')
            ->get()
            ->map(fn ($c) => [
                'id'      => $c->id,
                'name'    => $c->name,
                'party'   => $c->party ?? '',
                'is_ours' => (bool) $c->is_ours,
            ]);

        $existing = StationResult::where('workspace_id', $workspaceId)
            ->where('station_id', $agent->station_id)
            ->orderByDesc('version')
            ->first();

        // Resolve campaign manager name + phone for the "call manager" CTA.
        $manager = DB::table('workspace_managers as wm')
            ->join('users as u', 'u.id', '=', 'wm.user_id')
            ->where('wm.workspace_id', $workspaceId)
            ->where('wm.status', 'active')
            ->select('u.first_name', 'u.last_name', 'u.phone')
            ->first();

        $managerData = $manager
            ? ['name' => trim($manager->first_name . ' ' . $manager->last_name), 'phone' => $manager->phone]
            : null;

        return response()->json([
            'workspace' => [
                'id'          => $workspace->id,
                'name'        => $workspace->name,
                'seat'        => $workspace->seat,
                'form_letter' => $letter,
                'form_name'   => "Form {$letter}A",
            ],
            'station' => [
                'id'                => $station->id,
                'code'              => $station->code,
                'name'              => $station->name,
                'registered_voters' => $station->registered_voters,
                ...$geo,
            ],
            'candidates'      => $candidates,
            'existing_result' => $this->formatResult($existing),
            'manager'         => $managerData,
        ]);
    }

    public function store(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($workspaceId);
        $agent     = $this->resolveAgent($request, $workspaceId);
        $station   = $this->loadStation($agent->station_id);

        $data = $request->validate([
            'registered_voters'    => 'required|integer|min:0',
            'votes'                => 'required|array|min:1',
            'votes.*.candidate_id' => 'required|string',
            'votes.*.votes'        => 'required|integer|min:0',
            'rejected_ballots'     => 'nullable|integer|min:0',
            'disputed_votes'       => 'nullable|integer|min:0',
            'photo_base64'         => 'nullable|string',
        ]);

        $existing = StationResult::where('workspace_id', $workspaceId)
            ->where('station_id', $agent->station_id)
            ->orderByDesc('version')
            ->first();

        $version = $existing ? $existing->version + 1 : 1;

        // Retain reference code across corrections; generate on first submission.
        $refCode = $existing
            ? $existing->reference_code
            : (($station->code ?? '???') . '-' . $this->seatInitial($workspace->seat) . '-' . str_pad(rand(0, 9999), 4, '0', STR_PAD_LEFT));

        $photoPath = null;
        if (! empty($data['photo_base64'])) {
            $raw = preg_replace('/^data:image\/\w+;base64,/', '', $data['photo_base64']);
            $decoded = base64_decode($raw);
            if ($decoded) {
                $photoPath = "results-photos/{$workspaceId}/{$agent->station_id}-v{$version}.jpg";
                Storage::disk('public')->put($photoPath, $decoded);
            }
        } elseif ($existing?->photo_path) {
            $photoPath = $existing->photo_path;
        }

        $result = StationResult::create([
            'workspace_id'         => $workspaceId,
            'station_id'           => $agent->station_id,
            'submitted_by_user_id' => $request->user()->id,
            'registered_voters'    => $data['registered_voters'],
            'votes'                => $data['votes'],
            'rejected_ballots'     => $data['rejected_ballots'] ?? 0,
            'disputed_votes'       => $data['disputed_votes'] ?? 0,
            'photo_path'           => $photoPath,
            'reference_code'       => $refCode,
            'submitted_at'         => now(),
            'version'              => $version,
        ]);

        return response()->json(['result' => $this->formatResult($result)], 201);
    }
}

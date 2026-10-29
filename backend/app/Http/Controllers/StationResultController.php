<?php

namespace App\Http\Controllers;

use App\Models\ElectionRun;
use App\Models\StationResult;
use App\Models\Workspace;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceCandidate;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
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
        return Workspace::with('user')->findOrFail($workspaceId);
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
        $station = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('ps.id', $stationId)
            ->select('ps.id', 'ps.iebc_code', 'ps.stream_number', 'ps.registered_voters',
                     'pc.id as centre_id', 'pc.name', 'pc.ward_id', 'pc.code as centre_code')
            ->first();
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
            'run_id'            => $r->run_id,
            'registered_voters' => $r->registered_voters,
            'votes'             => $r->votes,
            'rejected_ballots'  => $r->rejected_ballots,
            'disputed_votes'    => $r->disputed_votes,
            'photo_url'         => $r->photo_path ? Storage::disk('public')->url($r->photo_path) : null,
            'reference_code'    => $r->reference_code,
            'submitted_at'      => $r->submitted_at?->toIso8601String(),
            'version'           => $r->version,
            'status'            => $r->status ?? 'submitted',
        ];
    }

    private function activeRun(string $workspaceId): ?ElectionRun
    {
        return ElectionRun::where('workspace_id', $workspaceId)
            ->whereIn('status', ['open', 'tallying'])
            ->first();
    }

    public function context(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($workspaceId);
        $agent     = $this->resolveAgent($request, $workspaceId);
        $station   = $this->loadStation($agent->station_id);
        $geo       = $this->stationGeo($station);
        $letter    = $this->formLetter($workspace->seat);

        $saved = WorkspaceCandidate::where('workspace_id', $workspaceId)
            ->orderBy('ballot_order')
            ->get();

        if ($saved->isEmpty()) {
            // No ballot entered yet — show the aspirant as a placeholder so the
            // agent can at least record votes on election day.
            $owner = $workspace->user;
            $name  = trim(($owner->first_name ?? '') . ' ' . ($owner->last_name ?? ''));
            $candidates = collect([[
                'id'      => 'ours',
                'name'    => $name ?: 'Our candidate',
                'party'   => $workspace->party ?? '',
                'is_ours' => true,
            ]]);
        } else {
            $candidates = $saved->map(fn ($c) => [
                'id'      => $c->id,
                'name'    => $c->name,
                'party'   => $c->party ?? '',
                'is_ours' => (bool) $c->is_ours,
            ]);
        }

        $activeRun = $this->activeRun($workspaceId);

        $existing = $activeRun
            ? StationResult::where('workspace_id', $workspaceId)
                ->where('run_id', $activeRun->id)
                ->where('station_id', $agent->station_id)
                ->orderByDesc('version')
                ->first()
            : null;

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
                'code'              => $station->iebc_code,
                'name'              => $station->name,
                'stream_number'     => $station->stream_number,
                'registered_voters' => $station->registered_voters,
                ...$geo,
            ],
            'candidates'      => $candidates,
            'existing_result' => $this->formatResult($existing),
            'manager'         => $managerData,
            'active_run'      => $activeRun ? [
                'id'     => $activeRun->id,
                'name'   => $activeRun->name,
                'type'   => $activeRun->type,
                'status' => $activeRun->status,
            ] : null,
        ]);
    }

    public function sendResultOtp(Request $request, string $workspaceId): JsonResponse
    {
        $this->resolveWorkspace($workspaceId);
        $agent = $this->resolveAgent($request, $workspaceId);

        if ($agent->result_otp_attempts >= 5 &&
            $agent->result_otp_expires_at &&
            now()->lt($agent->result_otp_expires_at)) {
            return response()->json(['error' => 'Too many attempts. Wait 10 minutes.'], 429);
        }

        $code   = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);
        $agent->update([
            'result_otp_hash'       => Hash::make($code),
            'result_otp_expires_at' => now()->addMinutes(10),
            'result_otp_attempts'   => 0,
        ]);

        // In production, send code via SMS to $agent->phone
        // For now return dev_otp when APP_DEBUG is true
        $devOtp = config('app.debug') ? $code : null;

        return response()->json([
            'ok'        => true,
            'phone_hint' => $this->maskPhone($agent->phone),
            'dev_otp'   => $devOtp,
        ]);
    }

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            $local = substr($digits, 3);
            return '+254 ' . $local[0] . substr($local, 1, 2) . '· ··· ' . substr($local, -3);
        }
        return substr($phone, 0, 4) . '·····' . substr($phone, -3);
    }

    public function store(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($workspaceId);
        $agent     = $this->resolveAgent($request, $workspaceId);
        $station   = $this->loadStation($agent->station_id);

        $run = $this->activeRun($workspaceId);
        if (! $run) {
            return response()->json(['error' => 'No active run. Ask your campaign manager to open a run before you can submit results.'], 422);
        }

        $data = $request->validate([
            'otp'                  => 'required|string|size:6',
            'registered_voters'    => 'required|integer|min:0',
            'votes'                => 'required|array|min:1',
            'votes.*.candidate_id' => 'required|string',
            'votes.*.votes'        => 'required|integer|min:0',
            'rejected_ballots'     => 'nullable|integer|min:0',
            'disputed_votes'       => 'nullable|integer|min:0',
            'photo_base64'         => 'nullable|string',
        ]);

        // Verify OTP
        if (! $agent->result_otp_hash || ! $agent->result_otp_expires_at) {
            return response()->json(['error' => 'Request a verification code first.'], 422);
        }
        if (now()->gt($agent->result_otp_expires_at)) {
            return response()->json(['error' => 'Verification code has expired. Request a new one.'], 422);
        }
        if ($agent->result_otp_attempts >= 5) {
            return response()->json(['error' => 'Too many incorrect codes. Request a new one.'], 429);
        }
        if (! Hash::check($data['otp'], $agent->result_otp_hash)) {
            $agent->increment('result_otp_attempts');
            return response()->json(['error' => 'Incorrect verification code.'], 422);
        }
        // Consume the OTP
        $agent->update(['result_otp_hash' => null, 'result_otp_expires_at' => null, 'result_otp_attempts' => 0]);

        $existing = StationResult::where('workspace_id', $workspaceId)
            ->where('run_id', $run->id)
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
            'run_id'               => $run->id,
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
            'status'               => 'submitted',
            'otp_verified'         => true,
        ]);

        $action = $version > 1 ? 'result.resubmitted' : 'result.submitted';

        // Gather geo scope for the station
        $geo = $this->stationGeo($station);
        $wardRow = $station->ward_id
            ? \DB::table('wards')->where('name', $geo['ward_name'])->value('id')
            : null;

        AuditService::log($request, $action, $workspaceId,
            'StationResult', $result->id,
            $station->name . ' · ' . ($geo['ward_name'] ?? ''),
            ['reference_code' => $refCode, 'version' => $version, 'run_id' => $run->id],
            $station->ward_id ?? null,
            null, null,
        );

        return response()->json(['result' => $this->formatResult($result)], 201);
    }
}

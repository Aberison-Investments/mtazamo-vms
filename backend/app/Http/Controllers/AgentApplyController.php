<?php

namespace App\Http\Controllers;

use App\Models\RecruitmentLink;
use App\Models\WorkspaceAgent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;

class AgentApplyController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const OTP_MAX_ATTEMPTS = 5;

    public function show(string $token): JsonResponse
    {
        $link = $this->findActiveLink($token);
        if (! $link) {
            return response()->json(['error' => 'This application link is invalid or has been closed.'], 404);
        }

        $workspace = $link->workspace;

        $ward = DB::table('wards')
            ->leftJoin('constituencies', 'wards.constituency_id', '=', 'constituencies.id')
            ->leftJoin('counties', 'constituencies.county_id', '=', 'counties.id')
            ->where('wards.id', $link->ward_id)
            ->select('wards.id', 'wards.name', 'constituencies.name as constituency_name', 'counties.name as county_name')
            ->first();

        $stations = DB::table('polling_stations')
            ->where('ward_id', $link->ward_id)
            ->select('id', 'code', 'name', 'registered_voters')
            ->get();

        $agentsByStation = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', 'agent')
            ->where('status', 'approved')
            ->whereNotNull('station_id')
            ->select('station_id')
            ->get()
            ->groupBy('station_id');

        $stationData = $stations->map(function ($st) use ($agentsByStation) {
            $count = $agentsByStation->get($st->id, collect())->count();
            return [
                'id'                => $st->id,
                'code'              => $st->code,
                'name'              => $st->name,
                'registered_voters' => $st->registered_voters,
                'coverage'          => $count > 0 ? 'full' : 'gap',
            ];
        });

        $aspirant = $workspace->user;

        return response()->json([
            'link' => [
                'open_roles'                => $link->open_roles,
                'require_preferred_station' => $link->require_preferred_station,
                'show_walkthrough'          => $link->show_walkthrough,
            ],
            'workspace' => [
                'name'          => $workspace->name,
                'seat'          => $workspace->seat,
                'aspirant_name' => $aspirant?->name,
                'year'          => $workspace->year,
            ],
            'ward'     => $ward ? (array) $ward : null,
            'stations' => $stationData->values(),
        ]);
    }

    public function requestOtp(Request $request, string $token): JsonResponse
    {
        $link = $this->findActiveLink($token);
        if (! $link) {
            return response()->json(['error' => 'This application link is invalid or has been closed.'], 404);
        }

        $data = $request->validate(['phone' => ['required', 'string', 'max:30']]);
        $phone = $this->normalizePhone($data['phone']);

        $code = (string) random_int(100000, 999999);
        $cacheKey = "apply_otp_{$token}_{$phone}";

        Cache::put($cacheKey, [
            'otp_hash'   => Hash::make($code),
            'expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES)->timestamp,
            'attempts'   => 0,
        ], now()->addMinutes(self::OTP_TTL_MINUTES + 2));

        Log::info("Mtazamo agent apply OTP for {$phone}: {$code}");

        return response()->json([
            'ok'         => true,
            'phone_hint' => $this->maskPhone($phone),
            'dev_otp'    => config('app.debug') ? $code : null,
        ]);
    }

    public function submit(Request $request, string $token): JsonResponse
    {
        $link = $this->findActiveLink($token);
        if (! $link) {
            return response()->json(['error' => 'This application link is invalid or has been closed.'], 404);
        }

        $data = $request->validate([
            'code'         => ['required', 'string', 'size:6'],
            'first_name'   => ['required', 'string', 'max:100'],
            'last_name'    => ['required', 'string', 'max:100'],
            'national_id'  => ['nullable', 'string', 'max:20'],
            'phone'        => ['required', 'string', 'max:30'],
            'age'          => ['required', 'integer', 'min:18', 'max:120'],
            'role'         => ['required', 'string', 'in:agent,volunteer'],
            'email'        => ['nullable', 'email', 'max:255'],
            'station_id'   => ['nullable', 'uuid'],
        ]);

        $phone = $this->normalizePhone($data['phone']);
        $cacheKey = "apply_otp_{$token}_{$phone}";
        $cached = Cache::get($cacheKey);

        if (! $cached) {
            return response()->json([
                'error'  => 'No code was requested yet or it has expired.',
                'errors' => ['code' => ['No code was requested yet or it has expired.']],
            ], 422);
        }

        if (now()->timestamp > $cached['expires_at']) {
            Cache::forget($cacheKey);
            return response()->json([
                'error'  => 'Your code has expired. Please request a new one.',
                'errors' => ['code' => ['Your code has expired. Please request a new one.']],
            ], 422);
        }

        if ($cached['attempts'] >= self::OTP_MAX_ATTEMPTS) {
            return response()->json([
                'error'  => 'Too many attempts. Please request a new code.',
                'errors' => ['code' => ['Too many attempts. Please request a new code.']],
            ], 422);
        }

        if (! Hash::check($data['code'], $cached['otp_hash'])) {
            Cache::put($cacheKey, array_merge($cached, ['attempts' => $cached['attempts'] + 1]), now()->addMinutes(self::OTP_TTL_MINUTES));
            return response()->json([
                'error'  => 'Incorrect code — try again.',
                'errors' => ['code' => ['Incorrect code — try again.']],
            ], 422);
        }

        Cache::forget($cacheKey);

        if (! in_array($data['role'], $link->open_roles ?? [])) {
            return response()->json([
                'error'  => 'That role is not open for this link.',
                'errors' => ['role' => ['That role is not open for this link.']],
            ], 422);
        }

        $duplicate = WorkspaceAgent::where('workspace_id', $link->workspace_id)
            ->whereIn('status', ['pending', 'approved'])
            ->where(function ($q) use ($phone, $data) {
                $q->where('phone', $phone);
                if (! empty($data['national_id'])) {
                    $q->orWhere('national_id', $data['national_id']);
                }
            })
            ->exists();

        if ($duplicate) {
            return response()->json([
                'error'  => 'A record with that phone or national ID already exists in this workspace.',
                'errors' => ['phone' => ['That phone number already has a record in this workspace.']],
            ], 422);
        }

        $agent = WorkspaceAgent::create([
            'workspace_id'        => $link->workspace_id,
            'role'                => $data['role'],
            'status'              => 'pending',
            'station_id'          => $data['station_id'] ?? null,
            'ward_id'             => $link->ward_id,
            'source'              => 'public_link',
            'recruitment_link_id' => $link->id,
            'first_name'          => $data['first_name'],
            'last_name'           => $data['last_name'],
            'national_id'         => $data['national_id'] ?? null,
            'phone'               => $phone,
            'age'                 => $data['age'],
            'email'               => $data['email'] ?? null,
            'phone_verified'      => true, // OTP was verified above
        ]);

        $link->increment('application_count');

        return response()->json(['ok' => true, 'id' => $agent->id]);
    }

    private function findActiveLink(string $token): ?RecruitmentLink
    {
        return RecruitmentLink::where('token', $token)
            ->where('is_active', true)
            ->with('workspace.user')
            ->first();
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
            return '+254' . substr($digits, 1);
        }
        if (strlen($digits) === 9) {
            return '+254' . $digits;
        }
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            return '+' . $digits;
        }
        return '+' . $digits;
    }

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            $local = substr($digits, 3);
            return '+254 ' . $local[0] . '·· ··· ' . substr($local, -3);
        }
        return $phone;
    }
}

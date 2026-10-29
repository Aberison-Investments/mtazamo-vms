<?php

namespace App\Http\Controllers;

use App\Models\ApiToken;
use App\Models\RecruitmentLink;
use App\Models\User;
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

        $stations = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('pc.ward_id', $link->ward_id)
            ->select('ps.id', 'ps.iebc_code as code', 'ps.stream_number', 'ps.registered_voters',
                     'pc.name', 'pc.code as centre_code')
            ->orderBy('pc.code')
            ->orderBy('ps.stream_number')
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

        $data = $request->validate([
            'phone'       => ['required', 'string', 'max:30'],
            'email'       => ['nullable', 'email', 'max:255'],
            'national_id' => ['nullable', 'string', 'max:20'],
        ]);
        $phone = $this->normalizePhone($data['phone']);

        // Uniqueness check before sending the OTP
        $duplicate = WorkspaceAgent::where('workspace_id', $link->workspace_id)
            ->whereIn('status', ['pending', 'approved'])
            ->where(function ($q) use ($phone, $data) {
                $q->where('phone', $phone);
                if (! empty($data['national_id'])) {
                    $q->orWhere('national_id', $data['national_id']);
                }
                if (! empty($data['email'])) {
                    $q->orWhere('email', $data['email']);
                }
            })
            ->first(['phone', 'email', 'national_id']);

        if ($duplicate) {
            $emailConflict = ! empty($data['email']) && $duplicate->email === $data['email'];
            $phoneConflict = $duplicate->phone === $phone;

            if ($emailConflict && ! $phoneConflict) {
                return response()->json([
                    'error'  => 'That email address is already registered in this workspace.',
                    'errors' => ['email' => ['That email address is already registered in this workspace.']],
                ], 422);
            }
            return response()->json([
                'error'  => 'That phone number already has a record in this workspace.',
                'errors' => ['phone' => ['That phone number already has a record in this workspace.']],
            ], 422);
        }

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

        if (! in_array($data['role'], $link->open_roles ?? [])) {
            return response()->json([
                'error'  => 'That role is not open for this link.',
                'errors' => ['role' => ['That role is not open for this link.']],
            ], 422);
        }

        Cache::forget($cacheKey);

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

        // Issue a short-lived setup token so the applicant can create their account immediately
        $setupToken = \Illuminate\Support\Str::random(40);
        Cache::put("apply_setup_{$agent->id}", hash('sha256', $setupToken), now()->addMinutes(30));

        return response()->json([
            'ok'          => true,
            'id'          => $agent->id,
            'setup_token' => $setupToken,
        ]);
    }

    public function setup(Request $request, string $agentId): JsonResponse
    {
        $data = $request->validate([
            'setup_token'           => ['required', 'string'],
            'password'              => ['required', 'string', 'min:8', 'max:255'],
            'password_confirmation' => ['required', 'same:password'],
        ]);

        $agent = WorkspaceAgent::find($agentId);
        if (! $agent || $agent->status !== 'pending' || ! $agent->phone_verified) {
            return response()->json(['error' => 'Invalid or expired setup link.'], 404);
        }

        $cacheKey = "apply_setup_{$agentId}";
        $stored   = Cache::get($cacheKey);

        if (! $stored || ! hash_equals($stored, hash('sha256', $data['setup_token']))) {
            return response()->json(['error' => 'Setup link has expired. Please apply again.'], 422);
        }

        // If they already have an account (duplicate setup attempt), just sign them in
        if ($agent->user_id) {
            $user = User::find($agent->user_id);
            if ($user) {
                Cache::forget($cacheKey);
                $tokens = ApiToken::issueFor($user, $request->ip(), $request->userAgent());
                return response()->json([
                    'token'        => $tokens['access_token'],
                    'refresh_token' => $tokens['refresh_token'],
                    'user'         => $this->presentUser($user),
                    'workspace_id' => $agent->workspace_id,
                ]);
            }
        }

        $user = User::create([
            'name'              => trim("{$agent->first_name} {$agent->last_name}"),
            'first_name'        => $agent->first_name,
            'last_name'         => $agent->last_name,
            'phone'             => $agent->phone,
            'phone_verified_at' => now(),
            'email'             => $agent->email,
            'password'          => $data['password'],
        ]);

        $agent->update(['user_id' => $user->id]);

        Cache::forget($cacheKey);

        $tokens = ApiToken::issueFor($user, $request->ip(), $request->userAgent());

        return response()->json([
            'token'         => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'user'          => $this->presentUser($user),
            'workspace_id'  => $agent->workspace_id,
        ], 201);
    }

    private function presentUser(User $user): array
    {
        return [
            'id'    => $user->id,
            'name'  => $user->name,
            'email' => $user->email,
            'phone' => $user->phone,
        ];
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
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            return '+' . $digits;
        }
        if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
            return '+254' . substr($digits, 1);
        }
        if (strlen($digits) === 9) {
            return '+254' . $digits;
        }
        return '+254' . ltrim($digits, '0');
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

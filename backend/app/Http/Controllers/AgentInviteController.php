<?php

namespace App\Http\Controllers;

use App\Models\AgentInvite;
use App\Models\ApiToken;
use App\Models\User;
use App\Models\WorkspaceAgent;
use App\Support\SeatRoles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class AgentInviteController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const OTP_MAX_ATTEMPTS = 5;
    private const VERIFIED_TTL_MINUTES = 30;

    public function show(string $token): JsonResponse
    {
        $invite = $this->findPending($token);
        if (! $invite) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        return response()->json(['invite' => $this->presentInvite($invite)]);
    }

    public function requestOtp(string $token): JsonResponse
    {
        $invite = $this->findPending($token);
        if (! $invite) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        $code = (string) random_int(100000, 999999);

        $invite->update([
            'otp_code_hash'  => Hash::make($code),
            'otp_expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
            'otp_attempts'   => 0,
        ]);

        Log::info("Mtazamo agent invite OTP for {$invite->phone}: {$code}");

        return response()->json([
            'ok'         => true,
            'phone_hint' => $this->maskPhone($invite->phone),
            'dev_otp'    => config('app.debug') ? $code : null,
        ]);
    }

    public function accept(Request $request, string $token): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:6']]);

        $invite = $this->findPending($token);
        if (! $invite) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        if (! $invite->otp_code_hash || ! $invite->otp_expires_at) {
            return response()->json([
                'error'  => 'No code was requested yet.',
                'errors' => ['code' => ['No code was requested yet.']],
            ], 422);
        }

        if (now()->greaterThan($invite->otp_expires_at)) {
            return response()->json([
                'error'  => 'Your code has expired. Please request a new one.',
                'errors' => ['code' => ['Your code has expired. Please request a new one.']],
            ], 422);
        }

        if ($invite->otp_attempts >= self::OTP_MAX_ATTEMPTS) {
            return response()->json([
                'error'  => 'Too many attempts. Please request a new code.',
                'errors' => ['code' => ['Too many attempts. Please request a new code.']],
            ], 422);
        }

        if (! Hash::check($data['code'], $invite->otp_code_hash)) {
            $invite->increment('otp_attempts');
            return response()->json([
                'error'  => 'Incorrect code — try again.',
                'errors' => ['code' => ['Incorrect code — try again.']],
            ], 422);
        }

        $plain = Str::random(40);
        $invite->update([
            'otp_code_hash'             => null,
            'otp_expires_at'            => null,
            'otp_attempts'              => 0,
            'verified_token_hash'       => hash('sha256', $plain),
            'verified_token_expires_at' => now()->addMinutes(self::VERIFIED_TTL_MINUTES),
        ]);

        return response()->json([
            'ok'             => true,
            'verified_token' => $plain,
            'name'           => $invite->name,
            'email'          => null,
            'role'           => $invite->role,
            'seat'           => $invite->workspace->seat,
        ]);
    }

    public function setup(Request $request, string $token): JsonResponse
    {
        $data = $request->validate([
            'verified_token'        => ['required', 'string'],
            'first_name'            => ['required', 'string', 'max:100'],
            'last_name'             => ['required', 'string', 'max:100'],
            'email'                 => ['required', 'email', 'max:255', 'unique:users,email'],
            'password'              => ['required', 'string', 'min:10', 'max:255'],
            'password_confirmation' => ['required', 'same:password'],
        ]);

        $invite = AgentInvite::where('invite_token', $token)
            ->where('status', 'pending')
            ->with('workspace')
            ->first();

        if (! $invite || ($invite->expires_at && now()->greaterThan($invite->expires_at))) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        if (! $invite->verified_token_hash ||
            ! $invite->verified_token_expires_at ||
            now()->greaterThan($invite->verified_token_expires_at)) {
            return response()->json([
                'error'  => 'Phone verification has expired. Please start again.',
                'errors' => ['verified_token' => ['Phone verification has expired.']],
            ], 422);
        }

        if (! hash_equals($invite->verified_token_hash, hash('sha256', $data['verified_token']))) {
            return response()->json(['error' => 'Invalid verification state.'], 422);
        }

        $user = User::create([
            'name'              => trim("{$data['first_name']} {$data['last_name']}"),
            'first_name'        => $data['first_name'],
            'last_name'         => $data['last_name'],
            'phone'             => $invite->phone,
            'phone_verified_at' => now(),
            'email'             => $data['email'],
            'password'          => $data['password'],
        ]);

        $workspace = $invite->workspace;

        $agentData = [
            'workspace_id'    => $workspace->id,
            'user_id'         => $user->id,
            'role'            => $invite->role,
            'status'          => 'approved',
            'source'          => 'targeted_invite',
            'invite_id'       => $invite->id,
            'first_name'      => $data['first_name'],
            'last_name'       => $data['last_name'],
            'phone'           => $invite->phone,
            'station_id'      => $invite->station_id,
            'ward_id'         => $invite->ward_id,
            'constituency_id' => $invite->constituency_id,
            'county_id'       => $invite->county_id,
            'approved_at'     => now(),
        ];

        WorkspaceAgent::create($agentData);

        $invite->update([
            'status'                    => 'accepted',
            'verified_token_hash'       => null,
            'verified_token_expires_at' => null,
        ]);

        $plain = ApiToken::issueFor($user);

        return response()->json(['token' => $plain, 'user' => $this->presentUser($user)], 201);
    }

    public function decline(string $token): JsonResponse
    {
        $invite = $this->findPending($token);
        if (! $invite) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        $invite->update(['status' => 'declined']);

        return response()->json(['ok' => true]);
    }

    private function findPending(string $token): ?AgentInvite
    {
        $invite = AgentInvite::where('invite_token', $token)
            ->where('status', 'pending')
            ->with('workspace')
            ->first();

        if (! $invite || ($invite->expires_at && now()->greaterThan($invite->expires_at))) {
            return null;
        }

        return $invite;
    }

    /** @return array<string, mixed> */
    private function presentInvite(AgentInvite $inv): array
    {
        $workspace = $inv->workspace;
        $seat = $workspace->seat ?? 'governor';
        $role = $inv->role;

        $geoScope = $this->buildGeoScope($inv, $role);

        return [
            'name'           => $inv->name,
            'phone_masked'   => $this->maskPhone($inv->phone),
            'role'           => $role,
            'role_label'     => SeatRoles::roleLabel($role),
            'role_blurb'     => SeatRoles::roleBlurb($role, $seat),
            'geo_scope'      => $geoScope,
            'expires_at'     => $inv->expires_at?->toIso8601String(),
            'workspace' => [
                'name'          => $workspace->name,
                'seat'          => $workspace->seat,
                'aspirant_name' => $workspace->user?->name,
                'year'          => $workspace->year,
            ],
        ];
    }

    private function buildGeoScope(AgentInvite $inv, string $role): string
    {
        $parts = [];

        if ($inv->station_id) {
            $station = DB::table('polling_stations')->where('id', $inv->station_id)->first();
            if ($station) $parts[] = $station->name;
        }
        if ($inv->ward_id) {
            $ward = DB::table('wards')->where('id', $inv->ward_id)->first();
            if ($ward) $parts[] = $ward->name . ' Ward';
        }
        if ($inv->constituency_id) {
            $c = DB::table('constituencies')->where('id', $inv->constituency_id)->first();
            if ($c) $parts[] = $c->name;
        }
        if ($inv->county_id) {
            $co = DB::table('counties')->where('id', $inv->county_id)->first();
            if ($co) $parts[] = $co->name . ' County';
        }

        return implode(' · ', $parts) ?: $inv->workspace->name;
    }

    /** @return array<string, mixed> */
    private function presentUser(User $u): array
    {
        return [
            'id'             => $u->id,
            'name'           => $u->name,
            'first_name'     => $u->first_name,
            'last_name'      => $u->last_name,
            'phone'          => $u->phone,
            'phone_masked'   => $this->maskPhone((string) $u->phone),
            'phone_verified' => (bool) $u->phone_verified_at,
            'email'          => $u->email,
            'email_verified' => (bool) $u->email_verified_at,
            'initials'       => collect(explode(' ', $u->name))
                ->map(fn ($p) => $p[0] ?? '')
                ->take(2)
                ->implode(''),
        ];
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

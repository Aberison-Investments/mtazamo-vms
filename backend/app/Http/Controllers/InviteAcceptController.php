<?php

namespace App\Http\Controllers;

use App\Models\ApiToken;
use App\Models\User;
use App\Models\WorkspaceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class InviteAcceptController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const OTP_MAX_ATTEMPTS = 5;
    private const VERIFIED_TTL_MINUTES = 30;

    public function show(string $token): JsonResponse
    {
        $manager = $this->findPending($token);
        if (! $manager) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        return response()->json(['invite' => $this->presentInvite($manager)]);
    }

    public function requestOtp(string $token): JsonResponse
    {
        $manager = $this->findPending($token);
        if (! $manager) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        $code = (string) random_int(100000, 999999);

        $manager->update([
            'otp_code_hash'  => Hash::make($code),
            'otp_expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
            'otp_attempts'   => 0,
        ]);

        Log::info("Mtazamo manager invite OTP for {$manager->phone}: {$code}");

        return response()->json([
            'ok'        => true,
            'phone_hint' => $this->maskPhone($manager->phone),
            'dev_otp'   => config('app.debug') ? $code : null,
        ]);
    }

    // Step 1: verify OTP → issue short-lived verified_token for the setup step.
    public function accept(Request $request, string $token): JsonResponse
    {
        $data = $request->validate(['code' => ['required', 'string', 'size:6']]);

        $manager = $this->findPending($token);
        if (! $manager) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        if (! $manager->otp_code_hash || ! $manager->otp_expires_at) {
            return response()->json([
                'error'  => 'No code was requested yet.',
                'errors' => ['code' => ['No code was requested yet.']],
            ], 422);
        }

        if (now()->greaterThan($manager->otp_expires_at)) {
            return response()->json([
                'error'  => 'Your code has expired. Please request a new one.',
                'errors' => ['code' => ['Your code has expired. Please request a new one.']],
            ], 422);
        }

        if ($manager->otp_attempts >= self::OTP_MAX_ATTEMPTS) {
            return response()->json([
                'error'  => 'Too many attempts. Please request a new code.',
                'errors' => ['code' => ['Too many attempts. Please request a new code.']],
            ], 422);
        }

        if (! Hash::check($data['code'], $manager->otp_code_hash)) {
            $manager->increment('otp_attempts');
            return response()->json([
                'error'  => 'Incorrect code — try again.',
                'errors' => ['code' => ['Incorrect code — try again.']],
            ], 422);
        }

        $plain = Str::random(40);
        $manager->update([
            'otp_code_hash'            => null,
            'otp_expires_at'           => null,
            'otp_attempts'             => 0,
            'verified_token_hash'      => hash('sha256', $plain),
            'verified_token_expires_at' => now()->addMinutes(self::VERIFIED_TTL_MINUTES),
        ]);

        return response()->json([
            'ok'             => true,
            'verified_token' => $plain,
            'name'           => $manager->name,
            'email'          => $manager->email,
        ]);
    }

    // Step 2: create account using the verified_token, sign them in.
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

        $manager = WorkspaceManager::where('invite_token', $token)
            ->where('status', 'pending')
            ->with('workspace')
            ->first();

        if (! $manager || ($manager->expires_at && now()->greaterThan($manager->expires_at))) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        if (! $manager->verified_token_hash ||
            ! $manager->verified_token_expires_at ||
            now()->greaterThan($manager->verified_token_expires_at)) {
            return response()->json([
                'error'  => 'Phone verification has expired. Please start again.',
                'errors' => ['verified_token' => ['Phone verification has expired.']],
            ], 422);
        }

        if (! hash_equals($manager->verified_token_hash, hash('sha256', $data['verified_token']))) {
            return response()->json(['error' => 'Invalid verification state.'], 422);
        }

        $user = User::create([
            'name'             => trim("{$data['first_name']} {$data['last_name']}"),
            'first_name'       => $data['first_name'],
            'last_name'        => $data['last_name'],
            'phone'            => $manager->phone,
            'phone_verified_at' => now(),
            'email'            => $data['email'],
            'password'         => $data['password'],
        ]);

        $manager->update([
            'status'                    => 'active',
            'user_id'                   => $user->id,
            'accepted_at'               => now(),
            'verified_token_hash'       => null,
            'verified_token_expires_at' => null,
        ]);

        $plain = ApiToken::issueFor($user);

        return response()->json([
            'token'        => $plain,
            'user'         => $this->presentUser($user),
            'workspace_id' => $manager->workspace_id,
        ], 201);
    }

    public function decline(string $token): JsonResponse
    {
        $manager = $this->findPending($token);
        if (! $manager) {
            return response()->json(['error' => 'This invite link is invalid or has expired.'], 404);
        }

        $manager->update(['status' => 'removed']);

        return response()->json(['ok' => true]);
    }

    private function findPending(string $token): ?WorkspaceManager
    {
        $manager = WorkspaceManager::where('invite_token', $token)
            ->where('status', 'pending')
            ->with('workspace')
            ->first();

        if (! $manager || ($manager->expires_at && now()->greaterThan($manager->expires_at))) {
            return null;
        }

        return $manager;
    }

    /** @return array<string, mixed> */
    private function presentInvite(WorkspaceManager $m): array
    {
        $inviter = User::find($m->invited_by);

        return [
            'name'         => $m->name,
            'phone_masked' => $this->maskPhone($m->phone),
            'inviter_name' => $inviter?->name,
            'expires_at'   => $m->expires_at?->toIso8601String(),
            'workspace'    => [
                'name'   => $m->workspace->name,
                'seat'   => $m->workspace->seat,
                'county' => $m->workspace->county,
            ],
        ];
    }

    /** @return array<string, mixed> */
    private function presentUser(User $u): array
    {
        return [
            'id'             => $u->id,
            'name'           => $u->name,
            'first_name'     => $u->first_name,
            'last_name'      => $u->last_name,
            'age'            => $u->age,
            'gender'         => $u->gender,
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

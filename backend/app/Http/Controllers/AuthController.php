<?php

namespace App\Http\Controllers;

use App\Models\ApiToken;
use App\Models\User;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Aspirant account flow: register → log in (password) → SMS OTP second factor →
 * bearer token. There is no SMS gateway wired in dev, so the OTP is logged and,
 * when APP_DEBUG is on, echoed back as `dev_otp` for testing.
 */
class AuthController extends Controller
{
    private const OTP_TTL_MINUTES = 10;
    private const OTP_MAX_ATTEMPTS = 5;
    private const EMAIL_LINK_TTL_HOURS = 24;

    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'first_name' => ['required', 'string', 'max:100'],
            'last_name' => ['required', 'string', 'max:100'],
            'age' => ['required', 'integer', 'min:18', 'max:120'],
            'gender' => ['required', 'string', 'max:50'],
            'phone' => ['required', 'string', 'max:30', 'unique:users,phone'],
            'email' => ['required', 'email', 'max:255', 'unique:users,email'],
            'password' => ['required', 'string', 'min:10', 'max:255'],
        ]);

        $user = User::create([
            'name' => trim("{$data['first_name']} {$data['last_name']}"),
            'first_name' => $data['first_name'],
            'last_name' => $data['last_name'],
            'age' => $data['age'],
            'gender' => $data['gender'],
            'is_aspirant' => true,
            'phone' => $data['phone'],
            'email' => $data['email'],
            'password' => $data['password'], // hashed via cast
        ]);

        return response()->json([
            'ok' => true,
            'user' => $this->publicUser($user),
        ], 201);
    }

    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'], // email or phone
            'password' => ['required', 'string'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'identifier' => 'Those credentials do not match our records.',
            ]);
        }

        // Block agents whose application has not yet been approved
        if (! $user->is_aspirant) {
            $isActiveCM      = \App\Models\WorkspaceManager::where('user_id', $user->id)->where('status', 'active')->exists();
            $isApprovedAgent = \App\Models\WorkspaceAgent::where('user_id', $user->id)->where('status', 'approved')->exists();

            if (! $isActiveCM && ! $isApprovedAgent) {
                throw ValidationException::withMessages([
                    'identifier' => 'Your application is still pending review. You will be notified once it has been approved.',
                ]);
            }
        }

        $otp = $this->issueOtp($user, 'login');

        return response()->json([
            'challenge' => 'otp',
            'identifier' => $user->email,
            'phone_hint' => $this->maskPhone($user->phone),
            'dev_otp' => config('app.debug') ? $otp : null,
        ]);
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate([
            'identifier' => ['required', 'string'],
            'code' => ['required', 'string'],
        ]);

        $user = $this->findByIdentifier($data['identifier']);

        if (! $user || ! $user->otp_code_hash || ! $user->otp_expires_at) {
            throw ValidationException::withMessages(['code' => 'No active code. Please log in again.']);
        }

        if (now()->greaterThan($user->otp_expires_at)) {
            throw ValidationException::withMessages(['code' => 'That code has expired. Request a new one.']);
        }

        if ($user->otp_attempts >= self::OTP_MAX_ATTEMPTS) {
            throw ValidationException::withMessages(['code' => 'Too many attempts. Request a new code.']);
        }

        if (! Hash::check($data['code'], $user->otp_code_hash)) {
            $user->increment('otp_attempts');
            throw ValidationException::withMessages(['code' => 'That code is not correct.']);
        }

        // Success: the phone is proven, so mark it verified on first pass, and
        // clear the challenge.
        $user->forceFill([
            'otp_code_hash' => null,
            'otp_purpose' => null,
            'otp_expires_at' => null,
            'otp_attempts' => 0,
            'phone_verified_at' => $user->phone_verified_at ?? now(),
        ])->save();

        if ($request->ip()) {
            ApiToken::revokeSessionsFromIp($user, $request->ip());
        }

        $tokens = ApiToken::issueFor($user, $request->ip(), $request->userAgent());

        AuditService::logAuth($request, $user->id, 'auth.login', [
            'identifier' => $data['identifier'],
        ]);

        return response()->json([
            'token'         => $tokens['access_token'],
            'refresh_token' => $tokens['refresh_token'],
            'user'          => $this->publicUser($user->fresh()),
        ]);
    }

    public function resendOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['identifier' => ['required', 'string']]);
        $user = $this->findByIdentifier($data['identifier']);

        if (! $user) {
            throw ValidationException::withMessages(['identifier' => 'Unknown account.']);
        }

        $otp = $this->issueOtp($user, $user->otp_purpose ?? 'login');

        return response()->json([
            'ok' => true,
            'phone_hint' => $this->maskPhone($user->phone),
            'dev_otp' => config('app.debug') ? $otp : null,
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json(['user' => $this->publicUser($request->user())]);
    }

    // ---- email verification ------------------------------------------------

    /** Issue (or re-issue) an email verification link for the current user. */
    public function sendEmailVerification(Request $request): JsonResponse
    {
        $user = $request->user();

        if ($user->email_verified_at) {
            return response()->json([
                'ok' => true,
                'already_verified' => true,
                'email' => $user->email,
            ]);
        }

        $token = $this->issueEmailToken($user);

        return response()->json([
            'ok' => true,
            'email' => $user->email,
            'dev_token' => config('app.debug') ? $token : null,
        ]);
    }

    /**
     * Mark the email verified from a link click. Public: the link may be opened
     * on a different device with no session, so it authenticates by token alone.
     */
    public function verifyEmail(Request $request): JsonResponse
    {
        $data = $request->validate(['token' => ['required', 'string']]);

        $user = User::where('email_verification_token_hash', $this->hashEmailToken($data['token']))->first();

        if (! $user || ! $user->email_verification_expires_at) {
            throw ValidationException::withMessages([
                'token' => 'This verification link is invalid. Request a new one.',
            ]);
        }

        if (now()->greaterThan($user->email_verification_expires_at)) {
            throw ValidationException::withMessages([
                'token' => 'This verification link has expired. Request a new one.',
            ]);
        }

        $user->forceFill([
            'email_verified_at' => $user->email_verified_at ?? now(),
            'email_verification_token_hash' => null,
            'email_verification_expires_at' => null,
        ])->save();

        return response()->json(['ok' => true, 'email' => $user->email]);
    }

    /** Change the pending email address and send a fresh verification link. */
    public function changeEmail(Request $request): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'email' => ['required', 'email', 'max:255', 'unique:users,email,'.$user->id],
        ]);

        $user->forceFill([
            'email' => $data['email'],
            'email_verified_at' => null,
        ])->save();

        $token = $this->issueEmailToken($user);

        return response()->json([
            'ok' => true,
            'email' => $user->email,
            'dev_token' => config('app.debug') ? $token : null,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $plain = $request->bearerToken();
        if ($plain) {
            ApiToken::where('token_hash', ApiToken::hashFor($plain))
                ->update(['revoked_at' => now()]);
        }

        AuditService::logAuth($request, $request->user()->id, 'auth.logout');

        return response()->json(['ok' => true]);
    }

    // ---- token refresh & session management --------------------------------

    public function refresh(Request $request): JsonResponse
    {
        $data = $request->validate(['refresh_token' => 'required|string']);

        $result = ApiToken::rotateRefresh(
            $data['refresh_token'],
            $request->ip(),
            $request->userAgent(),
        );

        if (! $result) {
            return response()->json(['error' => 'Refresh token invalid or expired.'], 401);
        }

        AuditService::logAuth($request, $result['user']->id, 'auth.token_refreshed');

        return response()->json([
            'token'         => $result['access_token'],
            'refresh_token' => $result['refresh_token'],
            'user'          => $this->publicUser($result['user']->fresh()),
        ]);
    }

    /** List active sessions for the current user. */
    public function sessions(Request $request): JsonResponse
    {
        $currentHash = ApiToken::hashFor((string) $request->bearerToken());

        $sessions = ApiToken::where('user_id', $request->user()->id)
            ->whereNull('revoked_at')
            ->where('refresh_expires_at', '>', now())
            ->orderByDesc('created_at')
            ->get()
            ->map(fn ($t) => [
                'id'           => $t->id,
                'device_label' => $t->device_label ?? 'Unknown device',
                'ip_address'   => $t->ip_address,
                'last_used_at' => $t->last_used_at?->toIso8601String(),
                'created_at'   => $t->created_at?->toIso8601String(),
                'is_current'   => $t->token_hash === $currentHash,
                'access_valid' => $t->access_expires_at?->isFuture() ?? false,
            ]);

        return response()->json(['sessions' => $sessions]);
    }

    /** Revoke a specific session by token ID. */
    public function revokeSession(Request $request, int $tokenId): JsonResponse
    {
        $token = ApiToken::where('user_id', $request->user()->id)
            ->findOrFail($tokenId);

        $token->update(['revoked_at' => now()]);

        AuditService::logAuth($request, $request->user()->id, 'auth.session_revoked', [
            'session_id' => $tokenId,
            'device'     => $token->device_label,
        ]);

        return response()->json(['ok' => true]);
    }

    /** Revoke ALL sessions for the current user (emergency wipe). */
    public function revokeAll(Request $request): JsonResponse
    {
        ApiToken::where('user_id', $request->user()->id)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        AuditService::logAuth($request, $request->user()->id, 'auth.all_sessions_revoked');

        return response()->json(['ok' => true, 'message' => 'All sessions have been revoked.']);
    }

    // ---- helpers -----------------------------------------------------------

    private function issueOtp(User $user, string $purpose): string
    {
        $code = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        $user->forceFill([
            'otp_code_hash' => Hash::make($code),
            'otp_purpose' => $purpose,
            'otp_expires_at' => now()->addMinutes(self::OTP_TTL_MINUTES),
            'otp_attempts' => 0,
        ])->save();

        // Stand-in for the SMS gateway.
        Log::info("Mtazamo OTP for {$user->phone} ({$purpose}): {$code}");

        return $code;
    }

    /** Generate, store (hashed) and "send" an email verification token. */
    private function issueEmailToken(User $user): string
    {
        $token = Str::random(48);

        $user->forceFill([
            'email_verification_token_hash' => $this->hashEmailToken($token),
            'email_verification_expires_at' => now()->addHours(self::EMAIL_LINK_TTL_HOURS),
        ])->save();

        // Stand-in for the email gateway.
        Log::info("Mtazamo email verification for {$user->email}: token {$token}");

        return $token;
    }

    private function hashEmailToken(string $token): string
    {
        return hash('sha256', $token);
    }

    private function findByIdentifier(string $identifier): ?User
    {
        $identifier = trim($identifier);

        return User::where('email', $identifier)
            ->orWhere('phone', $identifier)
            ->first();
    }

    private function resolvePrimaryRole(User $user): ?string
    {
        if ($user->is_aspirant) return 'aspirant';

        $managed = \App\Models\WorkspaceManager::where('user_id', $user->id)->where('status', 'active')->exists();
        if ($managed) return 'campaign_manager';

        $agent = \App\Models\WorkspaceAgent::where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderBy('created_at')
            ->value('role');
        return $agent;
    }

    private function resolvePrimaryWorkspaceId(User $user): ?string
    {
        $own = $user->workspaces()->orderBy('created_at')->value('id');
        if ($own) return $own;

        $managed = \App\Models\WorkspaceManager::where('user_id', $user->id)
            ->where('status', 'active')
            ->orderBy('created_at')
            ->value('workspace_id');
        if ($managed) return $managed;

        // Tier officers
        $tier = \App\Models\WorkspaceAgent::where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->orderBy('created_at')
            ->value('workspace_id');
        if ($tier) return $tier;

        // Polling agents and volunteers
        return \App\Models\WorkspaceAgent::where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereIn('role', ['agent', 'volunteer'])
            ->orderBy('created_at')
            ->value('workspace_id');
    }

    private function maskPhone(?string $phone): ?string
    {
        if (! $phone) {
            return null;
        }
        $digits = preg_replace('/\D/', '', $phone);
        $last = substr($digits, -3);

        return '+254 7·· ··· '.$last;
    }

    /** @return array<string, mixed> */
    private function publicUser(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'first_name' => $user->first_name,
            'last_name' => $user->last_name,
            'age' => $user->age,
            'gender' => $user->gender,
            'phone' => $user->phone,
            'phone_masked' => $this->maskPhone($user->phone),
            'phone_verified' => (bool) $user->phone_verified_at,
            'email' => $user->email,
            'email_verified' => (bool) $user->email_verified_at,
            'is_aspirant' => (bool) $user->is_aspirant,
            'primary_workspace_id' => $this->resolvePrimaryWorkspaceId($user),
            'primary_role'         => $this->resolvePrimaryRole($user),
            'initials' => Str::of($user->first_name.' '.$user->last_name)
                ->explode(' ')
                ->filter()
                ->map(fn ($p) => Str::upper(Str::substr($p, 0, 1)))
                ->take(2)
                ->implode(''),
        ];
    }
}

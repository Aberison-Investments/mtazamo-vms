<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves `Authorization: Bearer <access_token>` to a user.
 *
 * Returns:
 *   401 {"error": "Authentication required."}       — no token present
 *   401 {"error": "Session expired.", "code": "TOKEN_EXPIRED"} — access token past expiry
 *   401 {"error": "Invalid or expired session."}    — token not found / revoked
 */
class AuthenticateToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = $request->bearerToken();

        if (! $plain) {
            return response()->json(['error' => 'Authentication required.'], 401);
        }

        // Check whether the token exists but is past its access window first,
        // so we can return the dedicated TOKEN_EXPIRED code the frontend uses
        // to trigger a silent refresh rather than forcing a full re-login.
        $expired = ApiToken::with('user')
            ->where('token_hash', ApiToken::hashFor($plain))
            ->whereNull('revoked_at')
            ->where('access_expires_at', '<=', now())
            ->exists();

        if ($expired) {
            return response()->json(
                ['error' => 'Session expired.', 'code' => 'TOKEN_EXPIRED'],
                401,
            );
        }

        $token = ApiToken::resolveAccess($plain);

        if (! $token || ! $token->user) {
            return response()->json(['error' => 'Invalid or expired session.'], 401);
        }

        $token->forceFill(['last_used_at' => now()])->save();

        $request->setUserResolver(fn () => $token->user);

        // Attach the raw token record so controllers can reference it (e.g. logout).
        $request->attributes->set('api_token', $token);

        return $next($request);
    }
}

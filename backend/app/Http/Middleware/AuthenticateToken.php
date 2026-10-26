<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Resolves the `Authorization: Bearer <token>` header to a user via the
 * api_tokens table and binds it to the request. Returns 401 when absent/invalid.
 */
class AuthenticateToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $plain = $request->bearerToken();

        if (! $plain) {
            return response()->json(['error' => 'Authentication required.'], 401);
        }

        $token = ApiToken::with('user')
            ->where('token_hash', ApiToken::hashFor($plain))
            ->first();

        if (! $token || ! $token->user) {
            return response()->json(['error' => 'Invalid or expired session.'], 401);
        }

        $token->forceFill(['last_used_at' => now()])->save();

        $request->setUserResolver(fn () => $token->user);

        return $next($request);
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ApiToken extends Model
{
    protected $fillable = [
        'user_id', 'token_hash', 'access_expires_at',
        'refresh_token_hash', 'refresh_expires_at',
        'revoked_at', 'ip_address', 'user_agent', 'device_label',
        'last_used_at',
    ];

    protected function casts(): array
    {
        return [
            'access_expires_at'  => 'datetime',
            'refresh_expires_at' => 'datetime',
            'revoked_at'         => 'datetime',
            'last_used_at'       => 'datetime',
        ];
    }

    /** @return BelongsTo<User, ApiToken> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ---- issuance -----------------------------------------------------------

    /**
     * Issue a paired access + refresh token for a user.
     * Returns ['access_token' => ..., 'refresh_token' => ...] — plaintexts shown once.
     *
     * @return array{access_token: string, refresh_token: string}
     */
    public static function issueFor(User $user, ?string $ipAddress = null, ?string $userAgent = null): array
    {
        $accessPlain  = Str::random(64);
        $refreshPlain = Str::random(64);

        static::create([
            'user_id'            => $user->id,
            'token_hash'         => self::hashFor($accessPlain),
            'access_expires_at'  => now()->addHours(2),
            'refresh_token_hash' => self::hashFor($refreshPlain),
            'refresh_expires_at' => now()->addDays(30),
            'ip_address'         => $ipAddress,
            'user_agent'         => $userAgent ? substr($userAgent, 0, 500) : null,
            'device_label'       => self::labelFromUserAgent($userAgent),
        ]);

        return ['access_token' => $accessPlain, 'refresh_token' => $refreshPlain];
    }

    /**
     * Revoke all active sessions for a user that originated from the given IP.
     * Called before issuing a new token on login so the same machine doesn't
     * accumulate stale sessions.
     */
    public static function revokeSessionsFromIp(User $user, string $ipAddress): void
    {
        static::where('user_id', $user->id)
            ->where('ip_address', $ipAddress)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);
    }

    /**
     * Roll a new access + refresh token pair from a valid refresh token (rotating refresh).
     * The old record is revoked immediately to prevent replay.
     *
     * @return array{access_token: string, refresh_token: string, user: User}|null
     */
    public static function rotateRefresh(string $refreshPlain, ?string $ipAddress = null, ?string $userAgent = null): ?array
    {
        $record = static::with('user')
            ->where('refresh_token_hash', self::hashFor($refreshPlain))
            ->whereNull('revoked_at')
            ->where('refresh_expires_at', '>', now())
            ->first();

        if (! $record || ! $record->user) return null;

        $user = $record->user;

        // Revoke old record before issuing new one (token rotation)
        $record->update(['revoked_at' => now()]);

        $tokens = static::issueFor($user, $ipAddress, $userAgent);

        return array_merge($tokens, ['user' => $user]);
    }

    /**
     * Resolve a bearer access token. Returns null if absent, expired, or revoked.
     */
    public static function resolveAccess(string $plain): ?static
    {
        return static::with('user')
            ->where('token_hash', self::hashFor($plain))
            ->whereNull('revoked_at')
            ->where('access_expires_at', '>', now())
            ->first();
    }

    public static function hashFor(string $plain): string
    {
        return hash('sha256', $plain);
    }

    private static function labelFromUserAgent(?string $ua): string
    {
        if (! $ua) return 'Unknown device';
        foreach (['Edg' => 'Edge', 'Chrome' => 'Chrome', 'Safari' => 'Safari', 'Firefox' => 'Firefox'] as $tok => $name) {
            if (stripos($ua, $tok) !== false) {
                $isMobile = stripos($ua, 'Mobile') !== false || stripos($ua, 'Android') !== false;
                return "$name (" . ($isMobile ? 'mobile' : 'desktop') . ')';
            }
        }
        return 'Browser';
    }
}

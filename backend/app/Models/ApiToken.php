<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

#[Fillable(['user_id', 'token_hash', 'last_used_at'])]
class ApiToken extends Model
{
    /** @return BelongsTo<User, ApiToken> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Issue a new token for a user. Returns the plaintext token (shown once);
     * only its hash is persisted.
     */
    public static function issueFor(User $user): string
    {
        $plain = Str::random(64);
        static::create([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plain),
        ]);

        return $plain;
    }

    public static function hashFor(string $plain): string
    {
        return hash('sha256', $plain);
    }
}

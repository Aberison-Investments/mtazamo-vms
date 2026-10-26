<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'workspace_id', 'user_id', 'invited_by', 'name', 'phone', 'email',
    'note', 'expiry_hours', 'status', 'invite_token',
    'expires_at', 'accepted_at',
    'otp_code_hash', 'otp_expires_at', 'otp_attempts',
    'verified_token_hash', 'verified_token_expires_at',
])]
class WorkspaceManager extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'expiry_hours' => 'integer',
            'expires_at' => 'datetime',
            'accepted_at' => 'datetime',
            'otp_expires_at' => 'datetime',
            'otp_attempts' => 'integer',
            'verified_token_expires_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workspace, WorkspaceManager> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}

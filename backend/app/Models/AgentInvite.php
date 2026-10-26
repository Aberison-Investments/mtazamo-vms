<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'workspace_id', 'invited_by_user_id', 'role', 'name', 'phone',
    'station_id', 'ward_id', 'constituency_id', 'county_id',
    'invite_token', 'expiry_hours', 'expires_at', 'status',
    'otp_code_hash', 'otp_expires_at', 'otp_attempts',
    'verified_token_hash', 'verified_token_expires_at',
])]
class AgentInvite extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'expiry_hours' => 'integer',
            'expires_at' => 'datetime',
            'otp_expires_at' => 'datetime',
            'otp_attempts' => 'integer',
            'verified_token_expires_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workspace, AgentInvite> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return BelongsTo<User, AgentInvite> */
    public function invitedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by_user_id');
    }
}

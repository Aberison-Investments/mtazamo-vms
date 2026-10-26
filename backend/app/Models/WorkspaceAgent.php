<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'workspace_id', 'user_id', 'role', 'status',
    'station_id', 'ward_id', 'constituency_id', 'county_id',
    'source', 'recruitment_link_id', 'invite_id',
    'first_name', 'last_name', 'national_id', 'phone', 'age', 'email', 'photo_path',
    'phone_verified',
    'approved_by_user_id', 'approved_at',
    'rejection_reason', 'rejected_by_user_id', 'rejected_at',
])]
class WorkspaceAgent extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'age' => 'integer',
            'phone_verified' => 'boolean',
            'approved_at' => 'datetime',
            'rejected_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workspace, WorkspaceAgent> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return BelongsTo<User, WorkspaceAgent> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return BelongsTo<RecruitmentLink, WorkspaceAgent> */
    public function recruitmentLink(): BelongsTo
    {
        return $this->belongsTo(RecruitmentLink::class);
    }

    /** @return BelongsTo<AgentInvite, WorkspaceAgent> */
    public function agentInvite(): BelongsTo
    {
        return $this->belongsTo(AgentInvite::class, 'invite_id');
    }
}

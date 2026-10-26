<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

#[Fillable([
    'workspace_id', 'ward_id', 'token',
    'open_roles', 'require_preferred_station', 'show_walkthrough',
    'close_when_full', 'is_active', 'application_count',
])]
class RecruitmentLink extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'open_roles' => 'array',
            'require_preferred_station' => 'boolean',
            'show_walkthrough' => 'boolean',
            'close_when_full' => 'boolean',
            'is_active' => 'boolean',
            'application_count' => 'integer',
        ];
    }

    /** @return BelongsTo<Workspace, RecruitmentLink> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return HasMany<WorkspaceAgent> */
    public function agents(): HasMany
    {
        return $this->hasMany(WorkspaceAgent::class, 'recruitment_link_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'user_id', 'name', 'seat', 'segment', 'scope',
    'county', 'county_id', 'constituency', 'constituency_id', 'ward', 'ward_id',
    'priority_counties', 'year', 'election_date', 'party', 'status',
    'candidates_updated_at', 'candidates_published_at',
])]
class Workspace extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return [
            'priority_counties'         => 'array',
            'year'                      => 'integer',
            'election_date'             => 'date',
            'candidates_updated_at'     => 'datetime',
            'candidates_published_at'   => 'datetime',
        ];
    }

    /** @return BelongsTo<User, Workspace> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /** @return \Illuminate\Database\Eloquent\Relations\HasMany<WorkspaceManager> */
    public function managers(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(WorkspaceManager::class);
    }

    /** @return \Illuminate\Database\Eloquent\Relations\HasMany<WorkspaceCandidate> */
    public function candidates(): \Illuminate\Database\Eloquent\Relations\HasMany
    {
        return $this->hasMany(WorkspaceCandidate::class);
    }
}

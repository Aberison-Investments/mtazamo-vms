<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ElectionRun extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id', 'name', 'type', 'status',
        'run_date', 'start_time', 'end_time',
        'opened_at', 'closed_at', 'created_by_user_id',
    ];

    protected function casts(): array
    {
        return [
            'opened_at' => 'datetime',
            'closed_at' => 'datetime',
            'run_date'  => 'date',
        ];
    }

    public function isActive(): bool
    {
        return in_array($this->status, ['open', 'tallying'], true);
    }

    /** @return BelongsTo<Workspace, ElectionRun> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return HasMany<StationResult, ElectionRun> */
    public function stationResults(): HasMany
    {
        return $this->hasMany(StationResult::class, 'run_id');
    }
}

<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StationResult extends Model
{
    use HasUuids;

    protected $fillable = [
        'workspace_id', 'station_id', 'submitted_by_user_id',
        'registered_voters', 'votes', 'rejected_ballots', 'disputed_votes',
        'photo_path', 'reference_code', 'submitted_at', 'version',
    ];

    protected function casts(): array
    {
        return [
            'votes'        => 'array',
            'submitted_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<Workspace, StationResult> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }

    /** @return BelongsTo<User, StationResult> */
    public function submittedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'submitted_by_user_id');
    }
}

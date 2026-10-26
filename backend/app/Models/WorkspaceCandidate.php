<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable(['workspace_id', 'name', 'party', 'ballot_order', 'is_ours'])]
class WorkspaceCandidate extends Model
{
    use HasUuids;

    protected function casts(): array
    {
        return ['is_ours' => 'boolean'];
    }

    /** @return BelongsTo<Workspace, WorkspaceCandidate> */
    public function workspace(): BelongsTo
    {
        return $this->belongsTo(Workspace::class);
    }
}

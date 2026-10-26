<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class WorkspaceAgentPermission extends Model
{
    use HasUuids;

    protected $table = 'workspace_agent_permissions';

    protected $fillable = [
        'workspace_id',
        'grantee_role',
        'grantee_geo_id',
        'permission',
        'granted_by_user_id',
        'granted_at',
    ];

    protected function casts(): array
    {
        return [
            'granted_at' => 'datetime',
        ];
    }
}

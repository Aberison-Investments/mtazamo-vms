<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceManager;
use Illuminate\Http\Request;

/**
 * Central audit logging service. Every significant state-changing action in the
 * system calls AuditService::log() so there is a tamper-evident record of who
 * did what, where, and when.
 *
 * Visibility rules:
 *   - CM / aspirant  → all logs for the workspace
 *   - County agent   → logs where county_id matches their county
 *   - Constituency   → logs where constituency_id matches
 *   - Ward admin     → logs where ward_id matches
 *   - Any user       → always their own actions (actor_user_id = self)
 */
class AuditService
{
    public static function log(
        Request  $request,
        string   $action,
        ?string  $workspaceId   = null,
        ?string  $entityType    = null,
        ?string  $entityId      = null,
        ?string  $entityLabel   = null,
        ?array   $context       = null,
        ?string  $wardId        = null,
        ?string  $constituencyId = null,
        ?string  $countyId      = null,
    ): void {
        $user = $request->user();
        if (! $user) return;

        AuditLog::create([
            'actor_user_id'   => $user->id,
            'actor_role'      => $workspaceId ? self::resolveRole($user, $workspaceId) : null,
            'workspace_id'    => $workspaceId,
            'action'          => $action,
            'entity_type'     => $entityType,
            'entity_id'       => $entityId,
            'entity_label'    => $entityLabel,
            'context'         => $context,
            'ward_id'         => $wardId,
            'constituency_id' => $constituencyId,
            'county_id'       => $countyId,
            'ip_address'      => $request->ip(),
            'user_agent'      => substr((string) $request->userAgent(), 0, 500),
            'created_at'      => now(),
        ]);
    }

    /**
     * Log an auth event (no workspace context).
     */
    public static function logAuth(
        Request $request,
        int     $userId,
        string  $action,
        ?array  $context = null,
    ): void {
        AuditLog::create([
            'actor_user_id' => $userId,
            'actor_role'    => null,
            'workspace_id'  => null,
            'action'        => $action,
            'context'       => $context,
            'ip_address'    => $request->ip(),
            'user_agent'    => substr((string) $request->userAgent(), 0, 500),
            'created_at'    => now(),
        ]);
    }

    /**
     * Build a query for audit logs visible to $user in $workspaceId.
     */
    public static function visibleQuery(User $user, string $workspaceId): \Illuminate\Database\Eloquent\Builder
    {
        $q = AuditLog::where('workspace_id', $workspaceId)
            ->orderByDesc('created_at');

        // Aspirant (owner) and active CMs see everything.
        if (self::isCMOrAspirant($user, $workspaceId)) {
            return $q;
        }

        // Tier officers see their own actions + actions that fall within their geo scope.
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->first();

        if (! $agent) {
            // Fall back to own actions only.
            return $q->where('actor_user_id', $user->id);
        }

        return $q->where(function ($inner) use ($agent, $user) {
            $inner->where('actor_user_id', $user->id);

            match ($agent->role) {
                'county'        => $inner->orWhere('county_id', $agent->county_id),
                'constituency'  => $inner->orWhere('constituency_id', $agent->constituency_id),
                'ward'          => $inner->orWhere('ward_id', $agent->ward_id),
                default         => null,
            };
        });
    }

    // ---- helpers ------------------------------------------------------------

    private static function resolveRole(User $user, string $workspaceId): string
    {
        // Workspace owner
        if (\App\Models\Workspace::where('id', $workspaceId)->where('user_id', $user->id)->exists()) {
            return 'aspirant';
        }

        // Active CM
        if (WorkspaceManager::where('workspace_id', $workspaceId)->where('user_id', $user->id)->where('status', 'active')->exists()) {
            return 'campaign_manager';
        }

        // Tier agent
        $agent = WorkspaceAgent::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->orderBy('created_at')
            ->value('role');

        return $agent ?? 'unknown';
    }

    private static function isCMOrAspirant(User $user, string $workspaceId): bool
    {
        if (\App\Models\Workspace::where('id', $workspaceId)->where('user_id', $user->id)->exists()) return true;

        return WorkspaceManager::where('workspace_id', $workspaceId)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
    }
}

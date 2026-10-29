<?php

namespace App\Http\Controllers;

use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $user = $request->user();

        $q = AuditService::visibleQuery($user, $workspaceId);

        // Optional filters
        if ($action = $request->query('action')) {
            $q->where('action', 'like', $action . '%');
        }
        if ($actorId = $request->query('actor_id')) {
            $q->where('actor_user_id', $actorId);
        }

        $logs = $q->with('actor:id,first_name,last_name,email')
            ->limit(200)
            ->get()
            ->map(fn ($l) => [
                'id'            => $l->id,
                'action'        => $l->action,
                'actor'         => $l->actor ? [
                    'id'   => $l->actor->id,
                    'name' => trim($l->actor->first_name . ' ' . $l->actor->last_name),
                ] : null,
                'actor_role'    => $l->actor_role,
                'entity_type'   => $l->entity_type,
                'entity_label'  => $l->entity_label,
                'context'       => $l->context,
                'ip_address'    => $l->ip_address,
                'created_at'    => $l->created_at?->toIso8601String(),
            ]);

        return response()->json(['logs' => $logs]);
    }

    /** Own activity across all workspaces — available to every authenticated user. */
    public function myActivity(Request $request): JsonResponse
    {
        $logs = \App\Models\AuditLog::where('actor_user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->limit(100)
            ->get()
            ->map(fn ($l) => [
                'id'           => $l->id,
                'action'       => $l->action,
                'workspace_id' => $l->workspace_id,
                'entity_label' => $l->entity_label,
                'context'      => $l->context,
                'ip_address'   => $l->ip_address,
                'created_at'   => $l->created_at?->toIso8601String(),
            ]);

        return response()->json(['logs' => $logs]);
    }
}

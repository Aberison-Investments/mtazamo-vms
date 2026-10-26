<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceAgentPermission;
use App\Support\SeatRoles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkspaceDelegationController extends Controller
{
    /**
     * Roles that can receive delegation permissions for a given seat.
     * Excludes campaign_manager (always has all), agent and volunteer (lowest tiers).
     */
    private function delegatableRoles(string $seat): array
    {
        $chain = SeatRoles::rolesForSeat($seat);
        return array_values(array_filter($chain, fn ($r) => ! in_array($r, ['agent', 'volunteer'])));
    }

    private function resolveWorkspace(Request $request, string $id): Workspace
    {
        $user = $request->user();
        $workspace = Workspace::find($id);
        if (! $workspace) abort(404);

        if ($workspace->user_id === $user->id) return $workspace;

        $isCM = $workspace->managers()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
        if ($isCM) return $workspace;

        abort(403);
    }

    public function index(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);

        $roles = $this->delegatableRoles($workspace->seat);

        $granted = WorkspaceAgentPermission::where('workspace_id', $id)
            ->whereNull('grantee_geo_id')
            ->get()
            ->groupBy('grantee_role');

        $rules = [];
        foreach ($roles as $role) {
            $perms = $granted->get($role, collect())->pluck('permission')->toArray();
            $rules[$role] = [
                'invite' => in_array('invite', $perms),
                'assign' => in_array('assign', $perms),
            ];
        }

        return response()->json([
            'delegation' => [
                'seat'  => $workspace->seat,
                'roles' => $roles,
                'rules' => $rules,
            ],
        ]);
    }

    public function upsert(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);

        $allowed = $this->delegatableRoles($workspace->seat);

        $data = $request->validate(['rules' => ['required', 'array']]);
        $incoming = $data['rules'];

        // Reject any roles that don't belong to this seat's chain.
        $unknown = array_diff(array_keys($incoming), $allowed);
        if ($unknown) {
            return response()->json([
                'error'  => 'Invalid roles for this seat.',
                'errors' => ['rules' => ['Roles not in chain: ' . implode(', ', $unknown)]],
            ], 422);
        }

        DB::transaction(function () use ($id, $allowed, $incoming, $request) {
            WorkspaceAgentPermission::where('workspace_id', $id)
                ->whereNull('grantee_geo_id')
                ->delete();

            $now    = now();
            $userId = $request->user()->id;

            foreach ($allowed as $role) {
                $roleRules = $incoming[$role] ?? [];
                foreach (['invite', 'assign'] as $perm) {
                    if (! empty($roleRules[$perm])) {
                        WorkspaceAgentPermission::create([
                            'workspace_id'       => $id,
                            'grantee_role'       => $role,
                            'grantee_geo_id'     => null,
                            'permission'         => $perm,
                            'granted_by_user_id' => $userId,
                            'granted_at'         => $now,
                        ]);
                    }
                }
            }
        });

        return $this->index($request, $id);
    }
}

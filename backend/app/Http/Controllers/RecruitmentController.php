<?php

namespace App\Http\Controllers;

use App\Models\AgentInvite;
use App\Models\RecruitmentLink;
use App\Models\Workspace;
use App\Models\WorkspaceManager;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceAgentPermission;
use App\Support\SeatRoles;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RecruitmentController extends Controller
{
    public function index(Request $request, string $workspaceId): JsonResponse
    {
        [$workspace, $tierRecord] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $wards = $this->wardsForWorkspace($workspace, $tierRecord);

        $linkMap = RecruitmentLink::where('workspace_id', $workspace->id)
            ->get()
            ->keyBy('ward_id');

        $result = $wards->map(function ($ward) use ($linkMap, $workspace) {
            $link = $linkMap->get($ward->id);
            return [
                'id'                 => $ward->id,
                'name'               => $ward->name,
                'constituency_name'  => $ward->constituency_name ?? null,
                'county_name'        => $ward->county_name ?? null,
                'link'               => $link ? $this->presentLink($link) : null,
            ];
        });

        $user = $request->user();
        $myRole = match (true) {
            $workspace->user_id === $user->id => 'aspirant',
            $workspace->managers()->where('user_id', $user->id)->where('status', 'active')->exists() => 'campaign_manager',
            default => $tierRecord?->role,
        };

        $seat = $workspace->seat;
        $roles = SeatRoles::rolesForSeat($seat);
        $roleData = array_map(fn ($r) => [
            'id'     => $r,
            'label'  => SeatRoles::roleLabel($r),
            'blurb'  => SeatRoles::roleBlurb($r, $seat),
            'filled' => $this->isRoleFilled($workspace, $r),
        ], $roles);

        return response()->json([
            'workspace' => [
                'id'   => $workspace->id,
                'name' => $workspace->name,
                'seat' => $workspace->seat,
            ],
            'wards'       => $result->values(),
            'seat_roles'  => $roleData,
            'form_letter' => SeatRoles::formLetter($seat),
            'my_role'     => $myRole,
        ]);
    }

    public function ward(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $link = RecruitmentLink::firstOrCreate(
            ['workspace_id' => $workspace->id, 'ward_id' => $wardId],
            ['token' => Str::random(40), 'open_roles' => ['agent', 'volunteer']],
        );

        $stations = DB::table('polling_stations')
            ->where('ward_id', $wardId)
            ->select('id', 'code', 'name', 'registered_voters')
            ->get();

        $agentsByStation = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', 'agent')
            ->whereIn('status', ['pending', 'approved'])
            ->whereNotNull('station_id')
            ->select('station_id', 'status')
            ->get()
            ->groupBy('station_id');

        $stationData = $stations->map(function ($st) use ($agentsByStation) {
            $agents = $agentsByStation->get($st->id, collect());
            $approved = $agents->where('status', 'approved')->count();
            $pending = $agents->where('status', 'pending')->count();
            $coverage = $approved > 0 ? 'full' : ($pending > 0 ? 'partial' : 'gap');
            return [
                'id'                => $st->id,
                'code'              => $st->code,
                'name'              => $st->name,
                'registered_voters' => $st->registered_voters,
                'coverage'          => $coverage,
                'approved_count'    => $approved,
                'pending_count'     => $pending,
            ];
        });

        return response()->json([
            'link'     => $this->presentLink($link),
            'stations' => $stationData->values(),
        ]);
    }

    public function updateWard(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $data = $request->validate([
            'open_roles'                => ['sometimes', 'array'],
            'open_roles.*'              => ['string', 'in:agent,volunteer'],
            'require_preferred_station' => ['sometimes', 'boolean'],
            'show_walkthrough'          => ['sometimes', 'boolean'],
            'close_when_full'           => ['sometimes', 'boolean'],
            'is_active'                 => ['sometimes', 'boolean'],
        ]);

        $link = RecruitmentLink::firstOrCreate(
            ['workspace_id' => $workspace->id, 'ward_id' => $wardId],
            ['token' => Str::random(40)],
        );

        $link->update($data);

        return response()->json(['link' => $this->presentLink($link->fresh())]);
    }

    public function regenerate(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $link = RecruitmentLink::where('workspace_id', $workspace->id)
            ->where('ward_id', $wardId)
            ->firstOrFail();

        $link->update(['token' => Str::random(40)]);

        return response()->json(['link' => $this->presentLink($link->fresh())]);
    }

    public function stats(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $workspaceId);

        $total = WorkspaceAgent::where('workspace_id', $workspace->id)->count();
        $pending = WorkspaceAgent::where('workspace_id', $workspace->id)->where('status', 'pending')->count();
        $approved = WorkspaceAgent::where('workspace_id', $workspace->id)->where('status', 'approved')->count();
        $rejected = WorkspaceAgent::where('workspace_id', $workspace->id)->where('status', 'rejected')->count();
        $openWards = RecruitmentLink::where('workspace_id', $workspace->id)->where('is_active', true)->count();

        return response()->json([
            'total_applications' => $total,
            'pending'            => $pending,
            'approved'           => $approved,
            'rejected'           => $rejected,
            'open_wards_count'   => $openWards,
        ]);
    }

    public function storeInvite(Request $request, string $workspaceId): JsonResponse
    {
        [$workspace, $tierRecord] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        // Roles available for this seat
        $seatChain = SeatRoles::rolesForSeat($workspace->seat);
        $validRoles = $seatChain;

        // If caller is a tier officer, restrict to roles below them in the chain
        if ($tierRecord) {
            $myPos = array_search($tierRecord->role, $seatChain, true);
            if ($myPos === false) abort(403, 'Your role is not in this seat\'s chain.');
            $rolesBelow = array_slice($seatChain, $myPos + 1);
            // Tier officers cannot invite volunteers via targeted invite
            $validRoles = array_values(array_filter($rolesBelow, fn ($r) => $r !== 'volunteer' && $r !== 'agent'));
            // Allow agent invites only if the tier officer is at ward or constituency level
            if (in_array($tierRecord->role, ['ward', 'constituency'], true)) {
                $validRoles[] = 'agent';
            }
        }

        // Filter out volunteer — tier officers use public links for volunteers
        $validRoles = array_values(array_filter($validRoles, fn ($r) => $r !== 'volunteer'));

        if (empty($validRoles)) abort(403, 'No invitable roles available for your position.');

        $data = $request->validate([
            'role'             => ['required', 'string', 'in:' . implode(',', $validRoles)],
            'name'             => ['required', 'string', 'max:150'],
            'phone'            => ['required', 'string', 'max:30'],
            'expiry_hours'     => ['required', 'integer', 'in:48,168,720'],
            'station_id'       => ['nullable', 'uuid'],
            'ward_id'          => ['nullable', 'uuid'],
            'constituency_id'  => ['nullable', 'uuid'],
            'county_id'        => ['nullable', 'uuid'],
        ]);

        // Require the geographic ID that matches the role
        $geoError = match ($data['role']) {
            'ward'         => empty($data['ward_id'])         ? 'ward_id'         : null,
            'constituency' => empty($data['constituency_id']) ? 'constituency_id' : null,
            'county'       => empty($data['county_id'])       ? 'county_id'       : null,
            'agent'        => empty($data['ward_id'])         ? 'ward_id'         : null,
            default        => null,
        };

        if ($geoError) {
            $label = str_replace('_id', '', $geoError);
            return response()->json([
                'error'  => "Please select a {$label} for this role.",
                'errors' => [$geoError => ["Please select a {$label}."]],
            ], 422);
        }

        if ($data['role'] === 'agent' && empty($data['station_id'])) {
            return response()->json([
                'error'  => 'Please select a polling station for this agent.',
                'errors' => ['station_id' => ['A polling station is required for a polling agent invite.']],
            ], 422);
        }

        $phone = $this->normalizePhone($data['phone']);

        if (\App\Models\User::where('phone', $phone)->exists()) {
            return response()->json([
                'error'  => 'That phone number is already registered to an existing account.',
                'errors' => ['phone' => ['That phone number is already registered to an existing account.']],
            ], 422);
        }

        $duplicateInvite = AgentInvite::where('workspace_id', $workspace->id)
            ->where('phone', $phone)
            ->where('status', 'pending')
            ->exists();

        if ($duplicateInvite) {
            return response()->json([
                'error'  => 'An active invite has already been sent to that phone number.',
                'errors' => ['phone' => ['An active invite has already been sent to that phone number.']],
            ], 422);
        }

        $invite = AgentInvite::create([
            'workspace_id'        => $workspace->id,
            'invited_by_user_id'  => $request->user()->id,
            'role'                => $data['role'],
            'name'                => $data['name'],
            'phone'               => $phone,
            'station_id'          => $data['station_id'] ?? null,
            'ward_id'             => $data['ward_id'] ?? null,
            'constituency_id'     => $data['constituency_id'] ?? null,
            'county_id'           => $data['county_id'] ?? null,
            'invite_token'        => Str::random(40),
            'expiry_hours'        => $data['expiry_hours'],
            'expires_at'          => now()->addHours($data['expiry_hours']),
            'status'              => 'pending',
        ]);

        $presented = $this->presentInvite($invite);
        if (config('app.debug')) {
            $presented['dev_token'] = $invite->invite_token;
        }

        return response()->json(['invite' => $presented], 201);
    }

    public function listInvites(Request $request, string $workspaceId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $invites = AgentInvite::where('workspace_id', $workspace->id)
            ->where('status', '!=', 'declined')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn ($inv) => $this->presentInvite($inv));

        return response()->json(['invites' => $invites]);
    }

    private function resolveWorkspace(Request $request, string $id): Workspace
    {
        $user = $request->user();

        $owned = Workspace::where('id', $id)->where('user_id', $user->id)->first();
        if ($owned) return $owned;

        $managed = Workspace::whereHas('managers', fn ($q) => $q->where('status', 'active')->where('user_id', $user->id))->find($id);
        if ($managed) return $managed;

        abort(404, 'Workspace not found.');
    }

    /**
     * Resolve a workspace for a tier officer with canInvite permission.
     * Returns [workspace, tierRecord] or aborts.
     */
    private function resolveWorkspaceForInvite(Request $request, string $id): array
    {
        $user = $request->user();
        $workspace = Workspace::find($id);
        if (! $workspace) abort(404, 'Workspace not found.');

        if ($workspace->user_id === $user->id) return [$workspace, null];

        $isCM = $workspace->managers()->where('user_id', $user->id)->where('status', 'active')->exists();
        if ($isCM) return [$workspace, null];

        // Tier officer with canInvite delegation
        $tierRecord = WorkspaceAgent::where('workspace_id', $id)
            ->where('user_id', $user->id)
            ->where('status', 'approved')
            ->whereNotIn('role', ['agent', 'volunteer'])
            ->first();

        if ($tierRecord) {
            $canInvite = WorkspaceAgentPermission::where('workspace_id', $id)
                ->where('grantee_role', $tierRecord->role)
                ->where('permission', 'invite')
                ->exists();
            if ($canInvite) return [$workspace, $tierRecord];
            abort(403, 'You do not have invite permission in this workspace.');
        }

        abort(403, 'Access denied.');
    }

    private function isRoleFilled(Workspace $workspace, string $role): bool
    {
        return match ($role) {
            // One-per-workspace tier roles: filled if anyone holds that role in an approved state.
            'national', 'county', 'constituency' =>
                WorkspaceAgent::where('workspace_id', $workspace->id)
                    ->where('role', $role)
                    ->where('status', 'approved')
                    ->exists(),
            // Ward admin: for ward-scoped workspaces (MCA) only one slot exists.
            'ward' => $workspace->scope === 'ward'
                && WorkspaceAgent::where('workspace_id', $workspace->id)
                    ->where('role', 'ward')
                    ->where('status', 'approved')
                    ->exists(),
            // Agents and volunteers are per-station/per-ward — never globally "filled".
            default => false,
        };
    }

    private function wardsForWorkspace(Workspace $workspace, ?WorkspaceAgent $tierRecord = null): \Illuminate\Support\Collection
    {
        $query = DB::table('wards')
            ->leftJoin('constituencies', 'wards.constituency_id', '=', 'constituencies.id')
            ->leftJoin('counties', 'constituencies.county_id', '=', 'counties.id')
            ->select(
                'wards.id',
                'wards.name',
                'constituencies.name as constituency_name',
                'counties.name as county_name',
            );

        if ($tierRecord) {
            // Ward-scoped workspace (MCA): all tier officers see only the workspace's ward.
            if ($workspace->scope === 'ward' && $workspace->ward_id) {
                $query->where('wards.id', $workspace->ward_id);
            } else {
                match ($tierRecord->role) {
                    'ward'         => $tierRecord->ward_id         && $query->where('wards.id', $tierRecord->ward_id),
                    'constituency' => $tierRecord->constituency_id && $query->where('wards.constituency_id', $tierRecord->constituency_id),
                    'county'       => $tierRecord->county_id       && $query->whereIn('wards.constituency_id',
                        fn ($q) => $q->select('id')->from('constituencies')->where('county_id', $tierRecord->county_id)),
                    default        => null,
                };
            }
            return $query->orderBy('wards.name')->get();
        }

        switch ($workspace->scope) {
            case 'ward':
                $query->where('wards.id', $workspace->ward_id);
                break;
            case 'constituency':
                $query->where('wards.constituency_id', $workspace->constituency_id);
                break;
            case 'county':
                $query->where('constituencies.county_id', $workspace->county_id);
                break;
            case 'national':
                $query->limit(200);
                break;
        }

        return $query->get();
    }

    /** @return array<string, mixed> */
    private function presentLink(RecruitmentLink $link): array
    {
        return [
            'id'                        => $link->id,
            'ward_id'                   => $link->ward_id,
            'token'                     => $link->token,
            'open_roles'                => $link->open_roles,
            'require_preferred_station' => $link->require_preferred_station,
            'show_walkthrough'          => $link->show_walkthrough,
            'close_when_full'           => $link->close_when_full,
            'is_active'                 => $link->is_active,
            'application_count'         => $link->application_count,
            'url'                       => config('app.frontend_url', '') . '/apply/' . $link->token,
        ];
    }

    /** @return array<string, mixed> */
    private function presentInvite(AgentInvite $inv): array
    {
        return [
            'id'          => $inv->id,
            'role'        => $inv->role,
            'name'        => $inv->name,
            'phone'       => $inv->phone,
            'station_id'  => $inv->station_id,
            'ward_id'     => $inv->ward_id,
            'status'      => $inv->status,
            'expires_at'  => $inv->expires_at?->toIso8601String(),
            'invited_at'  => $inv->created_at?->toIso8601String(),
        ];
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) === 10 && str_starts_with($digits, '0')) {
            return '+254' . substr($digits, 1);
        }
        if (strlen($digits) === 9) {
            return '+254' . $digits;
        }
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            return '+' . $digits;
        }
        return '+' . $digits;
    }
}

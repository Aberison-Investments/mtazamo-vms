<?php

namespace App\Http\Controllers;

use App\Models\AgentInvite;
use App\Models\RecruitmentLink;
use App\Models\Workspace;
use App\Models\WorkspaceManager;
use App\Models\WorkspaceAgent;
use App\Models\WorkspaceAgentPermission;
use App\Services\AuditService;
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

        $page    = max(1, (int) $request->query('page', 1));
        $perPage = min(200, max(1, (int) $request->query('per_page', 10)));
        $search  = trim((string) $request->query('search', ''));

        $query = $this->wardsQueryForWorkspace($workspace, $tierRecord);

        if ($search !== '') {
            $query->where(function ($q) use ($search) {
                $q->where('wards.name', 'ilike', "%{$search}%")
                  ->orWhere('constituencies.name', 'ilike', "%{$search}%");
            });
        }

        $total = (clone $query)->count();
        $wards = $query->orderBy('wards.name')
                       ->offset(($page - 1) * $perPage)
                       ->limit($perPage)
                       ->get();

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

        // Which constituencies / wards already have an approved agent in this role
        $filledConstituencyIds = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', 'constituency')
            ->where('status', 'approved')
            ->whereNotNull('constituency_id')
            ->pluck('constituency_id')
            ->unique()
            ->values()
            ->toArray();

        $filledWardIds = WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', 'ward')
            ->where('status', 'approved')
            ->whereNotNull('ward_id')
            ->pluck('ward_id')
            ->unique()
            ->values()
            ->toArray();

        return response()->json([
            'workspace' => [
                'id'   => $workspace->id,
                'name' => $workspace->name,
                'seat' => $workspace->seat,
            ],
            'wards'      => $result->values(),
            'wards_meta' => [
                'total'        => $total,
                'per_page'     => $perPage,
                'current_page' => $page,
                'last_page'    => (int) ceil($total / $perPage),
            ],
            'seat_roles'              => $roleData,
            'form_letter'             => SeatRoles::formLetter($seat),
            'my_role'                 => $myRole,
            'filled_constituency_ids' => $filledConstituencyIds,
            'filled_ward_ids'         => $filledWardIds,
        ]);
    }

    public function ward(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $link = RecruitmentLink::firstOrCreate(
            ['workspace_id' => $workspace->id, 'ward_id' => $wardId],
            ['token' => Str::random(40), 'open_roles' => ['agent', 'volunteer']],
        );

        $stations = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->where('pc.ward_id', $wardId)
            ->select('ps.id', 'ps.iebc_code as code', 'ps.stream_number', 'ps.registered_voters',
                     'pc.name', 'pc.code as centre_code')
            ->orderBy('pc.code')
            ->orderBy('ps.stream_number')
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

        if (array_key_exists('is_active', $data)) {
            $action = $data['is_active'] ? 'recruitment.link_opened' : 'recruitment.link_closed';
            AuditService::log($request, $action, $workspaceId,
                'RecruitmentLink', (string) $link->id, null,
                ['ward_id' => $wardId],
            );
        }

        return response()->json(['link' => $this->presentLink($link->fresh())]);
    }

    public function regenerate(Request $request, string $workspaceId, string $wardId): JsonResponse
    {
        [$workspace] = $this->resolveWorkspaceForInvite($request, $workspaceId);

        $link = RecruitmentLink::where('workspace_id', $workspace->id)
            ->where('ward_id', $wardId)
            ->firstOrFail();

        $link->update(['token' => Str::random(40)]);

        AuditService::log($request, 'recruitment.link_regenerated', $workspaceId,
            'RecruitmentLink', (string) $link->id, null,
            ['ward_id' => $wardId],
        );

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
            // All roles below the caller in the chain are invitable, except volunteer
            // (volunteers use the public application link, not targeted invites)
            $validRoles = array_values(array_filter($rolesBelow, fn ($r) => $r !== 'volunteer'));
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

        AuditService::log($request, 'recruitment.invite_sent', $workspaceId,
            'AgentInvite', (string) $invite->id, $invite->name,
            ['role' => $invite->role, 'phone' => $phone],
            $invite->ward_id, $invite->constituency_id, $invite->county_id,
        );

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
        // A role is globally "filled" only when the workspace scope means exactly
        // one slot exists for it. Broader scopes have N slots — never globally filled.
        //
        //  national      → one slot only in presidential (national) workspaces
        //  county        → one slot only in county-scoped workspaces (governor/senator)
        //  constituency  → one slot only in constituency- or ward-scoped workspaces (MP/MCA)
        //  ward          → one slot only in ward-scoped workspaces (MCA)
        //  agent/volunteer → per-station/per-ward, never globally filled
        $singleSlotScopes = [
            'national'     => ['national'],
            'county'       => ['county'],
            'constituency' => ['constituency', 'ward'],
            'ward'         => ['ward'],
        ];

        if (! isset($singleSlotScopes[$role])) {
            return false;
        }

        if (! in_array($workspace->scope, $singleSlotScopes[$role], true)) {
            return false;
        }

        return WorkspaceAgent::where('workspace_id', $workspace->id)
            ->where('role', $role)
            ->where('status', 'approved')
            ->exists();
    }

    private function wardsQueryForWorkspace(Workspace $workspace, ?WorkspaceAgent $tierRecord = null): \Illuminate\Database\Query\Builder
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
            return $query;
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
                // no geo filter — all wards in Kenya
                break;
        }

        return $query;
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
        $wardName         = null;
        $constituencyName = null;
        $countyName       = null;
        $stationName      = null;

        if ($inv->ward_id) {
            $geo = DB::table('wards')
                ->leftJoin('constituencies', 'wards.constituency_id', '=', 'constituencies.id')
                ->leftJoin('counties', 'constituencies.county_id', '=', 'counties.id')
                ->where('wards.id', $inv->ward_id)
                ->select('wards.name as ward_name', 'constituencies.name as constituency_name', 'counties.name as county_name')
                ->first();
            $wardName         = $geo?->ward_name;
            $constituencyName = $geo?->constituency_name;
            $countyName       = $geo?->county_name;
        } elseif ($inv->constituency_id) {
            $geo = DB::table('constituencies')
                ->leftJoin('counties', 'constituencies.county_id', '=', 'counties.id')
                ->where('constituencies.id', $inv->constituency_id)
                ->select('constituencies.name as constituency_name', 'counties.name as county_name')
                ->first();
            $constituencyName = $geo?->constituency_name;
            $countyName       = $geo?->county_name;
        } elseif ($inv->county_id) {
            $geo = DB::table('counties')->where('id', $inv->county_id)->value('name');
            $countyName = $geo;
        }

        if ($inv->station_id) {
            $stationName = DB::table('polling_stations')->where('id', $inv->station_id)->value('name');
        }

        return [
            'id'                => $inv->id,
            'role'              => $inv->role,
            'name'              => $inv->name,
            'phone'             => $inv->phone,
            'station_id'        => $inv->station_id,
            'station_name'      => $stationName,
            'ward_id'           => $inv->ward_id,
            'ward_name'         => $wardName,
            'constituency_name' => $constituencyName,
            'county_name'       => $countyName,
            'status'            => $inv->status,
            'expires_at'        => $inv->expires_at?->toIso8601String(),
            'invited_at'        => $inv->created_at?->toIso8601String(),
        ];
    }

    private function normalizePhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        // Already has country code: 254XXXXXXXXX
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            return '+' . $digits;
        }
        // Local format with leading zero: 07XXXXXXXX
        if (str_starts_with($digits, '0') && strlen($digits) === 10) {
            return '+254' . substr($digits, 1);
        }
        // 9-digit local: 7XXXXXXXX
        if (strlen($digits) === 9) {
            return '+254' . $digits;
        }
        // Frontend always prepends +254 — strip it and re-apply cleanly
        return '+254' . ltrim($digits, '0');
    }
}

<?php

namespace App\Http\Controllers;

use App\Models\ElectionRun;
use App\Models\Workspace;
use App\Services\AuditService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class ElectionRunController extends Controller
{
    private function requireCMOrAspirant(Request $request, Workspace $workspace): void
    {
        $user = $request->user();

        // Aspirant (workspace owner)
        if ($workspace->user_id === $user->id) return;

        // Active campaign manager
        $isCM = \DB::table('workspace_managers')
            ->where('workspace_id', $workspace->id)
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();

        if (! $isCM) abort(403, 'Only the aspirant or campaign manager can manage runs.');
    }

    private function formatRun(ElectionRun $run): array
    {
        return [
            'id'         => $run->id,
            'name'       => $run->name,
            'type'       => $run->type,
            'status'     => $run->status,
            'run_date'   => $run->run_date?->toDateString(),
            'start_time' => $run->start_time,
            'end_time'   => $run->end_time,
            'opened_at'  => $run->opened_at?->toIso8601String(),
            'closed_at'  => $run->closed_at?->toIso8601String(),
            'created_at' => $run->created_at?->toIso8601String(),
        ];
    }

    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = Workspace::findOrFail($workspaceId);

        $runs = ElectionRun::where('workspace_id', $workspaceId)
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'runs'       => $runs->map(fn ($r) => $this->formatRun($r)),
            'active_run' => $runs->first(fn ($r) => $r->isActive())
                ? $this->formatRun($runs->first(fn ($r) => $r->isActive()))
                : null,
        ]);
    }

    public function store(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = Workspace::findOrFail($workspaceId);
        $this->requireCMOrAspirant($request, $workspace);

        $data = $request->validate([
            'name'       => 'required|string|max:120',
            'type'       => 'required|in:live,rehearsal',
            'run_date'   => 'nullable|date',
            'start_time' => 'nullable|date_format:H:i',
            'end_time'   => 'nullable|date_format:H:i',
        ]);

        // Enforce single active run constraint.
        $hasActive = ElectionRun::where('workspace_id', $workspaceId)
            ->whereIn('status', ['open', 'tallying'])
            ->exists();

        if ($hasActive) {
            return response()->json([
                'error' => 'A run is already active in this workspace. Deactivate it before creating a new one.',
            ], 422);
        }

        $run = ElectionRun::create([
            'workspace_id'       => $workspaceId,
            'name'               => $data['name'],
            'type'               => $data['type'],
            'status'             => 'open',
            'run_date'           => $data['run_date'] ?? null,
            'start_time'         => $data['start_time'] ?? null,
            'end_time'           => $data['end_time'] ?? null,
            'opened_at'          => now(),
            'created_by_user_id' => $request->user()->id,
        ]);

        AuditService::log($request, 'run.created', $workspaceId,
            'ElectionRun', $run->id, $run->name,
            ['type' => $run->type, 'run_date' => $run->run_date?->toDateString()],
        );

        return response()->json(['run' => $this->formatRun($run)], 201);
    }

    public function update(Request $request, string $workspaceId, string $runId): JsonResponse
    {
        $workspace = Workspace::findOrFail($workspaceId);
        $this->requireCMOrAspirant($request, $workspace);

        $run = ElectionRun::where('workspace_id', $workspaceId)->findOrFail($runId);

        $data = $request->validate([
            'action'     => 'sometimes|in:activate,deactivate,certify,archive',
            'name'       => 'sometimes|string|max:120',
            'run_date'   => 'nullable|date',
            'start_time' => 'nullable|date_format:H:i',
            'end_time'   => 'nullable|date_format:H:i',
        ]);

        // Apply status transition if requested.
        if (isset($data['action'])) {
            match ($data['action']) {
                'activate' => $this->activate($workspaceId, $run),
                'deactivate' => $this->deactivate($run),
                'certify' => $this->certify($run),
                'archive' => $run->update(['status' => 'archived']),
            };
        }

        // Update metadata fields if provided.
        $updates = array_filter([
            'name'       => $data['name'] ?? null,
            'run_date'   => $data['run_date'] ?? null,
            'start_time' => $data['start_time'] ?? null,
            'end_time'   => $data['end_time'] ?? null,
        ], fn ($v) => $v !== null);

        if ($updates) $run->update($updates);

        $run->refresh();

        if (isset($data['action'])) {
            AuditService::log($request, 'run.' . $data['action'], $workspaceId,
                'ElectionRun', $run->id, $run->name,
                ['status' => $run->status],
            );
        }

        return response()->json(['run' => $this->formatRun($run)]);
    }

    private function activate(string $workspaceId, ElectionRun $run): void
    {
        if ($run->status === 'open') return;

        // Permanently closed runs can never be reopened.
        if ($run->closed_at !== null) {
            abort(422, 'This run was permanently closed and cannot be reopened.');
        }

        $hasActive = ElectionRun::where('workspace_id', $workspaceId)
            ->whereIn('status', ['open', 'tallying'])
            ->where('id', '!=', $run->id)
            ->exists();

        if ($hasActive) abort(422, 'Another run is already active. Deactivate it first.');

        $run->update(['status' => 'open', 'opened_at' => now(), 'closed_at' => null]);
    }

    private function deactivate(ElectionRun $run): void
    {
        // One-step permanent close — can never be reopened after this.
        $run->update(['status' => 'certified', 'closed_at' => now()]);
    }

    private function certify(ElectionRun $run): void
    {
        if ($run->status !== 'tallying') abort(422, 'Only a tallying run can be certified.');
        $run->update(['status' => 'certified']);
    }
}

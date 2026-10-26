<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceCandidate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class WorkspaceCandidatesController extends Controller
{
    private function resolveWorkspace(Request $request, string $id): Workspace
    {
        $user = $request->user();
        $workspace = Workspace::with('user')->find($id);
        if (! $workspace) abort(404);

        if ($workspace->user_id === $user->id) return $workspace;

        $isCM = $workspace->managers()
            ->where('user_id', $user->id)
            ->where('status', 'active')
            ->exists();
        if ($isCM) return $workspace;

        abort(403);
    }

    private function computeStatus(Workspace $workspace): string
    {
        if (! $workspace->candidates_published_at) return 'draft';
        if ($workspace->candidates_updated_at &&
            $workspace->candidates_updated_at->gt($workspace->candidates_published_at)) {
            return 'unpublished_changes';
        }
        return 'published';
    }

    private function formatResponse(Workspace $workspace): array
    {
        $saved = WorkspaceCandidate::where('workspace_id', $workspace->id)
            ->orderBy('ballot_order')
            ->get();

        if ($saved->isEmpty()) {
            $name = trim(($workspace->user->first_name ?? '') . ' ' . ($workspace->user->last_name ?? ''));
            $candidates = [[
                'id'           => 'ours',
                'name'         => $name,
                'party'        => $workspace->party ?? '',
                'ballot_order' => 1,
                'is_ours'      => true,
            ]];
        } else {
            $candidates = $saved->map(fn ($c) => [
                'id'           => $c->id,
                'name'         => $c->name,
                'party'        => $c->party ?? '',
                'ballot_order' => $c->ballot_order,
                'is_ours'      => (bool) $c->is_ours,
            ])->values()->toArray();
        }

        return [
            'candidates' => $candidates,
            'status'     => $this->computeStatus($workspace),
        ];
    }

    public function index(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        return response()->json($this->formatResponse($workspace));
    }

    public function save(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);

        $data = $request->validate([
            'candidates'           => 'required|array|min:1',
            'candidates.*.name'    => 'required|string|max:200',
            'candidates.*.party'   => 'nullable|string|max:150',
            'candidates.*.is_ours' => 'required|boolean',
        ]);

        DB::transaction(function () use ($workspace, $data) {
            WorkspaceCandidate::where('workspace_id', $workspace->id)->delete();
            foreach ($data['candidates'] as $i => $c) {
                WorkspaceCandidate::create([
                    'workspace_id' => $workspace->id,
                    'name'         => $c['name'],
                    'party'        => $c['party'] ?? null,
                    'ballot_order' => $i + 1,
                    'is_ours'      => (bool) ($c['is_ours'] ?? false),
                ]);
            }
            $workspace->update(['candidates_updated_at' => now()]);
        });

        return response()->json($this->formatResponse($workspace->fresh('user')));
    }

    public function publish(Request $request, string $id): JsonResponse
    {
        $workspace = $this->resolveWorkspace($request, $id);
        $workspace->update(['candidates_published_at' => now()]);
        return response()->json($this->formatResponse($workspace->fresh('user')));
    }
}

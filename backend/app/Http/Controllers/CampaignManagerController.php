<?php

namespace App\Http\Controllers;

use App\Models\Workspace;
use App\Models\WorkspaceManager;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class CampaignManagerController extends Controller
{
    public function index(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $this->resolveReadable($request, $workspaceId);

        $managers = WorkspaceManager::where('workspace_id', $workspace->id)
            ->where('status', '!=', 'removed')
            ->orderBy('created_at')
            ->get()
            ->map(fn (WorkspaceManager $m) => $this->present($m));

        return response()->json(['managers' => $managers]);
    }

    private function withDevToken(array $presented, WorkspaceManager $m): array
    {
        if (config('app.debug')) {
            $presented['dev_token'] = $m->invite_token;
        }
        return $presented;
    }

    public function store(Request $request, string $workspaceId): JsonResponse
    {
        $workspace = $request->user()->workspaces()->findOrFail($workspaceId);

        $data = $request->validate([
            'name'         => ['required', 'string', 'max:150'],
            'phone'        => ['required', 'string', 'max:30'],
            'email'        => ['nullable', 'email', 'max:200'],
            'note'         => ['nullable', 'string', 'max:500'],
            'expiry_hours' => ['required', 'integer', 'in:24,72,168'],
        ]);

        $phone = $this->normalizePhone($data['phone']);

        if (\App\Models\User::where('phone', $phone)->exists()) {
            return response()->json([
                'error'  => 'That phone number is already registered to an existing account.',
                'errors' => ['phone' => ['That phone number is already registered to an existing account.']],
            ], 422);
        }

        $exists = WorkspaceManager::where('workspace_id', $workspace->id)
            ->where('phone', $phone)
            ->where('status', '!=', 'removed')
            ->exists();

        if ($exists) {
            return response()->json([
                'error'  => 'That phone number already has access to this workspace.',
                'errors' => ['phone' => ['That phone number already has access to this workspace.']],
            ], 422);
        }

        $expiryHours = (int) $data['expiry_hours'];

        $manager = WorkspaceManager::create([
            'workspace_id' => $workspace->id,
            'invited_by'   => $request->user()->id,
            'name'         => $data['name'],
            'phone'        => $phone,
            'email'        => $data['email'] ?? null,
            'note'         => $data['note'] ?? null,
            'expiry_hours' => $expiryHours,
            'status'       => 'pending',
            'invite_token' => $this->generateToken(),
            'expires_at'   => now()->addHours($expiryHours),
        ]);

        return response()->json(['manager' => $this->withDevToken($this->present($manager), $manager)], 201);
    }

    public function resend(Request $request, string $workspaceId, string $managerId): JsonResponse
    {
        $workspace = $request->user()->workspaces()->findOrFail($workspaceId);

        $manager = WorkspaceManager::where('workspace_id', $workspace->id)
            ->where('id', $managerId)
            ->where('status', 'pending')
            ->firstOrFail();

        $manager->update([
            'invite_token' => $this->generateToken(),
            'expires_at'   => now()->addHours($manager->expiry_hours),
        ]);

        $fresh = $manager->fresh();
        return response()->json(['manager' => $this->withDevToken($this->present($fresh), $fresh)]);
    }

    public function destroy(Request $request, string $workspaceId, string $managerId): JsonResponse
    {
        $workspace = $request->user()->workspaces()->findOrFail($workspaceId);

        $manager = WorkspaceManager::where('workspace_id', $workspace->id)
            ->where('id', $managerId)
            ->where('status', '!=', 'removed')
            ->firstOrFail();

        $manager->update(['status' => 'removed']);

        return response()->json(['ok' => true]);
    }

    /** Workspace owner OR active campaign manager can read. */
    private function resolveReadable(Request $request, string $id): Workspace
    {
        $user      = $request->user();
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

    /** @return array<string, mixed> */
    private function present(WorkspaceManager $m): array
    {
        return [
            'id'           => $m->id,
            'name'         => $m->name,
            'phone'        => $m->phone,
            'phone_masked' => $this->maskPhone($m->phone),
            'email'        => $m->email,
            'status'       => $m->status,
            'expiry_hours' => $m->expiry_hours,
            'expires_at'   => $m->expires_at?->toIso8601String(),
            'accepted_at'  => $m->accepted_at?->toIso8601String(),
            'invited_at'   => $m->created_at?->toIso8601String(),
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

    private function maskPhone(string $phone): string
    {
        $digits = preg_replace('/\D/', '', $phone);
        if (str_starts_with($digits, '254') && strlen($digits) >= 12) {
            $local = substr($digits, 3);
            $last3 = substr($local, -3);
            $first = $local[0];
            return "+254 {$first}·· ··· {$last3}";
        }
        return $phone;
    }

    private function generateToken(): string
    {
        return strtoupper(Str::random(6));
    }
}

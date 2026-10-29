<?php

namespace App\Http\Controllers;

use App\Models\ElectionRun;
use App\Models\TierFormSubmission;
use App\Models\WorkspaceCandidate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class TierFormController extends Controller
{
    // ---- show: get existing draft/submission + platform aggregate ------------------

    public function show(Request $request, string $workspaceId, string $runId): JsonResponse
    {
        $user = $request->user();

        $run = ElectionRun::where('workspace_id', $workspaceId)->findOrFail($runId);

        $tier  = $request->query('tier', 'constituency');
        $geoId = $request->query('geo_id');

        $candidates = WorkspaceCandidate::where('workspace_id', $workspaceId)
            ->orderBy('ballot_order')->get();

        $platformTotals = $this->platformTotals($workspaceId, $runId, $tier, $geoId, $candidates);

        $existing = TierFormSubmission::where('run_id', $runId)
            ->where('workspace_id', $workspaceId)
            ->where('tier_level', $tier)
            ->where('geo_id', $geoId)
            ->first();

        return response()->json([
            'form'             => $existing ? $this->formatForm($existing) : null,
            'platform_totals'  => $platformTotals,
            'candidates'       => $candidates->map(fn ($c) => [
                'id'    => $c->id,
                'name'  => $c->name,
                'party' => $c->party ?? '',
            ])->values(),
        ]);
    }

    // ---- save draft ---------------------------------------------------------------

    public function save(Request $request, string $workspaceId, string $runId): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'tier'                    => 'required|string|in:constituency,county,national',
            'geo_id'                  => 'nullable|uuid',
            'candidate_data'          => 'nullable|array',
            'candidate_data.*.candidate_id'   => 'required|string',
            'candidate_data.*.form_votes'     => 'required|integer|min:0',
            'candidate_data.*.platform_votes' => 'required|integer|min:0',
            'total_valid_form'        => 'nullable|integer|min:0',
            'total_valid_platform'    => 'nullable|integer|min:0',
            'rejected_ballots_form'   => 'nullable|integer|min:0',
            'rejected_ballots_platform' => 'nullable|integer|min:0',
            'discrepancy_flags'       => 'nullable|array',
            'discrepancy_flags.*.station_id'       => 'required|string',
            'discrepancy_flags.*.station_name'     => 'required|string',
            'discrepancy_flags.*.ward_name'        => 'nullable|string',
            'discrepancy_flags.*.platform_votes'   => 'required|integer',
            'discrepancy_flags.*.form_votes'       => 'required|integer',
            'discrepancy_flags.*.note'             => 'nullable|string|max:1000',
            'form_image_paths'        => 'nullable|array',
            'form_image_paths.*'      => 'string',
            'has_discrepancy'         => 'nullable|boolean',
        ]);

        ElectionRun::where('workspace_id', $workspaceId)->findOrFail($runId);

        $form = TierFormSubmission::firstOrNew([
            'run_id'       => $runId,
            'workspace_id' => $workspaceId,
            'tier_level'   => $data['tier'],
            'geo_id'       => $data['geo_id'] ?? null,
        ]);

        // Cannot re-edit a submitted form
        if ($form->exists && $form->status === 'submitted') {
            return response()->json(['error' => 'Form has already been submitted.'], 422);
        }

        $form->fill([
            'submitted_by_user_id'     => $user->id,
            'candidate_data'           => $data['candidate_data'] ?? null,
            'total_valid_form'         => $data['total_valid_form'] ?? null,
            'total_valid_platform'     => $data['total_valid_platform'] ?? null,
            'rejected_ballots_form'    => $data['rejected_ballots_form'] ?? null,
            'rejected_ballots_platform'=> $data['rejected_ballots_platform'] ?? null,
            'discrepancy_flags'        => $data['discrepancy_flags'] ?? null,
            'has_discrepancy'          => $data['has_discrepancy'] ?? false,
            'form_image_paths'         => $data['form_image_paths'] ?? null,
            'status'                   => 'draft',
        ]);

        if (!$form->exists) {
            $form->id = (string) \Illuminate\Support\Str::uuid();
        }

        $form->save();

        return response()->json(['form' => $this->formatForm($form)]);
    }

    // ---- submit (finalise) -------------------------------------------------------

    public function submit(Request $request, string $workspaceId, string $runId): JsonResponse
    {
        $user = $request->user();

        $data = $request->validate([
            'tier'                    => 'required|string|in:constituency,county,national',
            'geo_id'                  => 'nullable|uuid',
            'candidate_data'          => 'required|array|min:1',
            'candidate_data.*.candidate_id'   => 'required|string',
            'candidate_data.*.form_votes'     => 'required|integer|min:0',
            'candidate_data.*.platform_votes' => 'required|integer|min:0',
            'total_valid_form'        => 'required|integer|min:0',
            'total_valid_platform'    => 'nullable|integer|min:0',
            'rejected_ballots_form'   => 'nullable|integer|min:0',
            'rejected_ballots_platform' => 'nullable|integer|min:0',
            'discrepancy_flags'       => 'nullable|array',
            'discrepancy_flags.*.station_id'       => 'required|string',
            'discrepancy_flags.*.station_name'     => 'required|string',
            'discrepancy_flags.*.ward_name'        => 'nullable|string',
            'discrepancy_flags.*.platform_votes'   => 'required|integer',
            'discrepancy_flags.*.form_votes'       => 'required|integer',
            'discrepancy_flags.*.note'             => 'nullable|string|max:1000',
            'form_image_paths'        => 'nullable|array',
            'form_image_paths.*'      => 'string',
            'has_discrepancy'         => 'nullable|boolean',
        ]);

        ElectionRun::where('workspace_id', $workspaceId)->findOrFail($runId);

        $form = TierFormSubmission::firstOrNew([
            'run_id'       => $runId,
            'workspace_id' => $workspaceId,
            'tier_level'   => $data['tier'],
            'geo_id'       => $data['geo_id'] ?? null,
        ]);

        if ($form->exists && $form->status === 'submitted') {
            return response()->json(['error' => 'Form has already been submitted.'], 422);
        }

        $form->fill([
            'submitted_by_user_id'     => $user->id,
            'candidate_data'           => $data['candidate_data'],
            'total_valid_form'         => $data['total_valid_form'],
            'total_valid_platform'     => $data['total_valid_platform'] ?? null,
            'rejected_ballots_form'    => $data['rejected_ballots_form'] ?? null,
            'rejected_ballots_platform'=> $data['rejected_ballots_platform'] ?? null,
            'discrepancy_flags'        => $data['discrepancy_flags'] ?? null,
            'has_discrepancy'          => $data['has_discrepancy'] ?? false,
            'form_image_paths'         => $data['form_image_paths'] ?? null,
            'status'                   => 'submitted',
            'submitted_at'             => now(),
        ]);

        if (!$form->exists) {
            $form->id = (string) \Illuminate\Support\Str::uuid();
        }

        $form->save();

        return response()->json(['form' => $this->formatForm($form)]);
    }

    // ---- image upload ------------------------------------------------------------

    public function uploadImage(Request $request, string $workspaceId): JsonResponse
    {
        $request->validate(['image' => 'required|image|max:8192']);

        $path = $request->file('image')->store('tier_forms/' . $workspaceId, 'public');

        return response()->json([
            'path' => $path,
            'url'  => Storage::disk('public')->url($path),
        ]);
    }

    // ---- helpers -----------------------------------------------------------------

    private function formatForm(TierFormSubmission $f): array
    {
        $imagePaths = $f->form_image_paths ?? [];
        $imageUrls  = array_map(
            fn ($p) => str_starts_with($p, 'http') ? $p : Storage::disk('public')->url($p),
            $imagePaths
        );

        return [
            'id'                       => $f->id,
            'tier_level'               => $f->tier_level,
            'geo_id'                   => $f->geo_id,
            'candidate_data'           => $f->candidate_data ?? [],
            'total_valid_form'         => $f->total_valid_form,
            'total_valid_platform'     => $f->total_valid_platform,
            'rejected_ballots_form'    => $f->rejected_ballots_form,
            'rejected_ballots_platform'=> $f->rejected_ballots_platform,
            'discrepancy_flags'        => $f->discrepancy_flags ?? [],
            'has_discrepancy'          => $f->has_discrepancy,
            'form_image_urls'          => $imageUrls,
            'form_image_paths'         => $imagePaths,
            'status'                   => $f->status,
            'submitted_at'             => $f->submitted_at?->toISOString(),
        ];
    }

    private function platformTotals(
        string $workspaceId,
        string $runId,
        string $tier,
        ?string $geoId,
        $candidates,
    ): array {
        $q = DB::table('polling_stations as ps')
            ->join('polling_centres as pc', 'pc.id', '=', 'ps.polling_centre_id')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->join('constituencies as c', 'c.id', '=', 'w.constituency_id')
            ->join('counties as co', 'co.id', '=', 'w.county_id')
            ->join('station_results as sr', function ($j) use ($workspaceId, $runId) {
                $j->on('sr.station_id', '=', 'ps.id')
                  ->where('sr.workspace_id', $workspaceId)
                  ->where('sr.run_id', $runId)
                  ->whereNotIn('sr.status', ['draft']);
            })
            ->select('sr.votes', 'sr.rejected_ballots');

        match ($tier) {
            'constituency' => $q->where('c.id', $geoId),
            'county'       => $q->where('co.id', $geoId),
            default        => null,
        };

        $rows = $q->get();

        $candidateTotals = [];
        $totalRejected   = 0;

        foreach ($rows as $row) {
            $votes = json_decode($row->votes ?? '[]', true) ?? [];
            foreach ($votes as $v) {
                $cid = $v['candidate_id'];
                $candidateTotals[$cid] = ($candidateTotals[$cid] ?? 0) + ($v['votes'] ?? 0);
            }
            $totalRejected += $row->rejected_ballots ?? 0;
        }

        $totalValid = array_sum($candidateTotals);

        return [
            'candidates' => $candidates->map(fn ($c) => [
                'candidate_id'   => $c->id,
                'candidate_name' => $c->name,
                'platform_votes' => $candidateTotals[$c->id] ?? 0,
            ])->values(),
            'total_valid'         => $totalValid,
            'rejected_ballots'    => $totalRejected,
            'reporting_stations'  => $rows->count(),
        ];
    }
}

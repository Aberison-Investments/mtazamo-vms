<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tier_form_submissions', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(\DB::raw('gen_random_uuid()'));
            $table->uuid('run_id');
            $table->uuid('workspace_id');
            $table->string('tier_level', 32); // constituency | county | national
            $table->uuid('geo_id')->nullable(); // constituency_id | county_id | null for national

            $table->unsignedBigInteger('submitted_by_user_id');
            $table->foreign('submitted_by_user_id')->references('id')->on('users');

            // Candidate totals: [{candidate_id, candidate_name, form_votes, platform_votes}]
            $table->jsonb('candidate_data')->nullable();
            $table->integer('total_valid_form')->nullable();
            $table->integer('total_valid_platform')->nullable();
            $table->integer('rejected_ballots_form')->nullable();
            $table->integer('rejected_ballots_platform')->nullable();

            // Per-station discrepancy flags: [{station_id, station_name, ward_name, platform_votes, form_votes, note}]
            $table->jsonb('discrepancy_flags')->nullable();
            $table->boolean('has_discrepancy')->default(false);

            // Photos of the physical form (multiple allowed)
            $table->jsonb('form_image_paths')->nullable();

            $table->string('status', 32)->default('draft'); // draft | submitted
            $table->timestamp('submitted_at')->nullable();
            $table->timestamps();

            $table->foreign('run_id')->references('id')->on('election_runs');
            $table->foreign('workspace_id')->references('id')->on('workspaces');

            // One submission per tier/geo per run
            $table->index(['run_id', 'workspace_id', 'tier_level', 'geo_id'], 'tier_form_run_scope_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tier_form_submissions');
    }
};

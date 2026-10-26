<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('station_results', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->uuid('station_id');
            $table->foreign('station_id')->references('id')->on('polling_stations');
            $table->foreignId('submitted_by_user_id')->constrained('users');
            $table->unsignedInteger('registered_voters');
            $table->jsonb('votes'); // [{candidate_id, candidate_name, votes}]
            $table->unsignedInteger('rejected_ballots')->default(0);
            $table->unsignedInteger('disputed_votes')->default(0);
            $table->string('photo_path')->nullable();
            $table->string('reference_code', 30);
            $table->timestamp('submitted_at');
            $table->unsignedInteger('version')->default(1);
            $table->timestamps();

            $table->index(['workspace_id', 'station_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('station_results');
    }
};

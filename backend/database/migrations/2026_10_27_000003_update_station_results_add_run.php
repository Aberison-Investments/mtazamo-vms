<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Clean break: remove all existing records so we can add a non-null run_id.
        DB::statement('DELETE FROM station_results');

        Schema::table('station_results', function (Blueprint $table) {
            // Required FK to the run this result belongs to.
            $table->foreignUuid('run_id')
                ->after('workspace_id')
                ->constrained('election_runs')
                ->cascadeOnDelete();

            // Workflow status for ward admin reconciliation.
            $table->enum('status', ['draft', 'submitted', 'queried', 'verified'])
                ->default('submitted')
                ->after('version');

            // Ward admin who verified/queried this result.
            $table->unsignedBigInteger('verified_by_user_id')->nullable()->after('status');
            $table->foreign('verified_by_user_id')->references('id')->on('users');

            // Short note set when a ward admin queries a result.
            $table->string('query_note')->nullable()->after('verified_by_user_id');

            // Whether the agent confirmed this submission via OTP.
            $table->boolean('otp_verified')->default(false)->after('query_note');

            $table->index(['workspace_id', 'run_id', 'station_id']);
        });
    }

    public function down(): void
    {
        Schema::table('station_results', function (Blueprint $table) {
            $table->dropForeign(['run_id']);
            $table->dropForeign(['verified_by_user_id']);
            $table->dropIndex(['workspace_id', 'run_id', 'station_id']);
            $table->dropColumn(['run_id', 'status', 'verified_by_user_id', 'query_note', 'otp_verified']);
        });
    }
};

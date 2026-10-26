<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_candidates', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('name', 200);
            $table->string('party', 150)->nullable();
            $table->unsignedSmallInteger('ballot_order');
            $table->boolean('is_ours')->default(false);
            $table->timestamps();

            $table->unique(['workspace_id', 'ballot_order']);
        });

        Schema::table('workspaces', function (Blueprint $table) {
            $table->timestamp('candidates_updated_at')->nullable()->after('status');
            $table->timestamp('candidates_published_at')->nullable()->after('candidates_updated_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_candidates');

        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropColumn(['candidates_updated_at', 'candidates_published_at']);
        });
    }
};

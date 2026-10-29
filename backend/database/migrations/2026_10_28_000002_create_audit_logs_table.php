<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->bigIncrements('id');

            // Who did it
            $table->foreignId('actor_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('actor_role')->nullable(); // their role in the workspace at the time

            // Which workspace (null for auth events like login)
            $table->foreignUuid('workspace_id')->nullable()->constrained()->nullOnDelete();

            // What happened
            $table->string('action', 80); // e.g. 'agent.approved', 'result.submitted'

            // What was affected (optional)
            $table->string('entity_type', 60)->nullable(); // e.g. 'WorkspaceAgent'
            $table->string('entity_id', 40)->nullable();   // UUID or int
            $table->string('entity_label')->nullable();     // human-readable, e.g. agent name

            // Extra structured detail (vote counts, old→new state, reason, etc.)
            $table->jsonb('context')->nullable();

            // Geographic scope — used to filter visibility for tier officers
            $table->uuid('ward_id')->nullable();
            $table->uuid('constituency_id')->nullable();
            $table->uuid('county_id')->nullable();

            // Request context
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();

            $table->timestamp('created_at')->useCurrent();

            // Indexes for the most common query patterns
            $table->index(['workspace_id', 'created_at']);
            $table->index(['actor_user_id', 'created_at']);
            $table->index(['workspace_id', 'ward_id', 'created_at']);
            $table->index(['workspace_id', 'constituency_id', 'created_at']);
            $table->index(['workspace_id', 'county_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};

<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_agent_permissions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->string('grantee_role', 30);
            $table->uuid('grantee_geo_id')->nullable(); // null = workspace-wide policy
            $table->enum('permission', ['invite', 'assign']);
            $table->foreignId('granted_by_user_id')->constrained('users');
            $table->timestamp('granted_at');
            $table->timestamps();

            $table->index(['workspace_id', 'grantee_role', 'permission']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_agent_permissions');
    }
};

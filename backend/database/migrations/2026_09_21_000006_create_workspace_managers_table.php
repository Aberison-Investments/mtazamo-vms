<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspace_managers', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by')->constrained('users');
            $table->string('name');
            $table->string('phone');
            $table->string('email')->nullable();
            $table->text('note')->nullable();
            $table->unsignedInteger('expiry_hours')->default(72);
            $table->enum('status', ['pending', 'active', 'removed'])->default('pending');
            $table->string('invite_token', 64)->unique()->nullable();
            $table->timestamp('expires_at')->nullable();
            $table->timestamp('accepted_at')->nullable();
            $table->timestamps();

            $table->unique(['workspace_id', 'phone']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_managers');
    }
};

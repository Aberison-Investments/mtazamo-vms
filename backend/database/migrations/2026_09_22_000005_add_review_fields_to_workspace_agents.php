<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_agents', function (Blueprint $table) {
            $table->boolean('phone_verified')->default(false)->after('photo_path');
            $table->text('rejection_reason')->nullable()->after('approved_at');
            $table->foreignId('rejected_by_user_id')
                ->nullable()->constrained('users')->nullOnDelete()
                ->after('rejection_reason');
            $table->timestamp('rejected_at')->nullable()->after('rejected_by_user_id');
        });
    }

    public function down(): void
    {
        Schema::table('workspace_agents', function (Blueprint $table) {
            $table->dropForeign(['rejected_by_user_id']);
            $table->dropColumn(['phone_verified', 'rejection_reason', 'rejected_by_user_id', 'rejected_at']);
        });
    }
};

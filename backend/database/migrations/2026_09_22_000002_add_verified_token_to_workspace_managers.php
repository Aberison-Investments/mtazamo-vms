<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_managers', function (Blueprint $table) {
            $table->string('verified_token_hash')->nullable()->after('otp_attempts');
            $table->timestamp('verified_token_expires_at')->nullable()->after('verified_token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('workspace_managers', function (Blueprint $table) {
            $table->dropColumn(['verified_token_hash', 'verified_token_expires_at']);
        });
    }
};

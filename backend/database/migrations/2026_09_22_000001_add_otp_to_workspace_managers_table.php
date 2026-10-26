<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_managers', function (Blueprint $table) {
            $table->string('otp_code_hash')->nullable()->after('accepted_at');
            $table->timestamp('otp_expires_at')->nullable()->after('otp_code_hash');
            $table->unsignedInteger('otp_attempts')->default(0)->after('otp_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('workspace_managers', function (Blueprint $table) {
            $table->dropColumn(['otp_code_hash', 'otp_expires_at', 'otp_attempts']);
        });
    }
};

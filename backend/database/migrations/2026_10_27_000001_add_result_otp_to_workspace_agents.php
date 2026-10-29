<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspace_agents', function (Blueprint $table) {
            $table->string('result_otp_hash')->nullable()->after('approved_at');
            $table->timestamp('result_otp_expires_at')->nullable()->after('result_otp_hash');
            $table->unsignedTinyInteger('result_otp_attempts')->default(0)->after('result_otp_expires_at');
        });
    }

    public function down(): void
    {
        Schema::table('workspace_agents', function (Blueprint $table) {
            $table->dropColumn(['result_otp_hash', 'result_otp_expires_at', 'result_otp_attempts']);
        });
    }
};

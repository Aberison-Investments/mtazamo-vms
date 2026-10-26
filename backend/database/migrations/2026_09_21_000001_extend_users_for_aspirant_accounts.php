<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Aspirant account fields (from the "Create account" screen) plus the SMS OTP
 * challenge state used for phone-based two-factor at every log-in.
 *
 * Phone is the second factor; email is verified separately from the setup guide,
 * so `email_verified_at` (already on the base users table) stays nullable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('first_name')->nullable()->after('name');
            $table->string('last_name')->nullable()->after('first_name');
            $table->unsignedTinyInteger('age')->nullable()->after('last_name');
            $table->string('gender')->nullable()->after('age');
            $table->string('phone')->nullable()->unique()->after('gender');
            $table->timestamp('phone_verified_at')->nullable()->after('phone');

            // Pending SMS OTP challenge (one live challenge per user is enough here).
            $table->string('otp_code_hash')->nullable();
            $table->string('otp_purpose')->nullable(); // 'phone_verification' | 'login'
            $table->timestamp('otp_expires_at')->nullable();
            $table->unsignedTinyInteger('otp_attempts')->default(0);
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['phone']);
            $table->dropColumn([
                'first_name', 'last_name', 'age', 'gender', 'phone', 'phone_verified_at',
                'otp_code_hash', 'otp_purpose', 'otp_expires_at', 'otp_attempts',
            ]);
        });
    }
};

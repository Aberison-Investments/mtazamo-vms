<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Email verification link state. `email_verified_at` already exists on the base
 * users table; this adds the pending single-use link token (stored as a SHA-256
 * hash so it stays queryable) and its expiry.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('email_verification_token_hash', 64)->nullable()->after('email');
            $table->timestamp('email_verification_expires_at')->nullable()->after('email_verification_token_hash');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['email_verification_token_hash', 'email_verification_expires_at']);
        });
    }
};

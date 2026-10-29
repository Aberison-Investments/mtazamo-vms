<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Wipe existing tokens — all sessions will require re-login after this migration.
        DB::table('api_tokens')->truncate();

        Schema::table('api_tokens', function (Blueprint $table) {
            // Short-lived access token (2 hours). The hash of the plaintext token
            // already lives in token_hash.
            $table->timestamp('access_expires_at')->nullable()->after('token_hash');

            // Long-lived refresh token (30 days, rolling). Only the hash is stored.
            $table->string('refresh_token_hash', 64)->nullable()->unique()->after('access_expires_at');
            $table->timestamp('refresh_expires_at')->nullable()->after('refresh_token_hash');

            // Explicit revocation timestamp. NULL means the session is still valid.
            $table->timestamp('revoked_at')->nullable()->after('refresh_expires_at');

            // Context recorded at issuance for session management / audit.
            $table->string('ip_address', 45)->nullable()->after('revoked_at');
            $table->text('user_agent')->nullable()->after('ip_address');
            $table->string('device_label')->nullable()->after('user_agent');
        });
    }

    public function down(): void
    {
        Schema::table('api_tokens', function (Blueprint $table) {
            $table->dropColumn([
                'access_expires_at', 'refresh_token_hash', 'refresh_expires_at',
                'revoked_at', 'ip_address', 'user_agent', 'device_label',
            ]);
        });
    }
};

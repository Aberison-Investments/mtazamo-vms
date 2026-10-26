<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('workspace_managers', 'user_id')) {
            Schema::table('workspace_managers', function (Blueprint $table) {
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete()->after('id');
            });
        }

        Schema::create('recruitment_links', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->uuid('ward_id');
            $table->foreign('ward_id')->references('id')->on('wards')->cascadeOnDelete();
            $table->string('token', 40)->unique();
            $table->json('open_roles')->default('["agent","volunteer"]');
            $table->boolean('require_preferred_station')->default(true);
            $table->boolean('show_walkthrough')->default(true);
            $table->boolean('close_when_full')->default(false);
            $table->boolean('is_active')->default(true);
            $table->unsignedInteger('application_count')->default(0);
            $table->timestamps();

            $table->unique(['workspace_id', 'ward_id']);
        });

        Schema::create('agent_invites', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('invited_by_user_id')->constrained('users');
            $table->string('role', 30);
            $table->string('name', 150);
            $table->string('phone', 30);
            $table->uuid('station_id')->nullable();
            $table->foreign('station_id')->references('id')->on('polling_stations')->nullOnDelete();
            $table->uuid('ward_id')->nullable();
            $table->foreign('ward_id')->references('id')->on('wards')->nullOnDelete();
            $table->uuid('constituency_id')->nullable();
            $table->foreign('constituency_id')->references('id')->on('constituencies')->nullOnDelete();
            $table->uuid('county_id')->nullable();
            $table->foreign('county_id')->references('id')->on('counties')->nullOnDelete();
            $table->string('invite_token', 40)->unique();
            $table->unsignedInteger('expiry_hours')->default(168);
            $table->timestamp('expires_at')->nullable();
            $table->enum('status', ['pending', 'accepted', 'declined'])->default('pending');
            $table->string('otp_code_hash')->nullable();
            $table->timestamp('otp_expires_at')->nullable();
            $table->unsignedInteger('otp_attempts')->default(0);
            $table->string('verified_token_hash')->nullable();
            $table->timestamp('verified_token_expires_at')->nullable();
            $table->timestamps();
        });

        Schema::create('workspace_agents', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('workspace_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('role', 30);
            $table->enum('status', ['pending', 'approved', 'rejected', 'removed'])->default('pending');
            $table->uuid('station_id')->nullable();
            $table->foreign('station_id')->references('id')->on('polling_stations')->nullOnDelete();
            $table->uuid('ward_id')->nullable();
            $table->foreign('ward_id')->references('id')->on('wards')->nullOnDelete();
            $table->uuid('constituency_id')->nullable();
            $table->foreign('constituency_id')->references('id')->on('constituencies')->nullOnDelete();
            $table->uuid('county_id')->nullable();
            $table->foreign('county_id')->references('id')->on('counties')->nullOnDelete();
            $table->enum('source', ['public_link', 'targeted_invite'])->default('public_link');
            $table->uuid('recruitment_link_id')->nullable();
            $table->foreign('recruitment_link_id')->references('id')->on('recruitment_links')->nullOnDelete();
            $table->uuid('invite_id')->nullable();
            $table->foreign('invite_id')->references('id')->on('agent_invites')->nullOnDelete();
            $table->string('first_name', 100);
            $table->string('last_name', 100);
            $table->string('national_id', 20)->nullable();
            $table->string('phone', 30);
            $table->unsignedTinyInteger('age')->nullable();
            $table->string('email', 255)->nullable();
            $table->string('photo_path')->nullable();
            $table->foreignId('approved_by_user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspace_agents');
        Schema::dropIfExists('agent_invites');
        Schema::dropIfExists('recruitment_links');

        if (Schema::hasColumn('workspace_managers', 'user_id')) {
            Schema::table('workspace_managers', function (Blueprint $table) {
                $table->dropForeign(['user_id']);
                $table->dropColumn('user_id');
            });
        }
    }
};

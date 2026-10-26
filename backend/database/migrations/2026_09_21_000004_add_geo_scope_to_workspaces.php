<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Geography scope on a workspace cascades with the seat: governor/senator stop
 * at county, MP goes to constituency, MCA goes to ward. County was already on the
 * table from the initial workspaces migration; add the deeper levels here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->uuid('county_id')->nullable()->after('county');
            $table->string('constituency')->nullable()->after('county_id');
            $table->uuid('constituency_id')->nullable()->after('constituency');
            $table->string('ward')->nullable()->after('constituency_id');
            $table->uuid('ward_id')->nullable()->after('ward');
        });
    }

    public function down(): void
    {
        Schema::table('workspaces', function (Blueprint $table) {
            $table->dropColumn(['county_id', 'constituency', 'constituency_id', 'ward', 'ward_id']);
        });
    }
};

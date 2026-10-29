<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('station_results', function (Blueprint $table) {
            $table->text('ward_amendment_note')->nullable()->after('query_note');
        });
    }

    public function down(): void
    {
        Schema::table('station_results', function (Blueprint $table) {
            $table->dropColumn('ward_amendment_note');
        });
    }
};

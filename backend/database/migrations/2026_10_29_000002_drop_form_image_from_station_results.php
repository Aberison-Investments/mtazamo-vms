<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('station_results', function (Blueprint $table) {
            $table->dropColumn('form_image_path');
        });
    }

    public function down(): void
    {
        Schema::table('station_results', function (Blueprint $table) {
            $table->string('form_image_path')->nullable();
        });
    }
};

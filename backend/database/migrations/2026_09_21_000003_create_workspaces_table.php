<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One workspace per election an aspirant contests (from the "Create workspace"
 * screen). Holds the seat, segment and geography scope; the geography snapshot
 * itself is read from the shared station register, so only the scope is stored.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('workspaces', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('seat');       // president | governor | senator | mp | mca
            $table->string('segment');    // primary | general
            $table->string('scope');      // national | county
            $table->string('county')->nullable();
            $table->json('priority_counties')->nullable(); // national scope only
            $table->unsignedSmallInteger('year');
            $table->string('party')->nullable();
            $table->string('status')->default('active'); // active | closed
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('workspaces');
    }
};

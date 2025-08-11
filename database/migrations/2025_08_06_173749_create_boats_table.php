<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up()
        {
            Schema::create('boats', function (Blueprint $table) {
                $table->id();
                $table->string('boat_id')->unique();

                $table->string('name')->nullable();
                $table->decimal('latitude', 10, 7)->nullable();
                $table->decimal('longitude', 10, 7)->nullable();
                $table->float('speed')->nullable();
                $table->unsignedSmallInteger('heading')->nullable();

                // If API timestamp might be missing or not ISO, make it nullable
                $table->timestamp('datetime')->nullable();

                $table->string('contact')->nullable();

                // Not JSON for SQLite; store as TEXT (comma-joined or JSON string)
                $table->text('atolls')->nullable();

                $table->string('type')->nullable();
            });
        }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('boats');
    }
};

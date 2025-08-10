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
                $table->id(); // Laravel ID (optional)
                $table->string('boat_id')->unique();  // from JSON: "id"
                $table->string('name');               // "na"
                $table->decimal('latitude', 10, 7);   // "la"
                $table->decimal('longitude', 10, 7);  // "lo"
                $table->float('speed')->nullable();   // "sp"
                $table->integer('heading')->nullable(); // "he"
                $table->timestamp('datetime');        // "dt"
                $table->string('contact')->nullable(); // "co"
                $table->timestamps();
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

<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class UpdateBoatTypesFromCsvSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('seeders/boat_types.csv');
        if (!file_exists($path)) {
            $this->command?->warn("boat_types.csv not found at: $path — skipping.");
            return;
        }

        $fh = fopen($path, 'r');
        if (!$fh) {
            $this->command?->warn("Unable to open CSV: $path — skipping.");
            return;
        }

        $first = fgetcsv($fh);
        if ($first === false) {
            fclose($fh);
            $this->command?->warn("CSV empty: $path — skipping.");
            return;
        }

        $hasHeader = false;
        $colDevice = 0; $colType = 1;
        $normalizedFirst = array_map(static fn($v) => strtolower(trim((string)$v)), $first);
        if (in_array('device_id', $normalizedFirst, true) || in_array('boat_id', $normalizedFirst, true)) {

            $hasHeader = true;
            $colDevice = array_search('device_id', $normalizedFirst, true);
            if ($colDevice === false) $colDevice = array_search('boat_id', $normalizedFirst, true);
            $colType   = array_search('boat_type', $normalizedFirst, true);
            if ($colDevice === false || $colType === false) {
                fclose($fh);
                $this->command?->error("Header must include device_id (or boat_id) and boat_type.");
                return;
            }
        } else {

            $this->processRow($first[$colDevice] ?? null, $first[$colType] ?? null);
        }

        while (($row = fgetcsv($fh)) !== false) {
            $this->processRow($row[$colDevice] ?? null, $row[$colType] ?? null);
        }

        fclose($fh);
    }

    protected function processRow($deviceId, $boatType): void
    {
        $boatId = trim((string)$deviceId);
        $type   = $this->normalizeType($boatType);

        if ($boatId === '' || $type === null) {
            return; // skip invalid/blank lines
        }

        DB::table('boats')
            ->where('boat_id', $boatId)
            ->update([
                'type'       => $type,
                'updated_at' => now(),
            ]);
    }

    protected function normalizeType($value): ?string
    {
        $v = strtolower(trim((string)$value));
        if ($v === '') return null;

        // Mappin common variations
        $map = [
            'supply boat'      => 'supply boat',
            'speed boat'       => 'speed boat',
            'safari'           => 'safari',
            'landing craft'    => 'landing craft',
            'fishing boat'     => 'fishing boat',
            'dinghy'           => 'dinghy',
            'excursion boat'   => 'excursion boat',
            'passenger ferry'  => 'passenger ferry',
            'tug boat'         => 'tug boat',
            // synonyms
            'ferry'            => 'passenger ferry',
            'landing-craft'    => 'landing craft',
            'speedboat'        => 'speed boat',
        ];

        return $map[$v] ?? $v; 
    }
}

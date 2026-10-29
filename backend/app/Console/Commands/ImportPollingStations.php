<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Reads the IEBC "Registered Voters per Polling Station" spreadsheet
 * (rov_per_polling_station.xlsx) and populates the polling_stations table.
 *
 * Must be run AFTER load-geo.sh has loaded polling_centres.
 *
 * Usage:
 *   php artisan geo:import-stations
 *   php artisan geo:import-stations --xlsx=/path/to/file.xlsx
 */
class ImportPollingStations extends Command
{
    protected $signature   = 'geo:import-stations
                              {--xlsx= : Path to rov_per_polling_station.xlsx}
                              {--dry-run : Show counts without writing}';
    protected $description = 'Import individual polling stations (streams) from the IEBC xlsx';

    private const MAX_COUNTY = 47; // 48=DIASPORA, 49=PRISONS excluded

    public function handle(): int
    {
        $xlsx = $this->option('xlsx')
            ?? base_path('../../documents/rov_per_polling_station .xlsx');

        if (! file_exists($xlsx)) {
            $this->error("File not found: {$xlsx}");
            $this->line('Pass --xlsx=/absolute/path/to/rov_per_polling_station.xlsx');
            return 1;
        }

        $this->info("Reading {$xlsx} …");
        $rows = $this->readXlsx($xlsx);
        $this->info(sprintf('Rows read (including headers): %d', count($rows)));

        // Build lookup: iebc_ward_code → polling_centre rows [{id, code}]
        $this->info('Loading polling_centres from DB …');
        $centres = DB::table('polling_centres as pc')
            ->join('wards as w', 'w.id', '=', 'pc.ward_id')
            ->select('pc.id', 'pc.code', 'w.iebc_code as ward_iebc')
            ->whereNotNull('w.iebc_code')
            ->get();

        // Index: ward_iebc_code => [ centre_code => centre_id ]
        // Stored both by numeric code and by the raw string so the S-prefix
        // fallback in the match step can find supplementary centres (S051 etc.).
        $centreIdx = [];
        foreach ($centres as $c) {
            $ward = (int)$c->ward_iebc;
            $centreIdx[$ward][$c->code] = $c->id;          // raw string key (e.g. "S051")
            if (is_numeric($c->code)) {
                $centreIdx[$ward][(int)$c->code] = $c->id; // integer key (e.g. 51)
            }
        }

        $inserted   = 0;
        $skipped    = 0;
        $notMatched = 0;
        $batch      = [];

        foreach ($rows as $row) {
            $countyCode = isset($row['A']) && is_numeric($row['A']) ? (int)$row['A'] : null;
            if (! $countyCode || $countyCode > self::MAX_COUNTY) continue;

            $wardCode     = isset($row['E']) ? (int)$row['E'] : null;
            $centreCode   = isset($row['G']) ? (int)$row['G'] : null;
            $stationCode  = $row['I'] ?? null;
            $stationName  = $row['J'] ?? null;
            $voters       = isset($row['K']) && is_numeric($row['K']) ? (int)$row['K'] : null;

            if (! $wardCode || ! $centreCode || ! $stationCode) {
                $skipped++;
                continue;
            }

            // Primary match: numeric code. Fallback: S-prefixed code (S051, S030…)
            // used by the old manual-import pipeline for supplementary centres.
            $centreId = $centreIdx[$wardCode][$centreCode]
                ?? $centreIdx[$wardCode][sprintf('S%03d', $centreCode)]
                ?? null;
            if (! $centreId) {
                $notMatched++;
                continue;
            }

            // stream_number = last 2 digits of the station code
            $streamNumber = (int)substr((string)$stationCode, -2);

            $batch[] = [
                'polling_centre_id' => $centreId,
                'iebc_code'         => (string)$stationCode,
                'stream_number'     => $streamNumber,
                'registered_voters' => $voters,
                'created_at'        => now(),
            ];

            $inserted++;

            if (count($batch) >= 500) {
                if (! $this->option('dry-run')) {
                    DB::table('polling_stations')->upsert(
                        $batch,
                        ['iebc_code'],
                        ['stream_number', 'registered_voters'],
                    );
                }
                $batch = [];
                $this->output->write('.');
            }
        }

        if ($batch && ! $this->option('dry-run')) {
            DB::table('polling_stations')->upsert(
                $batch,
                ['iebc_code'],
                ['stream_number', 'registered_voters'],
            );
        }

        $this->newLine();
        $this->info("Inserted / updated: {$inserted}");
        $this->warn("Unmatched centres:  {$notMatched}");
        $this->line("Skipped (bad data): {$skipped}");

        if ($notMatched > 0) {
            $this->warn('Some stations could not be matched to a polling centre.');
            $this->line('Re-run load-geo.sh to ensure polling_centres is up to date.');
        }

        return 0;
    }

    /** Parse xlsx (Office Open XML) without a library dependency. */
    private function readXlsx(string $path): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException("Cannot open xlsx: {$path}");
        }

        $ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

        // Shared strings table
        $sharedStrings = [];
        $ssXml = $zip->getFromName('xl/sharedStrings.xml');
        if ($ssXml) {
            $ssDom = new \DOMDocument();
            $ssDom->loadXML($ssXml);
            foreach ($ssDom->getElementsByTagNameNS($ns, 'si') as $si) {
                $text = '';
                foreach ($si->getElementsByTagNameNS($ns, 't') as $t) {
                    $text .= $t->nodeValue ?? '';
                }
                $sharedStrings[] = $text;
            }
        }

        $rows    = [];
        $sheetXml = $zip->getFromName('xl/worksheets/sheet1.xml');
        $zip->close();

        if (! $sheetXml) return $rows;

        $dom = new \DOMDocument();
        $dom->loadXML($sheetXml);

        foreach ($dom->getElementsByTagNameNS($ns, 'row') as $rowEl) {
            $row = [];
            foreach ($rowEl->getElementsByTagNameNS($ns, 'c') as $cell) {
                preg_match('/^([A-Z]+)/', $cell->getAttribute('r'), $m);
                $col  = $m[1] ?? null;
                $type = $cell->getAttribute('t');
                $vEl  = $cell->getElementsByTagNameNS($ns, 'v')->item(0);
                $val  = $vEl ? $vEl->nodeValue : null;
                if ($type === 's' && $val !== null) {
                    $val = $sharedStrings[(int)$val] ?? $val;
                }
                if ($col) $row[$col] = $val;
            }
            $rows[] = $row;
        }

        return $rows;
    }
}

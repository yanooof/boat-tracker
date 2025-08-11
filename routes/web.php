<?php

use Illuminate\Http\Request;
use App\Http\Controllers\ProfileController;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use GuzzleHttp\Client;
use GuzzleHttp\Promise\Utils;
use App\Models\Boat;

Route::get('/boats-data', function () {
    return Boat::select(
        'boat_id','name','latitude','longitude','speed','heading','datetime','contact','atolls','type'
    )->get();
});

Route::get('/refresh-boats', function () {
    // refresh every 30s
    $nowTs = now()->timestamp;
    $last  = Cache::get('boats_refresh_last', 0);
    if ($nowTs - $last < 30) {
        return response()->json(['ok' => false, 'reason' => 'locked'], 200);
    }
    Cache::put('boats_refresh_last', $nowTs, 60);

    $csvTypes = [];
    $csvPath  = database_path('seeders/boat_types.csv');
    if (is_file($csvPath) && is_readable($csvPath)) {
        if (($fh = fopen($csvPath, 'r')) !== false) {
            $first = fgetcsv($fh);
            $colDevice = 0; $colType = 1;

            $normalize = function($v) {
                $v = strtolower(trim((string)$v));
                if ($v === '') return null;
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
                ];
                return $map[$v] ?? $v;
            };

            // Detect header
            $hdr = array_map(fn($x) => strtolower(trim((string)$x)), (array)$first);
            if (in_array('device_id', $hdr, true) || in_array('boat_id', $hdr, true) || in_array('boatid', $hdr, true)) {
                $colDevice = array_search('device_id', $hdr, true);
                if ($colDevice === false) $colDevice = array_search('boat_id', $hdr, true);
                if ($colDevice === false) $colDevice = array_search('boatid',  $hdr, true);
                $colType   = array_search('boat_type', $hdr, true);
                if ($colType === false)   $colType   = 1;
            } else {
                // first row is data
                $id = trim((string)($first[$colDevice] ?? ''));
                $tp = $normalize($first[$colType] ?? null);
                if ($id !== '' && $tp !== null) $csvTypes[$id] = $tp;
            }

            while (($row = fgetcsv($fh)) !== false) {
                $id = trim((string)($row[$colDevice] ?? ''));
                $tp = $normalize($row[$colType] ?? null);
                if ($id !== '' && $tp !== null) $csvTypes[$id] = $tp;
            }
            fclose($fh);
        }
    }

    $ATOLL_IDS = [
        1=>"HA",2=>"HDH",3=>"SH",4=>"N",5=>"R",6=>"B",
        7=>"LH",8=>"K",9=>"AA",10=>"ADH",11=>"V",12=>"M",
        13=>"F",14=>"DH",15=>"TH",16=>"L",17=>"GA",18=>"GDH",19=>"GN",20=>"S",21=>"MALECITY"
    ];
    $base = 'https://m.followme.mv/public/get_my.php?a=atoll&id=';

    $client = new Client([
        'timeout'         => 8.0,
        'connect_timeout' => 5.0,
        'headers' => [
            'User-Agent' => 'BoatTracker/1.0 (+local)',
            'Accept'     => 'application/json,text/plain,*/*',
            'Referer'    => 'https://m.followme.mv/public/',
        ],
        'http_errors' => false,
        'curl' => [
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4,
        ],
        'verify' => false,  
    ]);

    $promises = [];
    foreach ($ATOLL_IDS as $id => $code) {
        $promises[$code] = $client->getAsync($base.$id);
    }
    $settled = Utils::settle($promises)->wait();

    $boats = [];
    $okAtolls = 0; $failAtolls = 0;
    $errors = []; 

    foreach ($settled as $atollCode => $result) {
        if ($result['state'] !== 'fulfilled') {
            $failAtolls++;
            $errors[$atollCode] = ($result['reason']->getMessage() ?? 'rejected');
            continue;
        }
        $res = $result['value'];
        if ($res->getStatusCode() !== 200) {
            $failAtolls++; $errors[$atollCode] = 'HTTP '.$res->getStatusCode();
            continue;
        }
        $json = json_decode((string)$res->getBody(), true);
        if (!is_array($json) || empty($json['devices']) || !is_array($json['devices'])) {
            $failAtolls++; $errors[$atollCode] = 'bad json/devices';
            continue;
        }
        $okAtolls++;

        foreach ($json['devices'] as $boatId => $b) {
            $boatId = (string)($b['id'] ?? $boatId);

            if (!isset($boats[$boatId])) {
                $boats[$boatId] = [
                    'boat_id'   => $boatId,
                    'name'      => $b['na'] ?? null,
                    'latitude'  => isset($b['la']) ? (float)$b['la'] : null,
                    'longitude' => isset($b['lo']) ? (float)$b['lo'] : null,
                    'speed'     => ($b['sp'] ?? '') !== '' ? (float)$b['sp'] : null,
                    'heading'   => ($b['he'] ?? '') !== '' ? (int)$b['he'] : null,
                    'datetime'  => $b['dt'] ?? null,
                    'contact'   => $b['co'] ?? null,
                    'atolls'    => [$atollCode],
                ];
            } else {
                if (!in_array($atollCode, $boats[$boatId]['atolls'], true)) {
                    $boats[$boatId]['atolls'][] = $atollCode;
                }
                if (!empty($b['dt'])) $boats[$boatId]['datetime']  = $b['dt'];
                if (isset($b['la']))   $boats[$boatId]['latitude']  = (float)$b['la'];
                if (isset($b['lo']))   $boats[$boatId]['longitude'] = (float)$b['lo'];
                if (($b['sp'] ?? '') !== '') $boats[$boatId]['speed']   = (float)$b['sp'];
                if (($b['he'] ?? '') !== '') $boats[$boatId]['heading'] = (int)$b['he'];
                if (!empty($b['na']))  $boats[$boatId]['name']    = $b['na'];
                if (!empty($b['co']))  $boats[$boatId]['contact'] = $b['co'];
                if (!empty($b['ty']))  $boats[$boatId]['type']    = $b['ty'];
            }

            if (empty($boats[$boatId]['type']) && isset($csvTypes[$boatId])) {
                $boats[$boatId]['type'] = $csvTypes[$boatId];
            }
        }
    }

    $payload = [];
    $now = now()->format('Y-m-d H:i:s');

    foreach ($boats as $boat) {
        $dt = $boat['datetime'] ?? null;
        if (is_numeric($dt)) {
            $dt = date('Y-m-d H:i:s', (int)$dt);
        } elseif (is_string($dt)) {
            $ts = strtotime($dt);
            $dt = $ts ? date('Y-m-d H:i:s', $ts) : null;
        } else {
            $dt = null;
        }

        $payload[] = [
            'boat_id'   => $boat['boat_id'],
            'name'      => $boat['name']      ?? null,
            'latitude'  => $boat['latitude']  ?? null,
            'longitude' => $boat['longitude'] ?? null,
            'speed'     => $boat['speed']     ?? null,
            'heading'   => $boat['heading']   ?? null,
            'datetime'  => $dt,
            'contact'   => $boat['contact']   ?? null,
            'atolls'    => implode(',', $boat['atolls'] ?? []),
            'type'      => $boat['type']      ?? null,
        ];
    }

    $ops = 0; $dbErr = 0; $errorsDB = null;
    try {
        DB::table('boats')->upsert(
            $payload,
            ['boat_id'],
            ['name','latitude','longitude','speed','heading','datetime','contact','atolls','type']
        );
        $ops = count($payload);
    } catch (\Throwable $e) {
        $dbErr = 1;
        $errorsDB = $e->getMessage();
    }

    $errSample = array_slice($errors, 0, 5, true);
    if ($errorsDB) $errSample['DB'] = $errorsDB;

    return response()->json([
        'ok'          => ($okAtolls > 0),
        'atolls_ok'   => $okAtolls,
        'atolls_fail' => $failAtolls,
        'boats_seen'  => count($boats),
        'db_ops'      => $ops,
        'db_errors'   => $dbErr,
        'errors'      => $errSample,
    ], 200);
});

Route::post('/user/map-style', function (Request $r) {
    if (!auth()->check()) return response()->json(['ok'=>false], 401);
    $style = $r->input('style'); // not persisted yet
    return ['ok'=>true];
})->middleware('auth');

Route::post('/favorites/toggle', function (Request $r) {
    if (!auth()->check()) return response()->json(['ok'=>false], 401);
    $boatId = (string)$r->input('boat_id');
    $value  = (bool)$r->input('value');
    return ['ok'=>true];
})->middleware('auth');

// main page
Route::view('/', 'main')->name('home');

Route::get('/dashboard', function () {
    return view('dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('/profile', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
});

require __DIR__.'/auth.php';



<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json(['service' => 'mtazamo-backend', 'status' => 'ok']);
});

Route::get('/health', function () {
    return response()->json(['status' => 'ok', 'service' => 'mtazamo-backend']);
});

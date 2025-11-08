<?php

use Illuminate\Support\Facades\Route;

Route::get('/api/laravel', function () { return ['ok' => true]; });
Route::post('/api/laravel', function () { return ['created' => true]; }); 
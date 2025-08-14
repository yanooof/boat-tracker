<x-app-layout>

    <x-map.navbar />

    <div id="map"></div>

    <x-map.filters />
    <x-map.sidebar />
    <x-map.list />
    <x-map.statusbar/>
    <div class="zoom-indicator" id="zoomIndicator">Zoom: 7%</div>

    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="is-auth" content="{{ auth()->check() ? '1' : '0' }}">
    <meta name="user-map-style" content="{{ auth()->check() ? (auth()->user()->map_style ?? '') : '' }}">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</x-app-layout>




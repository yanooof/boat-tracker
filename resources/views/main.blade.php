<x-app-layout>

    <x-map.navbar />

    <div id="map"></div>

    <x-map.filters />
    <x-map.sidebar />
    <div class="zoom-indicator" id="zoomIndicator">Zoom: 7%</div>
    <div id="statusPanel" class="status-panel">
      <div><strong>Currently tracking:</strong></div>
      <ul style="margin:6px 0 0 0; padding-left:16px;">
        <li id="statusCount">— boats</li>
        <li id="statusRefreshed">Last refreshed: —</li>
      </ul>
    </div>

    <meta name="csrf-token" content="{{ csrf_token() }}">
    <meta name="is-auth" content="{{ auth()->check() ? '1' : '0' }}">
    <meta name="user-map-style" content="{{ auth()->check() ? (auth()->user()->map_style ?? '') : '' }}">

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</x-app-layout>




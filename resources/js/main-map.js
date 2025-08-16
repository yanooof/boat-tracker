import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Fuse from 'fuse.js';

window.addEventListener('DOMContentLoaded', () => {
  
  const CSRF = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const IS_AUTH = document.querySelector('meta[name="is-auth"]')?.content === '1';
  const USER_MAP_STYLE = document.querySelector('meta[name="user-map-style"]')?.content || '';

  
  let ALL_BOATS = [];
  let markersById = new Map();
  let fuse = null;
  let currentBoat = null;
  let searchHandlersBound = false;

  /* MAP INITIALIZATION */
  const DEFAULT_VIEW = { center: [3.5, 73.5], zoom: 7 };

  const baseLayers = {
    'Dark (CARTO)': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{
        attribution:'&copy; CARTO', 
        subdomains: 'abcd', 
        maxZoom: 18
    }),

    'Light (CARTO)':    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{
        attribution: '&copy; CARTO', 
        subdomains: 'abcd', 
        maxZoom: 18 
    }),

    'Light (OSM)': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ 
        attribution: '&copy; OSM', 
        maxZoom: 19 
    }),

    'Voyager (CARTO)': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',{
        attribution:'&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors &copy; <a href="https://www.carto.com/">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }),
  };

  function savedMapStyleKey() {
    return localStorage.getItem('mapStyle') || USER_MAP_STYLE || 'Dark (CARTO)';
  }

  const map = L.map('map', {
    center: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
    minZoom: 7,
    maxZoom: 18,
    maxBounds: [[-1.5, 70.8],[7.8, 76.2]],
    maxBoundsViscosity: 1.0,
    zoomControl: false
  });

  let lastRefreshedAt = null;
    //function for refreshing details on the status panel bottom left
    function updateStatusPanel() {
    const countEl = document.getElementById('statusCount');
    const refEl   = document.getElementById('statusRefreshed');
    if (countEl) countEl.textContent = `${ALL_BOATS.length} Total unique boats`;
    if (refEl) {
    const t = lastRefreshedAt ? lastRefreshedAt.toLocaleString() : '—';
    refEl.textContent = `Last refreshed ${t}`;
    }
    }

  let currentLayer = null;
  function applyBaseLayer(key) {
    if (currentLayer) map.removeLayer(currentLayer);
    currentLayer = baseLayers[key] || baseLayers['Dark (CARTO)'];
    currentLayer.addTo(map);
  }
  applyBaseLayer(savedMapStyleKey());

  const zoomIndicator = document.getElementById('zoomIndicator');
  map.on('zoomend', () => { if (zoomIndicator) zoomIndicator.textContent = `Zoom: ${map.getZoom()}%`; });

  /* CHANGE MAP STYLE DROPDOWN */
  const layerBtn  = document.getElementById('layerBtn');
  const layerMenu = document.getElementById('layerMenu');
  if (layerMenu) layerMenu.innerHTML = Object.keys(baseLayers).map(k=>`<div class="layer-item" data-k="${k}">${k}</div>`).join('');
  if (layerBtn) layerBtn.onclick = () => layerMenu.style.display = (layerMenu.style.display==='block') ? 'none' : 'block';
  if (layerMenu) layerMenu.addEventListener('mousedown', async (e) => {
    const k = e.target?.dataset?.k;
    if (!k) return;
    applyBaseLayer(k);
    layerMenu.style.display = 'none';
    if (IS_AUTH) {
      try {
        await fetch('/user/map-style', {
          method:'POST',
          headers:{ 'Content-Type':'application/json', 'X-CSRF-TOKEN': CSRF },
          body: JSON.stringify({ style:k })
        });
      } catch (_) {}
    } else {
      localStorage.setItem('mapStyle', k);
    }
  });

  /*BOAT MARKER ICONS CONFIGURATION*/
  const TYPE_COLORS = { /*colors for boat markers based on boat type */
    'supply boat': '#708090',     
    'speed boat': '#FF4500',      
    'safari': '#DAA520',          
    'landing craft': '#556B2F',   
    'fishing boat': '#1E90FF',    
    'dinghy': '#FFD700',          
    'excursion boat': '#2E8B57',  
    'passenger ferry': '#4682B4',            
    'tug boat': '#8B0000',        
    'default': '#B0B0B0'          
  };
  const getBoatColor = (type) => TYPE_COLORS[type?.toLowerCase()] || TYPE_COLORS.default;

  function createCircleIcon(color) {
    return L.divIcon({
      className:'',
      html:`<div style="width:10px;height:10px;border-radius:50%;background:${color};border:1px solid #fff;"></div>`,
      iconSize:[10,10], iconAnchor:[5,5]
    });
  }
  function createArrowIcon(color, heading) {
    const size=14, h=(parseFloat(heading)||0), rotation=(h-90+360)%360;
    return L.divIcon({
      className:'',
      html:`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform: rotate(${rotation}deg); transform-origin: center;"><path d="M2 2 L22 12 L2 22 L7 12 Z" fill="${color}" stroke="white" stroke-width="0.5"/></svg>`,
      iconSize:[size,size], iconAnchor:[size/2,size/2]
    });
  }

  /*FUNCTION TO CHANGE BOAT REFRESH DATETIME TO "N TIME AGO FORMAT"*/
  function timeAgo(s){
    if(!s) return {text:'—', minutes:Infinity};
    const now=new Date(), t=new Date(s);
    const m=Math.floor((now-t)/60000), h=Math.floor(m/60), d=Math.floor(h/24), w=Math.floor(d/7);
    let text;
    if(m<1) text='just now';
    else if(m<60) text=`${m} min ago`;
    else if(h<24) text=`${h} hr${h>1?'s':''} ago`;
    else if(d<7) text=`${d} day${d>1?'s':''} ago`;
    else text=`${w} week${w>1?'s':''} ago`;
    return {text, minutes:m};
  }

  const ATOLLS = ['HA','HDH','SH','N','R','B','LH','K','AA','ADH','V','M','F','DH','TH','L','GA','GDH','GN','S','MALECITY'];
  const LOCATIONS = {"Malé":{lat:4.175,lon:73.509,radius:2},"Hulhumalé":{lat:4.226,lon:73.546,radius:4}};
  function haversine(a,b,c,d){const R=6371,toRad=x=>x*Math.PI/180;const dLat=toRad(c-a),dLon=toRad(d-b);const A=Math.sin(dLat/2)**2+Math.cos(toRad(a))*Math.cos(toRad(c))*Math.sin(dLon/2)**2;return 2*R*Math.asin(Math.sqrt(A));}

  /*FILTER SELECTION SIDEBAR */
  (function initFilters(){
    const typeEl=document.getElementById('typeFilters');
    const atollEl=document.getElementById('atollFilters');
    const locEl=document.getElementById('locFilters');
    if (typeEl)  typeEl.innerHTML  = Object.keys(TYPE_COLORS).filter(k=>k!=='default').map(t=>`<label><input type="checkbox" value="${t}"> ${t}</label>`).join('');
    if (atollEl) atollEl.innerHTML = ATOLLS.map(a=>`<label><input type="checkbox" value="${a}"> ${a}</label>`).join('');
    if (locEl)   locEl.innerHTML   = Object.keys(LOCATIONS).map(n=>`<label><input type="checkbox" value="${n}"> ${n}</label>`).join('');
  })();

  /*FUNCTION FOR FAVORITE BOAT BUTTON */
  const favKey='fav_boats';
  const favGetLocal=()=>JSON.parse(localStorage.getItem(favKey)||'[]');
  const favHasLocal=id=>favGetLocal().includes(String(id));
  const favSetLocal=(id,val)=>{let arr=favGetLocal(); id=String(id); arr = val ? Array.from(new Set([...arr,id])) : arr.filter(x=>x!==id); localStorage.setItem(favKey, JSON.stringify(arr));};
  async function favToggle(id,val){
    if (IS_AUTH){
      try{ await fetch('/favorites/toggle',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-TOKEN':CSRF},body:JSON.stringify({boat_id:id,value:val})}); }catch(_){}
    } else {
      favSetLocal(id,val);
    }
  }
  const isFav=id=>favHasLocal(id);

  /*FUNCTION FOR APPLYING FILTERS TO RENDER BOAT MARKERS*/
  function applyFilters(list){
    const types=[...document.querySelectorAll('#typeFilters input:checked')].map(cb=>cb.value.toLowerCase());
    const atolls=[...document.querySelectorAll('#atollFilters input:checked')].map(cb=>cb.value);
    const locs=[...document.querySelectorAll('#locFilters input:checked')].map(cb=>cb.value);
    const favOnly=document.getElementById('favOnly')?.checked;

    return list.filter(b=>{
      if (types.length && !types.includes((b.type||'').toLowerCase())) return false;
      if (atolls.length){
        const boatAtolls = Array.isArray(b.atolls) ? b.atolls : (typeof b.atolls==='string' ? b.atolls.split(',') : []);
        if (!boatAtolls.some(a=>atolls.includes(a))) return false;
      }
      if (locs.length){
        const ok = locs.some(n=>haversine(b.latitude,b.longitude, LOCATIONS[n].lat, LOCATIONS[n].lon) <= LOCATIONS[n].radius);
        if (!ok) return false;
      }
      if (favOnly && !isFav(b.boat_id)) return false;
      return true;
    });
  }
  
  /*FUNCTION TO RENDER BOAT MARKER ICONS */
  function renderMarkers(list){
    const ids=new Set(list.map(b=>b.boat_id ?? `${b.name}-${b.latitude}-${b.longitude}`));
    markersById.forEach((m,id)=>{ if(!ids.has(id)){ map.removeLayer(m); markersById.delete(id);} });

    list.forEach(b=>{
      if (b.latitude==null || b.longitude==null) return;
      const id = b.boat_id ?? `${b.name}-${b.latitude}-${b.longitude}`;
      const speed = parseFloat(b.speed)||0;
      const heading = parseInt(b.heading)||0;
      const color = getBoatColor(b.type);
      const icon = (speed < 0.1) ? createCircleIcon(color) : createArrowIcon(color, heading);
      const updated = timeAgo(b.datetime);

      let m = markersById.get(id);
      if (!m) {
        m = L.marker([b.latitude,b.longitude], {icon}).addTo(map);
        m.on('mouseover', function(){ this.openTooltip(); });
        m.on('mouseout', function(){ this.closeTooltip(); });
        m.on('click', ()=>openSidebar(b));
        markersById.set(id, m);
      } else {
        m.setLatLng([b.latitude,b.longitude]);
        m.setIcon(icon);
      }
      m.bindTooltip(`<div><strong>${b.name}</strong><br>Speed: ${speed.toFixed(1)} kn<br>Updated: ${updated.text}</div>`, {direction:'top', offset:[0,-10], opacity:.9});
      m.setOpacity(updated.minutes > 60 ? 0.5 : 1);
    });
  }

  /*FUNCTION TO DISPLAY BOAT DETAILS ON BOAT MARKER CLICK */
  function openSidebar(b){
    currentBoat = b;
    const speed = parseFloat(b.speed)||0;
    const updated = timeAgo(b.datetime).text;
    const nameEl = document.getElementById('sbName');
    const bodyEl = document.getElementById('sbBody');
    const wrapEl = document.getElementById('boatSidebar');
    const favBtn = document.getElementById('favToggle');
    const listClosed = document.getElementById('boatlist').style.display === 'none';

    if (!nameEl || !bodyEl || !wrapEl || !favBtn || !listClosed) return;

    nameEl.textContent = b.name ?? 'Boat';
    bodyEl.innerHTML = `
      <div><b>Contact:</b>${b.contact ?? '—'}</div>
      <div><b>Speed:</b> ${speed.toFixed(1)} kn</div>
      <div><b>Last updated:</b> ${updated}</div>
      <div><b>Boat type:</b> ${b.type ?? '—'}</div>
      <div><b>Travel regions (Atolls):</b> ${(Array.isArray(b.atolls)?b.atolls:(b.atolls||'').toString()).toString()}</div>
    `;
    const fav = isFav(b.boat_id);
    favBtn.textContent = fav ? 'Remove favorite' : 'Add to favorites';
    favBtn.classList.toggle('is-fav', fav);
    favBtn.onclick = async ()=>{
      const next = !isFav(b.boat_id);
      await favToggle(b.boat_id, next);
      favBtn.textContent = next ? 'Remove favorite' : 'Add to favorites';
      favBtn.classList.toggle('is-fav', next);
      if (document.getElementById('favOnly')?.checked) renderMarkers(applyFilters(ALL_BOATS));
    };
    const closeBtn = document.getElementById('closeSidebar');
    if (closeBtn) {
    closeBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeSidebar();
    };
    }
    wrapEl.style.display = 'block';
  }

  /*FUNCTION TO CLOSE SIDEBAR*/
  function closeSidebar(){
    const el = document.getElementById('boatSidebar')
    el.style.display = 'none';
  }

  /*FUNCTION TO LIST BOATS*/
  function listBoats(list){
    let listItems = "";
    let favIds = new Map();
    const bodyEl = document.querySelector(".list-body");

    list.forEach(b=>{
      currentBoat = b;
      const speed = parseFloat(b.speed)||0;
      const updated = timeAgo(b.datetime).text;
      const favId =  "favToggle-" + b.boat_id;

      closeSidebar();

      favIds.set(b.boat_id, favId);

      if (!bodyEl) return;

      listItems += `
        <li>
        <hr style="border-color:#374151; margin:10px 0;">
        <div><b>Name:</b>${b.name ?? 'Boat'}</div>
        <div><b>Contact:</b>${b.contact ?? '—'}</div>
        <div><b>Speed:</b> ${speed.toFixed(1)} kn</div>
        <div><b>Last updated:</b> ${updated}</div>
        <div><b>Boat type:</b> ${b.type ?? '—'}</div>
        <div><b>Travel regions (Atolls):</b> ${(Array.isArray(b.atolls)?b.atolls:(b.atolls||'').toString()).toString()}</div>
        <div id=${favId} class="fav-btn">Add to favorites</div>
        </li>
      `;
      })

      bodyEl.innerHTML = listItems;

      favIds.forEach((favId, id)=>{
        const favBtn = document.getElementById(favId);
        const fav = isFav(id);
        favBtn.textContent = fav ? 'Remove favorite' : 'Add to favorites';

        favBtn.classList.toggle('is-fav', fav);

        favBtn.onclick = async ()=>{
          const next = !isFav(id);
          await favToggle(id, next);
          favBtn.textContent = next ? 'Remove favorite' : 'Add to favorites';
          favBtn.classList.toggle('is-fav', next);
          if (document.getElementById('favOnly')?.checked) renderMarkers(applyFilters(ALL_BOATS));
        };
      })
  }

  /*SEARCH BAR FUNCTIONS */
  function bindSearchHandlers(){
    const searchInput=document.getElementById('searchInput');
    const dropdown=document.getElementById('searchDropdown');
    if (!searchInput || !dropdown) return;

    function showDropdown(items){
      if(!items || !items.length){ dropdown.style.display='none'; return; }
      dropdown.innerHTML=items.slice(0,10).map(i=>`<div class="dropdown-item" data-id="${i.item.boat_id ?? i.item.name}">${i.item.name}</div>`).join('');
      dropdown.style.display='block';
      dropdown.querySelectorAll('.dropdown-item').forEach(el=>el.addEventListener('mousedown',()=>selectBoat(el.dataset.id)));
    }
    function selectBoat(id){
      dropdown.style.display='none';
      const b=ALL_BOATS.find(x=>(x.boat_id??x.name)==id);
      if(!b) return;
      map.setView([b.latitude,b.longitude], 14, {animate:true});
      openSidebar(b);
    }
    searchInput.addEventListener('input', e=>{
      const q=e.target.value.trim();
      if(!q || !fuse){ dropdown.style.display='none'; renderMarkers(applyFilters(ALL_BOATS)); return; }
      const r=fuse.search(q);
      renderMarkers(applyFilters(r.map(x=>x.item)));
      showDropdown(r);
    });
    searchInput.addEventListener('keydown', e=>{
      if(e.key==='Enter'){
        const q=searchInput.value.trim();
        if(!q || !fuse) return;
        const top=fuse.search(q)[0];
        if(top) selectBoat(top.item.boat_id ?? top.item.name);
      }
    });

    /*FUNCTION TO RESET TO DEFAULT VIEW (RESET BUTTON) */
    document.getElementById('resetBtn')?.addEventListener('click', ()=>{
      searchInput.value='';
      dropdown.style.display='none';
      document.querySelectorAll('#filterpopup input[type=checkbox]').forEach(cb=>cb.checked=false);
      map.setView(DEFAULT_VIEW.center, DEFAULT_VIEW.zoom, {animate:true});
      renderMarkers(ALL_BOATS);
    });

    searchHandlersBound = true;
  }

  /*BUTTONS FOR FILTER SELECTION POPUP*/
  document.getElementById('filterBtn')?.addEventListener('click', ()=>{
    const el=document.getElementById('filterpopup');
    if(!el) return;
    el.style.display = (el.style.display==='block') ? 'none' : 'block';
  });
  document.getElementById('closeFilter')?.addEventListener('click', ()=>{
    const el=document.getElementById('filterpopup'); if(el) el.style.display='none';
  });
  document.getElementById('applyFilters')?.addEventListener('click', ()=>{
    renderMarkers(applyFilters(ALL_BOATS));
    const el=document.getElementById('filterpopup'); if(el) el.style.display='none';
  });

  /*BUTTONS FOR BOAT LIST*/
  document.getElementById('listBtn')?.addEventListener('click', ()=>{
    const el=document.getElementById('boatlist');
    if(!el) return;
    el.style.display = (el.style.display==='block') ? 'none' : 'block';
    listBoats(ALL_BOATS);
  });
  document.getElementById('closeList')?.addEventListener('click', ()=>{
    const el=document.getElementById('boatlist'); if(el) el.style.display='none';
  });

  /*FUNCTION TO FETCH AND REFRESH BOAT DATA TO DB*/
  async function loadBoats(){
    const res = await fetch('/boats-data');
    const data = await res.json();
    ALL_BOATS = Array.isArray(data) ? data : [];
    lastRefreshedAt = new Date(); 
    updateStatusPanel();
    console.log('boats loaded:', ALL_BOATS.length);

    if (!fuse) {
      fuse = new Fuse(ALL_BOATS, { keys: ['name'], threshold: 0.3, ignoreLocation: true });
      if (!searchHandlersBound) { try { bindSearchHandlers(); } catch(e) { console.warn('bindSearchHandlers failed', e); } }
    } else {
      fuse.setCollection(ALL_BOATS);
    }
    renderMarkers(applyFilters(ALL_BOATS)); 
  }

  async function refreshCycle(){
    try{
      await fetch('/refresh-boats');
      await loadBoats();
    }catch(e){ console.warn('refresh failed', e); }
  }

  refreshCycle();
  setInterval(refreshCycle, 30000);
});

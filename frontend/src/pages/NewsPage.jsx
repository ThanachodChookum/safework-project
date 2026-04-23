import React, { useState, useEffect, useCallback, useRef } from 'react';
import './NewsPage.css';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon issue in Webpack/Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ─── Format relative time ─────────────────────────────────────────────
function relTime(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'เมื่อกี้';
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

// ─── NewsCard ─────────────────────────────────────────────────────────
function NewsCard({ item, onClick, active }) {
  return (
    <button
      className={`news-card ${active ? 'active' : ''}`}
      onClick={() => onClick(item)}
    >
      {item.image && (
        <img
          className="news-card-img"
          src={item.image}
          alt=""
          loading="lazy"
          onError={e => { e.target.style.display = 'none'; }}
        />
      )}
      <div className="news-card-body">
        <div className="news-card-source">
          <span className="news-dot" />
          {item.source}
          <span className="news-card-time">{relTime(item.pubDate)}</span>
        </div>
        <h3 className="news-card-title">{item.title}</h3>
        {item.description && (
          <p className="news-card-desc">{item.description}</p>
        )}
        {item.location && (
          <div className="news-card-loc">📍 {item.location}</div>
        )}
      </div>
    </button>
  );
}

// ─── MapPanel ─────────────────────────────────────────────────────────
function MapPanel({ selected, onClose }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const [coords, setCoords] = useState(null);
  const [mapReady, setMapReady] = useState(false);
  const [loadingMap, setLoadingMap] = useState(true);
  const markersRef = useRef([]);

  // Geocode location from news item
  useEffect(() => {
    if (!selected) return;
    setCoords(null);
    setLoadingMap(true);

    const loc = selected.location || selected.title;

    fetch(`/api/news/geocode?location=${encodeURIComponent(loc)}`)
      .then(r => r.json())
      .then(data => {
        if (data.lat) setCoords({ lat: data.lat, lng: data.lng, addr: data.formattedAddress });
        else {
          // Default to Bangkok if geocode fails
          setCoords({ lat: 13.7563, lng: 100.5018, addr: 'ประเทศไทย' });
        }
      })
      .catch(() => setCoords({ lat: 13.7563, lng: 100.5018, addr: 'ประเทศไทย' }));
  }, [selected]);

  // Init map
  useEffect(() => {
    if (!mapRef.current) return;
    setMapReady(true);
  }, [selected]);

  // Draw map + markers when coords ready
  useEffect(() => {
    if (!mapReady || !coords || !mapRef.current) return;

    if (!mapObj.current) {
      mapObj.current = L.map(mapRef.current, {
        zoomControl: true,
        attributionControl: false
      }).setView([coords.lat, coords.lng], 14);

      // Dark style OpenStreetMap tiles (CartoDB Dark Matter)
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
      }).addTo(mapObj.current);
    } else {
      mapObj.current.setView([coords.lat, coords.lng], 14);
    }

    // Clear old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    // Accident marker
    const accidentIcon = L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color:#ff5c3a;width:16px;height:16px;border-radius:50%;border:2px solid white;box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });

    const accidentMarker = L.marker([coords.lat, coords.lng], { icon: accidentIcon })
      .addTo(mapObj.current)
      .bindPopup(`<div style="font-family:Sarabun,sans-serif;font-size:13px;max-width:220px;color:#000;">
        <strong>⚠ จุดเกิดเหตุ</strong><br/>
        ${selected?.title || ''}<br/>
        <small style="color:#666">${coords.addr}</small>
      </div>`);
    markersRef.current.push(accidentMarker);

    setLoadingMap(false);
  }, [mapReady, coords, selected]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapObj.current) {
        mapObj.current.remove();
        mapObj.current = null;
      }
    };
  }, []);

  if (!selected) return null;

  return (
    <div className="map-panel">
      <div className="map-panel-header">
        <div>
          <div className="map-panel-title">📍 แผนที่เหตุการณ์</div>
          <div className="map-panel-sub">{selected.title}</div>
        </div>
        <button className="map-close" onClick={onClose}>✕</button>
      </div>

      <div className="map-container" ref={mapRef}>
        {loadingMap && (
          <div className="map-loading">
            <span className="spinner" style={{ borderTopColor: 'var(--accent)' }} />
            <p>กำลังโหลดแผนที่…</p>
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="map-legend">
        <span className="legend-dot red" /> จุดเกิดเหตุ
      </div>
    </div>
  );
}

// ─── Main NewsPage ─────────────────────────────────────────────────────
export default function NewsPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [search, setSearch] = useState('');

  const fetchNews = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch('/api/news');
      if (!resp.ok) throw new Error(`${resp.status}`);
      const data = await resp.json();
      setNews(data.items || []);
      setLastUpdated(data.updatedAt);
    } catch (e) {
      setError('ไม่สามารถดึงข้อมูลข่าวได้: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  // Auto refresh every 5 min
  useEffect(() => {
    const id = setInterval(fetchNews, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [fetchNews]);

  const filtered = news.filter(n =>
    !search || n.title.includes(search) || (n.location || '').includes(search)
  );

  return (
    <div className="news-layout">
      {/* ─── Left: News List ─── */}
      <div className={`news-list-panel ${selected ? 'shrink' : ''}`}>
        <div className="news-list-header">
          <div>
            <h1 className="news-page-title">🚨 ข่าวอุบัติเหตุ</h1>
            <p className="news-page-sub">ครอบคลุมทั่วประเทศไทย</p>
          </div>
          <div className="news-controls">
            <button
              className="refresh-btn"
              onClick={fetchNews}
              disabled={loading}
              title="รีเฟรชข่าว"
            >
              {loading ? <span className="spinner-sm" /> : '↻'}
            </button>
          </div>
        </div>

        <div className="news-search-row">
          <input
            className="news-search"
            placeholder="ค้นหาข่าวหรือจังหวัด…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {lastUpdated && (
            <div className="news-updated">
              อัปเดต {relTime(lastUpdated)}
            </div>
          )}
        </div>

        {error && (
          <div className="news-error">
            ⚠ {error}
            <button onClick={fetchNews}>ลองใหม่</button>
          </div>
        )}

        {loading && news.length === 0 ? (
          <div className="news-loading-list">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton-card" style={{ animationDelay: `${i * 0.08}s` }}>
                <div className="skeleton-line long" />
                <div className="skeleton-line medium" />
                <div className="skeleton-line short" />
              </div>
            ))}
          </div>
        ) : (
          <div className="news-cards">
            {filtered.length === 0 ? (
              <div className="news-empty">ไม่พบข่าวที่ตรงกับการค้นหา</div>
            ) : (
              filtered.map(item => (
                <NewsCard
                  key={item.id}
                  item={item}
                  onClick={setSelected}
                  active={selected?.id === item.id}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* ─── Right: Map Panel ─── */}
      {selected && (
        <MapPanel
          selected={selected}
          onClose={() => setSelected(null)}
        />
      )}

      {!selected && (
        <div className="news-map-placeholder">
          <div className="placeholder-icon">🗺</div>
          <p>เลือกข่าวเพื่อดูตำแหน่งบนแผนที่</p>
        </div>
      )}
    </div>
  );
}

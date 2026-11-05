/* A projected, simulated route over the embedded map; no Maps API required. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const panel = document.querySelector('.map-panel');
  const layer = $('route-animation');
  let points = null;
  let progress = 0;
  let moving = false;
  let length = 0;
  let resizeFrame = 0;
  let zoomOffset = 0;
  let backgroundCenter = { lat: 13.7375, lng: 100.5604 };
  const MIN_ZOOM = 4;
  const MAX_ZOOM = 20;

  function showBackground(lat, lng, zoom) {
    const source = `https://maps.google.com/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}&z=${zoom}&output=embed`;
    if ($('google-map').src !== source) $('google-map').src = source;
    panel.dataset.zoom = String(zoom);
    $('map-zoom-in').disabled = zoom >= MAX_ZOOM;
    $('map-zoom-out').disabled = zoom <= MIN_ZOOM;
    const description = `ระดับการขยายแผนที่ ${zoom}`;
    if ($('map-zoom-level').textContent !== description) $('map-zoom-level').textContent = description;
  }

  function project(point) {
    const latitude = point.lat * Math.PI / 180;
    return { x: (point.lng + 180) / 360, y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 };
  }

  function draw() {
    if (!points) {
      showBackground(backgroundCenter.lat, backgroundCenter.lng, Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, 14 + zoomOffset)));
      return;
    }
    const width = panel.clientWidth;
    const height = panel.clientHeight;
    if (!width || !height) return;
    const world = points.map(project);
    const xs = world.map(point => point.x);
    const ys = world.map(point => point.y);
    const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    // Reserve space for the map buttons, trip card, and Google's attribution.
    const top = 78;
    const compact = height < 190;
    const bottom = document.querySelector('.map-bottom').offsetHeight + (compact ? 12 : 40);
    const usableWidth = Math.max(60, width - 126);
    const usableHeight = Math.max(compact ? 24 : 50, height - top - bottom);
    const fitZoom = Math.max(MIN_ZOOM, Math.min(17, Math.floor(Math.log2(Math.min(
      usableWidth / (256 * Math.max(bounds.right - bounds.left, 1e-8)),
      usableHeight / (256 * Math.max(bounds.bottom - bounds.top, 1e-8))
    )))));
    const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom + zoomOffset));
    zoomOffset = zoom - fitZoom;
    const scale = 256 * 2 ** zoom;
    const center = {
      x: (bounds.left + bounds.right) / 2 + 18 / scale,
      y: (bounds.top + bounds.bottom) / 2 + (height / 2 - (top + height - bottom) / 2) / scale
    };
    const pixelPoints = world.map(point => ({ x: (point.x - center.x) * scale + width / 2, y: (point.y - center.y) * scale + height / 2 }));
    const path = pixelPoints.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    ['map-route-halo', 'map-route-path', 'map-route-travelled'].forEach(id => $(id).setAttribute('d', path));
    const first = pixelPoints[0];
    const last = pixelPoints[pixelPoints.length - 1];
    $('map-start-marker').setAttribute('transform', `translate(${first.x},${first.y})`);
    $('map-end-marker').setAttribute('transform', `translate(${last.x},${last.y})`);
    length = $('map-route-path').getTotalLength();
    $('map-route-travelled').style.strokeDasharray = `${length} ${length}`;
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * center.y))) * 180 / Math.PI;
    const lng = center.x * 360 - 180;
    showBackground(lat, lng, zoom);
    paint(true);
  }

  function paint(snap = false) {
    if (!points || !length) return;
    const point = $('map-route-path').getPointAtLength(length * progress);
    const rider = $('map-rider');
    const travelled = $('map-route-travelled');
    rider.style.transition = snap || !moving ? 'none' : '';
    travelled.style.transition = snap || !moving ? 'none' : '';
    rider.style.transform = `translate(${point.x}px, ${point.y}px)`;
    travelled.style.strokeDashoffset = String(length * (1 - progress));
    layer.dataset.progress = progress.toFixed(6);
    layer.classList.toggle('is-moving', moving);
    layer.setAttribute('aria-label', `เส้นทางจำลอง เดินทางแล้ว ${Math.floor(progress * 100)} เปอร์เซ็นต์`);
  }

  window.TripMap = {
    setRoute(origin, destination) {
      zoomOffset = 0;
      backgroundCenter = { lat: destination.lat, lng: destination.lng };
      const dy = destination.lat - origin.lat;
      const dx = destination.lng - origin.lng;
      const bend = Math.max(Math.abs(dx), Math.abs(dy), 0.003) * 0.13;
      // Illustrative waypoints, explicitly separate from Google directions.
      points = [origin,
        { lat: origin.lat + dy * 0.3 + bend, lng: origin.lng + dx * 0.15 },
        { lat: origin.lat + dy * 0.3 + bend, lng: origin.lng + dx * 0.6 },
        { lat: origin.lat + dy * 0.8, lng: origin.lng + dx * 0.6 },
        destination];
      progress = 0;
      moving = false;
      layer.removeAttribute('hidden');
      $('route-label').hidden = false;
      panel.classList.add('has-route');
      $('google-map').setAttribute('tabindex', '-1');
      draw();
    },
    setProgress(percent, isMoving) {
      progress = Math.max(0, Math.min(1, percent / 100));
      moving = Boolean(isMoving) && progress < 1;
      paint();
    },
    clear() {
      points = null;
      length = 0;
      progress = 0;
      moving = false;
      layer.setAttribute('hidden', '');
      layer.classList.remove('is-moving');
      $('route-label').hidden = true;
      panel.classList.remove('has-route');
      $('google-map').removeAttribute('tabindex');
      zoomOffset = 0;
      draw();
    }
  };

  function zoomBy(change) {
    const zoom = Number(panel.dataset.zoom || 14);
    if (zoom + change < MIN_ZOOM || zoom + change > MAX_ZOOM) return;
    zoomOffset += change;
    draw();
  }
  $('map-zoom-in').addEventListener('click', () => zoomBy(1));
  $('map-zoom-out').addEventListener('click', () => zoomBy(-1));
  $('map-fit').addEventListener('click', () => { zoomOffset = 0; draw(); });

  const resize = () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(draw);
  };
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(panel);
  else window.addEventListener('resize', resize);
})();

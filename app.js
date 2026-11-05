/* Buildless, browser-only prototype. All routing and movement are simulated. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const places = [
    { name: 'จุฬาลงกรณ์มหาวิทยาลัย', lat: 13.7383, lng: 100.5307 },
    { name: 'สยามพารากอน', lat: 13.7464, lng: 100.5347 },
    { name: 'สามย่านมิตรทาวน์', lat: 13.7338, lng: 100.5284 },
    { name: 'สวนลุมพินี', lat: 13.7314, lng: 100.5414 },
    { name: 'เทอร์มินอล 21 อโศก', lat: 13.7375, lng: 100.5604 },
    { name: 'สถานีหัวลำโพง', lat: 13.7385, lng: 100.5171 },
    { name: 'เซ็นทรัลเวิลด์', lat: 13.7466, lng: 100.5394 },
    { name: 'อนุสาวรีย์ชัยสมรภูมิ', lat: 13.7649, lng: 100.5383 },
    { name: 'ตลาดนัดจตุจักร', lat: 13.7999, lng: 100.5503 }
  ];
  let trip = null;
  let meter = null;
  let running = false;
  let active = false;
  let timer = null;
  let lastTick = 0;
  let toastTimer = null;
  let pageState = 'setup';
  const money = value => `${value.toLocaleString('th-TH')} บาท`;
  const time = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  const rangeText = range => `${range.min}–${range.max} บาท`;

  function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4200);
  }

  function locate(name) {
    const found = places.find(place => place.name === name);
    if (found) return { ...found, custom: false };
    // Unknown text remains usable without geocoding: reproducible mock coordinates.
    let hash = 0;
    for (const char of name) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
    return { name, lat: 13.725 + (hash % 700) / 10000, lng: 100.51 + (Math.floor(hash / 700) % 600) / 10000, custom: true };
  }

  function straightDistance(a, b) {
    const rad = degrees => degrees * Math.PI / 180;
    const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function mockRoutes(origin, destination) {
    const direct = straightDistance(origin, destination);
    return [
      { name: 'เส้นทางหลัก', km: Math.max(0.5, direct * 1.5 + 0.3), speed: 19, delay: 2 },
      { name: 'ผ่านถนนสายรอง', km: Math.max(0.6, direct * 1.34 + 0.4), speed: 12, delay: 3 },
      { name: 'เลี่ยงแยกหลัก', km: Math.max(0.8, direct * 1.85 + 0.5), speed: 22, delay: 4 }
    ].map(route => ({ ...route, km: Math.round(route.km * 10) / 10, minutes: Math.max(3, Math.ceil(route.km / route.speed * 60 + route.delay)) })).sort((a, b) => a.minutes - b.minutes || a.km - b.km);
  }

  function setState(state) {
    const previousState = pageState;
    pageState = state;
    ['setup', 'meter', 'summary'].forEach(name => { $(`${name}-view`).hidden = name !== state; });
    $('trip-actions').hidden = state !== 'meter';
    const index = ['setup', 'meter', 'summary'].indexOf(state);
    [1, 2, 3].forEach((step, i) => { $(`step-${step}`).className = `step${i === index ? ' active' : i < index ? ' done' : ''}`; });
    document.querySelector('.map-panel').classList.toggle('trip-active', state === 'meter');
    document.querySelector('.map-panel').classList.toggle('trip-complete', state === 'summary');
    if (previousState !== state) $('panel-scroll').scrollTo({ top: 0, behavior: 'instant' });
  }

  function updateMap() {
    const { origin, destination } = trip;
    $('map-origin').textContent = origin.name;
    $('map-destination').textContent = destination.name;
    TripMap.setRoute(origin, destination);
    $('maps-link').href = `https://www.google.com/maps/dir/?api=1&origin=${origin.lat},${origin.lng}&destination=${destination.lat},${destination.lng}&travelmode=driving`;
    $('map-route-status').textContent = `${trip.route.km.toFixed(1)} กม. · ประมาณ ${trip.route.minutes} นาที`;
    updateProgress(0);
  }

  function updateProgress(percent) {
    const safe = Math.min(100, Math.max(0, percent));
    $('journey-fill').style.width = `${safe}%`;
    $('journey-bike').style.left = `${safe}%`;
    $('map-progress').textContent = `${Math.floor(safe)}%`;
    TripMap.setProgress(safe, active && running && trafficSpeed() > 0);
  }

  function calculate(event) {
    if (event) event.preventDefault();
    const originName = $('origin').value.trim();
    const destinationName = $('destination').value.trim();
    $('form-error').hidden = true;
    if (!originName || !destinationName || originName.replace(/\s/g, '').toLowerCase() === destinationName.replace(/\s/g, '').toLowerCase()) {
      $('form-error').textContent = !originName || !destinationName ? 'กรุณาระบุจุดเริ่มต้นและปลายทาง' : 'กรุณาเลือกจุดเริ่มต้นและปลายทางให้ต่างกัน';
      $('form-error').hidden = false;
      invalidateEstimate();
      return;
    }
    const origin = locate(originName);
    const destination = locate(destinationName);
    const routes = mockRoutes(origin, destination);
    const route = routes[0];
    trip = { origin, destination, route, range: Fare.estimate(route.km, route.minutes) };
    $('estimate-min').textContent = trip.range.min;
    $('estimate-max').textContent = trip.range.max;
    $('estimate-distance').textContent = route.km.toFixed(1);
    $('estimate-time').textContent = route.minutes;
    $('route-options').replaceChildren(...routes.map((item, index) => {
      const row = document.createElement('div');
      row.className = `route-option${index === 0 ? ' selected' : ''}`;
      const label = document.createElement('span');
      label.textContent = `${index === 0 ? '✓ ' : ''}${item.name}${index === 0 ? ' · เร็วที่สุด' : ''}`;
      const value = document.createElement('span');
      value.textContent = `${item.km.toFixed(1)} กม. / ${item.minutes} นาที`;
      row.append(label, value);
      return row;
    }));
    $('estimate-card').hidden = false;
    $('estimate-card').classList.remove('stale-estimate');
    $('start-trip').disabled = false;
    $('calculate-label').textContent = 'คำนวณราคาใหม่';
    updateMap();
    RidePanel.create(trip);
    if (origin.custom || destination.custom) toast('ชื่อสถานที่ใหม่นี้ใช้พิกัดสมมติในกรุงเทพฯ สำหรับการทดลอง');
  }

  function invalidateEstimate() {
    if (pageState !== 'setup') return;
    trip = null;
    RidePanel.clear();
    $('estimate-card').hidden = true;
    $('start-trip').disabled = true;
    $('calculate-label').textContent = 'คำนวณราคา';
    $('map-route-status').textContent = 'คำนวณใหม่เพื่ออัปเดตเส้นทาง';
    TripMap.clear();
    updateProgress(0);
  }

  function trafficSpeed() {
    const mode = $('traffic').value;
    if (mode === 'normal') return 24;
    if (mode === 'slow') return 4;
    if (mode === 'stopped') return 0;
    const phase = Math.floor(meter.seconds / 120) % 5;
    return [24, 4, 24, 0, 24][phase];
  }

  function tick() {
    const now = performance.now();
    const elapsed = Math.max(0, (now - lastTick) / 1000);
    lastTick = now;
    if (!running || !active) return;
    let remaining = elapsed * Number($('simulation-speed').value);
    let charged = 0;
    // Chunk at traffic boundaries so accelerated time follows the same rules.
    while (remaining > 1e-7 && meter.km < trip.route.km - 1e-9) {
      const untilBoundary = 120 - meter.seconds % 120;
      const step = Math.min(remaining, untilBoundary < 1e-7 ? 120 : untilBoundary);
      charged += Fare.advanceMeter(meter, step, trafficSpeed(), trip.route.km);
      remaining -= step;
    }
    if (charged) toast(`เคลื่อนที่ไม่เกิน 0.4 กม. ในรอบ 2 นาที · เพิ่ม ${charged} บาท`);
    renderMeter();
    if (meter.km >= trip.route.km - 1e-9) finishTrip();
  }

  function startTrip() {
    if (!trip || active) return;
    meter = Fare.createMeter();
    running = true;
    active = true;
    $('locked-range').textContent = rangeText(trip.range);
    $('pause-trip').textContent = 'พักมิเตอร์';
    $('pause-trip').setAttribute('aria-pressed', 'false');
    $('meter-status').classList.remove('paused');
    $('meter-status').replaceChildren(statusDot(), document.createTextNode('กำลังวิ่ง'));
    updateTrafficDescription();
    setState('meter');
    renderMeter(true);
    lastTick = performance.now();
    clearInterval(timer);
    timer = setInterval(tick, 200);
    ($('pause-trip').hidden ? $('finish-trip') : $('pause-trip')).focus({ preventScroll: true });
  }

  function statusDot() { const dot = document.createElement('span'); dot.className = 'live-dot'; return dot; }

  function renderMeter(forceShare = false) {
    const total = Fare.meterTotal(meter);
    $('meter-price').textContent = total;
    $('meter-distance').textContent = meter.km.toFixed(2);
    $('meter-time').textContent = time(meter.seconds);
    $('distance-fee').textContent = money(Math.ceil(Fare.distanceFare(meter.km) - 1e-9));
    $('time-fee').textContent = money(meter.slowFee);
    $('slow-count').textContent = `${meter.slowWindows} รอบ`;
    $('window-time').textContent = `${time(meter.windowSeconds)} / 02:00`;
    $('window-progress').value = meter.windowSeconds;
    $('window-info').textContent = `เคลื่อนที่ ${meter.windowKm.toFixed(2)} กม. · ถ้าไม่เกิน 0.40 กม. เมื่อครบรอบ เพิ่ม 5 บาท`;
    const note = $('meter-cap-note');
    note.classList.toggle('at-cap', total > trip.range.max);
    note.textContent = total > trip.range.max ? `มิเตอร์เกินช่วงราคาแล้ว · จ่ายสูงสุด ${trip.range.max} บาท` : total < trip.range.min ? `ยอดขั้นต่ำเมื่อจบทริป ${trip.range.min} บาท ตามช่วงที่ตกลง` : 'ราคาสุดท้ายปรับให้อยู่ในช่วงที่ตกลง';
    updateProgress(meter.km / trip.route.km * 100);
    $('map-route-status').textContent = `${running ? 'กำลังเดินทาง' : 'พักมิเตอร์'} · เหลือ ${Math.max(0, trip.route.km - meter.km).toFixed(2)} กม.`;
    RidePanel.update({ status: running ? 'riding' : 'paused', km: meter.km, seconds: meter.seconds,
      rawFare: total, total, meter: { ...meter } }, forceShare);
  }

  function pauseTrip() {
    if (!active) return;
    tick();
    if (!active) return;
    running = !running;
    lastTick = performance.now();
    $('pause-trip').textContent = running ? 'พักมิเตอร์' : 'เดินทางต่อ';
    $('pause-trip').setAttribute('aria-pressed', String(!running));
    $('meter-status').classList.toggle('paused', !running);
    $('meter-status').replaceChildren(statusDot(), document.createTextNode(running ? 'กำลังวิ่ง' : 'พักมิเตอร์'));
    renderMeter(true);
  }

  function finishTrip() {
    if (!active) return;
    running = false;
    active = false;
    clearInterval(timer);
    timer = null;
    updateProgress(meter.km / trip.route.km * 100);
    const result = Fare.settle(meter, trip.range);
    $('final-price').textContent = result.total;
    $('receipt-range').textContent = `ช่วงราคาที่ตกลง ${rangeText(trip.range)}`;
    $('receipt-origin').textContent = trip.origin.name;
    $('receipt-destination').textContent = trip.destination.name;
    $('receipt-distance').textContent = `${meter.km.toFixed(2)} กม.`;
    $('receipt-time').textContent = `${Math.floor(meter.seconds / 60)} นาที ${Math.floor(meter.seconds % 60)} วินาที`;
    $('receipt-distance-fee').textContent = money(Math.ceil(Fare.distanceFare(meter.km) - 1e-9));
    $('receipt-time-fee').textContent = money(meter.slowFee);
    $('receipt-slow-label').textContent = `ค่าเคลื่อนตัวช้า / หยุดรอ (${meter.slowWindows} รอบ)`;
    $('receipt-meter').textContent = money(result.raw);
    $('receipt-adjustment').textContent = `${result.adjustment > 0 ? '+' : result.adjustment < 0 ? '−' : ''}${money(Math.abs(result.adjustment))}`;
    $('adjustment-label').textContent = result.adjustment > 0 ? 'ปรับขึ้นตามราคาขั้นต่ำ' : result.adjustment < 0 ? 'ส่วนลดตามราคาสูงสุด' : 'ปรับตามช่วงราคา';
    $('settlement-note').textContent = result.adjustment > 0 ? `มิเตอร์ต่ำกว่า ${trip.range.min} บาท จึงคิดราคาขั้นต่ำที่ตกลงไว้ ${trip.range.min} บาท` : result.adjustment < 0 ? `มิเตอร์เกิน ${trip.range.max} บาท จึงจำกัดราคาสูงสุดที่ ${trip.range.max} บาท` : 'ยอดมิเตอร์อยู่ในช่วงราคาที่ตกลง จึงจ่ายตามมิเตอร์ได้เลย';
    $('map-route-status').textContent = `จบการเดินทาง · ${meter.km.toFixed(2)} กม.`;
    setState('summary');
    RidePanel.update({ status: 'completed', km: meter.km, seconds: meter.seconds,
      rawFare: result.raw, total: result.total, meter: { ...meter } }, true);
    $('new-trip').focus({ preventScroll: true });
  }

  $('route-form').addEventListener('submit', calculate);
  ['origin', 'destination'].forEach(id => $(id).addEventListener('input', () => { $('form-error').hidden = true; invalidateEstimate(); }));
  $('start-trip').addEventListener('click', startTrip);
  $('pause-trip').addEventListener('click', pauseTrip);
  $('finish-trip').addEventListener('click', () => { tick(); finishTrip(); });
  function updateTrafficDescription() {
    const messages = { auto: 'จำลองช่วงขับปกติ สลับรถติดและหยุดรอ', normal: 'ขับปกติ 24 กม./ชม. · ใน 2 นาที เคลื่อนที่ 0.80 กม.', slow: 'รถติด 4 กม./ชม. · ใน 2 นาที เคลื่อนที่ประมาณ 0.13 กม.', stopped: 'จอดรอ · เมื่อครบทุก 2 นาที เพิ่ม 5 บาท' };
    $('traffic-description').textContent = messages[$('traffic').value];
  }
  $('traffic').addEventListener('change', () => {
    lastTick = performance.now();
    updateTrafficDescription();
  });
  $('simulation-speed').addEventListener('change', () => { lastTick = performance.now(); });
  $('new-trip').addEventListener('click', () => {
    clearInterval(timer);
    timer = null;
    active = false;
    running = false;
    meter = null;
    setState('setup');
    calculate();
    $('destination').focus({ preventScroll: true });
  });
  // Navigation away cannot leave an old simulation timer running.
  window.addEventListener('pagehide', () => {
    clearInterval(timer); timer = null;
    if (active) RidePanel.update({ status: 'paused' }, true);
  });
  window.addEventListener('pageshow', event => {
    if (event.persisted && active) {
      lastTick = performance.now(); timer = setInterval(tick, 200);
      renderMeter(true);
    }
  });
  updateTrafficDescription();
  setState('setup');
})();

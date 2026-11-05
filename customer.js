(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const share = window.RideShare;
  let authoritative = null;
  let current = null;
  let source = 'snapshot';
  let demo = false;
  let unsubscribe = null;
  let timer = null;
  let lastTick = 0;
  let lastLocalSignature = '';
  let lastReviewsSignature = '';
  let reviewPersistent = true;
  let mapSignature = '';
  let mapProjection = null;

  const timeValue = value => typeof value === 'number' ? value : (Date.parse(value) || 0);
  const progress = record => Math.max(0, Math.min(1, record.route.km ? record.km / record.route.km : 0));
  const number = value => Number(value).toLocaleString('th-TH', { maximumFractionDigits: 0 });
  const elapsed = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
  function setText(id, text) { $(id).textContent = text; }
  function formatDate(value, includeTime = false) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return 'ไม่ระบุเวลา';
    return date.toLocaleString('th-TH', includeTime
      ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function routePoints(record) {
    if (typeof share.routePoints === 'function') return share.routePoints(record);
    const a = record.origin;
    const b = record.destination;
    const dy = b.lat - a.lat;
    const dx = b.lng - a.lng;
    const bend = Math.max(Math.abs(dx), Math.abs(dy), 0.003) * 0.13;
    return [a,
      { lat: a.lat + dy * 0.3 + bend, lng: a.lng + dx * 0.15 },
      { lat: a.lat + dy * 0.3 + bend, lng: a.lng + dx * 0.6 },
      { lat: a.lat + dy * 0.8, lng: a.lng + dx * 0.6 }, b];
  }
  function project(point) {
    const latitude = point.lat * Math.PI / 180;
    return { x: (point.lng + 180) / 360, y: (1 - Math.log(Math.tan(latitude) + 1 / Math.cos(latitude)) / Math.PI) / 2 };
  }
  function drawMap() {
    if (!current) return;
    const panel = $('customer-map');
    const width = panel.clientWidth;
    const height = panel.clientHeight;
    if (!width || !height) return;
    const points = routePoints(current).map(project);
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const bounds = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
    const zoom = Math.max(4, Math.min(17, Math.floor(Math.log2(Math.min(
      Math.max(60, width - 100) / (256 * Math.max(bounds.right - bounds.left, 1e-8)),
      Math.max(60, height - 160) / (256 * Math.max(bounds.bottom - bounds.top, 1e-8))
    )))));
    const scale = 256 * 2 ** zoom;
    const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    mapProjection = point => ({ x: (point.x - center.x) * scale + width / 2, y: (point.y - center.y) * scale + height / 2 });
    const pixels = points.map(mapProjection);
    const path = pixels.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');
    $('customer-route-layer').setAttribute('viewBox', `0 0 ${width} ${height}`);
    ['customer-route-halo', 'customer-route-path', 'customer-route-travelled'].forEach(id => $(id).setAttribute('d', path));
    const start = pixels[0];
    const end = pixels[pixels.length - 1];
    $('customer-start-marker').setAttribute('transform', `translate(${start.x},${start.y})`);
    $('customer-end-marker').setAttribute('transform', `translate(${end.x},${end.y})`);
    const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * center.y))) * 180 / Math.PI;
    const lng = center.x * 360 - 180;
    const url = `https://maps.google.com/maps?ll=${lat.toFixed(6)},${lng.toFixed(6)}&z=${zoom}&output=embed`;
    if ($('customer-google-map').getAttribute('src') !== url) $('customer-google-map').src = url;
    mapSignature = `${current.origin.lat},${current.origin.lng},${current.destination.lat},${current.destination.lng},${width},${height}`;
    paintMap();
  }
  function paintMap() {
    if (!current || !mapProjection) return;
    const position = share.position(current);
    const pixel = mapProjection(project(position));
    $('customer-rider-marker').setAttribute('transform', `translate(${pixel.x},${pixel.y})`);
    const length = $('customer-route-path').getTotalLength();
    $('customer-route-travelled').style.strokeDasharray = `${length} ${length}`;
    $('customer-route-travelled').style.strokeDashoffset = String(length * (1 - progress(current)));
    $('customer-route-layer').setAttribute('aria-label', `เส้นทางและตำแหน่งรถจำลอง เดินทางแล้ว ${Math.floor(progress(current) * 100)} เปอร์เซ็นต์`);
    setText('position-label', `ตำแหน่งจำลอง · ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`);
  }

  function renderConnection() {
    const labels = { snapshot: 'ข้อมูล ณ เวลาที่แชร์', synced: 'อัปเดตในเบราว์เซอร์นี้', demo: 'การทดลองแยกบนเครื่องนี้' };
    const mode = demo ? 'demo' : source;
    setText('source-badge', labels[mode]);
    $('source-badge').classList.toggle('demo', demo);
    setText('connection-title', labels[mode]);
    $('connection-dot').className = `connection-dot ${mode}`;
    let message = demo
      ? 'กำลังจำลองความเร็ว 30× เฉพาะหน้านี้ ตำแหน่งและมิเตอร์นี้ไม่ใช่ข้อมูลจากผู้ขับขี่ และจะไม่บันทึกทับทริปที่แชร์'
      : source === 'synced'
        ? 'แสดงข้อมูลล่าสุดที่บันทึกจากหน้าผู้ขับขี่ในเบราว์เซอร์นี้ เปิดหน้าผู้ขับขี่ไว้เพื่อรับการเปลี่ยนแปลง'
        : 'นี่คือภาพข้อมูลจากลิงก์ที่ผู้ขับขี่แชร์ ตำแหน่งและมิเตอร์จะไม่เดินต่อเองบนอุปกรณ์นี้';
    if (!demo && source === 'synced' && ['riding', 'paused'].includes(current.status) && Date.now() - timeValue(current.updatedAt) > 20000) {
      message += ' · ยังไม่ได้รับข้อมูลใหม่ในช่วง 20 วินาทีที่ผ่านมา';
    }
    setText('connection-description', message);
    setText('updated-label', `${demo ? 'ข้อมูลทริปต้นทาง' : 'อัปเดตล่าสุด'} · ${formatDate(authoritative.updatedAt, true)}`);
    $('start-customer-demo').hidden = demo || authoritative.status === 'cancelled';
    $('stop-customer-demo').hidden = !demo;
    setText('customer-demo-hint', demo
      ? 'หากหน้าผู้ขับขี่ส่งข้อมูลใหม่ หน้านี้จะกลับมาแสดงข้อมูลนั้นโดยอัตโนมัติ'
      : authoritative.status === 'cancelled' ? 'ทริปนี้ยกเลิกแล้ว กรุณาขอลิงก์ทริปใหม่จากผู้ขับขี่'
        : 'การทดลองแยกจากมิเตอร์ผู้ขับขี่ ไม่เปลี่ยนข้อมูลทริปที่แชร์');
  }

  function renderRider() {
    const rider = share.getRider(current.riderId);
    setText('rider-avatar', rider.initials);
    setText('rider-name', `${rider.name}${rider.nickname ? ` (${rider.nickname})` : ''}`);
    setText('rider-experience', `${rider.experience} · ${number(rider.rides)} เที่ยว`);
    setText('rider-rating', Number(rider.rating).toFixed(1));
    setText('rider-review-count', `(${number(rider.reviewCount)} รีวิว)`);
    setText('rider-vehicle', rider.vehicle);
    setText('rider-plate', rider.plate);
    setText('rider-stand', `${rider.stand} · ${rider.vest}`);
    const reviews = share.getReviews(current.riderId);
    const signature = JSON.stringify(reviews);
    if (signature === lastReviewsSignature) return;
    lastReviewsSignature = signature;
    $('rider-reviews').replaceChildren();
    reviews.forEach(review => {
      const article = document.createElement('article');
      article.className = 'past-review';
      const top = document.createElement('div');
      top.className = 'past-review-top';
      const name = document.createElement('b');
      name.textContent = review.name;
      const date = document.createElement('time');
      date.textContent = formatDate(review.date);
      top.append(name, date);
      const stars = document.createElement('p');
      stars.className = 'past-review-stars';
      stars.textContent = `${'★'.repeat(Math.max(0, Math.min(5, Math.round(review.rating))))} · ${review.rating}/5`;
      const comment = document.createElement('p');
      comment.textContent = review.comment || 'ไม่ได้เขียนความคิดเห็น';
      article.append(top, stars, comment);
      $('rider-reviews').append(article);
    });
  }

  function renderReview() {
    const saved = share.getReview(authoritative.id);
    const allowed = !demo && authoritative.status === 'completed' && !saved;
    $('review-fields').disabled = !allowed;
    $('customer-review-form').hidden = Boolean(saved);
    $('saved-review').hidden = !saved;
    setText('review-availability', saved
      ? reviewPersistent
        ? 'ขอบคุณสำหรับความคิดเห็น บันทึกรีวิวของทริปนี้ในเบราว์เซอร์แล้ว'
        : 'ขอบคุณสำหรับความคิดเห็น รับรีวิวไว้ชั่วคราวในหน้านี้ รีวิวอาจหายเมื่อปิดหน้า'
      : demo ? 'การทดลองแยกนี้ส่งรีวิวไม่ได้ กลับไปดูทริปที่แชร์และรอให้ผู้ขับขี่จบทริปก่อน'
        : authoritative.status === 'completed' ? 'ให้คะแนนผู้ขับขี่และฝากความคิดเห็นได้แล้ว รีวิวนี้บันทึกเฉพาะเบราว์เซอร์ของคุณ'
          : authoritative.status === 'cancelled' ? 'ทริปนี้ยกเลิกแล้ว จึงไม่เปิดรับรีวิว'
            : 'รีวิวจะเปิดให้ส่งเมื่อผู้ขับขี่จบการเดินทาง');
    if (saved) {
      setText('saved-review-rating', `${'★'.repeat(saved.rating)} · ${saved.rating}/5`);
      setText('saved-review-comment', saved.comment || 'ไม่ได้เขียนความคิดเห็น');
    }
  }

  function render() {
    if (!current) return;
    const status = {
      ready: ['พร้อมออกเดินทาง', 'ผู้ขับขี่กำลังเตรียมเริ่มทริป'],
      riding: ['กำลังเดินทาง', 'ดูตำแหน่ง ระยะทาง และค่าโดยสารจำลองของทริปนี้'],
      paused: ['พักมิเตอร์ชั่วคราว', 'ผู้ขับขี่พักการจำลอง ระยะทางและเวลาหยุดอยู่ที่ข้อมูลล่าสุด'],
      completed: ['จบการเดินทางแล้ว', 'ขอบคุณที่เดินทางด้วยกัน ตรวจสอบยอดสรุปได้ด้านล่าง'],
      cancelled: ['ยกเลิกการเดินทาง', 'ทริปนี้ถูกยกเลิกแล้ว ข้อมูลด้านล่างเป็นมิเตอร์ก่อนยกเลิก']
    }[current.status];
    setText('trip-status-title', status[0]);
    setText('trip-status-description', status[1]);
    $('trip-status-icon').querySelector('use').setAttribute('href', current.status === 'completed' ? '#c-check' : '#c-bike');
    setText('ride-code', `ทริป ${authoritative.id}`);
    setText('customer-origin', current.origin.name);
    setText('customer-destination', current.destination.name);
    setText('customer-route-name', `${current.route.name} · ${current.route.km.toFixed(1)} กม. · ประมาณ ${number(current.route.minutes)} นาที`);
    setText('customer-range', `${number(current.range.min)}–${number(current.range.max)} บาท`);
    setText('fare-label', current.status === 'completed' ? 'ค่าโดยสารสุทธิ' : current.status === 'cancelled' ? 'มิเตอร์ก่อนยกเลิก' : 'ค่าโดยสารตามมิเตอร์');
    setText('customer-fare', number(current.status === 'completed' ? current.total : current.rawFare));
    setText('fare-note', current.status === 'completed'
      ? `ยอดตามมิเตอร์ ${number(current.rawFare)} บาท · ปรับให้อยู่ในช่วงราคาที่ตกลง`
      : current.status === 'cancelled' ? 'ข้อมูลจำลองเท่านั้น ไม่มีการเรียกเก็บเงิน'
        : 'เมื่อจบทริป ราคาสุดท้ายจะปรับให้อยู่ในช่วงที่ตกลง');
    setText('customer-distance', `${current.km.toFixed(2)} กม.`);
    setText('customer-time', elapsed(current.seconds));
    const percent = Math.floor(progress(current) * 100);
    setText('customer-progress-label', `${percent}%`);
    $('customer-progress').value = progress(current) * 100;
    setText('progress-note', current.status === 'completed' && progress(current) < 0.999
      ? 'จบทริปก่อนครบระยะทางที่วางไว้ แสดงตำแหน่งและระยะทาง ณ เวลาจบทริป'
      : `ระยะทางเส้นทางจำลองทั้งหมด ${current.route.km.toFixed(2)} กม. · ไม่ใช่การติดตาม GPS`);
    const maps = new URL('https://www.google.com/maps/dir/');
    maps.searchParams.set('api', '1');
    maps.searchParams.set('origin', `${current.origin.lat},${current.origin.lng}`);
    maps.searchParams.set('destination', `${current.destination.lat},${current.destination.lng}`);
    maps.searchParams.set('travelmode', 'driving');
    $('customer-maps-link').href = maps.href;
    renderConnection();
    renderRider();
    renderReview();
    const panel = $('customer-map');
    const signature = `${current.origin.lat},${current.origin.lng},${current.destination.lat},${current.destination.lng},${panel.clientWidth},${panel.clientHeight}`;
    if (mapSignature !== signature) drawMap();
    else paintMap();
  }

  function acceptLocal(record) {
    if (!record || record.id !== authoritative.id) return;
    const signature = JSON.stringify(record);
    if (signature === lastLocalSignature) return;
    lastLocalSignature = signature;
    if (timeValue(record.updatedAt) < timeValue(authoritative.updatedAt)) return;
    authoritative = record;
    current = record;
    source = 'synced';
    demo = false;
    render();
  }

  function initialize() {
    const snapshot = share && share.decode(window.location.hash);
    if (!snapshot) {
      $('invalid-link').hidden = false;
      document.title = 'เปิดทริปไม่ได้ · SC-09';
      return;
    }
    authoritative = snapshot;
    const local = share.read(snapshot.id);
    if (local && timeValue(local.updatedAt) >= timeValue(snapshot.updatedAt)) {
      authoritative = local;
      source = 'synced';
    }
    lastLocalSignature = local ? JSON.stringify(local) : '';
    current = authoritative;
    $('trip-content').hidden = false;
    render();
    unsubscribe = share.subscribe(authoritative.id, acceptLocal);
    let pollElapsed = 0;
    lastTick = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      const delta = Math.max(0, (now - lastTick) / 1000);
      lastTick = now;
      pollElapsed += delta;
      if (pollElapsed >= 1.5) {
        pollElapsed = 0;
        acceptLocal(share.read(authoritative.id));
        renderConnection();
        renderReview();
        renderRider();
      }
      if (demo && current.status === 'riding') {
        current = share.simulate(current, delta, 30);
        render();
      }
    }, 250);
  }

  $('start-customer-demo').addEventListener('click', () => {
    if (!authoritative || authoritative.status === 'cancelled') return;
    current = share.newDemo(authoritative);
    demo = true;
    lastTick = performance.now();
    setText('review-result', '');
    render();
  });
  $('stop-customer-demo').addEventListener('click', () => {
    demo = false;
    current = authoritative;
    render();
  });
  $('customer-review-form').addEventListener('change', () => {
    const selected = Number(new FormData($('customer-review-form')).get('rating'));
    document.querySelectorAll('.star-options label').forEach((label, index) => label.classList.toggle('selected', index < selected));
  });
  $('customer-review-form').addEventListener('submit', event => {
    event.preventDefault();
    if (demo || !authoritative || authoritative.status !== 'completed' || share.getReview(authoritative.id)) return;
    try {
      const values = new FormData(event.currentTarget);
      const review = share.submitReview(authoritative, { rating: Number(values.get('rating')), comment: String(values.get('comment') || '').trim() });
      reviewPersistent = review.persistent !== false;
      $('review-result').classList.remove('error');
      setText('review-result', review.persistent === false
        ? 'รับรีวิวไว้ในหน้านี้แล้ว แต่เบราว์เซอร์ไม่อนุญาตให้เก็บข้อมูล รีวิวอาจหายเมื่อปิดหน้า'
        : 'บันทึกรีวิวแล้ว ขอบคุณสำหรับความคิดเห็น');
      renderReview();
      renderRider();
    } catch (_) {
      $('review-result').classList.add('error');
      setText('review-result', 'บันทึกรีวิวไม่ได้ กรุณาเลือกคะแนน 1–5 ดาว ตรวจสอบว่าทริปจบแล้วและยังไม่เคยส่งรีวิว');
    }
  });
  if (typeof ResizeObserver === 'function') new ResizeObserver(drawMap).observe($('customer-map'));
  else window.addEventListener('resize', drawMap);
  window.addEventListener('pagehide', () => { if (unsubscribe) unsubscribe(); if (timer) clearInterval(timer); });
  window.addEventListener('pageshow', event => { if (event.persisted) window.location.reload(); });
  window.addEventListener('hashchange', () => window.location.reload());
  initialize();
})();

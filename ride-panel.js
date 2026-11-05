/* Rider-side QR sharing; the customer page uses the self-contained snapshot. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  let record = null;
  let lastSaved = 0;
  let lastQR = 0;
  let url = '';
  let prototypeVersion = '2';
  try {
    const saved = localStorage.getItem('winsure.prototypeVersion');
    if (['1', '2'].includes(saved)) prototypeVersion = saved;
  } catch (_) { /* Keep the default when storage is unavailable. */ }
  const requestedVersion = new URLSearchParams(location.search).get('prototype');
  if (['1', '2'].includes(requestedVersion)) prototypeVersion = requestedVersion;
  const dialog = $('ride-qr-dialog');
  function renderRider() {
    const rider = RideShare.getRider(record ? record.riderId : undefined);
    $('share-rider-name').textContent = `${rider.name} · ${rider.vest}`;
    $('share-rider-vehicle').textContent = rider.plate;
    $('share-rider-rating').textContent = `★ ${rider.rating.toFixed(1)} · ${rider.reviewCount} รีวิวจำลอง`;
  }
  renderRider();
  const local = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  $('share-host-note').textContent = local ?
    'ทดสอบในเครื่อง: เปิดหน้าผู้โดยสารในแท็บใหม่ได้ หากสแกนจากโทรศัพท์ ให้ใช้ URL ที่โทรศัพท์เข้าถึงได้ เช่น GitHub Pages' :
    'QR เปิดข้อมูลทริปได้ทุกอุปกรณ์ · ตำแหน่งอัปเดตต่อเนื่องเมื่อเปิดสองหน้าในเบราว์เซอร์เดียวกันเท่านั้น';

  function renderQR() {
    if (!record || prototypeVersion === '1') return;
    try {
      const code = qrcode(0, url.length > 1000 ? 'L' : 'M');
      code.addData(url, 'Byte');
      code.make();
      const svg = code.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
      // Encoder output is geometry only; no ride text is inserted into markup.
      $('ride-qr').innerHTML = svg;
      $('ride-qr-large').innerHTML = svg;
      $('qr-snapshot-time').textContent = `ข้อมูล ณ ${new Date(record.updatedAt).toLocaleTimeString('th-TH')} · ตำแหน่งจำลอง`;
      lastQR = Date.now();
    } catch (_) {
      $('ride-qr').textContent = 'เปิดหน้าผู้โดยสารด้วยลิงก์ด้านล่าง';
      $('ride-qr-large').textContent = 'ไม่สามารถสร้าง QR ได้ กรุณาใช้ลิงก์';
    }
  }

  function publish(force) {
    if (!record || (!force && Date.now() - lastSaved < 1000)) return;
    renderRider();
    const persistent = RideShare.save(record);
    lastSaved = Date.now();
    url = RideShare.customerURL(record);
    $('customer-link').href = url;
    $('dialog-customer-link').href = url;
    $('ride-link').value = url;
    $('share-ride-id').textContent = `ทริป ${record.id.slice(0, 8)} · QR เฉพาะการเดินทางนี้`;
    if (!persistent) $('share-message').textContent = 'เบราว์เซอร์ปิดการจัดเก็บข้อมูล ลิงก์ยังใช้ได้ แต่อัปเดตข้ามแท็บและบันทึกถาวรไม่ได้';
    if (force || Date.now() - lastQR > 5000) renderQR();
  }

  function clear() {
    if (record && record.status === 'ready') {
      record.status = 'cancelled';
      record.updatedAt = Math.max(Date.now(), record.updatedAt + 1);
      RideShare.save(record);
    }
    record = null;
    $('ride-share-card').hidden = true;
    $('open-ride-qr').hidden = true;
    if (dialog.open) dialog.close();
  }

  window.RidePanel = {
    create(trip) {
      clear();
      record = RideShare.create(trip);
      $('share-message').textContent = '';
      applyVersion();
      publish(true);
    },
    update(changes, force = false) {
      if (!record) return;
      record = { ...record, ...changes, updatedAt: Math.max(Date.now(), record.updatedAt + 1) };
      publish(force);
    },
    clear
  };

  function applyVersion() {
    document.body.dataset.prototype = prototypeVersion;
    const visible = prototypeVersion === '2' && Boolean(record);
    $('ride-share-card').hidden = !visible;
    $('open-ride-qr').hidden = !visible;
    if (!visible && dialog.open) dialog.close();
  }
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'winsure:prototype-version' ||
      !['1', '2'].includes(event.data.version)) return;
    if (prototypeVersion === event.data.version) return;
    prototypeVersion = event.data.version;
    applyVersion();
    if (prototypeVersion === '2') publish(true);
  });
  applyVersion();

  function openQR() {
    if (!record || prototypeVersion === '1') return;
    publish(true);
    if (!dialog.open) dialog.showModal();
  }
  $('open-ride-qr').addEventListener('click', openQR);
  $('expand-ride-qr').addEventListener('click', openQR);
  $('close-ride-qr').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  } });
  $('copy-ride-link').addEventListener('click', async () => {
    publish(true);
    try {
      await navigator.clipboard.writeText(url);
      $('share-message').textContent = 'คัดลอกลิงก์ทริปนี้แล้ว';
    } catch (_) {
      $('ride-link').focus();
      $('ride-link').select();
      $('share-message').textContent = 'เลือกลิงก์ไว้แล้ว กรุณาคัดลอกจากช่องลิงก์';
    }
  });
})();

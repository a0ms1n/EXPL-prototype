/* Static ride snapshots and same-browser updates. No server or live GPS. */
(function (root) {
  'use strict';
  const Fare = root.Fare || (typeof require === 'function' ? require('./fare.js') : null);
  const PREFIX = 'sc09-v2-';
  const memory = new Map();
  const rider = Object.freeze({
    id: 'rider-somchai', name: 'สมชาย ใจดี', nickname: 'พี่ชาย', initials: 'สช',
    stand: 'วินสามย่าน · จุฬาฯ', experience: 'ขับขี่ 8 ปี',
    vehicle: 'Honda Wave 125i · สีดำแดง', plate: '1กข 2345 กรุงเทพมหานคร',
    vest: 'เสื้อวินหมายเลข 09', rating: 4.9, reviewCount: 128, rides: 1240
  });
  const mockReviews = [
    { name: 'คุณพลอย', rating: 5, comment: 'ขับสุภาพ มีหมวกกันน็อกให้ ราคาตรงตามที่ตกลงค่ะ', date: '2026-10-28' },
    { name: 'คุณต้น', rating: 5, comment: 'รู้เส้นทางดี ไปถึงตรงเวลา พูดจาดีครับ', date: '2026-10-24' },
    { name: 'คุณมิน', rating: 4, comment: 'เดินทางสะดวก เห็นราคาก่อนขึ้นรถ สบายใจขึ้นมาก', date: '2026-10-20' }
  ];
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
  const text = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
  const validPoint = point => point && text(point.name, 100) && number(point.lat, -85, 85) && number(point.lng, -180, 180);

  function valid(record) {
    return Boolean(record && record.v === 1 && typeof record.id === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(record.id) &&
      record.riderId === rider.id && number(record.createdAt, 1, 1e15) &&
      number(record.updatedAt, record.createdAt, 1e15) && validPoint(record.origin) && validPoint(record.destination) &&
      record.route && text(record.route.name, 100) && number(record.route.km, 0.01, 1000) && number(record.route.minutes, 0.01, 10000) &&
      record.range && number(record.range.min, 25, 1e6) && number(record.range.max, record.range.min, 1e6) &&
      ['ready', 'riding', 'paused', 'completed', 'cancelled'].includes(record.status) &&
      number(record.km, 0, record.route.km) && number(record.seconds, 0, 1e8) &&
      number(record.rawFare, 25, 1e8) && number(record.total, 25, 1e8));
  }

  function create(trip) {
    const now = Date.now();
    const id = root.crypto && typeof root.crypto.randomUUID === 'function' ? root.crypto.randomUUID() :
      `${now.toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 8)}`;
    const record = { v: 1, id, createdAt: now, updatedAt: now, riderId: rider.id,
      origin: clone(trip.origin), destination: clone(trip.destination),
      route: { name: trip.route.name, km: trip.route.km, minutes: trip.route.minutes },
      range: { min: trip.range.min, max: trip.range.max },
      status: 'ready', km: 0, seconds: 0, rawFare: 25, total: 25 };
    if (!valid(record)) throw new RangeError('Invalid ride details.');
    return record;
  }

  function encode(record) {
    if (!valid(record)) throw new RangeError('Invalid ride snapshot.');
    // Compact field names keep even Thai place names practical to scan.
    const point = value => [value.name, value.lat, value.lng];
    const data = [1, record.id, record.createdAt, record.riderId, point(record.origin), point(record.destination),
      [record.route.name, record.route.km, record.route.minutes], [record.range.min, record.range.max],
      record.status, record.km, record.seconds, record.rawFare, record.total, record.updatedAt];
    const bytes = new TextEncoder().encode(JSON.stringify(data));
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return '#ride=' + btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function decode(hash) {
    try {
      if (typeof hash !== 'string' || !/^#ride=[A-Za-z0-9_-]+$/.test(hash) || hash.length > 8000) return null;
      const raw = hash.slice(6).replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(raw), char => char.charCodeAt(0));
      const data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
      if (!Array.isArray(data) || data.length !== 14 || ![4, 5, 6, 7].every(i => Array.isArray(data[i])) ||
        data[4].length !== 3 || data[5].length !== 3 || data[6].length !== 3 || data[7].length !== 2) return null;
      const point = value => ({ name: value[0], lat: value[1], lng: value[2] });
      const record = { v: data[0], id: data[1], createdAt: data[2], riderId: data[3], origin: point(data[4]), destination: point(data[5]),
        route: { name: data[6][0], km: data[6][1], minutes: data[6][2] }, range: { min: data[7][0], max: data[7][1] },
        status: data[8], km: data[9], seconds: data[10], rawFare: data[11], total: data[12], updatedAt: data[13] };
      return valid(record) ? record : null;
    } catch (_) { return null; }
  }

  function customerURL(record, baseURL) {
    const url = new URL('customer.html', baseURL || root.location.href);
    url.hash = encode(record);
    return url.href;
  }

  function stored(key) {
    try {
      const raw = root.localStorage.getItem(PREFIX + key);
      if (raw) return JSON.parse(raw);
    } catch (_) { /* Private browsing can disable persistence. */ }
    return memory.has(key) ? clone(memory.get(key)) : null;
  }

  function persist(key, value) {
    memory.set(key, clone(value));
    try { root.localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; }
    catch (_) { return false; }
  }

  function read(id) {
    const record = stored('ride-' + id);
    return valid(record) && record.id === id ? record : null;
  }

  function save(record) {
    if (!valid(record)) throw new RangeError('Invalid ride update.');
    return persist('ride-' + record.id, record);
  }

  function subscribe(id, callback) {
    const handler = event => {
      if (event.key === PREFIX + 'ride-' + id || event.key === null) {
        const record = read(id);
        if (record) callback(record);
      }
    };
    if (root.addEventListener) root.addEventListener('storage', handler);
    return () => { if (root.removeEventListener) root.removeEventListener('storage', handler); };
  }

  function routePoints(record) {
    const { origin, destination } = record;
    const dy = destination.lat - origin.lat;
    const dx = destination.lng - origin.lng;
    const bend = Math.max(Math.abs(dx), Math.abs(dy), 0.003) * 0.13;
    return [origin,
      { lat: origin.lat + dy * 0.3 + bend, lng: origin.lng + dx * 0.15 },
      { lat: origin.lat + dy * 0.3 + bend, lng: origin.lng + dx * 0.6 },
      { lat: origin.lat + dy * 0.8, lng: origin.lng + dx * 0.6 }, destination];
  }

  function position(record) {
    const project = point => ({ x: (point.lng + 180) / 360,
      y: (1 - Math.log(Math.tan(point.lat * Math.PI / 180) + 1 / Math.cos(point.lat * Math.PI / 180)) / Math.PI) / 2 });
    const points = routePoints(record).map(project);
    const lengths = points.slice(1).map((point, i) => Math.hypot(point.x - points[i].x, point.y - points[i].y));
    let distance = lengths.reduce((a, b) => a + b, 0) * Math.max(0, Math.min(1, record.km / record.route.km));
    let i = 0;
    while (i < lengths.length - 1 && distance > lengths[i]) distance -= lengths[i++];
    const fraction = lengths[i] ? Math.min(1, distance / lengths[i]) : 0;
    const x = points[i].x + (points[i + 1].x - points[i].x) * fraction;
    const y = points[i].y + (points[i + 1].y - points[i].y) * fraction;
    return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, lng: x * 360 - 180 };
  }

  const validReview = review => review && review.riderId === rider.id && text(review.rideId, 80) &&
    Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5 &&
    typeof review.comment === 'string' && review.comment.length <= 500 && text(review.date, 40);

  function getReview(rideId) {
    const review = stored('review-' + rideId);
    return validReview(review) && review.rideId === rideId ? review : null;
  }

  function getReviews(riderId) {
    if (riderId !== rider.id) return [];
    const ids = stored('review-index');
    const own = (Array.isArray(ids) ? ids : []).slice(-100).map(getReview).filter(Boolean).reverse();
    return [...own, ...clone(mockReviews)];
  }

  function submitReview(record, input) {
    if (!valid(record) || record.status !== 'completed') throw new RangeError('Complete the ride before reviewing.');
    if (getReview(record.id)) throw new RangeError('This ride already has a review.');
    if (!input || !Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5 ||
      typeof input.comment !== 'string' || input.comment.trim().length > 500) throw new RangeError('Choose 1–5 stars and at most 500 characters.');
    const review = { rideId: record.id, riderId: record.riderId, name: 'คุณ (รีวิวทดลอง)', rating: input.rating,
      comment: input.comment.trim(), date: new Date().toISOString().slice(0, 10) };
    const persistent = persist('review-' + record.id, review);
    const ids = stored('review-index');
    persist('review-index', [...new Set([...(Array.isArray(ids) ? ids : []), record.id])].slice(-100));
    return { ...review, persistent };
  }

  function getRider(id) {
    if (id && id !== rider.id) return null;
    const reviews = getReviews(rider.id).filter(review => review.rideId);
    const count = rider.reviewCount + reviews.length;
    return { ...rider, rating: Math.round((rider.rating * rider.reviewCount + reviews.reduce((sum, review) => sum + review.rating, 0)) / count * 10) / 10,
      reviewCount: count };
  }

  function newDemo(record) {
    if (!valid(record)) throw new RangeError('Invalid ride.');
    return { ...clone(record), status: 'riding', km: 0, seconds: 0, rawFare: 25, total: 25,
      meter: Fare.createMeter(), updatedAt: Math.max(Date.now(), record.createdAt) };
  }

  function simulate(record, elapsedSeconds, speedMultiplier = 30) {
    if (!valid(record) || !number(elapsedSeconds, 0, 1e6) || !number(speedMultiplier, 0, 1000)) throw new RangeError('Invalid simulation.');
    const next = clone(record);
    if (next.status !== 'riding') return next;
    const meter = next.meter || { ...Fare.createMeter(), km: next.km, seconds: next.seconds,
      slowFee: Math.max(0, next.rawFare - Math.ceil(Fare.distanceFare(next.km))) };
    Fare.advanceMeter(meter, elapsedSeconds * speedMultiplier, 24, next.route.km);
    next.meter = meter;
    next.km = meter.km;
    next.seconds = meter.seconds;
    next.rawFare = Fare.meterTotal(meter);
    if (meter.km >= next.route.km - 1e-9) next.status = 'completed';
    next.total = next.status === 'completed' ? Fare.settle(meter, next.range).total : next.rawFare;
    next.updatedAt = Math.max(Date.now(), next.createdAt);
    return next;
  }

  const api = { create, encode, decode, customerURL, read, save, subscribe, routePoints, position,
    getRider, getReviews, getReview, submitReview, newDemo, simulate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RideShare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

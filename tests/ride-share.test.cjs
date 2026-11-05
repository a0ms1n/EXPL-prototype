const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, '../ride-share.js'), 'utf8');
const fareSource = fs.readFileSync(path.join(__dirname, '../fare.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const trip = () => ({
  origin: { name: 'จุฬาลงกรณ์มหาวิทยาลัย 🛵', lat: 13.7383, lng: 100.5307 },
  destination: { name: 'สามย่านมิตรทาวน์ & ร้านชา', lat: 13.7338, lng: 100.5284 },
  route: { name: 'เส้นทางหลัก', km: 4.8, minutes: 18 },
  range: { min: 32, max: 46 }
});

// Each VM represents a device/tab. Independent stores prove QR portability;
// shared stores let the same tests exercise real storage-event subscriptions.
function storageHub() {
  const values = new Map();
  const tabs = [];
  return {
    values,
    attach(dispatch) {
      const tab = { dispatch };
      tabs.push(tab);
      return {
        getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
        setItem(key, value) {
          key = String(key);
          value = String(value);
          const oldValue = values.get(key) ?? null;
          values.set(key, value);
          if (oldValue !== value) for (const peer of tabs) {
            if (peer !== tab) peer.dispatch('storage', { key, oldValue, newValue: value });
          }
        },
        removeItem(key) {
          key = String(key);
          const oldValue = values.get(key) ?? null;
          values.delete(key);
          for (const peer of tabs) if (peer !== tab) peer.dispatch('storage', { key, oldValue, newValue: null });
        }
      };
    }
  };
}

function device({ hub = storageHub(), blockedStorage = false, random = Math.random, secureRandom = true, url = 'https://example.github.io/ride-prototype/app.html' } = {}) {
  const listeners = new Map();
  const dispatch = (type, event) => {
    for (const callback of [...(listeners.get(type) || [])]) callback(event);
  };
  const storage = hub.attach(dispatch);
  const sandbox = {
    URL, URLSearchParams, TextEncoder, TextDecoder,
    crypto: {
      randomUUID: () => webcrypto.randomUUID(),
      getRandomValues(values) {
        for (let i = 0; i < values.length; i++) values[i] = Math.floor(random() * 0x100000000);
        return values;
      }
    },
    console, setTimeout, clearTimeout, setInterval, clearInterval,
    btoa, atob,
    location: new URL(url),
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    dispatchEvent(event) { dispatch(event.type, event); },
    CustomEvent: class CustomEvent {
      constructor(type, options = {}) { this.type = type; this.detail = options.detail; }
    }
  };
  sandbox.Math = Object.create(Math);
  sandbox.Math.random = random;
  if (!secureRandom) delete sandbox.crypto.getRandomValues;
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  Object.defineProperty(sandbox, 'localStorage', {
    get() {
      if (blockedStorage) throw new Error('Storage blocked');
      return storage;
    }
  });
  vm.createContext(sandbox);
  vm.runInContext(fareSource, sandbox, { filename: 'fare.js' });
  vm.runInContext(source, sandbox, { filename: 'ride-share.js' });
  return { api: sandbox.RideShare, hub, sandbox, dispatch };
}

test('CommonJS and browser builds expose the ride protocol', () => {
  const commonJS = require('../ride-share.js');
  const { api } = device();
  for (const name of ['create', 'customerURL', 'encode', 'decode', 'read', 'save', 'subscribe', 'position', 'getRider', 'getRiders', 'getReviews', 'getReview', 'submitReview', 'simulate', 'newDemo']) {
    assert.equal(typeof api[name], 'function', `browser ${name}`);
    assert.equal(typeof commonJS[name], 'function', `CommonJS ${name}`);
  }
});

test('new rides randomly choose among five profiles and sharing retains the selected rider', () => {
  for (const secureRandom of [true, false]) {
    let selection = 0;
    const { api } = device({ random: () => selection, secureRandom });
    const riders = api.getRiders();
    assert.equal(riders.length, 5);
    assert.equal(new Set(riders.map(rider => rider.id)).size, 5);
    assert.equal(new Set(riders.map(rider => rider.name)).size, 5);
    const receiver = device({ random: () => 0.999999 }).api;
    const selected = [];
    for (let i = 0; i < riders.length; i++) {
      selection = (i + 0.5) / riders.length;
      const ride = api.create(trip());
      selected.push(ride.riderId);
      assert.equal(ride.riderId, riders[i].id, `selection bucket ${i}, secure random ${secureRandom}`);
      const imported = receiver.decode(new URL(api.customerURL(ride)).hash);
      assert.equal(imported.riderId, ride.riderId);
      assert.equal(receiver.getRider(imported.riderId).name, riders[i].name);
      assert.equal(receiver.getRider(imported.riderId).plate, riders[i].plate);
      assert.equal(api.newDemo(ride).riderId, ride.riderId);
    }
    assert.equal(new Set(selected).size, 5);
    const originalName = riders[0].name;
    riders[0].name = 'mutated';
    assert.equal(api.getRider(riders[0].id).name, originalName);
  }
});

test('reviews and aggregate counts remain isolated for all five selected riders', () => {
  let selection = 0;
  const hub = storageHub();
  const { api } = device({ hub, random: () => selection });
  const riders = api.getRiders();
  const baseline = new Map(riders.map(rider => [rider.id, api.getRider(rider.id).reviewCount]));
  const rides = [];
  for (let i = 0; i < riders.length; i++) {
    selection = (i + 0.5) / riders.length;
    const done = api.simulate(api.newDemo(api.create(trip())), 10000);
    rides.push(done);
    api.save(done);
    api.submitReview(done, { rating: i + 1, comment: `รีวิวสำหรับ ${riders[i].name}` });
  }
  const reloaded = device({ hub }).api;
  for (const ride of rides) {
    assert.equal(reloaded.getRider(ride.riderId).reviewCount, baseline.get(ride.riderId) + 1);
    const ownReviews = reloaded.getReviews(ride.riderId).filter(review => review.rideId);
    assert.equal(ownReviews.length, 1);
    assert.equal(ownReviews[0].rideId, ride.id);
    assert.equal(ownReviews[0].riderId, ride.riderId);
    assert.equal(reloaded.getReview(ride.id).riderId, ride.riderId);
    assert.throws(() => reloaded.submitReview(ride, { rating: 5, comment: 'duplicate' }), rangeError);
  }
});

test('each created ride has a unique ID and independent trip data', () => {
  const { api } = device();
  const input = trip();
  const rides = Array.from({ length: 128 }, () => api.create(input));
  assert.equal(new Set(rides.map(ride => ride.id)).size, rides.length);
  assert.ok(rides.every(ride => ride.v === 1 && ride.id && ride.createdAt && ride.updatedAt));
  input.origin.name = 'changed';
  input.route.km = 99;
  assert.equal(rides[0].origin.name, trip().origin.name);
  assert.equal(rides[0].route.km, trip().route.km);
});

test('QR links carry UTF-8 trip data to a new device without shared storage', () => {
  const sender = device();
  const receiver = device();
  const ride = sender.api.create(trip());
  const link = new URL(sender.api.customerURL(ride));
  assert.equal(link.origin, 'https://example.github.io');
  assert.equal(link.pathname, '/ride-prototype/customer.html');
  assert.ok(link.hash.length > 20);
  assert.equal(receiver.api.read(ride.id), null);
  const received = receiver.api.decode(link.hash);
  assert.ok(received);
  for (const field of ['id', 'riderId', 'origin', 'destination', 'route', 'range', 'status']) {
    assert.deepEqual(clone(received[field]), clone(ride[field]), field);
  }
  assert.equal(receiver.api.decode(sender.api.encode(ride)).origin.name, trip().origin.name);
});

test('customer links preserve nested GitHub Pages paths and replace queries and fragments', () => {
  const { api } = device();
  const ride = api.create(trip());
  for (const base of ['https://user.github.io/project/app.html?debug=1#old', 'https://user.github.io/project/', 'https://user.github.io/nested/project/index.html']) {
    const link = new URL(api.customerURL(ride, base));
    const expected = new URL('customer.html', base);
    assert.equal(link.pathname, expected.pathname);
    assert.equal(link.search, '');
    assert.equal(api.decode(link.hash).id, ride.id);
  }
});

const payloadHash = value => '#ride=' + Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
const payloadData = hash => JSON.parse(Buffer.from(hash.slice(6), 'base64url').toString('utf8'));
const rangeError = error => error?.name === 'RangeError';

test('malformed, unsupported, and incorrectly typed QR snapshots are rejected', () => {
  const { api } = device();
  const ride = api.create(trip());
  const data = payloadData(api.encode(ride));
  const invalid = [
    '', '#ride=', '#ride=A', '#ride=%%%%', '#ride=abc=', '#other=abc',
    '#ride=' + 'A'.repeat(8000), payloadHash(null), payloadHash({}),
    payloadHash([]), payloadHash([...data, 'extra']), payloadHash(data.slice(0, -1)),
    '#ride=' + Buffer.from([0xff]).toString('base64url')
  ];
  const change = (index, value) => {
    const next = clone(data);
    next[index] = value;
    invalid.push(payloadHash(next));
  };
  change(0, 2);
  for (const id of ['', '../ride-123', '<script>', 12345678, ['ride-valid-123']]) change(1, id);
  change(2, -1);
  change(3, 'unrecognized-rider');
  for (const point of [null, [], ['', 13, 100], ['Origin', 91, 100], ['Origin', 13, 181], ['Origin', '13', 100]]) change(4, point);
  change(4, { 0: 'Origin', 1: 13, 2: 100, length: 3 });
  change(5, ['Destination', 13, 100, 'extra']);
  for (const route of [['Route', 0, 18], ['Route', -1, 18], ['Route', 4, 0], ['Route', '4', 18]]) change(6, route);
  change(7, [46, 32]);
  change(7, [24, 30]);
  change(7, { 0: 25, 1: 35, length: 2 });
  change(8, 'unknown');
  change(9, -1);
  change(9, ride.route.km + 1);
  change(10, '60');
  change(11, 0);
  change(12, null);
  change(13, ride.createdAt - 1);
  for (const hash of invalid) assert.equal(api.decode(hash), null, `reject ${hash.slice(0, 100)}`);
  for (const value of [null, {}, 123]) assert.equal(api.decode(value), null);
});

test('storage updates stay isolated by ride and unsubscribe removes listeners', () => {
  const hub = storageHub();
  const sender = device({ hub });
  const receiver = device({ hub });
  const a = sender.api.create(trip());
  const b = sender.api.create(trip());
  const updates = [];
  const stop = receiver.api.subscribe(a.id, ride => updates.push(clone(ride)));
  assert.equal(sender.api.save(a), true);
  assert.equal(updates.length, 1);
  assert.equal(sender.api.save(b), true);
  assert.equal(updates.length, 1);
  const next = { ...a, status: 'riding', km: 1.2, seconds: 180, rawFare: 25, total: 25, updatedAt: a.updatedAt + 1 };
  sender.api.save(next);
  assert.equal(updates.length, 2);
  assert.equal(updates[1].km, 1.2);
  assert.equal(receiver.api.read(a.id).km, 1.2);
  assert.equal(receiver.api.read(b.id).km, 0);
  assert.equal(receiver.api.read('does-not-exist'), null);
  stop();
  sender.api.save({ ...next, km: 1.3 });
  assert.equal(updates.length, 2);
  const read = receiver.api.read(a.id);
  read.origin.name = 'mutated';
  assert.equal(receiver.api.read(a.id).origin.name, trip().origin.name);
});

test('corrupted or incorrectly indexed stored rides do not become active', () => {
  const hub = storageHub();
  const { api } = device({ hub });
  const a = api.create(trip());
  const b = api.create(trip());
  api.save(a);
  const key = [...hub.values.keys()].find(key => hub.values.get(key).includes(a.id));
  hub.values.set(key, JSON.stringify(b));
  assert.equal(api.read(a.id), null);
  hub.values.set(key, '{broken json');
  // A valid in-memory fallback is allowed when persisted JSON is unusable.
  const restored = api.read(a.id);
  assert.ok(restored === null || restored.id === a.id);
  assert.throws(() => api.save({ ...a, km: -1 }), rangeError);
});

function project(point) {
  return {
    x: (point.lng + 180) / 360,
    y: (1 - Math.log(Math.tan(point.lat * Math.PI / 180) + 1 / Math.cos(point.lat * Math.PI / 180)) / Math.PI) / 2
  };
}

test('map position follows route distance and preserves an early completion endpoint', () => {
  const { api } = device();
  const ride = api.create(trip());
  const points = api.routePoints(ride);
  assert.equal(points.length, 5);
  assert.deepEqual(clone(points[0]), clone(ride.origin));
  assert.deepEqual(clone(points.at(-1)), clone(ride.destination));
  const world = points.map(project);
  const lengths = world.slice(1).map((p, i) => Math.hypot(p.x - world[i].x, p.y - world[i].y));
  const total = lengths.reduce((a, b) => a + b, 0);
  // At every waypoint, the position must coincide with that map vertex.
  let travelled = 0;
  for (let i = 0; i < points.length; i++) {
    if (i) travelled += lengths[i - 1];
    const position = api.position({ ...ride, km: ride.route.km * travelled / total });
    assert.ok(Math.abs(position.lat - points[i].lat) < 1e-8, `latitude at waypoint ${i}`);
    assert.ok(Math.abs(position.lng - points[i].lng) < 1e-8, `longitude at waypoint ${i}`);
  }
  const partial = { ...ride, km: ride.route.km / 4, status: 'riding' };
  const early = { ...partial, status: 'completed' };
  assert.deepEqual(clone(api.position(early)), clone(api.position(partial)));
  assert.notDeepEqual(clone(api.position(early)), clone(api.position({ ...ride, km: ride.route.km })));
});

test('simulation advances a new record, caps arrival, and freezes paused or ended rides', () => {
  const { api } = device();
  const original = api.create(trip());
  const snapshot = clone(original);
  const riding = api.newDemo(original);
  assert.deepEqual(clone(original), snapshot);
  assert.equal(riding.status, 'riding');
  const next = api.simulate(riding, 2, 30);
  assert.notEqual(next, riding);
  assert.ok(Math.abs(next.km - 0.4) < 1e-9);
  assert.equal(next.seconds, 60);
  assert.equal(riding.km, 0);
  assert.equal(riding.seconds, 0);
  for (const status of ['ready', 'paused', 'completed', 'cancelled']) {
    const frozen = { ...next, status };
    assert.deepEqual(clone(api.simulate(frozen, 100)), clone(frozen), status);
  }
  const stopped = api.simulate(next, 100, 0);
  for (const field of ['km', 'seconds', 'rawFare', 'total', 'meter', 'status']) {
    assert.deepEqual(clone(stopped[field]), clone(next[field]), `zero speed: ${field}`);
  }
  const done = api.simulate(next, 10000, 30);
  assert.equal(done.status, 'completed');
  assert.equal(done.km, done.route.km);
  assert.ok(Math.abs(done.seconds - done.route.km / 24 * 3600) < 1e-7);
  assert.ok(done.total >= done.range.min && done.total <= done.range.max);
  assert.deepEqual(clone(api.simulate(done, 100)), clone(done));
  const restarted = api.newDemo(done);
  assert.equal(restarted.status, 'riding');
  assert.equal(restarted.km, 0);
  assert.equal(restarted.seconds, 0);
  assert.equal(done.status, 'completed');
  for (const [elapsed, speed] of [[-1, 30], [NaN, 30], [Infinity, 30], [1, -1], [1, Infinity]]) {
    assert.throws(() => api.simulate(riding, elapsed, speed), rangeError);
  }
});

test('completed rides and a single validated review survive another tab or reload', () => {
  const hub = storageHub();
  const { api } = device({ hub });
  const ride = api.create(trip());
  const rider = api.getRider(ride.riderId);
  assert.ok(rider && rider.name && rider.vehicle && rider.plate);
  assert.equal(api.getRider('unknown-rider'), null);
  assert.equal(api.getReviews('unknown-rider').length, 0);
  assert.throws(() => api.submitReview(ride, { rating: 5, comment: '' }), rangeError);
  const done = api.simulate(api.newDemo(ride), 10000);
  api.save(done);
  for (const rating of [0, 6, 2.5, '5', NaN, null]) {
    assert.throws(() => api.submitReview(done, { rating, comment: '' }), rangeError);
  }
  for (const comment of [null, 123, 'ก'.repeat(501)]) {
    assert.throws(() => api.submitReview(done, { rating: 5, comment }), rangeError);
  }
  const result = api.submitReview(done, { rating: 4, comment: '  ขับสุภาพ ขอบคุณค่ะ 🛵  ' });
  assert.equal(result.persistent, true);
  assert.equal(result.comment, 'ขับสุภาพ ขอบคุณค่ะ 🛵');
  assert.equal(result.rideId, ride.id);
  assert.equal(result.riderId, ride.riderId);
  assert.equal(api.getRider(ride.riderId).reviewCount, rider.reviewCount + 1);
  assert.equal(api.getReviews(ride.riderId).filter(review => review.rideId === ride.id).length, 1);
  const reload = device({ hub }).api;
  assert.equal(reload.read(ride.id).status, 'completed');
  assert.equal(reload.read(ride.id).total, done.total);
  assert.equal(reload.getReview(ride.id).rating, 4);
  assert.throws(() => reload.submitReview(done, { rating: 1, comment: 'duplicate' }), rangeError);
  const other = api.create(trip());
  assert.equal(reload.getReview(other.id), null);
  assert.equal(reload.read(other.id), null);
  assert.ok(api.getReviews(ride.riderId).some(review => !review.rideId), 'mock reviews remain identifiable');
});

test('blocked browser storage preserves a usable ride and review in memory', () => {
  const { api } = device({ blockedStorage: true });
  const ride = api.create(trip());
  assert.equal(api.save(ride), false);
  assert.equal(api.read(ride.id).id, ride.id);
  const done = api.simulate(api.newDemo(ride), 10000);
  assert.equal(api.save(done), false);
  assert.equal(api.read(ride.id).status, 'completed');
  const review = api.submitReview(done, { rating: 5, comment: '' });
  assert.equal(review.persistent, false);
  assert.equal(api.getReview(ride.id).rating, 5);
  assert.throws(() => api.submitReview(done, { rating: 5, comment: '' }), rangeError);
  const otherDevice = device({ blockedStorage: true }).api;
  assert.equal(otherDevice.decode(new URL(api.customerURL(done)).hash).id, ride.id);
  assert.equal(otherDevice.read(ride.id), null);
});

test('local QR encoder handles normal and maximum-length Thai trip links', () => {
  const qrcode = require('../qrcode.js');
  const { api } = device();
  const long = trip();
  long.origin.name = 'จ'.repeat(100);
  long.destination.name = 'ฬ'.repeat(100);
  long.route.name = 'ถ'.repeat(100);
  for (const input of [trip(), long]) {
    const ride = api.create(input);
    const url = api.customerURL(ride, `https://user.github.io/${'long-project-name-'.repeat(12)}/app.html`);
    const code = qrcode(0, url.length > 1000 ? 'L' : 'M');
    code.addData(url, 'Byte');
    code.make();
    const size = code.getModuleCount();
    assert.ok(size >= 21 && size <= 177 && (size - 17) % 4 === 0, `valid QR dimensions: ${size}`);
    assert.equal(code.isDark(0, 0), true);
    assert.equal(code.isDark(1, 1), false);
    assert.equal(code.isDark(3, 3), true);
    const svg = code.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
    assert.match(svg, /^<svg\b/);
    assert.match(svg, /viewBox=/);
    assert.match(svg, /<path\b/);
    assert.ok(!svg.includes(input.origin.name), 'QR geometry does not interpolate ride text as markup');
    assert.equal(api.decode(new URL(url).hash).origin.name, input.origin.name);
  }
});

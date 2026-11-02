const { test } = require('node:test');
const assert = require('node:assert/strict');
const Fare = require('../fare.js');

test('distance pricing covers both tier boundaries and fractional kilometres', () => {
  for (const [km, expected] of [[0, 25], [1, 25], [2, 25], [2.5, 27.5], [5, 40], [5.5, 45], [8, 70]]) {
    assert.equal(Fare.distanceFare(km), expected, `${km} km`);
  }
});

test('partial two-minute windows do not charge', () => {
  const meter = Fare.createMeter();
  Fare.advanceMeter(meter, 119, 0);
  assert.equal(meter.slowFee, 0);
  Fare.advanceMeter(meter, 1, 0);
  assert.equal(meter.slowFee, 5);
  assert.equal(meter.slowWindows, 1);
});

test('exactly 0.4 km in two minutes incurs the slow charge', () => {
  const meter = Fare.createMeter();
  Fare.advanceMeter(meter, 120, 12);
  assert.equal(meter.km, 0.4);
  assert.equal(meter.slowFee, 5);
});

test('at most 0.4 km incurs the slow charge; more does not', () => {
  for (const [speed, fee] of [[11.99, 5], [4, 5], [12.01, 0], [15, 0], [24, 0]]) {
    const meter = Fare.createMeter();
    Fare.advanceMeter(meter, 120, speed);
    assert.equal(meter.slowFee, fee, `${speed} km/h`);
  }
});

test('small ticks still include exactly 0.4 km at a completed boundary', () => {
  const meter = Fare.createMeter();
  for (let i = 0; i < 600; i++) Fare.advanceMeter(meter, 0.2, 12);
  assert.ok(Math.abs(meter.km - 0.4) < 1e-9);
  assert.equal(meter.slowFee, 5);
  assert.equal(meter.slowWindows, 1);
});

test('a long update charges once per completed window and retains the remainder', () => {
  const meter = Fare.createMeter();
  assert.equal(Fare.advanceMeter(meter, 365, 0), 15);
  assert.equal(meter.slowWindows, 3);
  assert.equal(meter.windowSeconds, 5);
});

test('mixed driving and waiting use the distance of the entire window', () => {
  const meter = Fare.createMeter();
  Fare.advanceMeter(meter, 60, 36); // 0.6 km followed by one minute waiting.
  Fare.advanceMeter(meter, 60, 0);
  assert.equal(meter.slowFee, 0);
  Fare.advanceMeter(meter, 120, 0); // Independent next window.
  assert.equal(meter.slowFee, 5);
  assert.equal(meter.windowKm, 0);
});

test('small simulation ticks give the same result as a single update', () => {
  const single = Fare.createMeter();
  const ticks = Fare.createMeter();
  Fare.advanceMeter(single, 360, 4);
  for (let i = 0; i < 1800; i++) Fare.advanceMeter(ticks, 0.2, 4);
  assert.ok(Math.abs(ticks.km - single.km) < 1e-9);
  assert.equal(ticks.slowFee, single.slowFee);
  assert.equal(ticks.slowWindows, 3);
});

test('arrival stops time and distance exactly at the destination', () => {
  const meter = Fare.createMeter();
  Fare.advanceMeter(meter, 600, 24, 0.5);
  assert.equal(meter.km, 0.5);
  assert.equal(meter.seconds, 75);
  assert.equal(meter.slowFee, 0);
  Fare.advanceMeter(meter, 120, 0, 0.5);
  assert.equal(meter.seconds, 75);
});

test('arrival at a full slow window charges it, but not an unfinished window', () => {
  const meter = Fare.createMeter();
  Fare.advanceMeter(meter, 180, 3, 0.1);
  assert.equal(meter.km, 0.1);
  assert.equal(meter.seconds, 120);
  assert.equal(meter.slowFee, 5);
});

test('meter combines distance and time fees and rounds up only once', () => {
  const meter = Fare.createMeter();
  meter.km = 2.11;
  meter.slowFee = 5;
  assert.equal(Fare.meterTotal(meter), 31);
});

test('final fare clamps below minimum, above maximum, and retains an in-range fare', () => {
  const range = { min: 40, max: 60 };
  for (const [km, total, adjustment] of [[0, 40, 15], [5.5, 45, 0], [8, 60, -10]]) {
    const meter = Fare.createMeter();
    meter.km = km;
    assert.deepEqual(Fare.settle(meter, range), { raw: Fare.meterTotal(meter), total, adjustment });
  }
});

test('estimates enclose the distance fare for short and long routes', () => {
  for (const km of [0.5, 2, 3.4, 5, 7.8, 15, 30]) {
    const range = Fare.estimate(km, km * 4);
    assert.ok(range.min >= 25);
    assert.ok(range.max >= range.min);
    assert.ok(range.max >= Fare.distanceFare(km));
  }
});

test('invalid distance, speed, and time inputs fail explicitly', () => {
  for (const value of [-1, NaN, Infinity]) assert.throws(() => Fare.distanceFare(value), RangeError);
  assert.throws(() => Fare.advanceMeter(Fare.createMeter(), -1, 5), RangeError);
  assert.throws(() => Fare.advanceMeter(Fare.createMeter(), 120, -5), RangeError);
});

test('predictions apply a 7 baht margin around the projected meter with a base-fare floor', () => {
  assert.deepEqual(Fare.estimate(4.9, 16), { min: 33, max: 47, distanceFare: 40 });
  assert.deepEqual(Fare.estimate(2, 10), { min: 43, max: 57, distanceFare: 25 });
  assert.deepEqual(Fare.estimate(0.3, 3), { min: 25, max: 37, distanceFare: 25 });
  for (const minutes of [-1, NaN, Infinity]) assert.throws(() => Fare.estimate(2, minutes), RangeError);
});

(function (root) {
  'use strict';

  const RULES = Object.freeze({ base: 25, firstKm: 2, middleKm: 5, middleRate: 5, upperRate: 10, windowSeconds: 120, slowKm: 0.4, slowFee: 5 });

  function distanceFare(km) {
    if (!Number.isFinite(km) || km < 0) throw new RangeError('Distance must be a nonnegative number.');
    return RULES.base + Math.max(0, Math.min(km, 5) - 2) * 5 + Math.max(0, km - 5) * 10;
  }

  function estimate(km, minutes) {
    const base = distanceFare(km);
    if (!Number.isFinite(minutes) || minutes < 0) throw new RangeError('Time must be a nonnegative number.');
    const projectedMeter = createMeter();
    if (minutes > 0) advanceMeter(projectedMeter, minutes * 60, km / minutes * 60, km);
    // Route duration supplies an average speed; actual traffic can vary by window.
    projectedMeter.km = km;
    const margin = 7;
    return {
      min: Math.max(RULES.base, meterTotal(projectedMeter) - margin),
      max: meterTotal(projectedMeter) + margin,
      distanceFare: Math.ceil(base - 1e-9)
    };
  }

  function createMeter() {
    return { km: 0, seconds: 0, windowKm: 0, windowSeconds: 0, slowFee: 0, slowWindows: 0 };
  }

  // Split updates at every two-minute boundary: each non-overlapping window
  // charges once, including when one simulation tick crosses several windows.
  function advanceMeter(meter, seconds, speedKmh, destinationKm = Infinity) {
    if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(speedKmh) || speedKmh < 0) {
      throw new RangeError('Time and speed must be nonnegative numbers.');
    }
    let remaining = seconds;
    let charged = 0;
    while (remaining > 1e-8 && meter.km < destinationKm - 1e-9) {
      const untilDestination = speedKmh > 0 ? (destinationKm - meter.km) / speedKmh * 3600 : Infinity;
      const step = Math.min(remaining, RULES.windowSeconds - meter.windowSeconds, untilDestination);
      if (step <= 1e-8) break;
      const km = speedKmh * step / 3600;
      meter.km = Math.min(destinationKm, meter.km + km);
      meter.seconds += step;
      meter.windowKm += km;
      meter.windowSeconds += step;
      remaining -= step;
      if (meter.windowSeconds >= RULES.windowSeconds - 1e-8) {
        // Include exactly 0.4 km, allowing floating-point rounding at the boundary.
        if (meter.windowKm <= RULES.slowKm + 1e-9) {
          meter.slowFee += RULES.slowFee;
          meter.slowWindows += 1;
          charged += RULES.slowFee;
        }
        meter.windowKm = 0;
        meter.windowSeconds = 0;
      }
    }
    return charged;
  }

  function meterTotal(meter) { return Math.ceil(distanceFare(meter.km) + meter.slowFee - 1e-9); }
  function settle(meter, range) {
    const raw = meterTotal(meter);
    const total = Math.min(range.max, Math.max(range.min, raw));
    return { raw, total, adjustment: total - raw };
  }

  const api = { RULES, distanceFare, estimate, createMeter, advanceMeter, meterTotal, settle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Fare = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);

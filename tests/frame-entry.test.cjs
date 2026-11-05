const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../frame-entry.js'), 'utf8');

function openEntry(href, { embedded = false } = {}) {
  const url = new URL(href);
  const navigations = [];
  const window = {
    location: {
      href: url.href,
      search: url.search,
      hash: url.hash,
      replace(destination) { navigations.push(destination); }
    }
  };
  window.parent = embedded ? {} : window;
  vm.runInNewContext(source, { window, URL }, { filename: 'frame-entry.js' });
  return navigations;
}

test('direct app entries use the preview host at the same repository subpath', () => {
  for (const href of [
    'https://user.github.io/project/app.html',
    'https://user.github.io/nested/project/app.html?prototype=1&frame=on',
    'https://example.com/app.html?prototype=2&frame=off'
  ]) {
    const input = new URL(href);
    const navigations = openEntry(href);
    assert.equal(navigations.length, 1);
    const redirected = new URL(navigations[0]);
    assert.equal(redirected.origin, input.origin);
    assert.equal(redirected.pathname, new URL('index.html', input).pathname);
    assert.equal(redirected.search, input.search);
  }
});

test('direct entry preserves explicit version, frame choice, other parameters and fragment', () => {
  const href = 'https://user.github.io/project/app.html?prototype=1&frame=off&name=%E0%B8%A7%E0%B8%B4%E0%B8%99%20demo#ride=abc_-123';
  const redirected = new URL(openEntry(href)[0]);
  assert.equal(redirected.search, new URL(href).search);
  assert.equal(redirected.hash, '#ride=abc_-123');
});

test('opening a local app file also uses its sibling preview without losing preferences', () => {
  const href = 'file:///home/demo/Hidden%20Desktop/Prototype/app.html?prototype=2&frame=on#preview';
  assert.deepEqual(openEntry(href), [
    'file:///home/demo/Hidden%20Desktop/Prototype/index.html?prototype=2&frame=on#preview'
  ]);
});

test('the app inside its host iframe never redirects or creates a preview loop', () => {
  for (const href of [
    'https://user.github.io/project/app.html?prototype=1',
    'file:///home/demo/Prototype/app.html?prototype=2'
  ]) assert.deepEqual(openEntry(href, { embedded: true }), []);
});

test('the direct-entry guard runs synchronously before app assets initialize', () => {
  const html = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.match(scripts[0][1], /\bsrc=["']frame-entry\.js["']/);
  assert.doesNotMatch(scripts[0][1], /\b(?:async|defer|type=["']module["'])\b/i);
  assert.ok(scripts[0].index < html.indexOf('<link'), 'guard precedes stylesheet and app asset loading');
  assert.equal(scripts.filter(script => /\bsrc=["']frame-entry\.js["']/.test(script[1])).length, 1);
});

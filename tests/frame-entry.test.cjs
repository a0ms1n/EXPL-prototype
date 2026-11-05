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
      pathname: url.pathname,
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
    'file:///home/demo/Prototype/app.html?prototype=2',
    'https://user.github.io/project/customer.html?frame=on#ride=abc_-123',
    'file:///home/demo/Prototype/customer.html#ride=abc_-123'
  ]) assert.deepEqual(openEntry(href, { embedded: true }), []);
});

test('direct passenger links use the shared host while retaining the self-contained ride hash', () => {
  for (const href of [
    'https://user.github.io/nested/project/customer.html?prototype=1&frame=on#ride=abc_-123',
    'https://user.github.io/project/customer.html?view=rider&frame=off&name=%E0%B8%A7%E0%B8%B4%E0%B8%99%20demo#ride=snapshot',
    'file:///home/demo/Hidden%20Desktop/Prototype/customer.html?frame=on#ride=local_snapshot'
  ]) {
    const input = new URL(href);
    const navigations = openEntry(href);
    assert.equal(navigations.length, 1);
    const redirected = new URL(navigations[0]);
    assert.equal(redirected.pathname, new URL('index.html', input).pathname);
    assert.equal(redirected.protocol, input.protocol);
    assert.equal(redirected.origin, input.origin);
    assert.equal(redirected.searchParams.get('view'), 'passenger');
    for (const [key, value] of input.searchParams) {
      if (key !== 'view') assert.equal(redirected.searchParams.get(key), value);
    }
    assert.equal(redirected.hash, input.hash);
  }
});

test('passenger entry guard is synchronous and home links leave the host iframe', () => {
  const html = fs.readFileSync(path.join(__dirname, '../customer.html'), 'utf8');
  const firstScript = [...html.matchAll(/<script\b([^>]*)>/gi)][0];
  assert.match(firstScript[1], /\bsrc=["']frame-entry\.js["']/);
  assert.doesNotMatch(firstScript[1], /\b(?:async|defer|type=["']module["'])\b/i);
  const homeLinks = [...html.matchAll(/<a\b[^>]*>/gi)].filter(link => /\bhref=["']\.\/index\.html["']/.test(link[0]));
  assert.equal(homeLinks.length, 3);
  for (const link of homeLinks) assert.match(link[0], /\btarget=["']_top["']/);
});

test('the direct-entry guard runs synchronously before app assets initialize', () => {
  const html = fs.readFileSync(path.join(__dirname, '../app.html'), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>/gi)];
  assert.match(scripts[0][1], /\bsrc=["']frame-entry\.js["']/);
  assert.doesNotMatch(scripts[0][1], /\b(?:async|defer|type=["']module["'])\b/i);
  assert.ok(scripts[0].index < html.indexOf('<link'), 'guard precedes stylesheet and app asset loading');
  assert.equal(scripts.filter(script => /\bsrc=["']frame-entry\.js["']/.test(script[1])).length, 1);
});

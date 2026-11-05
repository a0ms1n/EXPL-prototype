(function () {
  'use strict';
  const frame = document.getElementById('app-preview');
  const toggle = document.getElementById('toggle-frame');
  const versionSwitch = document.getElementById('prototype-version');
  const requestedVersion = new URLSearchParams(window.location.search).get('prototype');
  let prototypeVersion = '2';
  let phoneMode = !window.matchMedia('(max-width: 899px), (max-height: 500px)').matches;
  try {
    const saved = localStorage.getItem('winsure.phoneMode');
    if (saved !== null) phoneMode = saved === 'true';
    const savedVersion = localStorage.getItem('winsure.prototypeVersion');
    if (['1', '2'].includes(savedVersion)) prototypeVersion = savedVersion;
  } catch { /* Storage may be disabled for local files. */ }
  if (['1', '2'].includes(requestedVersion)) prototypeVersion = requestedVersion;
  function resize() {
    const stage = document.getElementById('preview-stage');
    const style = getComputedStyle(stage);
    const available = stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
    const landscape = window.matchMedia('(max-height: 540px) and (orientation: landscape)').matches;
    document.documentElement.style.setProperty('--phone-height', `${Math.max(0, Math.min(landscape ? 414 : 874, available))}px`);
  }
  function sync() {
    document.body.classList.toggle('phone-preview', phoneMode);
    toggle.textContent = `Mobile frame: ${phoneMode ? 'On' : 'Off'}`;
    toggle.setAttribute('aria-pressed', String(phoneMode));
    frame.contentWindow.postMessage({ type: 'winsure:display-mode', phoneMode }, '*');
    versionSwitch.value = prototypeVersion;
    frame.contentWindow.postMessage({ type: 'winsure:prototype-version', version: prototypeVersion }, '*');
    resize();
  }
  window.addEventListener('message', event => {
    if (event.source !== frame.contentWindow || !event.data) return;
    if (event.data.type === 'winsure:ready') sync();
    if (event.data.type === 'winsure:phone-mode' && typeof event.data.phoneMode === 'boolean') {
      phoneMode = event.data.phoneMode;
      try { localStorage.setItem('winsure.phoneMode', String(phoneMode)); } catch { /* Use the in-memory choice. */ }
      sync();
    }
  });
  toggle.addEventListener('click', () => {
    phoneMode = !phoneMode;
    try { localStorage.setItem('winsure.phoneMode', String(phoneMode)); } catch { /* Keep the in-memory choice. */ }
    sync();
  });
  versionSwitch.addEventListener('change', () => {
    prototypeVersion = versionSwitch.value;
    try { localStorage.setItem('winsure.prototypeVersion', prototypeVersion); } catch { /* Keep the in-memory choice. */ }
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('prototype', prototypeVersion);
      window.history.replaceState(null, '', url);
    } catch { /* Switching still works for restricted local-file previews. */ }
    sync();
  });
  frame.addEventListener('load', sync);
  window.addEventListener('resize', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  if (typeof ResizeObserver === 'function') new ResizeObserver(resize).observe(document.getElementById('preview-stage'));
  sync();
})();

(function () {
  'use strict';
  const frame = document.getElementById('app-preview');
  const toggle = document.getElementById('toggle-frame');
  let phoneMode = !window.matchMedia('(max-width: 899px), (max-height: 500px)').matches;
  try {
    const saved = localStorage.getItem('winsure.phoneMode');
    if (saved !== null) phoneMode = saved === 'true';
  } catch { /* Storage may be disabled for local files. */ }
  function resize() {
    const scale = Math.max(0.1, Math.min(1, (window.innerWidth - 32) / 415, (window.innerHeight - 80) / 874));
    document.documentElement.style.setProperty('--phone-scale', scale.toFixed(5));
  }
  function sync() {
    document.body.classList.toggle('phone-preview', phoneMode);
    toggle.textContent = `Mobile frame: ${phoneMode ? 'On' : 'Off'}`;
    toggle.setAttribute('aria-pressed', String(phoneMode));
    frame.contentWindow.postMessage({ type: 'winsure:display-mode', phoneMode }, '*');
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
  frame.addEventListener('load', sync);
  window.addEventListener('resize', resize);
  sync();
})();

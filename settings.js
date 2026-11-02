(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const dialog = $('debug-settings');
  const preferences = { showWindow: false, showPause: true, traffic: 'auto', speed: '30' };
  try {
    const saved = JSON.parse(localStorage.getItem('winsure.debug') || '{}');
    if (typeof saved.showWindow === 'boolean') preferences.showWindow = saved.showWindow;
    if (typeof saved.showPause === 'boolean') preferences.showPause = saved.showPause;
    if (['auto', 'normal', 'slow', 'stopped'].includes(saved.traffic)) preferences.traffic = saved.traffic;
    if (['1', '10', '30', '60'].includes(saved.speed)) preferences.speed = saved.speed;
  } catch { /* Defaults work when storage is unavailable. */ }
  $('show-window').checked = preferences.showWindow;
  $('slow-window').hidden = !preferences.showWindow;
  $('show-pause').checked = preferences.showPause;
  function applyPauseVisibility() {
    // Hiding the only resume control must not leave a trip paused.
    if (!preferences.showPause && $('pause-trip').getAttribute('aria-pressed') === 'true') $('pause-trip').click();
    $('pause-trip').hidden = !preferences.showPause;
    $('trip-actions').classList.toggle('pause-hidden', !preferences.showPause);
  }
  applyPauseVisibility();
  $('traffic').value = preferences.traffic;
  $('simulation-speed').value = preferences.speed;
  function save() {
    try { localStorage.setItem('winsure.debug', JSON.stringify(preferences)); } catch { /* Keep working without persistence. */ }
  }
  $('open-settings').addEventListener('click', () => dialog.showModal());
  $('close-settings').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    // Do not steal focus from a trip control selected after the dialog closed.
    if (document.activeElement === document.body || dialog.contains(document.activeElement)) $('open-settings').focus({ preventScroll: true });
  });
  $('show-window').addEventListener('change', () => {
    preferences.showWindow = $('show-window').checked;
    $('slow-window').hidden = !preferences.showWindow;
    save();
  });
  $('show-pause').addEventListener('change', () => {
    preferences.showPause = $('show-pause').checked;
    applyPauseVisibility();
    save();
  });
  $('traffic').addEventListener('change', () => { preferences.traffic = $('traffic').value; save(); });
  $('simulation-speed').addEventListener('change', () => { preferences.speed = $('simulation-speed').value; save(); });
  $('phone-mode').addEventListener('change', () => {
    const phoneMode = $('phone-mode').checked;
    document.body.classList.toggle('phone-mode', phoneMode);
    try { localStorage.setItem('winsure.phoneMode', String(phoneMode)); } catch { /* Keep working without persistence. */ }
    if (window.parent !== window) window.parent.postMessage({ type: 'winsure:phone-mode', phoneMode }, '*');
  });
  window.addEventListener('message', event => {
    if (event.source !== window.parent || !event.data || event.data.type !== 'winsure:display-mode' || typeof event.data.phoneMode !== 'boolean') return;
    $('phone-mode').checked = event.data.phoneMode;
    document.body.classList.toggle('phone-mode', event.data.phoneMode);
  });
  if (window.parent !== window) window.parent.postMessage({ type: 'winsure:ready' }, '*');
  else { $('phone-mode').checked = false; document.body.classList.remove('phone-mode'); }
})();

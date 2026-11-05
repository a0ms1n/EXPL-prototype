/* Direct rider and passenger links share the host's real iframe viewport. */
(function () {
  'use strict';
  if (window.parent !== window) return;
  const preview = new URL('index.html', window.location.href);
  preview.search = window.location.search;
  if (/\/customer\.html$/i.test(new URL(window.location.href).pathname)) {
    preview.searchParams.set('view', 'passenger');
  }
  preview.hash = window.location.hash;
  window.location.replace(preview.href);
})();

/* A direct app link must use the same real iframe viewport as index.html. */
(function () {
  'use strict';
  if (window.parent !== window) return;
  const preview = new URL('index.html', window.location.href);
  preview.search = window.location.search;
  preview.hash = window.location.hash;
  window.location.replace(preview.href);
})();

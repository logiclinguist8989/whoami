/* Applies the saved light/dark theme before first paint (loaded in <head> on every page). */
(function () {
  'use strict';
  document.documentElement.classList.add('js');
  try {
    var saved = localStorage.getItem('theme');
    // Only accept known values; anything else in storage is ignored
    if (saved === 'light' || saved === 'dark') document.documentElement.setAttribute('data-theme', saved);
  } catch (e) { /* storage unavailable */ }
})();

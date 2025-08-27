// js/sw-register.js
(function(){
  if (!('serviceWorker' in navigator)) return;
  const isSecure = location.protocol === 'https:' || location.hostname === 'localhost';
  if (!isSecure) return; // SW requires secure context
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW register failed', err));
  });
})();

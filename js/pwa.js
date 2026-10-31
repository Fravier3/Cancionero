// Service worker y auto-actualización: la app se actualiza sola al abrirla o al volver a ella.

const CHECK_EVERY_MS = 45 * 60 * 1000;

export function initPWA({ onBeforeReload } = {}) {
  if (!('serviceWorker' in navigator)) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // En la primera instalación el SW toma el control sin que haya nada que recargar.
    if (!hadController || reloading) return;
    reloading = true;
    onBeforeReload?.();
    setTimeout(() => location.reload(), 700);
  });

  navigator.serviceWorker
    .register('./sw.js', { updateViaCache: 'none' })
    .then((registration) => {
      const checkForUpdate = async () => {
        try {
          registration.update().catch(() => {});
          const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
          if (!res.ok) return;
          const { version } = await res.json();
          if (version && version !== window.APP_VERSION) {
            await registration.update();
            if (registration.waiting) registration.waiting.postMessage('SKIP_WAITING');
          }
        } catch {
          /* sin conexión: se intentará más tarde */
        }
      };
      checkForUpdate();
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      setInterval(checkForUpdate, CHECK_EVERY_MS);
    })
    .catch(() => {
      /* sin service worker la app sigue funcionando en línea */
    });
}

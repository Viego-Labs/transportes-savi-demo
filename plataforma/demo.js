// Demo estática de la plataforma (tarea 14): lo que en la app hace el servidor y en GitHub Pages
// no se puede. Lo carga cada página de la demo antes que las islas. Sin datos: solo traduce rutas.
//   - Navegación: una ruta de la app (/panel/…, /clientes/…), venga de un enlace, de un atajo de
//     teclado o de una isla, va a su página guardada; si no está guardada, a «No está en la demo».
//   - Formularios: los que guardan (POST) no salen y dicen «Esto es una demo: aquí no se guarda
//     nada»; los de filtros (GET) van a su página guardada.
//   - fetch: lo que lee (la campana) sale de su copia guardada; lo que escribe responde 405 con el
//     mensaje de demo, que la isla enseña como cualquier error.
(() => {
  const yo = document.currentScript;
  const BASE = yo.dataset.base;
  const VISTA = yo.dataset.vista;
  const PROPIA = `${BASE}${VISTA}`;
  const MENSAJE = 'Esto es una demo: aquí no se guarda nada.';
  let rutas = null;
  const leerRutas = () => (rutas ??= fetch(`${PROPIA}/demo-rutas.json`).then((r) => r.json()));
  const zona = (ruta) => (ruta.startsWith('/clientes') || ruta.startsWith('/api/clientes') ? 'clientes' : 'panel');

  // URL de la app → URL guardada (o null si ya lo es).
  async function guardada(u) {
    let ruta;
    if (u.pathname.startsWith(`${PROPIA}/`)) {
      if (!u.search || u.pathname.includes('/q-')) return null;
      ruta = u.pathname.slice(PROPIA.length);
    } else if (u.pathname.startsWith(BASE)) return null;
    else ruta = u.pathname;
    if (ruta === '/' || ruta === '/cdn-cgi/access/logout') return BASE;
    const r = await leerRutas();
    const sinPunto = (s) => s.replace(/[?&]+$/, '');
    const conPagina = sinPunto(`${ruta}${u.search}`);
    return r[conPagina] ?? (u.search ? null : r[ruta]) ?? `${PROPIA}/${zona(ruta)}/no-esta/`;
  }

  if (window.navigation) {
    window.navigation.addEventListener('navigate', (e) => {
      if (!e.cancelable || e.hashChange || e.formData || e.downloadRequest) return;
      const u = new URL(e.destination.url);
      if (u.origin !== location.origin) return;
      const fuera = !u.pathname.startsWith(BASE);
      const conFiltros = u.search && u.pathname.startsWith(`${PROPIA}/`) && !u.pathname.includes('/q-');
      if (!fuera && !conFiltros) return;
      e.preventDefault();
      guardada(u).then((d) => location.assign(d ?? u.href));
    });
  }

  function avisar(junto) {
    let caja = document.querySelector('[data-demo-aviso]');
    if (!caja) {
      caja = document.createElement('p');
      caja.setAttribute('role', 'status');
      caja.dataset.demoAviso = '';
      caja.className = 'demo-aviso';
      document.body.append(caja);
    }
    caja.textContent = '';
    requestAnimationFrame(() => (caja.textContent = MENSAJE));
    clearTimeout(avisar.t);
    avisar.t = setTimeout(() => (caja.textContent = ''), 5000);
    junto?.querySelector?.('button[type=submit], button:not([type])')?.focus?.();
  }

  document.addEventListener(
    'submit',
    (e) => {
      const f = e.target;
      if (!(f instanceof HTMLFormElement)) return;
      const metodo = f.hasAttribute('data-demo-guarda') ? 'post' : (e.submitter?.getAttribute('formmethod') || f.getAttribute('method') || 'get').toLowerCase();
      if (metodo === 'dialog') return;
      // Los formularios de una isla los lleva React: lo que guardan pasa por fetch (abajo), que
      // responde con el mensaje de demo; aquí solo se evita que el navegador los envíe.
      const enIsla = Boolean(f.closest('astro-island'));
      if (metodo !== 'get') {
        e.preventDefault();
        if (!enIsla) avisar(f);
        return;
      }
      if (enIsla) return;
      e.preventDefault();
      const u = new URL(f.dataset.demoAccion || f.getAttribute('action') || location.href, location.href);
      u.search = '';
      for (const [k, v] of new FormData(f, e.submitter)) if (typeof v === 'string' && v !== '') u.searchParams.append(k, v);
      guardada(u).then((d) => location.assign(d ?? u.href));
    },
    true,
  );

  // Las notificaciones en el móvil necesitan el service worker de la app, que la demo no instala.
  if (navigator.serviceWorker) {
    const sw = navigator.serviceWorker;
    sw.register = () => Promise.reject(new Error('En la demo no se pueden activar las notificaciones en el móvil.'));
    sw.getRegistration = () => Promise.resolve(undefined);
  }

  const real = window.fetch.bind(window);
  window.fetch = async (entrada, opciones = {}) => {
    const metodo = String(opciones.method || (entrada instanceof Request ? entrada.method : 'GET')).toUpperCase();
    const u = new URL(entrada instanceof Request ? entrada.url : String(entrada), location.href);
    if (u.origin !== location.origin || u.pathname.startsWith(BASE)) return real(entrada, opciones);
    if (metodo !== 'GET' && metodo !== 'HEAD') {
      avisar();
      return new Response(JSON.stringify({ ok: false, error: MENSAJE, codigo: 405 }), { status: 405, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
    }
    const d = await guardada(u);
    if (d && !d.endsWith('/no-esta/')) return real(d, { ...opciones, credentials: 'same-origin' });
    return new Response(JSON.stringify({ ok: false, error: 'En la demo esto no está guardado.' }), { status: 404, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
  };
})();

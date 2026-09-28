/**
 * Service worker do VagaCerta: abre sem internet e fica rápido no 4G.
 *
 * Estratégia "rede primeiro, cópia se falhar": com internet, sempre a versão
 * nova (nada de app velho preso em cache); sem internet, a última cópia —
 * inclusive a última lista de vagas carregada.
 *
 * Não guarda: eventos do funil, alertas e painel (escritas e dados privados).
 */

const VERSAO = 'vagacerta-v1';
const ESSENCIAL = ['/', '/manifest.webmanifest', '/marca/icone-192.png', '/marca/favicon.svg'];
const NUNCA_GUARDAR = ['/api/eventos', '/api/alertas', '/api/funil'];

self.addEventListener('install', (ev) => {
  ev.waitUntil(caches.open(VERSAO).then((c) => c.addAll(ESSENCIAL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (ev) => {
  const req = ev.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (NUNCA_GUARDAR.some((p) => url.pathname.startsWith(p))) return;

  ev.respondWith((async () => {
    const cache = await caches.open(VERSAO);
    try {
      const resp = await fetch(req);
      if (resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch {
      const copia = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
      if (copia) return copia;
      if (req.mode === 'navigate') return (await cache.match('/')) ?? Response.error();
      return Response.error();
    }
  })());
});

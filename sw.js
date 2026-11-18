/* Service worker dos avisos no celular do gestor (index.html 6.5).
   Só é registrado quando o gestor toca em "Ativar avisos": aparelho de motorista nunca o recebe.
   Faz APENAS duas coisas: mostrar o aviso e abrir o app ao tocar nele.
   Não tem "fetch" e não guarda nada em cache — o app continua indo à rede como sempre,
   e uma versão nova do index.html chega na hora, como antes. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil(self.clients.claim()));

self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { corpo: e.data ? e.data.text() : "" }; }
  // o iPhone exige que todo push mostre um aviso; se não mostrar, ele cancela a inscrição
  e.waitUntil(self.registration.showNotification(d.titulo || "Viagens Couve Flor", {
    body: d.corpo || "",
    tag: d.tag || undefined,
    icon: "icone-192.png",
    badge: "icone-192.png",
    data: { url: self.registration.scope }
  }));
});

self.addEventListener("notificationclick", e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || self.registration.scope;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(janelas => {
    for (const j of janelas) if ("focus" in j) return j.focus();
    return self.clients.openWindow(url);
  }));
});

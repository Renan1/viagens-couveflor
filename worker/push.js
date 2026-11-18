/**
 * Avisos no celular do gestor — Worker do Cloudflare (Web Push)
 *
 * O Apps Script não faz a criptografia que o Web Push exige, então ele chama este
 * Worker, que cifra o aviso (RFC 8291, aes128gcm), assina com a chave VAPID
 * (RFC 8292) e entrega ao serviço de push do aparelho (Apple, Google, Mozilla…).
 *
 * O Worker não guarda nada: a inscrição do aparelho vem em cada chamada.
 * Este arquivo é cópia: quem roda é o código colado no painel do Cloudflare.
 *
 * Variáveis do Worker (Configurações → Variáveis e segredos), geradas por
 * ferramentas/gerar-chaves-push.mjs:
 *   VAPID_PUBLICA  chave pública VAPID (base64url, 65 bytes)
 *   VAPID_PRIVADA  chave privada VAPID (base64url, 32 bytes)   — segredo
 *   SEGREDO        senha combinada com o Apps Script           — segredo
 *   CONTATO        opcional; padrão: endereço do site
 *
 * Chamada: POST /  com  Authorization: Bearer <SEGREDO>
 *   {"inscricao": {"endpoint": "...", "keys": {"p256dh": "...", "auth": "..."}},
 *    "titulo": "...", "corpo": "...", "tag": "..."}
 * Resposta: {"ok": true} | {"ok": false, "expirada": true|false, "status": 410, "erro": "..."}
 */

const VERSAO = 1;
const CONTATO_PADRAO = "https://viagensuber.couveflorrefeicoes.com.br";

// só entrega para serviços de push conhecidos: o Worker não vira um "carteiro" para qualquer endereço
const HOSTS_PUSH = [/^web\.push\.apple\.com$/, /^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/,
                    /\.notify\.windows\.com$/, /^push\.services\.mozilla\.com$/];

const enc = new TextEncoder();

function b64u(bytes) {
  let s = "";
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function deB64u(texto) {
  const t = String(texto || "").replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function juntar(...partes) {
  const total = partes.reduce((s, p) => s + p.length, 0), u = new Uint8Array(total);
  let i = 0;
  for (const p of partes) { u.set(p, i); i += p.length; }
  return u;
}
function iguais(a, b) { // comparação em tempo constante
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}

async function hkdf(salt, ikm, info, bytes) {
  const k = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, k, bytes * 8));
}

/**
 * Cifra o conteúdo para o aparelho (RFC 8291, aes128gcm, um registro só).
 * "fixo" serve só para o teste com o vetor da RFC (chave efêmera e sal conhecidos).
 */
export async function cifrar(texto, p256dh, auth, fixo) {
  const uaPublica = deB64u(p256dh), segredoAuth = deB64u(auth);
  if (uaPublica.length !== 65 || uaPublica[0] !== 4) throw new Error("p256dh inválida");
  if (segredoAuth.length !== 16) throw new Error("auth inválida");

  let par, asPublica;
  if (fixo) {
    const priv = deB64u(fixo.privada), pub = deB64u(fixo.publica);
    const jwk = { kty: "EC", crv: "P-256", d: b64u(priv), x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
    par = { privateKey: await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]) };
    asPublica = pub;
  } else {
    par = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
    asPublica = new Uint8Array(await crypto.subtle.exportKey("raw", par.publicKey));
  }
  const uaChave = await crypto.subtle.importKey("raw", uaPublica, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const compartilhado = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaChave }, par.privateKey, 256));

  const ikm = await hkdf(segredoAuth, compartilhado, juntar(enc.encode("WebPush: info\0"), uaPublica, asPublica), 32);
  const sal = fixo ? deB64u(fixo.sal) : crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(sal, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const claro = juntar(enc.encode(texto), new Uint8Array([2])); // 0x02 = último (e único) registro
  const chave = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, chave, claro));

  const rs = 4096, cab = new Uint8Array(21);
  cab.set(sal, 0);
  new DataView(cab.buffer).setUint32(16, rs);
  cab[20] = asPublica.length;
  return juntar(cab, asPublica, cifrado);
}

/** Cabeçalho Authorization do VAPID (RFC 8292): JWT ES256 com validade de 12 h. */
export async function vapid(endpoint, publica, privada, contato) {
  const pub = deB64u(publica);
  const jwk = { kty: "EC", crv: "P-256", d: privada, x: b64u(pub.slice(1, 33)), y: b64u(pub.slice(33, 65)), ext: true };
  const chave = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const cab = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const corpo = b64u(enc.encode(JSON.stringify({
    aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contato
  })));
  const assinatura = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, chave, enc.encode(cab + "." + corpo));
  return "vapid t=" + cab + "." + corpo + "." + b64u(assinatura) + ", k=" + publica;
}

const json = (obj, status) => new Response(JSON.stringify(obj), {
  status: status || 200, headers: { "Content-Type": "application/json" }
});

export default {
  async fetch(req, env) {
    if (req.method === "GET") return json({ ok: true, servico: "avisos", versao: VERSAO });
    if (req.method !== "POST") return json({ ok: false, erro: "método não permitido" }, 405);
    if (!env.SEGREDO || !env.VAPID_PUBLICA || !env.VAPID_PRIVADA) return json({ ok: false, erro: "Worker sem as variáveis configuradas" }, 500);
    const auth = req.headers.get("Authorization") || "";
    if (!iguais(auth, "Bearer " + env.SEGREDO)) return json({ ok: false, erro: "não autorizado" }, 401);

    let p;
    try { p = await req.json(); } catch (e) { return json({ ok: false, erro: "corpo inválido" }, 400); }
    const ins = p && p.inscricao, chaves = ins && ins.keys;
    if (!ins || !ins.endpoint || !chaves || !chaves.p256dh || !chaves.auth) return json({ ok: false, erro: "inscrição incompleta" }, 400);

    let destino;
    try { destino = new URL(ins.endpoint); } catch (e) { return json({ ok: false, erro: "endereço inválido" }, 400); }
    if (destino.protocol !== "https:" || !HOSTS_PUSH.some(r => r.test(destino.hostname))) {
      return json({ ok: false, erro: "serviço de push desconhecido: " + destino.hostname }, 400);
    }

    const conteudo = JSON.stringify({
      titulo: String(p.titulo || "Viagens Couve Flor").slice(0, 120),
      corpo: String(p.corpo || "").slice(0, 600),
      tag: String(p.tag || "").slice(0, 64)
    });

    try {
      const corpo = await cifrar(conteudo, chaves.p256dh, chaves.auth);
      const r = await fetch(ins.endpoint, {
        method: "POST",
        headers: {
          "Authorization": await vapid(ins.endpoint, env.VAPID_PUBLICA, env.VAPID_PRIVADA, env.CONTATO || CONTATO_PADRAO),
          "Content-Encoding": "aes128gcm",
          "Content-Type": "application/octet-stream",
          "TTL": "86400",   // se o aparelho estiver desligado, o aviso espera até 24 h
          "Urgency": "high"
        },
        body: corpo
      });
      if (r.ok) return json({ ok: true, status: r.status });
      const detalhe = (await r.text()).slice(0, 300);
      // 404/410: o aparelho cancelou a inscrição (app removido, permissão retirada, expirou)
      return json({ ok: false, expirada: r.status === 404 || r.status === 410, status: r.status, erro: detalhe || ("HTTP " + r.status) });
    } catch (e) {
      return json({ ok: false, erro: String(e && e.message || e) }, 500);
    }
  }
};

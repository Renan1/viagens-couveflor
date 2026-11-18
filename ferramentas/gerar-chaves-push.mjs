// Gera as chaves dos avisos no celular (Web Push). Rodar UMA vez, com Node 18 ou mais novo:
//   node ferramentas/gerar-chaves-push.mjs
// O resultado aparece só na tela: não é gravado em arquivo e NÃO deve entrar no repositório.
// Trocar as chaves depois obriga a ativar os avisos de novo no celular.

const par = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const jwk = await crypto.subtle.exportKey("jwk", par.privateKey);
const publica = Buffer.from(await crypto.subtle.exportKey("raw", par.publicKey)).toString("base64url");
const segredo = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

console.log(`
=== No Cloudflare (Worker → Configurações → Variáveis e segredos) ===
VAPID_PUBLICA  (texto)    ${publica}
VAPID_PRIVADA  (segredo)  ${jwk.d}
SEGREDO        (segredo)  ${segredo}

=== No Apps Script (Configurações do projeto → Propriedades do script) ===
PUSH_URL       endereço do Worker (ex.: https://avisos-viagens.SEU-USUARIO.workers.dev)
PUSH_SEGREDO   ${segredo}
PUSH_CHAVE     ${publica}
`);

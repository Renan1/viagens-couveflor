# Avisos no celular — como publicar (index.html 6.5 + Code.gs 7 + Worker)

**Situação em 2026-11-18:** passos 1 a 4 feitos (Worker `avisos-viagens` no ar, Code.gs 7
publicado, site 6.5 no `main`). Falta o passo 5 no iPhone. Este roteiro fica para refazer
tudo (outra conta, chaves novas) ou investigar quando um aviso não chegar.

A ordem importa. Cada etapa só depende da anterior.

## 1. Gerar as chaves (uma vez só)

Na máquina do trabalho (tem Node 24), dentro da pasta do projeto:

```
node ferramentas/gerar-chaves-push.mjs
```

Aparecem três valores: VAPID_PUBLICA, VAPID_PRIVADA e SEGREDO. Guarde-os num lugar
seguro (gerenciador de senhas). **Não cole no repositório** — ele é público.
Gerar de novo depois obriga a ativar os avisos de novo no celular.

## 2. Criar o Worker no Cloudflare

1. Painel do Cloudflare → **Workers & Pages** → **Criar** → **Worker** → nome
   `avisos-viagens` → **Implantar** (sobe o "Hello World").
2. **Editar código** → apagar tudo → colar o conteúdo de `worker/push.js` → **Implantar**.
3. **Configurações → Variáveis e segredos** → adicionar:
   - `VAPID_PUBLICA` — tipo **Texto**
   - `VAPID_PRIVADA` — tipo **Segredo**
   - `SEGREDO` — tipo **Segredo**

   e **Implantar**.
4. Abrir o endereço do Worker no navegador (`https://avisos-viagens.<sua-conta>.workers.dev`).
   Deve aparecer `{"ok":true,"servico":"avisos","versao":1}`.

Não usa D1, R2 nem KV: só chamadas de Worker, poucas por dia.

## 3. Apps Script (Code.gs 7)

1. Editor do Apps Script → **Configurações do projeto** (engrenagem) → **Propriedades do
   script** → adicionar:
   - `PUSH_URL` — o endereço do Worker do passo 2.4
   - `PUSH_SEGREDO` — o mesmo SEGREDO
   - `PUSH_CHAVE` — a mesma VAPID_PUBLICA
2. Colar o `Code.gs` novo e salvar.
3. **Autorizar o acesso externo:** escolher a função `testarAviso` no topo e **Executar**.
   O Google pede uma permissão nova ("conectar a um serviço externo"): aprovar.
   No registro de execução, o esperado neste momento é
   `{"ok":false,"erro":"nenhum aparelho ativado"}` — prova que a permissão funcionou.
   *Sem este passo, os avisos falham com "sem permissão" e o painel mostra o erro.*
4. **Implantar → Gerenciar implantações → lápis → Nova versão.**
5. Conferir com `?acao=ping`: `"versao":7`.

Se o Code.gs 7 for ao ar antes do site novo, nada muda para ninguém: o site 6.4 ignora os
campos novos.

## 4. Site (index.html 6.5 + sw.js)

Juntar o branch `avisos-push` ao `main` (com o ok do dono). Para os motoristas nada muda:
o `sw.js` só é instalado no aparelho que tocar em "Ativar avisos" no painel do gestor.

## 5. No iPhone (iOS 16.4 ou mais novo)

1. O app precisa estar **na tela de início, adicionado pelo Safari** (Compartilhar →
   Adicionar à Tela de Início). Na aba normal do Safari não há avisos.
2. Abrir pelo ícone → PIN → painel → seção **Avisos no celular** → **Ativar avisos** →
   **Permitir**.
3. Chega o aviso "Avisos ativados". Depois, **Enviar teste** manda outro quando quiser.

Só um aparelho recebe: ativar em outro passa os avisos para ele.

## Quando algo não chega

- O painel mostra o **último problema** na seção Avisos no celular (vem da aba Ajustes,
  chave `push_erro`).
- "o aparelho cancelou a inscrição": o app foi removido da tela de início ou a permissão
  foi retirada. Ativar de novo.
- "avisos não configurados": falta alguma Propriedade do script (passo 3.1).
- "não autorizado": o SEGREDO do Worker e o PUSH_SEGREDO não são iguais.
- Foco/Não Perturbe do iPhone segura os avisos: Ajustes → Foco → permitir o app Viagens.

# Sistema de viagens — Couve Flor Refeições

Documento de contexto do projeto. O Claude Code lê este arquivo automaticamente ao
abrir uma sessão nesta pasta. Mantenha-o atualizado ao fechar cada etapa.

## Como trabalhar com o dono do projeto

- **Discussão antes de código.** Explique a decisão e o risco, aponte quando discordar,
  espere o "ok" antes de mudanças não triviais.
- Não reescreva o que já foi decidido aqui sem justificar.
- Idioma: português. Commits em português.
- Publicar no `main` = publicar para os motoristas (GitHub Pages). Trabalhe em branch,
  teste, e só junte ao `main` com aprovação.

## O que o sistema faz

Controla as viagens que motoristas prestadores fazem para a empresa: levar a equipe de
casa para a empresa (IDA), trazer de volta (VOLTA) e viagens fora da rotina (EXTRA).
O motorista registra pelo celular com um toque; o gestor vê o consolidado, fecha
pagamentos (sempre por PIX) e exporta para o dashboard financeiro.

2 a 3 motoristas, tarifa fixa por motorista (hoje R$ 50 e R$ 55), cerca de 4 viagens
por dia útil. Volume anual na casa de 1.000 linhas.

## Arquitetura

- **Tela:** `index.html`, arquivo único, JavaScript puro, sem framework e sem build.
  GitHub Pages, repositório `Renan1/viagens-couveflor`, servido em
  `https://viagensuber.couveflorrefeicoes.com.br` (CNAME no Cloudflare apontando para
  `renan1.github.io`, proxy desligado).
- **Backend:** `Code.gs`, Google Apps Script publicado como aplicativo web
  (Executar como: eu | Acesso: qualquer pessoa). Endpoint `/exec` fixado na constante
  `API` dentro do `index.html`.
- **Banco:** a própria planilha do Google que hospeda o script.
- O `Code.gs` do repositório é **cópia**: quem roda é o código colado no editor do
  Apps Script. Mantenha os dois iguais.

Ausência de framework e de build é decisão: o dono edita direto pelo GitHub quando
precisa. (A máquina do trabalho tem Node 24, o que viabiliza `clasp` — ver pendências.)

## Modelo de dados (abas da planilha)

- **Viagens:** ID | Código (do motorista) | Motorista | Tipo | Data | Hora | Valor |
  Descrição | Enviado em | Pagamento
- **Motoristas:** Código | Nome | Tarifa
- **Pagamentos:** ID | Código | Motorista | De | Até | Viagens | Valor | Pago em |
  Observação | E2E | Comprovante  *(E2E e Comprovante a partir da versão 5)*
- **Ajustes:** Chave | Valor — `pin`, `pin_tentativas`, `pin_bloqueado_ate`,
  `pasta_comprovantes` (v5) e o antigo `pagos` (obsoleto).

Datas e horas são **texto** (`AAAA-MM-DD` e `HH:MM`), com as colunas formatadas como
texto. Gravadas como data real, o Google converte e os filtros por mês quebram. A
leitura aceita os dois formatos (`comoData`, `comoHora`, `comoEnvio`).

## Identidade e acesso

Sem login. Cada motorista tem um **código pessoal** aleatório que vive no link
(`...com.br/?m=mabc123...`). O código fica no `localStorage` do aparelho e, desde a
4.1, volta para a barra de endereços (sobrevive a limpeza de dados).

O gestor entra pelo endereço limpo, sem `?m=`, com PIN de 4 dígitos (aba Ajustes).
`?sair=1` limpa o acesso de motorista do aparelho. Aparelho sem identificação vê a tela
"Quem está entrando?".

Consequência aceita: quem tem o link de um motorista vê os dados daquele motorista.

## Regras de negócio que não podem se perder

- **O valor fica gravado dentro de cada viagem.** Mudar a tarifa não altera histórico.
- **Pagamento é por viagem, não por mês.** Fechar marca as viagens em aberto de um
  motorista até uma data e cria uma linha em Pagamentos.
- **Viagem já paga não pode ser cancelada**; é preciso desfazer o pagamento antes.
- **O motorista só cancela o que lançou hoje** (validado no servidor). O gestor cancela
  qualquer uma não paga.
- **EXTRA exige valor e descrição.**
- **Lançamento retroativo é permitido**; `Enviado em` guarda quando o registro aconteceu.
- **Pagamento é 100% PIX** e exige o código E2E (v5). E2E repetido é recusado.
- **O motorista vê o E2E, nunca o arquivo do comprovante.** O comprovante fica numa
  pasta privada do Drive de quem publica o script.
- **Desfazer pagamento manda o comprovante para a lixeira do Drive** (30 dias).

## Armadilhas já pagas (não repetir)

- **Comunicação:** leituras e ações de motorista por GET. Ações de gestor (com PIN) por
  POST com `Content-Type: text/plain` — evita o preflight de CORS que o Apps Script não
  responde, e o PIN não vai na URL. O servidor recusa ação de gestor por GET.
- **Salvar o `Code.gs` não publica nada.** Implantar → Gerenciar implantações → lápis →
  Nova versão. Criar implantação nova muda a URL e quebra o site.
- **Nunca reformatar colunas a cada requisição** (`setNumberFormat` em massa causou
  lentidão e erros). Formatação só na criação/ampliação da aba ou rodando `preparar()`.
- **A fila de pendências não pode bloquear a abertura do app.** Roda depois que a tela
  carregou; item recusado pelo servidor sai da fila.
- **O `manifest.json` tem `start_url` fixo**, então o atalho instalado abre sem `?m=`.
  Daí a identidade guardada no aparelho e na URL.
- **Falta de conexão não é link inválido** (corrigido na 4.1). Sem resposta e sem
  cópia do mês, o motorista vê os botões e registra pela fila. A tela "acesso não vale
  mais" é só para recusa do servidor — antes, ela aparecia offline e induzia o motorista
  a apertar "Sair" e perder o acesso.
- **A tela é redesenhada inteira (`pintar()`) a cada mudança.** Valor digitado em campo
  precisa morar no estado `E`, senão some. Input de arquivo fica fora do `#app`.

## Robustez implementada

Três tentativas com pausa crescente, tempo limite de 15 s por tentativa (60 s no envio
de comprovante), cache local da última lista por mês, fila offline, botão "testar
conexão" (`?acao=ping`, mostra a resposta crua).

## Segurança já tratada

PIN com bloqueio de 15 minutos após 5 erros; escape de HTML em tudo que vem da planilha
(`esc`, `curto`); proteção contra fórmula no CSV (`celula`); comprovante só via POST com
PIN, tipo restrito a PDF/JPEG, limite de 5 MB.

## Estado em 2026-10-02

- **No ar:** `index.html` 5.0 + `Code.gs` 5 (ping: 2 motoristas, 67 viagens). Drive
  autorizado; primeiro comprovante anexado com sucesso (pagamento fechado ainda na 4.1,
  sem E2E).
- **Versão 5:** E2E obrigatório no fechamento, comprovante opcional (PDF ou foto
  reduzida no aparelho para JPEG de até 1600 px), enviado depois do fechamento (falha
  no envio não desfaz o pagamento; "anexar comprovante" no histórico permite reenviar
  ou anexar em pagamentos antigos), "ver comprovante" abre no Drive do dono, CSV de
  pagamentos com coluna `e2e` no fim.

### Ao publicar uma versão nova do `Code.gs` — a ordem importa

1. Colar o `Code.gs` no editor do Apps Script e salvar.
2. Implantar → Gerenciar implantações → lápis → **Nova versão**.
   **Implantar não pede autorização nova.** Se o código passar a usar outro serviço
   do Google (ex.: Drive), rodar pelo editor uma função que o use (no caso do Drive,
   `pastaComprovantes`) e aprovar — senão a chamada falha com "sem permissão".
   A troca de versão pode levar alguns minutos para o `ping` refletir.
3. Conferir com `?acao=ping` a versão nova.
4. Só então juntar o branch do site ao `main`.

## Pendências

1. **Acompanhar o primeiro fechamento real com E2E** na versão 5.
2. **PIN do gestor salvo no navegador sem expiração** e **sem botão de sair no painel
   do gestor** — vindos da auditoria. Proposta: botão "sair" + expiração de 30 dias.
   PIN continua com 4 dígitos (decidido).
3. **`clasp`** para versionar e implantar o `Code.gs` por comando, sempre na implantação
   existente (para a URL `/exec` não mudar). `clasp login` é feito pelo dono.
4. **Dashboard** — decidir se o `couveflor-dashboard` (privado) lê a planilha direto
   ou continua recebendo o CSV copiado.

### Decidido e descartado

- **Recuperação de acesso por código curto** (ex.: `MOI4`): **rejeitada pelo dono.**
  Não propor de novo. Perdeu o link, o gestor reenvia pelo botão "link".

## Como testar localmente

Servir a pasta com um servidor estático (ex.: `npx http-server -p 8080 -c-1`) e abrir
`http://127.0.0.1:8080`. O app fala com a planilha real. Para testar telas do gestor
ou cenários sem rede sem mexer em dados reais, sobrescrever `window.fetch` no console
com respostas simuladas e chamar `carregar()`. Ao final, `localStorage.clear()`.

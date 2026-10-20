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
pagamentos (sempre por PIX), acompanha o **Dashboard de viagens** (aba dentro do app,
desde a 6.2) e exporta para o dashboard financeiro da empresa (outro repositório — ver
pendências).

**Trabalham também aos sábados e domingos** (dono, 2026-10-20), com a mesma tarifa.

**Cadência de pagamento:** a partir de outubro/2026 o pagamento passa a ser **mensal**
para todos (o Heder era pago por semana, por isso teve fechamento no meio do mês). O
sistema aguenta as duas cadências, porque o fechamento é por viagem até uma data.

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
- **Dashboard de viagens (6.2):** aba "Dashboard" do painel do gestor, dentro do
  `index.html`. Só leitura, só gestor. Pede o histórico inteiro de uma vez (ação
  `gestor` **sem** `mes` devolve todas as viagens) e calcula tudo no aparelho; não usa
  rota nova do `Code.gs`. Gráfico em SVG feito à mão, sem biblioteca.
- O `Code.gs` do repositório é **cópia**: quem roda é o código colado no editor do
  Apps Script. Mantenha os dois iguais.

Ausência de framework e de build é decisão: o dono edita direto pelo GitHub quando
precisa. (A máquina do trabalho tem Node 24, o que viabiliza `clasp` — ver pendências.)

## Modelo de dados (abas da planilha)

- **Viagens:** ID | Código (do motorista) | Motorista | Tipo | Data | Hora | Valor |
  Descrição | Enviado em | Pagamento
- **Motoristas:** Código | Nome | Tarifa | Chave PIX | Banco  *(Chave PIX e Banco a
  partir do `Code.gs` 6)*
- **Pagamentos:** ID | Código | Motorista | De | Até | Viagens | Valor | Pago em |
  Observação | E2E | Comprovante | Tamanho  *(E2E e Comprovante a partir da versão 5;
  Tamanho, em bytes, a partir da 6)*
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
- **Fechar = pagar.** O fechamento exige o E2E de um PIX que já aconteceu, então não
  existe "fechar o mês" antes de pagar. Para pagar outubro no começo de novembro: abrir
  "Fechar PIX" **no dia do pagamento** e pôr em "Fechar viagens até o dia" o último dia
  do mês (31/10). Viagens de novembro ficam de fora e seguem em aberto. Viagem lançada
  depois do fechamento (retroativa) entra no próximo.
- **Tarifa igual todos os dias:** sábado, domingo e feriado valem o mesmo; o sistema
  nunca usa dia da semana para calcular valor. Dia útil só existe na projeção do
  dashboard.

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
- **O dashboard depende de `gestor` sem `mes` devolver tudo.** Se o `Code.gs` passar a
  paginar ou exigir `mes`, o dashboard quebra. Ele é recalculado em `telaDash()`; o
  histórico fica em `E.todas` e é descartado a cada `carregar()` do painel (para não
  mostrar número velho depois de um fechamento ou cancelamento).
- **Mês em andamento não se compara com mês fechado.** O resumo compara "até o dia N" com
  o mesmo período do mês anterior; a tabela marca o mês corrente como "parcial".
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

**PIN do gestor no aparelho (5.1):** vale 30 dias fixos a partir de quando foi digitado
(`cf_pin_ate`; abrir o app não renova). Vencido ou no botão "Sair do painel", o app
apaga `cf_pin`, `cf_pin_ate` e as cópias `cf_cache_gestor_*` — que guardam dados do
gestor no aparelho (inclui `cf_cache_gestor_todas`, o histórico do dashboard). `cf_fila` e `cf_motorista` não são tocados. PIN de antes da 5.1
(sem prazo) começa a contar na primeira abertura da 5.1.

## Estado em 2026-10-20

- **No ar:** `index.html` **6.4** + `Code.gs` 6 (inalterado). A 6.2 (Dashboard de
  viagens) foi juntada ao `main` em 2026-10-20, com o ok do dono, que já tinha testado o
  branch com dados reais; a 6.3 (baixar CSV) foi juntada no mesmo dia, também com ok; a
  6.4 (projeção por tipo de dia) foi validada pelo dono com dados reais e juntada em
  2026-10-21.
  GitHub Pages leva alguns minutos para refletir.
- **Dashboard de viagens (6.2), o que mostra** (mês escolhido no seletor):
  - resumo: total, viagens, média por viagem, comparado ao mês anterior (mesmo período se
    o mês está em andamento);
  - gráfico de barras por mês (valor, empilhado VOLTA → IDA → EXTRA) e tabela com a
    variação mensal; só meses a partir da primeira viagem;
  - por motorista (viagens, valor, variação) e por tipo;
  - **projeção do mês seguinte** (só para o mês atual ou o último fechado): como os
    motoristas trabalham todos os dias com a mesma tarifa, o ritmo é medido em dois
    grupos pelos próprios dados — **dias úteis** e **dias não úteis** (fim de semana e
    feriado): viagens IDA/VOLTA por dia de cada grupo × dias de cada grupo no mês seguinte
    × tarifa **atual** de cada motorista, mais a média dos EXTRA dos meses fechados. Se um
    motorista não trabalha nos não úteis, esse ritmo sai zero sozinho. Mês em andamento
    que ainda não teve fim de semana empresta o ritmo do mês mais recente que teve (sem
    histórico, avisa que não inclui fim de semana). Faixa mínimo–máximo só com mais de um
    mês de histórico. É projeção, não previsão: com poucos meses é conta, não tendência.
- **Decisões de desenho do dashboard** (não refazer sem justificar): variação em cinza
  com ▲/▼, **sem verde/vermelho** (gastar mais ou menos não é bom nem ruim por si);
  pilha na ordem VOLTA → IDA → EXTRA, porque o cinza do EXTRA ao lado do verde da VOLTA
  falhava no teste de daltonismo (validador de paleta); legenda e tabela existem porque o
  amarelo da IDA no tema claro tem contraste baixo; dica do gráfico montada com
  `textContent` (dado vem da planilha).
- **Dia útil** (para separar os dois grupos da projeção) = segunda a sexta menos feriados nacionais (fixos, Carnaval, Sexta-feira
  Santa, Corpus Christi, 20/11 desde 2024). **Feriados de Juiz de Fora (cadastrados em
  2026-10-20):** só o municipal que não é nacional nem móvel — 13/06, Santo Antônio (Lei
  8.733/1995), em `FERIADOS_LOCAIS` como `"06-13"` (`"MM-DD"` vale todo ano,
  `"AAAA-MM-DD"` um dia só). **Pontos facultativos do servidor público** (Portaria
  279-SRH/2025: 2/1, 18/2, 2/4, 20/4, 5/6, 28/10, 24/12, 31/12) **não entram**: valem
  para a prefeitura, não necessariamente para a Couve Flor. Se a Couve Flor parar em
  algum, acrescentar em `FERIADOS_LOCAIS`. Segunda e terça de Carnaval entram por padrão
  no cálculo. **Dono, 2026-10-20:** não trabalham em 01/01 (já é feriado nacional);
  24/12 e 31/12 possivelmente trabalham, mas só parte do dia — não cadastrados. Só afeta a
  projeção, nunca o valor pago.
- **Pagamento mensal a partir de outubro/2026**; fechamento de outubro será feito no dia
  do PIX (começo de novembro) com "até 31/10". Ver "Fechar = pagar" nas regras.
- **6.4 (projeção por tipo de dia, no ar):**
  a projeção deixou de tratar fim de semana como "avulso" e passou a medir dia útil e
  dia não útil separadamente (ver acima). Testada com 4 cenários simulados de conta
  conhecida (trabalham todo dia; só dias úteis; mês-base sem fim de semana com e sem
  histórico): bateram exatamente.
- **6.3 (baixar CSV, no ar desde 2026-10-20):** botões
  "Baixar viagens" e "Baixar pagtos" no Exportar do painel, ao lado dos "Copiar". O
  arquivo de **pagamentos sai idêntico ao "copiar", sem BOM** (é o que segue para o
  dashboard financeiro; um leitor de máquina pode engolir o BOM no nome da primeira
  coluna); o de **viagens sai com BOM** (para abrir no Excel com acento certo). Nomes:
  `pagamentos-AAAA-MM-DD.csv` e `viagens-AAAA-MM.csv`. Separador `;`, decimal vírgula.
- **Testes do dashboard** foram feitos com dados simulados (Chromium, tema escuro e
  claro) e pelo dono com dados reais.

## Histórico até 2026-10-07

- **Primeiro fechamento real com E2E feito** (Moisés, viagens de setembro, outubro
  ficou em aberto) — comprovante em **JPG**, então a leitura automática do PDF (5.2)
  **ainda não foi testada com PDF real de banco**; só com PDF montado no teste.
- **Lentidão do Apps Script em 2026-10-07:** um `ping` ficou mais de 2 min sem resposta
  e o seguinte levou 9,5 s. Pode ter sido passageiro; se motoristas reclamarem de
  demora, começar por aqui (o app desiste de cada tentativa em 15 s, 3 tentativas).
- **Visual 6.0 (redesign v3, protótipo do dono; inclui a leitura de PDF da 5.2):** tokens de cor `--bg`, `--surf`,
  `--ida` etc. no `:root` (escuro padrão; claro pelo aparelho ou botão de tema, guardado
  em `cf_tema`), fonte do sistema, ícone "carro de frente" (`ICONE` no código e
  `icone-*.png`). EXTRA, fechamento PIX e detalhe do pagamento abrem em folha que sobe
  de baixo (`folha()`). PIN: as casas são desenho sobre um campo invisível
  (`#pinCampo`) que chama o teclado do celular — **teclado na tela foi rejeitado pelo
  dono**; com 4 dígitos entra sozinho (criar PIN ainda pede botão). Ficou de fora do
  protótipo o que não existe nos dados: chave PIX, nome do banco e tamanho do arquivo,
  tarifas diferentes para IDA e VOLTA.
- **Estava no ar em 2026-10-07:** `index.html` 6.1 + `Code.gs` 6 (ping: 2 motoristas,
  92 viagens). Drive autorizado.
- **Versão 5:** E2E obrigatório no fechamento, comprovante opcional (PDF ou foto
  reduzida no aparelho para JPEG de até 1600 px), enviado depois do fechamento (falha
  no envio não desfaz o pagamento; "anexar comprovante" no histórico permite reenviar
  ou anexar em pagamentos antigos), "ver comprovante" abre no Drive do dono, CSV de
  pagamentos com coluna `e2e` no fim.
- **Versão 5.2 (no ar desde 2026-10-05, só `index.html`; `Code.gs` segue 5):** ao
  anexar **PDF** no fechamento, o app lê o texto com pdf.js (cdnjs, 3.11.174, carregado
  só nessa hora) e preenche o E2E se o campo estiver vazio; se já houver código
  diferente, avisa sem sobrescrever. Mostra a data/hora do PIX embutida no E2E (UTC→
  Brasília) e se o valor do fechamento aparece no PDF. **Foto não é lida** (OCR pesado e
  erra O/0, I/1 no final do código) — decisão do dono. O texto do PDF não sai do aparelho.

### Ao publicar uma versão nova do `Code.gs` — a ordem importa

1. Colar o `Code.gs` no editor do Apps Script e salvar.
2. Implantar → Gerenciar implantações → lápis → **Nova versão**.
   **Implantar não pede autorização nova.** Se o código passar a usar outro serviço
   do Google (ex.: Drive), rodar pelo editor uma função que o use (no caso do Drive,
   `pastaComprovantes`) e aprovar — senão a chamada falha com "sem permissão".
   A troca de versão pode levar alguns minutos para o `ping` refletir.
3. Conferir com `?acao=ping` a versão nova.
4. Só então juntar o branch do site ao `main`.

## Pendências (revisadas com o dono em 2026-10-07)

### Aprovadas, a fazer

1. **Chave PIX, banco e tamanho do comprovante — no ar desde 2026-10-07**
   (`index.html` 6.1 + `Code.gs` 6). Chaves reais cadastradas pelo dono em 2026-10-07,
   funcionando. Falta só ver o tamanho do arquivo no próximo comprovante. Como ficou:
   - Aba Motoristas ganha `Chave PIX` e `Banco` no fim (texto); aba Pagamentos ganha
     `Tamanho` (bytes) no fim. As colunas entram sozinhas na primeira chamada.
   - Chave em **texto livre**, só sem espaços (decisão do dono); banco livre.
   - Gestor: botão "PIX" em cada motorista abre folha para editar/apagar; campos
     opcionais no cadastro; a folha de fechamento mostra a chave com "copiar" e o banco;
     o detalhe do pagamento mostra o tamanho do arquivo ao lado de "Ver comprovante".
   - **O motorista vê a própria chave e o banco** (decisão do dono), para conferir.
   - Servidor 5 com tela 6.1: avisa "servidor desatualizado" em vez de perder a chave.
   - O banco **não** sai do E2E: o ISPB embutido é o de **quem pagou** (sempre o Itaú
     da Couve Flor). Por isso é cadastrado junto com a chave.
   - Pagamentos com comprovante anterior à v6 ficam sem tamanho.
2. **Dashboard financeiro da empresa (`couveflor-dashboard`) — decidido pelo dono em
   2026-10-20: fica de fora deste app.** O Dashboard de viagens (aba do app) e o
   financeiro (outro repositório, que recebe arquivos em `entrada/<MÊS>/` desde que a
   sincronização com Apps Script foi desligada em 2026-09-28) são coisas diferentes. A
   ponte é **manual**: o dono baixa o CSV de pagamentos (botão "Baixar pagtos", 6.3) e o
   coloca na pasta do dashboard financeiro. Não mexer no `couveflor-dashboard` a partir
   daqui e não ler a planilha direto. **Não verificado:** se o `tools/entrada.py` aceita
   o nome do arquivo e se espera só o mês ou o histórico inteiro (o CSV traz todos os
   pagamentos, como o "copiar" sempre trouxe — o comentário no código diz que o
   dashboard já lê essas colunas, com `e2e` no fim). Se o primeiro envio de novembro
   duplicar valores, o ajuste é filtrar o CSV pelo mês. Passo manual todo mês: se
   esquecer, o custo de transporte não aparece nas finanças.
3. **Testar a leitura de PDF com comprovante real** no próximo fechamento em que o
   banco gerar PDF (o de outubro, no começo de novembro: pedir o comprovante em PDF,
   não em foto). No mesmo fechamento, ver o tamanho do arquivo (pendência 1).
### Próxima tarefa de desenvolvimento (aprovada pelo dono em 2026-10-20, sem código ainda)

- **Indicadores de consistência** no app, sem GPS e sem dado novo (o `Enviado em` já
  existe): viagens duplicadas (mesmo motorista, mesmo tipo, mesmo dia), horário fora do
  padrão e quantidade de lançamentos retroativos (data da viagem bem anterior ao `Enviado
  em`). Só leitura, para o gestor. **Antes de codar, combinar com o dono** os limites
  (o que é "fora do padrão", quantos dias contam como retroativo) e onde aparece (aba do
  Dashboard ou faixa no Painel). Lembrete: duas IDA no mesmo dia pode ser legítimo.

### Adiadas pelo dono

- **`clasp`** — o dono prefere publicar o `Code.gs` à mão por enquanto e avisa quando
  incomodar. Não propor de novo antes disso.
- **Tarifas diferentes para IDA e VOLTA** — não é assim que trabalham hoje; talvez no
  futuro. Exigiria mudar a aba Motoristas e o cálculo do valor no `registrar`.

### Decidido e descartado

- **Recuperação de acesso por código curto** (ex.: `MOI4`): **rejeitada pelo dono.**
  Não propor de novo. Perdeu o link, o gestor reenvia pelo botão "link".
- **Criar o PIN sem botão** (entrar sozinho ao digitar 4 dígitos, como já é no login):
  o dono preferiu manter o botão em "Criar PIN".
- **Ler o E2E de foto (OCR)**: descartado; só PDF é lido.
- **Teclado numérico desenhado na tela do PIN**: rejeitado; usa o teclado do celular.
- **GPS / rastreamento do trajeto da corrida: descartado pelo dono em 2026-10-20.** A
  tarifa é fixa por viagem, então trajeto e km não mudam o valor pago; monitoramento
  seria outro propósito, fora do escopo deste projeto. Só reabrir se virar produto (SaaS).
  Se for retomado, a análise já feita: app web instalado só rastreia com tela ligada e app
  aberto (o motorista usa Waze, o app vai para segundo plano e para de gravar); dois
  pontos GPS (início e fim) é a opção barata; trilha completa pede app nativo; guardar a
  trilha simplificada, uma linha por viagem; LGPD exige consentimento e rastrear trajeto
  pode pesar como subordinação — consultar advogado ou contador; testar antes em ambiente
  separado, com um motorista real e o Waze aberto.
- **Integração automática com o dashboard financeiro** (anexar e alterar o
  `couveflor-dashboard` a partir daqui): descartada em 2026-10-20; fica o CSV manual.

## Como testar localmente

Servir a pasta com um servidor estático (ex.: `npx http-server -p 8080 -c-1`) e abrir
`http://127.0.0.1:8080`. O app fala com a planilha real. Para testar telas do gestor
ou cenários sem rede sem mexer em dados reais, sobrescrever `window.fetch` no console
com respostas simuladas e chamar `carregar()`. Ao final, `localStorage.clear()`.

Para o dashboard, o simulado precisa responder `acao:"gestor"` com `viagens` (todas, sem
`mes`), `motoristas` (`id`, `nome`, `tarifa`) e `hojeISO`. Em teste automatizado
(Playwright), `localStorage.cf_pin` e `cf_pin_ate` (data futura) pulam a tela do PIN.

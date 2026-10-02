/**
 * Controle de viagens — Couve Flor Refeições  (versão 4)
 * Publicar como aplicativo web: Executar como "Eu" | Acesso "Qualquer pessoa".
 * Depois de qualquer alteração aqui: Implantar -> Gerenciar implantações -> lápis -> Nova versão.
 *
 * Pagamento agora é por viagem, não por mês: cada fechamento marca as viagens
 * em aberto de um motorista até uma data, e vira uma linha na aba Pagamentos.
 */

var VERSAO = 4;
var ABA_V = 'Viagens';
var ABA_M = 'Motoristas';
var ABA_A = 'Ajustes';
var ABA_P = 'Pagamentos';
var FUSO = 'America/Sao_Paulo';

function doGet(e) {
  var p = e.parameter || {};
  p._metodo = 'GET'; // sempre sobrescreve: o cliente não escolhe o método
  return responder(executar(p));
}

function doPost(e) {
  var corpo = {};
  try { corpo = JSON.parse(e.postData.contents); } catch (err) { corpo = e.parameter || {}; }
  corpo = corpo || {};
  corpo._metodo = 'POST';
  return responder(executar(corpo));
}

function responder(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function executar(p) {
  try { return processar(p); }
  catch (err) { return { ok: false, erro: 'Erro no servidor: ' + (err && err.message ? err.message : err) }; }
}

/* ---------- planilha ---------- */

function aba(nome, cabecalho, colunasTexto) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var s = ss.getSheetByName(nome);
  if (!s) {
    s = ss.insertSheet(nome);
    s.appendRow(cabecalho);
    s.getRange(1, 1, 1, cabecalho.length).setFontWeight('bold');
    s.setFrozenRows(1);
    formatarTexto(s, colunasTexto);
  } else if (s.getLastColumn() < cabecalho.length) {
    // completa cabeçalhos novos em planilhas criadas por versões antigas
    s.getRange(1, 1, 1, cabecalho.length).setValues([cabecalho]).setFontWeight('bold');
    formatarTexto(s, colunasTexto);
  }
  return s;
}

/** Formata colunas como texto. Só na criação/ampliação da aba ou rodando preparar(). */
function formatarTexto(s, colunas) {
  (colunas || []).forEach(function (c) {
    s.getRange(2, c, Math.max(s.getMaxRows() - 1, 1), 1).setNumberFormat('@');
  });
}

var COL_V = ['ID', 'Código', 'Motorista', 'Tipo', 'Data', 'Hora', 'Valor', 'Descrição', 'Enviado em', 'Pagamento'];
var COL_P = ['ID', 'Código', 'Motorista', 'De', 'Até', 'Viagens', 'Valor', 'Pago em', 'Observação'];

function abaViagens() { return aba(ABA_V, COL_V, [1, 2, 4, 5, 6, 9, 10]); }
function abaMotoristas() { return aba(ABA_M, ['Código', 'Nome', 'Tarifa'], [1]); }
function abaAjustes() { return aba(ABA_A, ['Chave', 'Valor'], [1, 2]); }
function abaPagamentos() { return aba(ABA_P, COL_P, [1, 2, 4, 5, 8]); }

function linhas(s) {
  var v = s.getDataRange().getValues();
  return v.slice(1).filter(function (l) { return String(l[0]).length > 0; });
}

function comoData(v) {
  if (v instanceof Date) return Utilities.formatDate(v, FUSO, 'yyyy-MM-dd');
  return String(v || '').trim();
}
function comoHora(v) {
  if (v instanceof Date) return Utilities.formatDate(v, FUSO, 'HH:mm');
  return String(v || '').trim();
}
function comoEnvio(v) {
  if (v instanceof Date) return Utilities.formatDate(v, FUSO, 'dd/MM/yyyy HH:mm');
  return String(v || '').trim();
}
function hojeBR() { return Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy'); }
function hojeISO() { return Utilities.formatDate(new Date(), FUSO, 'yyyy-MM-dd'); }

function ajuste(chave) {
  var l = linhas(abaAjustes());
  for (var i = 0; i < l.length; i++) if (l[i][0] === chave) return String(l[i][1]);
  return '';
}

function gravarAjuste(chave, valor) {
  var s = abaAjustes(), l = s.getDataRange().getValues();
  for (var i = 1; i < l.length; i++) {
    if (l[i][0] === chave) { s.getRange(i + 1, 2).setValue(String(valor)); return; }
  }
  s.appendRow([chave, String(valor)]);
}

function motoristas() {
  return linhas(abaMotoristas()).map(function (l) {
    return { id: String(l[0]), nome: String(l[1]), tarifa: Number(l[2]) || 0 };
  });
}

function acharMotorista(id) {
  var m = motoristas();
  for (var i = 0; i < m.length; i++) if (m[i].id === String(id)) return m[i];
  return null;
}

function mapaViagem(l) {
  return {
    id: String(l[0]),
    motorista: String(l[1]),
    nome: String(l[2]),
    tipo: String(l[3]),
    data: comoData(l[4]),
    hora: comoHora(l[5]),
    valor: Number(l[6]) || 0,
    descricao: String(l[7] || ''),
    enviado: comoEnvio(l[8]),
    pagamento: String(l[9] || '')
  };
}

function viagens(mes) {
  return linhas(abaViagens()).map(mapaViagem).filter(function (v) {
    return !mes || v.data.indexOf(mes) === 0;
  });
}

function pagamentos() {
  return linhas(abaPagamentos()).map(function (l) {
    return {
      id: String(l[0]), motorista: String(l[1]), nome: String(l[2]),
      de: comoData(l[3]), ate: comoData(l[4]),
      qtd: Number(l[5]) || 0, valor: Number(l[6]) || 0,
      pagoEm: comoEnvio(l[7]), obs: String(l[8] || '')
    };
  });
}

function novoCodigo(prefixo) {
  var c = prefixo || 'm', letras = 'abcdefghijkmnpqrstuvwxyz23456789';
  for (var i = 0; i < 12; i++) c += letras.charAt(Math.floor(Math.random() * letras.length));
  return c;
}

function travar() {
  var l = LockService.getScriptLock();
  l.waitLock(15000);
  return l;
}

/* ---------- rotas ---------- */

function processar(p) {
  var acao = p.acao || '';

  if (acao === 'ping') {
    return { ok: true, versao: VERSAO, motoristas: motoristas().length, viagens: viagens().length, pinCriado: !!ajuste('pin') };
  }

  /* ----- motorista ----- */
  if (acao === 'motorista') {
    var m = acharMotorista(p.t);
    if (!m) return { ok: false, erro: 'Link inválido. Peça o seu link ao gestor.' };

    var todas = viagens().filter(function (v) { return v.motorista === m.id; });
    var abertas = todas.filter(function (v) { return !v.pagamento; });
    var meus = pagamentos().filter(function (x) { return x.motorista === m.id; });

    return {
      ok: true, nome: m.nome, tarifa: m.tarifa, hoje: hojeBR(),
      viagens: todas.filter(function (v) { return !p.mes || v.data.indexOf(p.mes) === 0; }),
      abertoQtd: abertas.length,
      abertoValor: abertas.reduce(function (s, v) { return s + v.valor; }, 0),
      abertoDesde: abertas.length ? abertas.map(function (v) { return v.data; }).sort()[0] : '',
      pagamentos: meus
    };
  }

  if (acao === 'registrar') {
    var mot = acharMotorista(p.t);
    if (!mot) return { ok: false, erro: 'Link inválido.' };
    if (!p.id || !p.tipo || !p.data || !p.hora) return { ok: false, erro: 'Dados incompletos.' };

    var valor = mot.tarifa;
    if (p.tipo === 'extra') {
      valor = Number(String(p.valor).replace(',', '.')) || 0;
      if (valor <= 0) return { ok: false, erro: 'Informe o valor da viagem extra.' };
      if (!String(p.descricao || '').trim()) return { ok: false, erro: 'Descreva a viagem extra.' };
    }

    var trava = travar();
    try {
      var s = abaViagens(), existentes = linhas(s);
      for (var i = 0; i < existentes.length; i++) {
        if (String(existentes[i][0]) === String(p.id)) return { ok: true, repetido: true };
      }
      var n = s.getLastRow() + 1;
      s.getRange(n, 1, 1, 10).setNumberFormat('@');
      s.getRange(n, 7).setNumberFormat('0.00');
      s.getRange(n, 1, 1, 10).setValues([[
        String(p.id), mot.id, mot.nome, String(p.tipo),
        String(p.data), String(p.hora), valor, String(p.descricao || ''),
        Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm'), ''
      ]]);
      SpreadsheetApp.flush();
      return { ok: true, valor: valor };
    } finally { trava.releaseLock(); }
  }

  if (acao === 'cancelar') {
    var dono = acharMotorista(p.t);
    if (!dono) return { ok: false, erro: 'Link inválido.' };
    return removerLinha(p.id, dono.id, true);
  }

  /* ----- gestor ----- */
  var pin = ajuste('pin');

  if (acao === 'definir_pin') {
    if (pin) return { ok: false, erro: 'O PIN já foi criado.' };
    if (!/^\d{4}$/.test(String(p.pin || ''))) return { ok: false, erro: 'O PIN precisa ter 4 dígitos.' };
    gravarAjuste('pin', p.pin);
    return { ok: true };
  }

  var protegida = ['gestor', 'add_motorista', 'edit_motorista', 'rm_motorista', 'cancelar_g',
       'fechar_pagamento', 'desfazer_pagamento'].indexOf(acao) >= 0;

  if (protegida && p._metodo === 'GET') return { ok: false, erro: 'Ação não permitida por este método.' };

  if (acao === 'gestor' && !pin) return { ok: true, semPin: true };

  if (protegida) {
    var erroPin = conferirPin(p.pin, pin);
    if (erroPin) return erroPin;
  }

  if (acao === 'gestor') {
    var todasG = viagens();
    return {
      ok: true, hoje: hojeBR(), hojeISO: hojeISO(),
      motoristas: motoristas(),
      viagens: todasG.filter(function (v) { return !p.mes || v.data.indexOf(p.mes) === 0; }),
      abertas: todasG.filter(function (v) { return !v.pagamento; }),
      pagamentos: pagamentos()
    };
  }

  if (acao === 'fechar_pagamento') {
    var alvo = acharMotorista(p.motorista);
    if (!alvo) return { ok: false, erro: 'Motorista não encontrado.' };
    var ate = String(p.ate || hojeISO());

    var trava2 = travar();
    try {
      var sv = abaViagens(), dados = sv.getDataRange().getValues();
      var indices = [], soma = 0, datas = [];
      for (var j = 1; j < dados.length; j++) {
        var v = mapaViagem(dados[j]);
        if (v.id && v.motorista === alvo.id && !v.pagamento && v.data <= ate) {
          indices.push(j + 1); soma += v.valor; datas.push(v.data);
        }
      }
      if (!indices.length) return { ok: false, erro: 'Não há viagens em aberto desse motorista até essa data.' };

      datas.sort();
      var idPag = novoCodigo('p');
      for (var k = 0; k < indices.length; k++) {
        sv.getRange(indices[k], 10).setNumberFormat('@').setValue(idPag);
      }
      abaPagamentos().appendRow([
        idPag, alvo.id, alvo.nome, datas[0], datas[datas.length - 1],
        indices.length, soma, Utilities.formatDate(new Date(), FUSO, 'dd/MM/yyyy HH:mm'),
        String(p.obs || '')
      ]);
      SpreadsheetApp.flush();
      return { ok: true, qtd: indices.length, valor: soma, de: datas[0], ate: datas[datas.length - 1] };
    } finally { trava2.releaseLock(); }
  }

  if (acao === 'desfazer_pagamento') {
    var trava3 = travar();
    try {
      var sv2 = abaViagens(), d2 = sv2.getDataRange().getValues();
      for (var x = 1; x < d2.length; x++) {
        if (String(d2[x][9] || '') === String(p.id)) sv2.getRange(x + 1, 10).setValue('');
      }
      var sp = abaPagamentos(), d3 = sp.getDataRange().getValues();
      for (var y = 1; y < d3.length; y++) {
        if (String(d3[y][0]) === String(p.id)) { sp.deleteRow(y + 1); break; }
      }
      SpreadsheetApp.flush();
      return { ok: true };
    } finally { trava3.releaseLock(); }
  }

  if (acao === 'add_motorista') {
    var nome = String(p.nome || '').trim();
    var tarifa = Number(String(p.tarifa).replace(',', '.')) || 0;
    if (!nome || tarifa <= 0) return { ok: false, erro: 'Informe nome e tarifa.' };
    var codigo = novoCodigo('m');
    abaMotoristas().appendRow([codigo, nome, tarifa]);
    return { ok: true, id: codigo };
  }

  if (acao === 'edit_motorista') {
    var s2 = abaMotoristas(), l2 = s2.getDataRange().getValues();
    for (var j2 = 1; j2 < l2.length; j2++) {
      if (String(l2[j2][0]) === String(p.id)) {
        if (p.nome) s2.getRange(j2 + 1, 2).setValue(String(p.nome).trim());
        if (p.tarifa) s2.getRange(j2 + 1, 3).setValue(Number(String(p.tarifa).replace(',', '.')) || 0);
        return { ok: true };
      }
    }
    return { ok: false, erro: 'Motorista não encontrado.' };
  }

  if (acao === 'rm_motorista') {
    var usadas = viagens().filter(function (v) { return v.motorista === String(p.id); });
    if (usadas.length) return { ok: false, erro: 'Esse motorista tem viagens lançadas e não pode ser removido.' };
    var s3 = abaMotoristas(), l3 = s3.getDataRange().getValues();
    for (var k3 = 1; k3 < l3.length; k3++) {
      if (String(l3[k3][0]) === String(p.id)) { s3.deleteRow(k3 + 1); return { ok: true }; }
    }
    return { ok: false, erro: 'Motorista não encontrado.' };
  }

  if (acao === 'cancelar_g') return removerLinha(p.id, null, false);

  return { ok: false, erro: 'Ação desconhecida: ' + acao };
}

/** Valida o PIN com bloqueio: 5 erros seguidos travam por 15 minutos. Retorna null se ok. */
function conferirPin(digitado, pin) {
  var trava = travar();
  try {
    var ate = ajuste('pin_bloqueado_ate');
    if (ate && new Date(ate).getTime() > Date.now()) {
      return { ok: false, erro: 'Muitas tentativas erradas. Tente novamente em alguns minutos.' };
    }
    if (String(digitado || '') !== pin) {
      var n = (Number(ajuste('pin_tentativas')) || 0) + 1;
      if (n >= 5) {
        gravarAjuste('pin_bloqueado_ate', new Date(Date.now() + 15 * 60 * 1000).toISOString());
        n = 0;
      }
      gravarAjuste('pin_tentativas', n);
      return { ok: false, erro: 'PIN incorreto.' };
    }
    if (Number(ajuste('pin_tentativas'))) gravarAjuste('pin_tentativas', 0); // só grava se precisar
    return null;
  } finally { trava.releaseLock(); }
}

function removerLinha(id, donoObrigatorio, somenteHoje) {
  var trava = travar();
  try {
    var s = abaViagens(), l = s.getDataRange().getValues();
    for (var i = 1; i < l.length; i++) {
      if (String(l[i][0]) === String(id)) {
        if (String(l[i][9] || '')) {
          return { ok: false, erro: 'Essa viagem já entrou em um pagamento. Desfaça o pagamento antes de cancelar.' };
        }
        if (donoObrigatorio && String(l[i][1]) !== donoObrigatorio) {
          return { ok: false, erro: 'Essa viagem não é sua.' };
        }
        if (somenteHoje && comoEnvio(l[i][8]).indexOf(hojeBR()) !== 0) {
          return { ok: false, erro: 'Só dá para cancelar o que foi lançado hoje. Fale com o gestor.' };
        }
        s.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { ok: true };
      }
    }
    return { ok: true, inexistente: true };
  } finally { trava.releaseLock(); }
}

/** Rode uma vez pelo editor após atualizar o script. */
function preparar() {
  formatarTexto(abaViagens(), [1, 2, 4, 5, 6, 9, 10]);
  formatarTexto(abaMotoristas(), [1]);
  formatarTexto(abaAjustes(), [1, 2]);
  formatarTexto(abaPagamentos(), [1, 2, 4, 5, 8]);
}
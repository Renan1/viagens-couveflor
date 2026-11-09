// Simulador do servidor para os prints do guia. Dados 100% fictícios.
(function(){
  const pad = n => String(n).padStart(2, "0");
  const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  const br = (s, h) => s.slice(8, 10) + "/" + s.slice(5, 7) + "/" + s.slice(0, 4) + " " + h;
  const HOJE = "2026-10-21";
  const mot = [
    {id:"mcarlos00001", nome:"Carlos Souza", tarifa:50, chave:"carlos.souza@email.com", banco:"Nubank"},
    {id:"mana00000002", nome:"Ana Lima", tarifa:55, chave:"+5532999990000", banco:"Banco Inter"}
  ];
  const viagens = [];
  let n = 0;
  const add = (m, tipo, data, hora, valor, desc, pag) => viagens.push({
    id: "v" + (++n), motorista: m.id, nome: m.nome, tipo, data, hora, valor: valor ?? m.tarifa,
    descricao: desc || "", enviado: br(data, hora.slice(0, 3) + pad(Math.min(59, Number(hora.slice(3)) + 2))), pagamento: pag || ""
  });
  for(let d = new Date(2026, 7, 3); iso(d) <= HOJE; d.setDate(d.getDate() + 1)){
    const s = iso(d), dow = d.getDay();
    const pag = s <= "2026-08-31" ? "pago" : s <= "2026-09-30" ? "pset" : "";
    const pc = pag === "pago" ? "pagoC08" : pag === "pset" ? "pagoC09" : "";
    const pa = pag === "pago" ? "pagoA08" : pag === "pset" ? "pagoA09" : "";
    add(mot[0], "ida", s, "07:10", null, "", pc);
    if(s !== HOJE) add(mot[0], "volta", s, "17:40", null, "", pc);
    if(dow !== 0 && dow !== 6){
      add(mot[1], "ida", s, "06:50", null, "", pa);
      if(s !== HOJE) add(mot[1], "volta", s, "18:10", null, "", pa);
    }
  }
  add(mot[0], "extra", "2026-09-12", "10:30", 80, "Buscar equipamento na loja", "pagoC09");
  add(mot[1], "extra", "2026-10-15", "13:00", 70, "Levar marmitas para o evento", "");
  const soma = l => l.reduce((s, v) => s + v.valor, 0);
  const pg = (id, m, de, ate, pagoEm, e2e, comp, tam) => {
    const vs = viagens.filter(v => v.pagamento === id);
    return {id, motorista:m.id, nome:m.nome, de, ate, qtd:vs.length, valor:soma(vs), pagoEm, obs:"", e2e, comprovante:comp, tamanho:tam};
  };
  const pagamentos = [
    pg("pagoC08", mot[0], "2026-08-03", "2026-08-31", "02/09/2026 09:15", "E60701190202609021215ABCDEF00001", "arqFicticio1", 148320),
    pg("pagoA08", mot[1], "2026-08-03", "2026-08-31", "02/09/2026 09:20", "E60701190202609021220ABCDEF00002", "arqFicticio2", 152100),
    pg("pagoC09", mot[0], "2026-09-01", "2026-09-30", "03/10/2026 10:05", "E60701190202610031305ABCDEF00003", "arqFicticio3", 187392),
    pg("pagoA09", mot[1], "2026-09-01", "2026-09-30", "03/10/2026 10:12", "E60701190202610031312ABCDEF00004", "", 0)
  ];
  window.SIM = {mot, viagens, pagamentos, HOJE};
  const resp = o => new Response(JSON.stringify(o));
  window.fetch = async (url, op) => {
    const p = op && op.method === "POST" ? JSON.parse(op.body) : Object.fromEntries(new URL(url).searchParams);
    const a = p.acao;
    if(a === "ping") return resp({ok:true, versao:6, motoristas:mot.length, viagens:viagens.length, pinCriado:true});
    if(a === "motorista"){
      const m = mot.find(x => x.id === p.t); if(!m) return resp({ok:false, erro:"Link inválido. Peça o seu link ao gestor."});
      const todas = viagens.filter(v => v.motorista === m.id), abertas = todas.filter(v => !v.pagamento);
      return resp({ok:true, nome:m.nome, tarifa:m.tarifa, chave:m.chave, banco:m.banco, hoje:"21/10/2026",
        viagens: todas.filter(v => !p.mes || v.data.startsWith(p.mes)), abertoQtd:abertas.length, abertoValor:soma(abertas),
        abertoDesde: abertas.map(v => v.data).sort()[0] || "",
        pagamentos: pagamentos.filter(x => x.motorista === m.id).map(x => Object.assign({}, x, {comprovante:"", tamanho:0}))});
    }
    if(a === "registrar"){
      const m = mot.find(x => x.id === p.t);
      viagens.push({id:p.id, motorista:m.id, nome:m.nome, tipo:p.tipo, data:p.data, hora:p.hora,
        valor: p.tipo === "extra" ? Number(String(p.valor).replace(",", ".")) : m.tarifa, descricao:p.descricao || "",
        enviado: br(HOJE, "07:12"), pagamento:""});
      return resp({ok:true});
    }
    if(a === "cancelar" || a === "cancelar_g"){ const i = viagens.findIndex(v => v.id === p.id); if(i >= 0) viagens.splice(i, 1); return resp({ok:true}); }
    if(a === "gestor"){
      if(p.pin !== "1234") return resp({ok:false, erro:"PIN incorreto."});
      return resp({ok:true, hoje:"21/10/2026", hojeISO:HOJE, motoristas:mot,
        viagens: viagens.filter(v => !p.mes || v.data.startsWith(p.mes)), abertas: viagens.filter(v => !v.pagamento), pagamentos});
    }
    if(a === "fechar_pagamento"){
      const m = mot.find(x => x.id === p.motorista), id = "pNovo" + Date.now();
      viagens.filter(v => v.motorista === m.id && !v.pagamento && v.data <= p.ate).forEach(v => v.pagamento = id);
      const novo = pg(id, m, "2026-10-01", p.ate, "21/10/2026 10:00", p.e2e, "", 0); pagamentos.push(novo);
      return resp({ok:true, id, qtd:novo.qtd, valor:novo.valor});
    }
    if(a === "anexar_comprovante"){ const x = pagamentos.find(y => y.id === p.id); if(x){ x.comprovante = "arqNovo"; x.tamanho = 160000; } return resp({ok:true, comprovante:"arqNovo", tamanho:160000}); }
    if(a === "edit_motorista"){ const m = mot.find(x => x.id === p.id); if(p.chave !== undefined) m.chave = p.chave; if(p.banco !== undefined) m.banco = p.banco; if(p.tarifa) m.tarifa = Number(p.tarifa); return resp({ok:true, chave:m.chave, banco:m.banco}); }
    return resp({ok:true});
  };
  window.confirm = () => true;
  return "simulador pronto: " + viagens.length + " viagens";
})();

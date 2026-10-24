const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const notas = ['Muito ruim','Ruim','Regular','Bom','Excelente'];
const emojis = ['😞','🙁','😐','🙂','🤩'];
export function renderRespostas(rows, total, csrf) {
  const texto = (title, value, classe='') => value ? `<div class="response-text ${classe}"><h3>${title}</h3><p>${esc(value)}</p></div>` : '';
  return `<header class="admin-top"><span class="admin-brand"><code>&lt;/&gt;</code> Vozes da feira</span><form method="post" action="/admin/logout"><input type="hidden" name="csrf" value="${esc(csrf)}"><button>Sair</button></form></header><h1 class="admin-title">Cada resposta, uma descoberta.</h1><p>${total} avaliações recebidas. Exibindo as 500 mais recentes.</p><nav class="admin-actions"><a class="botao" href="/admin/graficos">↗ Gráficos e indicadores</a><a class="botao" href="/api/exportar">↓ Baixar CSV</a><a class="botao" href="/admin">↻ Atualizar respostas</a></nav><section class="responses" aria-label="Avaliações dos visitantes">${rows.map(r => {
    const date = new Date(r.data);
    const when = Number.isNaN(date.getTime()) ? r.data : new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(date);
    return `<article class="response-card"><div class="response-head"><div><h2>${esc(r.curso)}</h2><time datetime="${esc(r.data)}">${esc(when)} · Brasília</time></div><div class="rating-badge"><span aria-hidden="true">${emojis[r.nota-1]}</span>${notas[r.nota-1]} · ${r.nota}/5</div></div>${texto('✨ O que gostou',r.gostou)}${texto('💡 Sugestões para melhorar',r.sugestoes,'suggestion')}${texto('💬 Comentário anterior',r.comentario,'legacy')}${!r.gostou&&!r.sugestoes&&!r.comentario?'<p class="no-text">O visitante enviou apenas a avaliação por emoji.</p>':''}</article>`;
  }).join('')}</section>${!rows.length?'<div class="admin-empty"><h2>As primeiras opiniões estão chegando.</h2><p>Assim que alguém responder ao questionário, a avaliação aparecerá aqui.</p></div>':''}`;
}

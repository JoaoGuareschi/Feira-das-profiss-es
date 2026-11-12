const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nota = value => value.toLocaleString('pt-BR', {minimumFractionDigits:2, maximumFractionDigits:2});

export function classificarTurmas(items) {
  const sorted = items.filter(r => r.total > 0).map(r => ({...r, pontos:Math.round(r.media * 100)}))
    .sort((a,b) => b.pontos - a.pontos || b.total - a.total || a.nome.localeCompare(b.nome, 'pt-BR'));
  return sorted.map((r,i) => ({...r, posicao:sorted.findIndex(other => other.pontos === r.pontos && other.total === r.total) + 1}));
}

export function renderRanking(items) {
  const ranking = classificarTurmas(items);
  const destaques = ranking.filter(r => r.posicao <= 3);
  return `<section class="card ranking" aria-labelledby="ranking-titulo">
    <div class="ranking-heading"><div><span class="eyebrow">&lt;/&gt; DS · DESTAQUES DA FEIRA</span><h2 id="ranking-titulo">Ranking das turmas</h2><p>As opiniões dos visitantes colocam cada turma em destaque.</p></div><span class="ranking-tag">${ranking.length} turmas avaliadas</span></div>
    <p class="ranking-regra">Ordem pela média (duas casas decimais). Desempate pelo número de avaliações; se ambos forem iguais, as turmas compartilham a posição. Cursos sem respostas ainda não participam.</p>
    ${!ranking.length ? '<p class="empty">O ranking começa com a primeira avaliação. Que turma vai conquistar o destaque?</p>' : `
    <div class="ranking-podio">${destaques.map(r => `<article class="ranking-destaque ranking-top-${r.posicao}" style="--curso-cor:${r.cor}"><span class="ranking-medalha motion">${r.posicao}º</span><span class="ranking-caption">${r.posicao === 1 ? 'Destaque da feira' : 'Entre as melhores'}</span><h3>${esc(r.nome)}</h3><div class="ranking-nota">${nota(r.pontos / 100)} <small>/ 5</small></div><p>${r.total.toLocaleString('pt-BR')} avaliações</p></article>`).join('')}</div>
    <ol class="ranking-lista" aria-label="Classificação completa das turmas">${ranking.map(r => `<li value="${r.posicao}" class="ranking-linha" style="--curso-cor:${r.cor}"><span class="ranking-posicao" aria-label="Posição ${r.posicao}">${r.posicao}º</span><div class="ranking-curso"><strong>${esc(r.nome)}</strong><small>${r.total.toLocaleString('pt-BR')} avaliações</small><div class="ranking-trilho" aria-hidden="true"><span style="width:${r.pontos / 5}%"></span></div></div><strong class="ranking-pontos">${nota(r.pontos / 100)}<small> / 5</small></strong></li>`).join('')}</ol>`}
  </section>`;
}

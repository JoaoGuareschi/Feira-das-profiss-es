import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarTurmas, renderRanking } from './ranking.js';

test('classifica pela média, desempata por volume e preserva empates', () => {
  const rows = classificarTurmas([
    {nome:'Sem votos',total:0,media:null},
    {nome:'D',total:50,media:4},
    {nome:'C',total:2,media:5},
    {nome:'B',total:3,media:5},
    {nome:'A',total:3,media:5},
  ]);
  assert.deepEqual(rows.map(r => [r.nome,r.posicao]), [['A',1],['B',1],['C',3],['D',4]]);
});
test('empate usa a mesma precisão da média exibida', () => {
  assert.deepEqual(classificarTurmas([{nome:'A',total:3000,media:4.3333},{nome:'B',total:3000,media:4.334}]).map(r => r.posicao), [1,1]);
});
test('estado vazio e nomes escapados no ranking', () => {
  assert.match(renderRanking([]), /primeira avaliação/);
  const html = renderRanking([{nome:'<script>alert(1)</script>',total:1,media:5,cor:'#2563eb'}]);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /5,00/);
  assert.match(html, /&lt;script&gt;/);
});

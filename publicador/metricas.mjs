// Puxa as métricas dos posts e da conta e escreve em gestao/metricas/ e gestao/RELATORIO.md.
// Comentário, compartilhamento e salvamento pesam mais que curtida (regra do projeto).
import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { criarIg } from './ig.mjs';
import { RAIZ } from './fila.mjs';

const PASTA = join(RAIZ, 'gestao', 'metricas');
const METRICAS = {
  REELS: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions', 'ig_reels_avg_watch_time'],
  FEED: ['views', 'reach', 'likes', 'comments', 'shares', 'saved', 'total_interactions'],
  STORY: ['views', 'reach', 'replies', 'shares', 'navigation'],
};
const COLUNAS = ['data', 'tipo', 'link', 'primeira_linha', 'views', 'reach', 'likes', 'comments', 'shares', 'saved', 'ig_reels_avg_watch_time', 'score'];

async function insights(ig, id, metricas) {
  const ler = async (lista) => {
    const { data } = await ig.chamar(`${id}/insights`, { params: { metric: lista.join(',') } });
    return Object.fromEntries(data.map((d) => [d.name, d.values?.[0]?.value ?? d.total_value?.value ?? 0]));
  };
  try {
    return await ler(metricas);
  } catch {
    // alguma métrica não existe para esse post: pega uma por uma
    const r = {};
    for (const m of metricas) Object.assign(r, await ler([m]).catch(() => ({})));
    return r;
  }
}

// (comentários + compartilhamentos + salvamentos) por mil contas alcançadas
export const score = (p) => (p.reach ? Math.round(((p.comments ?? 0) + (p.shares ?? 0) + (p.saved ?? 0)) / p.reach * 10000) / 10 : 0);

const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

export async function coletar(ig, igUserId, { limite = 50 } = {}) {
  const { data: midias } = await ig.chamar(`${igUserId}/media`, {
    params: { fields: 'id,caption,media_type,media_product_type,permalink,timestamp', limit: limite },
  });
  const posts = [];
  for (const m of midias) {
    const tipo = m.media_product_type === 'REELS' ? 'REELS' : 'FEED';
    const p = { data: m.timestamp?.slice(0, 10), tipo: m.media_type === 'CAROUSEL_ALBUM' ? 'CARROSSEL' : tipo === 'REELS' ? 'REELS' : 'FEED',
      link: m.permalink, primeira_linha: (m.caption ?? '').split('\n')[0].slice(0, 80), ...(await insights(ig, m.id, METRICAS[tipo]).catch(() => ({}))) };
    p.score = score(p);
    posts.push(p);
  }

  const stories = [];
  const { data: ativos = [] } = await ig.chamar(`${igUserId}/stories`, { params: { fields: 'id,permalink,timestamp' } }).catch(() => ({}));
  for (const s of ativos) {
    stories.push({ id: s.id, data: s.timestamp, link: s.permalink, ...(await insights(ig, s.id, METRICAS.STORY).catch(() => ({}))) });
  }

  const conta = await ig.chamar(igUserId, { params: { fields: 'username,followers_count,follows_count,media_count' } });
  return { posts, stories, conta };
}

export function escrever({ posts, stories, conta }, hoje = new Date().toISOString().slice(0, 10)) {
  mkdirSync(PASTA, { recursive: true });
  writeFileSync(join(PASTA, 'posts.csv'), [COLUNAS.join(','), ...posts.map((p) => COLUNAS.map((c) => csv(p[c])).join(','))].join('\n') + '\n');

  const arqConta = join(PASTA, 'conta.csv');
  if (!existsSync(arqConta)) writeFileSync(arqConta, 'data,seguidores,seguindo,posts\n');
  appendFileSync(arqConta, `${hoje},${conta.followers_count ?? ''},${conta.follows_count ?? ''},${conta.media_count ?? ''}\n`);

  const arqStories = join(PASTA, 'stories.csv');
  if (!existsSync(arqStories)) writeFileSync(arqStories, 'coletado,publicado,id,views,reach,replies,shares\n');
  for (const s of stories) appendFileSync(arqStories, `${hoje},${s.data},${s.id},${s.views ?? ''},${s.reach ?? ''},${s.replies ?? ''},${s.shares ?? ''}\n`);

  const ranking = [...posts].filter((p) => p.reach).sort((a, b) => b.score - a.score);
  const linha = (p) => `| ${p.data} | ${p.tipo} | ${p.score} | ${p.reach} | ${p.comments ?? 0} | ${p.shares ?? 0} | ${p.saved ?? 0} | ${p.likes ?? 0} | [${p.primeira_linha.replace(/\|/g, '/') || 'abrir'}](${p.link}) |`;
  const cab = ['| Data | Tipo | Score | Alcance | Coment. | Compart. | Salvos | Curtidas | Post |', '|---|---|---|---|---|---|---|---|---|'];
  const md = [
    `# Relatório do @${conta.username ?? ''}`, '',
    `Atualizado em ${hoje}. Seguidores: **${conta.followers_count ?? '?'}**.`, '',
    'Score = (comentários + compartilhamentos + salvamentos) por mil contas alcançadas.', '',
    '## 5 melhores dos últimos 50 posts', '', ...cab, ...ranking.slice(0, 5).map(linha), '',
    '## 5 piores', '', ...cab, ...ranking.slice(-5).reverse().map(linha), '',
    'Tabela completa em metricas/posts.csv; evolução de seguidores em metricas/conta.csv.', '',
  ];
  writeFileSync(join(RAIZ, 'gestao', 'RELATORIO.md'), md.join('\n'));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { IG_TOKEN, IG_USER_ID } = process.env;
  if (!IG_TOKEN || !IG_USER_ID) { console.log('IG_TOKEN e IG_USER_ID ainda não configurados.'); process.exit(0); }
  const ig = criarIg({ token: IG_TOKEN, igUserId: IG_USER_ID });
  const dados = await coletar(ig, IG_USER_ID);
  escrever(dados);
  console.log(`${dados.posts.length} posts e ${dados.stories.length} stories; ${dados.conta.followers_count} seguidores`);
}

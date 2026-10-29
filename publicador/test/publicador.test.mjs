import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const raiz = mkdtempSync(join(tmpdir(), 'publicador-'));
process.env.RAIZ_REPO = raiz;
const { criarIg } = await import('../ig.mjs');
const { rodar } = await import('../publicar.mjs');
const { enfileirar, normalizarQuando } = await import('../enfileirar.mjs');
const { score, escrever } = await import('../metricas.mjs');

// Simula a API: guarda cada chamada e responde conforme a rota.
function apiFalsa({ statusSequencia = ['IN_PROGRESS', 'FINISHED'], falharPublish = false } = {}) {
  const chamadas = [];
  let n = 0;
  const status = {};
  const fetchImpl = async (url, opc = {}) => {
    const u = new URL(url);
    const corpo = opc.body instanceof URLSearchParams ? Object.fromEntries(opc.body) : null;
    chamadas.push({ metodo: opc.method, caminho: u.pathname, host: u.host, params: corpo ?? Object.fromEntries(u.searchParams), headers: opc.headers });
    const resp = (json, ok = true) => ({ ok, status: ok ? 200 : 400, json: async () => json });
    if (u.host === 'rupload.facebook.com') return resp({ success: true });
    if (u.pathname.endsWith('/media') && opc.method === 'POST') { const id = `c${++n}`; status[id] = [...statusSequencia]; return resp({ id }); }
    if (u.pathname.endsWith('/media_publish')) return falharPublish ? resp({ error: { message: 'boom' } }, false) : resp({ id: 'm1' });
    const id = u.pathname.split('/').pop();
    if (u.searchParams.get('fields') === 'status_code,status') return resp({ status_code: status[id].shift() ?? 'FINISHED' });
    if (u.searchParams.get('fields') === 'permalink') return resp({ permalink: 'https://instagram.com/p/x' });
    return resp({});
  };
  return { chamadas, ig: criarIg({ token: 't', igUserId: '123', fetchImpl, esperar: async () => {} }) };
}

function post(nome, dados) {
  mkdirSync(join(raiz, 'fila', 'midia'), { recursive: true });
  for (const m of dados.midias ?? []) if (!m.startsWith('http')) writeFileSync(join(raiz, m), 'x');
  writeFileSync(join(raiz, 'fila', `${nome}.json`), JSON.stringify(dados));
}

test('carrossel: cria filhos, espera, publica e arquiva', async () => {
  post('car', { quando: '2026-10-30T08:00:00-03:00', tipo: 'CARROSSEL', aprovado: true, legenda: 'oi',
    midias: ['fila/midia/a.jpg', 'fila/midia/b.jpg'] });
  const { ig, chamadas } = apiFalsa();
  const r = await rodar({ ig, agora: new Date('2026-10-30T12:00:00Z'), rawBase: 'https://raw/x', log: { log() {}, error() {} } });
  assert.equal(r.publicados.length, 1);
  const criacoes = chamadas.filter((c) => c.metodo === 'POST' && c.caminho.endsWith('/media'));
  assert.equal(criacoes.length, 3);
  assert.equal(criacoes[0].params.is_carousel_item, 'true');
  assert.equal(criacoes[0].params.image_url, 'https://raw/x/fila/midia/a.jpg');
  assert.equal(criacoes[2].params.media_type, 'CAROUSEL');
  assert.equal(criacoes[2].params.children, 'c1,c2');
  assert.ok(!existsSync(join(raiz, 'fila', 'car.json')));
  assert.ok(!existsSync(join(raiz, 'fila', 'midia', 'a.jpg')));
  const arquivado = JSON.parse(readFileSync(join(raiz, 'gestao', 'publicados', r.publicados[0].publicadoEm.slice(0, 7), 'car.json'), 'utf8'));
  assert.equal(arquivado.permalink, 'https://instagram.com/p/x');
});

test('reels sobe o vídeo pelo arquivo (resumable)', async () => {
  post('reel', { quando: '2026-10-30T19:00:00-03:00', tipo: 'REELS', aprovado: true, legenda: 'reel', midias: ['fila/midia/v.mp4'] });
  const { ig, chamadas } = apiFalsa();
  const r = await rodar({ ig, agora: new Date('2026-10-30T23:00:00Z'), rawBase: 'https://raw/x', log: { log() {}, error() {} } });
  assert.equal(r.publicados.length, 1);
  const criacao = chamadas.find((c) => c.caminho.endsWith('/media'));
  assert.equal(criacao.params.media_type, 'REELS');
  assert.equal(criacao.params.upload_type, 'resumable');
  assert.equal(criacao.params.share_to_feed, 'true');
  const up = chamadas.find((c) => c.host === 'rupload.facebook.com');
  assert.equal(up.headers.Authorization, 'OAuth t');
});

test('não publica sem aprovação nem antes da hora', async () => {
  post('sem-ok', { quando: '2026-10-30T08:00:00-03:00', tipo: 'STORY', midias: ['fila/midia/s.jpg'] });
  post('futuro', { quando: '2026-11-30T08:00:00-03:00', tipo: 'STORY', aprovado: true, midias: ['fila/midia/s2.jpg'] });
  const { ig, chamadas } = apiFalsa();
  const r = await rodar({ ig, agora: new Date('2026-10-30T12:00:00Z'), rawBase: 'https://raw/x', log: { log() {}, error() {} } });
  assert.equal(r.publicados.length, 0);
  assert.equal(chamadas.length, 0);
  assert.equal(r.aguardando, 1);
});

test('erro da API fica registrado e para depois de 3 tentativas', async () => {
  post('falha', { quando: '2026-10-30T08:00:00-03:00', tipo: 'STORY', aprovado: true, midias: ['fila/midia/f.jpg'] });
  const { ig } = apiFalsa({ falharPublish: true });
  const log = { log() {}, error() {} };
  for (let i = 0; i < 5; i++) await rodar({ ig, agora: new Date('2026-10-30T12:00:00Z'), rawBase: 'r', log });
  const p = JSON.parse(readFileSync(join(raiz, 'fila', 'falha.json'), 'utf8'));
  assert.equal(p.status, 'erro');
  assert.equal(p.tentativas, 3);
  assert.match(p.erro, /boom/);
});

test('PNG é recusado na fila; enfileirar converte para JPEG', async () => {
  const origem = join(raiz, 'tela.png');
  const { execFileSync } = await import('node:child_process');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:s=108x192', '-frames:v', '1', origem]);
  const arq = enfileirar({ tipo: 'story', quando: '2026-11-01T09:00-03:00', midias: [origem], nome: 'Abertura do dia' });
  const p = JSON.parse(readFileSync(arq, 'utf8'));
  assert.equal(p.quando, '2026-11-01T09:00:00-03:00');
  assert.equal(p.aprovado, false);
  assert.match(p.midias[0], /^fila\/midia\/20261101-0900-story-abertura-do-dia\/01\.jpg$/);
  assert.equal(readFileSync(join(raiz, p.midias[0])).subarray(0, 2).toString('hex'), 'ffd8');
});

test('validação pega erro de preenchimento e não chama a API', async () => {
  post('ruim', { quando: '2026-10-30T08:00:00-03:00', tipo: 'CARROSSEL', aprovado: true, midias: ['fila/midia/x.png'] });
  const { ig, chamadas } = apiFalsa();
  const r = await rodar({ ig, agora: new Date('2026-10-31T12:00:00Z'), rawBase: 'r', log: { log() {}, error() {} } });
  assert.equal(chamadas.length, 0);
  const erro = r.erros.find((p) => p.arquivo.endsWith('ruim.json')).erro;
  assert.match(erro, /JPEG/);
  assert.match(erro, /2 a 10/);
});

test('score e relatório', () => {
  assert.equal(score({ reach: 1000, comments: 10, shares: 5, saved: 5 }), 20);
  escrever({ posts: [{ data: '2026-10-28', tipo: 'REELS', link: 'l', primeira_linha: 'a', reach: 1000, comments: 10, shares: 5, saved: 5, score: 20 }],
    stories: [], conta: { username: 'souolucasribeiro', followers_count: 30000 } }, '2026-10-29');
  const md = readFileSync(join(raiz, 'gestao', 'RELATORIO.md'), 'utf8');
  assert.match(md, /Seguidores: \*\*30000\*\*/);
  assert.match(readFileSync(join(raiz, 'gestao', 'metricas', 'conta.csv'), 'utf8'), /2026-10-29,30000/);
});

test('normalizarQuando', () => assert.equal(normalizarQuando('2026-10-30T19:00-03:00'), '2026-10-30T19:00:00-03:00'));

// Leitura e gravação da fila (pasta fila/ na raiz do repo).
import { readdirSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = process.env.RAIZ_REPO || join(dirname(fileURLToPath(import.meta.url)), '..');
export const PASTA_FILA = join(RAIZ, 'fila');
export const PASTA_PUBLICADOS = join(RAIZ, 'gestao', 'publicados');

const VIDEO = new Set(['.mp4', '.mov']);
const IMAGEM = new Set(['.jpg', '.jpeg']);
export const TIPOS = ['REELS', 'FEED', 'CARROSSEL', 'STORY'];

export function lerFila() {
  if (!existsSync(PASTA_FILA)) return [];
  return readdirSync(PASTA_FILA)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ arquivo: join(PASTA_FILA, f), ...JSON.parse(readFileSync(join(PASTA_FILA, f), 'utf8')) }))
    .sort((a, b) => new Date(a.quando) - new Date(b.quando));
}

export function salvar(post) {
  const { arquivo, ...dados } = post;
  writeFileSync(arquivo, JSON.stringify(dados, null, 2) + '\n');
}

// Erros de preenchimento que impedem a publicação (lista vazia = ok).
export function validar(post) {
  const erros = [];
  if (!TIPOS.includes(post.tipo)) erros.push(`tipo deve ser ${TIPOS.join(', ')}`);
  if (Number.isNaN(new Date(post.quando).getTime()) || !/[+-]\d\d:\d\d$|Z$/.test(post.quando ?? '')) {
    erros.push('quando precisa de data, hora e fuso, ex.: 2026-10-30T19:00:00-03:00');
  }
  const midias = post.midias ?? [];
  if (!midias.length) erros.push('sem mídia');
  if (post.tipo === 'CARROSSEL' && (midias.length < 2 || midias.length > 10)) erros.push('carrossel tem de 2 a 10 mídias');
  if (post.tipo !== 'CARROSSEL' && midias.length > 1) erros.push('só carrossel aceita mais de uma mídia');
  for (const m of midias) {
    const ext = extname(m.split('?')[0]).toLowerCase();
    if (ext === '.png' || ext === '.webp') erros.push(`${m}: a API só aceita imagem JPEG (rode o enfileirar, que converte)`);
    else if (!VIDEO.has(ext) && !IMAGEM.has(ext)) erros.push(`${m}: formato não suportado`);
    if (!m.startsWith('http') && !existsSync(join(RAIZ, m))) erros.push(`${m}: arquivo não encontrado`);
  }
  if (post.tipo === 'REELS' && !VIDEO.has(extname(midias[0] ?? '').toLowerCase())) erros.push('reels precisa de vídeo');
  if (post.tipo !== 'STORY' && (post.legenda ?? '').length > 2200) erros.push('legenda passa de 2200 caracteres');
  return erros;
}

// Caminho do repo → { url, arquivo, video } para a API.
export function resolverMidia(m, rawBase) {
  const video = VIDEO.has(extname(m.split('?')[0]).toLowerCase());
  if (m.startsWith('http')) return { url: m, video };
  return { url: `${rawBase}/${m.split('/').map(encodeURIComponent).join('/')}`, arquivo: join(RAIZ, m), video };
}

// Move o post para gestao/publicados/AAAA-MM/ e apaga a mídia local da fila.
export function arquivar(post) {
  const mes = (post.publicadoEm ?? new Date().toISOString()).slice(0, 7);
  const destino = join(PASTA_PUBLICADOS, mes);
  mkdirSync(destino, { recursive: true });
  salvar(post);
  renameSync(post.arquivo, join(destino, basename(post.arquivo)));
  for (const m of [...(post.midias ?? []), post.capa].filter(Boolean)) {
    if (!m.startsWith('http') && m.startsWith('fila/')) rmSync(join(RAIZ, m), { force: true });
  }
}

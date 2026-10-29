// Coloca um post na fila. Converte PNG em JPEG (a API só aceita JPEG).
// Uso:
//   node enfileirar.mjs --tipo CARROSSEL --quando 2026-10-30T08:00-03:00 \
//     --legenda legenda.txt [--aprovado] [--capa capa.jpg] [--nome carrossel-teto] arquivo1.png arquivo2.png ...
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, extname, basename } from 'node:path';
import { RAIZ, PASTA_FILA, validar, TIPOS } from './fila.mjs';

function argumentos(argv) {
  const opc = { midias: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--aprovado') opc.aprovado = true;
    else if (a.startsWith('--')) opc[a.slice(2)] = argv[++i];
    else opc.midias.push(a);
  }
  return opc;
}

// Aceita "2026-10-30T08:00-03:00" e completa os segundos.
export function normalizarQuando(q) {
  return q.replace(/T(\d\d:\d\d)([+-]|Z)/, 'T$1:00$2');
}

const slug = (t) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function enfileirar(opc) {
  const tipo = (opc.tipo ?? '').toUpperCase();
  if (!TIPOS.includes(tipo)) throw new Error(`--tipo deve ser ${TIPOS.join(', ')}`);
  const quando = normalizarQuando(opc.quando ?? '');
  const nome = slug(opc.nome ?? basename(opc.midias[0] ?? 'post', extname(opc.midias[0] ?? '')));
  const id = `${quando.slice(0, 16).replace(/[-:]/g, '').replace('T', '-')}-${tipo.toLowerCase()}-${nome}`;
  const pastaMidia = join('fila', 'midia', id);
  mkdirSync(join(RAIZ, pastaMidia), { recursive: true });

  const copiar = (origem, n) => {
    const ext = extname(origem).toLowerCase();
    if (ext === '.png' || ext === '.webp') {
      const destino = join(pastaMidia, `${n}.jpg`);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', origem, '-q:v', '2', join(RAIZ, destino)]);
      return destino;
    }
    const destino = join(pastaMidia, `${n}${ext === '.jpeg' ? '.jpg' : ext}`);
    copyFileSync(origem, join(RAIZ, destino));
    return destino;
  };

  const legenda = opc.legenda && existsSync(opc.legenda) ? readFileSync(opc.legenda, 'utf8').trim() : (opc.legenda ?? '');
  const post = {
    quando,
    tipo,
    aprovado: opc.aprovado === true,
    legenda: tipo === 'STORY' ? '' : legenda,
    midias: opc.midias.map((m, i) => copiar(m, String(i + 1).padStart(2, '0'))),
  };
  if (opc.capa) post.capa = copiar(opc.capa, 'capa');
  const erros = validar(post);
  if (erros.length) throw new Error(erros.join('\n'));
  const arquivo = join(PASTA_FILA, `${id}.json`);
  writeFileSync(arquivo, JSON.stringify(post, null, 2) + '\n');
  return arquivo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(enfileirar(argumentos(process.argv.slice(2))));
}

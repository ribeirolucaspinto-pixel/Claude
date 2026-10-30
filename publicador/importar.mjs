// Importa posts cuja mídia está em URLs (ex.: artes que ficaram no Metricool).
// Cada fila/importar/<nome>.json tem { quando, tipo, legenda, aprovado, urls: [...] }.
// Baixa as URLs, passa pelo enfileirar (que converte PNG em JPEG) e apaga o arquivo de importação.
import { readdirSync, readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { RAIZ } from './fila.mjs';
import { enfileirar } from './enfileirar.mjs';

const PASTA = join(RAIZ, 'fila', 'importar');

export async function importar({ log = console } = {}) {
  if (!existsSync(PASTA)) return [];
  const feitos = [];
  for (const f of readdirSync(PASTA).filter((n) => n.endsWith('.json'))) {
    const pedido = JSON.parse(readFileSync(join(PASTA, f), 'utf8'));
    const tmp = mkdtempSync(join(tmpdir(), 'importar-'));
    try {
      const midias = [];
      for (const [i, url] of pedido.urls.entries()) {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`${url}: HTTP ${resp.status}`);
        const ext = extname(new URL(url).pathname).toLowerCase() || '.jpg';
        const destino = join(tmp, `${String(i + 1).padStart(2, '0')}${ext}`);
        writeFileSync(destino, Buffer.from(await resp.arrayBuffer()));
        midias.push(destino);
      }
      const legenda = join(tmp, 'legenda.txt');
      writeFileSync(legenda, pedido.legenda ?? '');
      const arquivo = enfileirar({
        tipo: pedido.tipo, quando: pedido.quando, legenda, aprovado: pedido.aprovado === true,
        nome: basename(f, '.json'), midias,
      });
      rmSync(join(PASTA, f));
      log.log(`importado: ${f} -> ${arquivo}`);
      feitos.push(arquivo);
    } catch (e) {
      log.error(`falhou ${f}: ${e.message}`);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
  return feitos;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await importar();
}

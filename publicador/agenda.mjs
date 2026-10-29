// Gera gestao/AGENDA.md: o que está na fila e os últimos publicados.
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { lerFila, PASTA_PUBLICADOS, RAIZ } from './fila.mjs';

const hora = (iso) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
const resumo = (t = '') => t.split('\n')[0].replace(/\|/g, '/').slice(0, 70);

export function gerarAgenda() {
  const linhas = ['# Agenda do Instagram', '', `Atualizado em ${hora(new Date().toISOString())}.`, '', '## Na fila', '',
    '| Quando | Tipo | Aprovado | Status | Primeira linha |', '|---|---|---|---|---|'];
  for (const p of lerFila()) {
    const status = p.status === 'erro' ? `erro: ${resumo(p.erro)}` : 'aguardando';
    linhas.push(`| ${hora(p.quando)} | ${p.tipo} | ${p.aprovado ? 'sim' : 'NÃO'} | ${status} | ${resumo(p.legenda)} |`);
  }
  const publicados = [];
  if (existsSync(PASTA_PUBLICADOS)) {
    for (const mes of readdirSync(PASTA_PUBLICADOS).sort().reverse().slice(0, 2)) {
      for (const f of readdirSync(join(PASTA_PUBLICADOS, mes))) {
        publicados.push(JSON.parse(readFileSync(join(PASTA_PUBLICADOS, mes, f), 'utf8')));
      }
    }
  }
  publicados.sort((a, b) => new Date(b.publicadoEm) - new Date(a.publicadoEm));
  linhas.push('', '## Publicados recentes', '', '| Publicado | Tipo | Link | Primeira linha |', '|---|---|---|---|');
  for (const p of publicados.slice(0, 30)) {
    linhas.push(`| ${hora(p.publicadoEm)} | ${p.tipo} | ${p.permalink ?? p.id} | ${resumo(p.legenda)} |`);
  }
  mkdirSync(join(RAIZ, 'gestao'), { recursive: true });
  writeFileSync(join(RAIZ, 'gestao', 'AGENDA.md'), linhas.join('\n') + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) gerarAgenda();

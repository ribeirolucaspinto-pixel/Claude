// Publica o que está vencido na fila. Roda a cada 15 min pelo GitHub Actions.
// Só publica post com "aprovado": true.
import { criarIg } from './ig.mjs';
import { lerFila, salvar, validar, resolverMidia, arquivar } from './fila.mjs';
import { gerarAgenda } from './agenda.mjs';

const MAX_TENTATIVAS = 3;

export async function rodar({ ig, agora = new Date(), rawBase, log = console } = {}) {
  const resumo = { publicados: [], erros: [], aguardando: 0 };
  for (const post of lerFila()) {
    if (post.status === 'erro' && (post.tentativas ?? 0) >= MAX_TENTATIVAS) continue;
    if (new Date(post.quando) > agora) { resumo.aguardando++; continue; }
    if (post.aprovado !== true) { log.log(`- ${post.arquivo}: vencido, mas sem aprovação`); continue; }

    const erros = validar(post);
    if (erros.length) {
      Object.assign(post, { status: 'erro', erro: erros.join('; '), tentativas: MAX_TENTATIVAS });
      salvar(post);
      resumo.erros.push(post);
      continue;
    }
    try {
      const { id, permalink } = await ig.publicar({
        tipo: post.tipo,
        legenda: post.legenda ?? '',
        midias: post.midias.map((m) => resolverMidia(m, rawBase)),
        capaUrl: post.capa ? resolverMidia(post.capa, rawBase).url : undefined,
        capaMs: post.capaMs,
        compartilharNoFeed: post.compartilharNoFeed,
        colaboradores: post.colaboradores?.length ? post.colaboradores : undefined,
      });
      Object.assign(post, { status: 'publicado', id, permalink, publicadoEm: new Date().toISOString(), erro: undefined });
      arquivar(post);
      resumo.publicados.push(post);
      log.log(`✓ ${post.tipo} publicado: ${permalink ?? id}`);
    } catch (e) {
      Object.assign(post, { status: 'erro', erro: e.message, tentativas: (post.tentativas ?? 0) + 1 });
      salvar(post);
      resumo.erros.push(post);
      log.error(`✗ ${post.arquivo}: ${e.message}`);
    }
  }
  return resumo;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { IG_TOKEN, IG_USER_ID, GITHUB_REPOSITORY, GITHUB_SHA } = process.env;
  if (!IG_TOKEN || !IG_USER_ID) {
    console.log('IG_TOKEN e IG_USER_ID ainda não configurados; nada a fazer.');
    process.exit(0);
  }
  const rawBase = process.env.RAW_BASE || `https://raw.githubusercontent.com/${GITHUB_REPOSITORY}/${GITHUB_SHA}`;
  const ig = criarIg({ token: IG_TOKEN, igUserId: IG_USER_ID });
  const resumo = await rodar({ ig, rawBase });
  gerarAgenda();
  console.log(`publicados ${resumo.publicados.length}, erros ${resumo.erros.length}, na fila ${resumo.aguardando}`);
  if (resumo.erros.length) process.exitCode = 1; // o GitHub manda e-mail quando falha
}

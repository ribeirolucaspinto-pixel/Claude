// Diagnóstico do acesso à API (só leitura): mostra o que a Meta responde para o token atual.
import { hostDoToken, VERSAO } from './ig.mjs';

const token = process.env.IG_TOKEN ?? '';
const id = process.env.IG_USER_ID ?? '';
const base = `https://${hostDoToken(token)}/${VERSAO}`;
console.log(`tipo de token: ${token.slice(0, 3)}… host ${hostDoToken(token)} id ${id}`);
const testes = [
  ['me', { fields: 'id,username,account_type' }],
  [id, { fields: 'id,username,media_count' }],
  [`${id}/content_publishing_limit`, { fields: 'config,quota_usage' }],
  [`${id}/media`, { fields: 'id,timestamp,permalink', limit: '3' }],
];
for (const [caminho, params] of testes) {
  const url = new URL(`${base}/${caminho}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  console.log(`GET ${caminho}: ${r.status} ${(await r.text()).slice(0, 600)}`);
}

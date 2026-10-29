// Renova o token de longa duração (vale 60 dias; renovar com pelo menos 24h de idade).
// Escreve o token novo em arquivo para o workflow gravar no secret IG_TOKEN.
import { writeFileSync } from 'node:fs';

const atual = process.env.IG_TOKEN;
if (!atual) { console.log('IG_TOKEN não configurado.'); process.exit(0); }
if (atual.startsWith('EAA')) {
  // Token de página gerado de um token de usuário de longa duração não expira.
  console.log('token do login do Facebook (página): não precisa renovar.');
  process.exit(0);
}
const url = new URL('https://graph.instagram.com/refresh_access_token');
url.searchParams.set('grant_type', 'ig_refresh_token');
url.searchParams.set('access_token', atual);
const r = await fetch(url);
const json = await r.json().catch(() => ({}));
if (!r.ok || !json.access_token) {
  console.error(`não consegui renovar o token: ${r.status} ${JSON.stringify(json.error ?? json)}`);
  process.exit(1);
}
console.log(`::add-mask::${json.access_token}`);
writeFileSync(process.argv[2] || 'token-novo.txt', json.access_token);
console.log(`token renovado; vale mais ${Math.round(json.expires_in / 86400)} dias`);

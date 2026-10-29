// Cliente mínimo da Instagram API com login do Instagram (graph.instagram.com).
// Permissões do app: instagram_business_basic, instagram_business_content_publish,
// instagram_business_manage_insights.

import { readFileSync, statSync } from 'node:fs';

export const VERSAO = process.env.GRAPH_VERSION || 'v23.0';

export function criarIg({ token, igUserId, fetchImpl = fetch, esperar = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  const base = `https://graph.instagram.com/${VERSAO}`;

  async function chamar(caminho, { method = 'GET', params = {} } = {}) {
    const url = new URL(caminho.startsWith('http') ? caminho : `${base}/${caminho}`);
    const corpo = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v === undefined || v === null) continue;
      (method === 'GET' ? url.searchParams : corpo).set(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
    }
    const r = await fetchImpl(url, {
      method,
      headers: { Authorization: `Bearer ${token}` },
      body: method === 'GET' ? undefined : corpo,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.error) {
      throw new Error(`Instagram ${method} ${caminho}: ${r.status} ${JSON.stringify(json.error ?? json)}`);
    }
    return json;
  }

  // Envia o vídeo direto do arquivo (não precisa de URL pública).
  async function enviarVideo(containerId, arquivo) {
    const dados = readFileSync(arquivo);
    const r = await fetchImpl(`https://rupload.facebook.com/ig-api-upload/${VERSAO}/${containerId}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, offset: '0', file_size: String(statSync(arquivo).size) },
      body: dados,
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok || json.success === false) throw new Error(`upload do vídeo: ${r.status} ${JSON.stringify(json)}`);
  }

  // Espera o container ficar pronto (vídeo leva de segundos a alguns minutos).
  async function aguardar(containerId, { tentativas = 60, intervaloMs = 10_000 } = {}) {
    for (let i = 0; i < tentativas; i++) {
      const { status_code, status } = await chamar(containerId, { params: { fields: 'status_code,status' } });
      if (status_code === 'FINISHED' || status_code === 'PUBLISHED') return;
      if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`container ${containerId}: ${status_code} ${status ?? ''}`);
      await esperar(intervaloMs);
    }
    throw new Error(`container ${containerId} não ficou pronto a tempo`);
  }

  // midia: { url } (imagem JPEG ou vídeo em URL pública) ou { arquivo } (vídeo local)
  // Reels sobem do arquivo (resumable); as demais mídias vão por URL pública.
  async function container(params, midia, video) {
    const p = { ...params };
    const resumable = video && params.media_type === 'REELS' && midia.arquivo;
    if (video) {
      if (resumable) p.upload_type = 'resumable';
      else p.video_url = midia.url;
    } else {
      p.image_url = midia.url;
    }
    const { id } = await chamar(`${igUserId}/media`, { method: 'POST', params: p });
    if (resumable) await enviarVideo(id, midia.arquivo);
    return id;
  }

  return {
    chamar,
    aguardar,

    async publicar(post) {
      const { tipo, legenda, midias } = post;
      let criacao;
      if (tipo === 'CARROSSEL') {
        const filhos = [];
        for (const m of midias) {
          const video = m.video;
          const id = await container({ is_carousel_item: true, media_type: video ? 'VIDEO' : undefined }, m, video);
          filhos.push(id);
        }
        for (const id of filhos) await aguardar(id);
        criacao = (await chamar(`${igUserId}/media`, {
          method: 'POST',
          params: { media_type: 'CAROUSEL', children: filhos.join(','), caption: legenda, collaborators: post.colaboradores },
        })).id;
      } else if (tipo === 'REELS') {
        criacao = await container({
          media_type: 'REELS',
          caption: legenda,
          share_to_feed: post.compartilharNoFeed ?? true,
          cover_url: post.capaUrl,
          thumb_offset: post.capaMs,
          collaborators: post.colaboradores,
        }, midias[0], true);
      } else if (tipo === 'STORY') {
        const m = midias[0];
        criacao = await container({ media_type: 'STORIES' }, m, m.video);
      } else if (tipo === 'FEED') {
        const m = midias[0];
        criacao = await container({ caption: legenda, media_type: m.video ? 'REELS' : undefined, collaborators: post.colaboradores }, m, m.video);
      } else {
        throw new Error(`tipo desconhecido: ${tipo}`);
      }
      await aguardar(criacao);
      const { id } = await chamar(`${igUserId}/media_publish`, { method: 'POST', params: { creation_id: criacao } });
      let permalink = null;
      try { permalink = (await chamar(id, { params: { fields: 'permalink' } })).permalink ?? null; } catch {}
      return { id, permalink };
    },

    async cota() {
      const { data } = await chamar(`${igUserId}/content_publishing_limit`, { params: { fields: 'quota_usage,config' } });
      return data?.[0] ?? null;
    },
  };
}

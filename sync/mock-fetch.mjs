// 測試用：取代 fetch，假裝成 YouTube / GitHub / AniList，讓 run.mjs 能完整跑過。
import { zstdCompressSync } from 'node:zlib';

const V = { // id: [標題, 秒, 額外欄位]
  a1: ['某部動畫 EP1', 1440], a2: ['某部動畫 EP2', 1440], a3: ['【會員搶先看】某部動畫 EP3', 1440],
  pvA: ['某部動畫 PV', 90], mem1: ['#ULTRA會員搶先看《某部動畫》#3', 1440], a4: ['不可說 EP1', 1440],
  movieA: ['劇場版 某不可說的電影', 6000], liveA: ['直播中', 3000, { live: 'live' }],
  blockA: ['某部動畫 EP4', 1440, { rr: { blocked: ['TW'] } }], noEmb: ['某部動畫 EP5', 1440, { emb: false }],
  b1: ['《仙逆》Renegade Immortal EP 1 | 腾讯视频', 1400], b2: ['《仙逆》Renegade Immortal EP 2 | 腾讯视频', 1400], bt: ['EP3 Trailer 预告｜《仙逆》', 60],
};
const LISTS = {
  UUtestA: ['a1', 'a2', 'a3', 'pvA', 'mem1', 'a4', 'movieA', 'liveA', 'blockA', 'noEmb'],
  UUMOtestA: ['mem1'],
  UUtestB: ['b1', 'b2', 'bt'],
  plA1: ['a2', 'a1', 'pvA', 'mem1', 'a3', 'blockA', 'noEmb'], plA2: ['a1'], plA3: ['a4'],
  plB: ['b1', 'b2', 'bt'],
};
const PLAYLISTS = {
  UCtestA: [['plA1', '某部動畫【Ani-One】'], ['plA2', '週邊精品'], ['plA3', '不可說【Ani-One】']],
  UCtestB: [['plB', '《仙逆》Renegade Immortal | 腾讯视频 - 动漫']],
};
const DATASET = [
  { title: 'Some Anime', type: 'TV', synonyms: ['某部動畫'], animeSeason: { year: 2024, season: 'SPRING' }, status: 'FINISHED', episodes: 12, sources: ['https://anilist.co/anime/100'] },
  { title: 'Renegade Immortal', type: 'ONA', synonyms: ['仙逆'], animeSeason: { year: 2023, season: 'FALL' }, status: 'RELEASING', episodes: null, sources: ['https://anilist.co/anime/200'] },
  { title: 'Forbidden', type: 'TV', synonyms: ['不可說'], animeSeason: { year: 2020, season: 'WINTER' }, sources: ['https://anilist.co/anime/300'] },
];
const ANILIST = [
  { id: 100, countryOfOrigin: 'JP', format: 'TV', status: 'FINISHED', episodes: 12, season: 'SPRING', seasonYear: 2024, averageScore: 81, popularity: 5000, trending: 10, genres: ['Action', 'Isekai-not-a-genre'], description: '一段<br>簡介', bannerImage: 'b.jpg', coverImage: { large: 'c.jpg' }, tags: [{ name: 'Isekai', rank: 80, isMediaSpoiler: false }, { name: 'School', rank: 30, isMediaSpoiler: false }] },
  { id: 200, countryOfOrigin: 'CN', format: 'ONA', status: 'RELEASING', episodes: null, season: 'FALL', seasonYear: 2023, averageScore: 85, popularity: 9000, trending: 50, genres: ['Fantasy'], description: null, bannerImage: null, coverImage: { large: 'd.jpg' }, tags: [] },
  { id: 300, countryOfOrigin: 'JP', format: 'TV', status: 'FINISHED', episodes: 1, season: 'WINTER', seasonYear: 2020, averageScore: 50, popularity: 1, trending: 0, genres: ['Hentai'], description: '', bannerImage: null, coverImage: { large: 'e.jpg' }, tags: [] },
];

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const page = (ids, tok) => { const i = Number(tok ?? 0); return { items: ids.slice(i, i + 3).map((id) => ({ contentDetails: { videoId: id } })), ...(i + 3 < ids.length && { nextPageToken: String(i + 3) }) }; };

globalThis.fetch = async (url, init) => {
  const u = new URL(url);
  if (u.hostname === 'github.com') return new Response(zstdCompressSync(Buffer.from(JSON.stringify({ data: DATASET }))));
  if (u.hostname === 'graphql.anilist.co') return json({ data: { Page: { media: ANILIST } } });
  const p = u.searchParams, route = u.pathname.split('/').pop();
  if (route === 'playlistItems') { const l = LISTS[p.get('playlistId')]; return l ? json(page(l, p.get('pageToken'))) : json({}, 404); }
  if (route === 'playlists') return json({ items: (PLAYLISTS[p.get('channelId')] ?? []).map(([id, title]) => ({ id, snippet: { title }, contentDetails: { itemCount: LISTS[id].length } })) });
  if (route === 'videos') {
    return json({ items: p.get('id').split(',').filter((id) => V[id]).map((id) => {
      const [title, sec, x = {}] = V[id];
      return { id, snippet: { title, publishedAt: '2026-01-0' + (1 + (id.charCodeAt(1) % 8)) + 'T00:00:00Z', liveBroadcastContent: x.live ?? 'none' },
        status: { embeddable: x.emb ?? true }, contentDetails: { duration: `PT${Math.floor(sec / 60)}M${sec % 60}S`, ...(x.rr && { regionRestriction: x.rr }) }, statistics: { viewCount: '100' } };
    }) });
  }
  return json({ error: { message: 'mock: ' + url } }, 500);
};

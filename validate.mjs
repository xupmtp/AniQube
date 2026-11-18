// AniQube 動工前驗證：找片源頻道、測會員限定偵測、抽樣檢查可播條件、列出所有播放清單標題供對應測試。
// 用法（Node 18 以上，免安裝套件）：
//   macOS / Linux:  YOUTUBE_API_KEY=你的金鑰 node validate.mjs > results.json
//   Windows (PowerShell):  $env:YOUTUBE_API_KEY="你的金鑰"; node validate.mjs > results.json
// 輸出不含金鑰。預估用量：搜尋 4 次、其他約 100 單位。

const KEY = process.env.YOUTUBE_API_KEY;
if (!KEY) { console.error('請先設定環境變數 YOUTUBE_API_KEY'); process.exit(1); }

const API = 'https://www.googleapis.com/youtube/v3/';
const QUERIES = { muse: 'Muse木棉花-TW', anione: 'Ani-One中文官方動畫頻道', youku: '優酷動漫', iqiyi: '愛奇藝動漫' };

async function yt(path, params) {
  const url = new URL(path, API);
  for (const [k, v] of Object.entries({ ...params, key: KEY })) url.searchParams.set(k, v);
  const r = await fetch(url);
  const j = await r.json();
  if (!r.ok) return { error: { status: r.status, reason: j.error?.errors?.[0]?.reason, message: j.error?.message } };
  return j;
}

async function all(path, params, maxPages = 40) {
  const items = [];
  let pageToken;
  for (let i = 0; i < maxPages; i++) {
    const j = await yt(path, { ...params, maxResults: 50, ...(pageToken && { pageToken }) });
    if (j.error) return { error: j.error, items };
    items.push(...j.items);
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return { items };
}

async function videoDetails(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 50) {
    const j = await yt('videos', { part: 'snippet,status,contentDetails', id: ids.slice(i, i + 50).join(',') });
    if (j.error) return { error: j.error, items: out };
    out.push(...j.items.map(v => {
      const rr = v.contentDetails.regionRestriction;
      return {
        id: v.id,
        title: v.snippet.title,
        duration: v.contentDetails.duration,
        embeddable: v.status.embeddable,
        privacy: v.status.privacyStatus,
        live: v.snippet.liveBroadcastContent,
        ageRestricted: v.contentDetails.contentRating?.ytRating === 'ytAgeRestricted',
        twBlocked: !!rr && ((rr.blocked ?? []).includes('TW') || (rr.allowed && !rr.allowed.includes('TW'))),
      };
    }));
  }
  return { items: out };
}

async function inspectChannel(ch) {
  const id = ch.id;
  const playlists = await all('playlists', { part: 'snippet,contentDetails', channelId: id });

  // 會員限定偵測：非官方慣例，UUMO 開頭的清單只含會員限定影片
  const membersProbe = await yt('playlistItems', { part: 'contentDetails', playlistId: 'UUMO' + id.slice(2), maxResults: 50 });
  const memberIds = membersProbe.items?.map(i => i.contentDetails.videoId) ?? [];

  // 抽樣：最大的 5 個清單各取前 50 集，加上最新 50 支上傳
  const biggest = [...(playlists.items ?? [])].sort((a, b) => b.contentDetails.itemCount - a.contentDetails.itemCount).slice(0, 5);
  const sampleIds = new Set();
  for (const p of biggest) {
    const j = await yt('playlistItems', { part: 'contentDetails', playlistId: p.id, maxResults: 50 });
    j.items?.forEach(i => sampleIds.add(i.contentDetails.videoId));
  }
  const uploads = await yt('playlistItems', { part: 'contentDetails', playlistId: ch.contentDetails.relatedPlaylists.uploads, maxResults: 50 });
  const uploadIds = uploads.items?.map(i => i.contentDetails.videoId) ?? [];

  return {
    id,
    title: ch.snippet.title,
    customUrl: ch.snippet.customUrl,
    country: ch.snippet.country,
    subscribers: ch.statistics.subscriberCount,
    videoCount: ch.statistics.videoCount,
    playlistsError: playlists.error,
    playlists: (playlists.items ?? []).map(p => ({ id: p.id, title: p.snippet.title, itemCount: p.contentDetails.itemCount, publishedAt: p.snippet.publishedAt })),
    membersProbe: { error: membersProbe.error, totalResults: membersProbe.pageInfo?.totalResults, videos: (await videoDetails(memberIds.slice(0, 10))).items },
    playlistSample: await videoDetails([...sampleIds]),
    latestUploads: await videoDetails(uploadIds),
  };
}

const result = { ranAt: new Date().toISOString(), channels: {} };
for (const [key, q] of Object.entries(QUERIES)) {
  const s = await yt('search', { part: 'snippet', type: 'channel', q, maxResults: 5, regionCode: 'TW' });
  if (s.error) { result.channels[key] = { query: q, error: s.error }; continue; }
  const ids = s.items.map(i => i.id.channelId);
  const c = await yt('channels', { part: 'snippet,statistics,contentDetails', id: ids.join(',') });
  if (c.error) { result.channels[key] = { query: q, error: c.error }; continue; }
  const candidates = c.items.sort((a, b) => Number(b.statistics.subscriberCount ?? 0) - Number(a.statistics.subscriberCount ?? 0));
  console.error(`[${key}] 檢查 ${candidates[0]?.snippet.title}`);
  result.channels[key] = {
    query: q,
    candidates: candidates.map(ch => ({ id: ch.id, title: ch.snippet.title, customUrl: ch.snippet.customUrl, subscribers: ch.statistics.subscriberCount })),
    picked: candidates[0] ? await inspectChannel(candidates[0]) : null,
  };
}
console.log(JSON.stringify(result, null, 2));
console.error('完成，請把 results.json 傳回來');

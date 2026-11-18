# AniQube (動漫立方)

[繁體中文](README.md) | **English**

A Netflix-style anime browsing site. Every video comes from official YouTube channels (Muse Communication Taiwan, Ani-One Asia's Chinese channel, and Tencent Video Animation) and is only played through the embedded YouTube player. It is a fully static site: no backend and no database.

Site: <https://xupmtp.github.io/AniQube/>

## How it works
Every day GitHub Actions runs `npm run sync`. It uses the YouTube Data API to fetch the playlists of the three channels, matches them to AniList entries, and writes JSON files under `public/data/`. The data is committed, then the site is built and deployed to GitHub Pages. The browser only reads these JSON files; search, filtering and sorting all happen client-side.

For the full picture (architecture, what each module does, data formats and the sync pipeline) see [docs/architecture.html](docs/architecture.html) (in Traditional Chinese).

## First-time setup
1. Create a public GitHub repo and push everything; in Settings → Pages → Source, choose GitHub Actions.
2. In Settings → Secrets and variables → Actions, add `YOUTUBE_API_KEY`.
3. Set `REPO_URL` in `src/config.ts` to your repo.
4. On the Actions page, run the `sync-and-deploy` workflow manually.

## Local development
Requires Node 22.15 or later.
```
npm install
YOUTUBE_API_KEY=your-key npm run sync   # about 3,000 quota units; the daily limit is 10,000
npm run rebuild   # after changing rules: reuse the last fetched YouTube data, no quota or key needed
npm run dev
npm test
```
The API key is only read from the `YOUTUBE_API_KEY` environment variable; it never appears in code or config files.

## Tuning
- `public/data/report.json`: report of each sync. `unmatched` lists playlists with no AniList match; `guessed` lists matches that were inferred (worth spot-checking).
- `manual-matches.json`: `{"playlistId": anilistId}` to set a match by hand; `null` means intentionally unmatched. Manual entries win over automatic ones.
- `manual-works.json`: `{"playlistId": "work title"}` to assign a playlist to a work by hand (automatically, playlists are grouped when their titles match after removing season numbers and dub labels).
- `sources.json`: channels, length thresholds, and the regular expressions for excluded titles and members-only markers.
- `sync/taxonomy.mjs`: Chinese names for genres and tags.

## License
Code is MIT. Title matching uses anime-offline-database (ODbL-1.0); AniList data is used under its terms. Video copyrights belong to the respective channels.

# Motor City Atlas

An unofficial, interactive 3D model of the 2026 Detroit Lions roster. Every player stands where the depth chart puts him, scaled to his listed height and build, and opens into a full dossier: statistics, league percentile ranks, contract and cap numbers, sourced background, headlines and an AI assistant that answers questions from the same data.

This is an independent fan project. It is not affiliated with or endorsed by the Detroit Lions, the NFL or any data provider, and it uses no official logos or photography.

## What is in it

- **3D field** — offense and defense lined up across the line of scrimmage, backups in waves behind the starters, reserve lists and practice squad on the sidelines.
- **Data lenses** — re-color the roster and raise each player on a column for cap number, snap share, league-percentile index, age, years of contract control, or this week's health report.
- **Player dossier** — season-by-season and game-by-game stats, situational splits, Next Gen Stats and charting history, percentile ranks against qualified players at the position, a pass/target/run tendency map that can be painted onto the 3D turf, combine results, signature plays, year-by-year contract breakdown, Wikipedia background and family links, and headlines.
- **Team views** — this week's matchup (ranks on both sides of the ball, projection, injuries, series history), the season (results with win-probability stories, standings, playoff picture), the salary cap, the health report, transactions, and a sources page.
- **Ask** — a question box, per player or for the whole team, answered by Claude from the site's own data files.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

The site reads static JSON from `public/data`. A snapshot is committed, so it runs without rebuilding the data.

## Refreshing the data

```bash
npm run data        # rebuild public/data from the live sources
npm run data:check  # sanity-check the result
```

`npm run data` writes nothing when the content has not changed. `.github/workflows/refresh-data.yml` runs both commands on a schedule (every three hours, and every 30 minutes around games) and commits when something moved, which triggers a redeploy. Scheduled workflows only run from a repository's default branch.

The data script starts Node with `--use-env-proxy`, so it also works behind an HTTP proxy such as a Claude Code cloud session. That flag needs Node 22.21 or newer.

| Source | Used for |
| --- | --- |
| [nflverse](https://github.com/nflverse/nflverse-data) | Player and team statistics, snap counts, play-by-play, Next Gen Stats, combine and draft records, schedule and results |
| OverTheCap, via nflverse | Contract terms and year-by-year cap figures |
| Pro Football Reference, via nflverse | Charting statistics and snap counts |
| ESPN | Current roster, depth chart, injuries, standings, matchup projection, headlines |
| Wikipedia (CC BY-SA 4.0) and Wikidata (CC0) | Biographical background, family links, official social accounts |

Deliberately not included: PFF grades (a licensed product — each player links to his PFF page), rumors or unsourced claims about players' private lives, details about players' children, and official team marks or photographs.

## The Ask feature

`api/ask.ts` is a serverless function that streams an answer from the Claude API, grounded in `public/data/ask-team.json` and the selected player's dossier. It needs one server-side environment variable:

| Variable | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | Required. Without it the endpoint returns 503 and the site shows a notice; everything else keeps working. |
| `ASK_MODEL` | Optional. Defaults to `claude-opus-5-5`. |
| `ASK_EFFORT` | Optional. `low` (default), `medium` or `high`. |

Each question sends the team file and one dossier to the model (prompt caching keeps repeat questions cheap), so a busy public site has a real per-question cost. The function has a simple per-visitor rate limit; put a rate-limit rule in front of `/api/ask` on the host as well, and set a spend limit on the API key.

## Layout

```
api/            serverless functions (Ask)
pipeline/       data build: nflverse, ESPN, Wikipedia/Wikidata -> public/data
public/data/    generated JSON the site reads
src/scene/      three.js scene: stadium, player figures, camera, field overlays
src/ui/         HUD, dossier, team panels, charts, Ask
src/lib/        layout of the depth chart, data lenses, formatting
```

## Deploying

The project is a Vite single-page app plus one function in `/api`; `vercel.json` configures the build, the SPA routes (`/player/:slug`, `/team/:panel`) and caching. Set `ANTHROPIC_API_KEY` in the host's environment settings to switch the Ask feature on.

### As a Claude artifact

```bash
npm run build:artifact   # writes dist-artifact/: page.html plus assets/ and data/
```

This packages the same app for publishing as a Claude artifact: asset and data paths are relative, links use the hash (`#p-<slug>`, `#t-<panel>`) because an artifact cannot own URL paths, and Ask runs through the viewer's own Claude account instead of `/api/ask`, so it needs no API key. `dist-artifact/files.json` lists the supporting files to publish alongside `page.html`. An artifact is a snapshot: it shows the data as of the build, and is refreshed by building and publishing again.

# NexusGram Mini App — Fix notes (2026-11-08)

## Root cause of Error 1101
`EMBEDDED_APP_CSS` string was never closed.  
`EMBEDDED_APP_HTML`, `LOGO_WEBP_B64`, and all server helper functions were accidentally nested **inside** the CSS string.

Result: at runtime `EMBEDDED_APP_HTML` was `undefined` → `ReferenceError` when serving `/` → Cloudflare **Error 1101 Worker threw exception**.

## What was fixed
1. Properly closed CSS string and restored top-level:
   - `EMBEDDED_APP_HTML`
   - `LOGO_WEBP_B64`
   - helper functions (`auth`, `getUser`, `indiaDay`, etc.)
2. Wrapped `handle()` in try/catch so future errors return JSON 500 instead of 1101.
3. Monetag postback now:
   - Enforces **1000 rewarded ads / user / day** (24h window + IST day)
   - Checks `ads_enabled` admin switch
   - Blocks banned users
   - Auto-creates user row if missing
4. Static assets (`/`, `/app.js`, `/app.css`) now use short browser cache for faster reloads.
5. Ad reward history UI already uses SVG icons (shield / reward style).

## Monetag Postback URL

Set this in Monetag dashboard (Reward / Postback URL):

```
https://nexusgram-mini-app.rajtilakbbu1.workers.dev/api/monetag/postback?secret=YOUR_MONETAG_POSTBACK_SECRET&ymid={ymid}&event_type={event_type}&reward_event_type={reward_event_type}&zone_id={zone_id}&sub_zone_id={sub_zone_id}&request_var={request_var}&estimated_price={estimated_price}&telegram_id={telegram_id}
```

### Required Cloudflare Worker secrets / vars
| Name | Purpose |
|------|---------|
| `MONETAG_POSTBACK_SECRET` | Shared secret in `?secret=` (must match) |
| `BOT_TOKEN` | Telegram bot token |
| `ADMIN_IDS` | Comma-separated Telegram admin IDs |
| `DB` | D1 database binding |
| `ads_enabled` | Admin setting `1` to allow rewards |

Optional: pass `telegram_id` in postback, or use `ymid` format `nxg-{telegramId}-{random}`.

### Limits
- **1000** valued ad rewards per user per day (hard-coded)
- Day boundary uses IST (`indiaDay`)
- Monetag + AdsGram legacy claims both count toward the same 1000

## Deploy
1. Upload `src/worker.js` + `src/admin.js` to your Worker (or full folder).
2. Ensure D1 binding name is `DB`.
3. Set `MONETAG_POSTBACK_SECRET` in Worker secrets.
4. Enable ads: Telegram admin → `/set ads_enabled 1`
5. Hit `https://nexusgram-mini-app.rajtilakbbu1.workers.dev/health` → should return `{"ok":true,...}`

## Test postback (replace SECRET)
```
curl "https://nexusgram-mini-app.rajtilakbbu1.workers.dev/api/monetag/postback?secret=SECRET&ymid=nxg-123456789-test1&event_type=click&reward_event_type=valued&zone_id=1&sub_zone_id=1&request_var=test&estimated_price=0.01&telegram_id=123456789"
```

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

## UI Polish (2026-11-08) — Rewarded Ads section

- Completely redesigned **Watch & Earn** card: reward highlight, daily progress bar, cleaner CTA.
- Professional empty / error states for **Ad Reward History** with SVG icons.
- When Monetag SDK is not loaded (`show_12178167` missing), the card switches to an error state with warning icon + clear message instead of only a toast.
- History refresh is now a compact icon button in the section header.
- Progress bar updates from `/api/ad-history` count (used / 1000).

**Important:** Ensure the Monetag SDK script tag is present in the HTML `<head>` (from your Monetag dashboard), e.g.:

```html
<script src="https://YOUR-MONETAG-DOMAIN/sdk.js" data-zone="12178167" data-sdk="show_12178167"></script>
```

Without it, the "Ad network not ready" state will appear.


## Admin UI & Wallet fixes (2026-11-08)

1. **Admin panel isolation** — ON/OFF switches and admin controls only render for admins inside the Admin page (not visible to regular users). Fixed broken `admin-links-panel` markup that could leak UI.
2. **Admin energy control** — Admin panel has ENERGY CONTROLS: set default max energy for new users (`start_energy`), and set any user's energy+max by Telegram ID.
3. **Typography** — Admin grid labels/inputs and switch buttons use readable sizes (no 7px overlap).
4. **TON Connect** — Fixed connector box for Telegram Wallet / Tonkeeper sign-in; wallet address fills the withdrawal field after connect.
5. **Real NXG withdrawal** — Submit still locks NXG and creates a pending request; payout goes to the connected TON address after admin approval (on-chain send from treasury). Copy updated to reflect real TON payout flow.
6. **isAdmin** — Client trusts server `config.isAdmin` from `ADMIN_IDS` (removed single hardcoded owner ID).

### Admin: set user energy
- Mini App → Admin Panel → ENERGY CONTROLS → enter Telegram ID + value → SET THIS USER ENERGY  
- Or bot: use settings `start_energy` via `/set start_energy 2000`


## Referral link + speed (2026-11-08)

### Referral
- Invite link format: `https://t.me/<BOT>?startapp=nxg_ref_<telegramId>`
- Optional named mini-app: set Worker var `MINI_APP_SHORT_NAME` → `https://t.me/<BOT>/<short>?startapp=nxg_ref_<id>`
- Server accepts `nxg_ref_ID` or plain `ID` in `start_param`
- Squad page shows the full invite link; Copy / Share improved
- Set `BOT_USERNAME` Worker var to your real bot username (without @)

### Speed
- Session `refreshed()` runs DB reads in parallel (`Promise.all`)
- Schema bootstrap once per isolate (no CREATE TABLE every request)
- Admin settings cached ~15s in memory
- Secondary loads (missions, ad history) deferred after first paint
- Static `/app.js` + `/app.css` cache 10 minutes


## Automatic NXG TON payout (treasury)

When a user submits a withdrawal (≥ minimum), the worker can **automatically send NXG jettons** from your Tonkeeper treasury wallet.

### Cloudflare Worker secrets / vars
| Name | Required | Description |
|------|----------|-------------|
| `TREASURY_MNEMONIC` | Yes (auto-pay) | 24-word seed of the wallet that **holds NXG** (keep secret!) |
| `NXG_JETTON_MASTER` | Yes | Your NXG jetton master contract address (`EQ...`) |
| `NXG_DECIMALS` | No | Default `9` |
| `TON_API_KEY` | Recommended | toncenter.com or tonapi key |
| `TON_ENDPOINT` | No | Default `https://toncenter.com/api/v2/jsonRPC` |
| `AUTO_WITHDRAWALS` | No | `1` to force auto even before admin setting |
| `NXG_TRANSFER_GAS` | No | TON for gas per send, default `0.06` |

### Admin toggle
- Mini App Admin Panel → **Auto TON payout** ON/OFF  
- Or `/set auto_withdrawals 1`

### Deploy with packages
```bash
cd nexusgram-mini-app-main
npm install
npx wrangler deploy
```

Treasury wallet must hold enough **NXG jettons** + a little **TON** for gas.

If auto-pay fails (RPC/gas/balance), request stays `pending` for manual approve in Telegram bot (`/withdrawals`). Approve will retry on-chain send.

**Security:** Never put `TREASURY_MNEMONIC` in the Mini App client or public repo. Only Worker secrets.


### Your mainnet addresses (configured as defaults)
- **NXG Jetton master:** `EQDkKFt5FCNAocxdDmxKBKv0gca5P8FyicTzdcGJwyzvNVcO`
- **Treasury wallet (must match mnemonic):** `UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c`

Set Worker secrets:
```
NXG_JETTON_MASTER=EQDkKFt5FCNAocxdDmxKBKv0gca5P8FyicTzdcGJwyzvNVcO
TREASURY_WALLET_ADDRESS=UQAmNEgAkUaJFRKF0wLeqrbKbpGlTtdTWzT_YoCEowW-ob2c
TREASURY_MNEMONIC=<24 words of the treasury Tonkeeper wallet only>
TON_API_KEY=<toncenter key>
```


## Critical UI fix (2026-11-08)

### Root cause of white boxes / broken bottom nav / visible `\n`
The embedded `EMBEDDED_APP_HTML` string was **partially double-escaped** from the admin panel section onward (`style=\"..."`, `\n` as text). Browsers treated attributes as broken → bottom nav and lower UI rendered as blank/white blocks, and literal `\n` could appear on screen.

### What was fixed
1. Unescaped the corrupted HTML region (proper quotes + real newlines).
2. Profile pill: removed redundant person icon so **username stays visible**; ellipsis for long names.
3. Topbar/brand flex so nothing gets clipped off-screen.
4. Bottom nav forced dark background (`#030b12`) so it never turns white.
5. Nav labels slightly larger for readability.
6. Header shows first name, or `@username` if first name is empty.
7. Mojibake characters cleaned (`Â·` → `·`, etc.).

### Deploy
```bash
cd nexusgram-mini-app-main
npm install
npx wrangler deploy
```

After deploy: fully close the Mini App in Telegram and reopen (or clear cache) so new HTML/CSS/JS load.


## Full bug sweep (2026-11-08 — final)

| Bug | Fix |
|-----|-----|
| Double-escaped HTML (admin → bottom nav) → white boxes, visible `\n` | Unescaped entire broken region |
| Extra `</section>` before leaderboard | Removed |
| Username blank / "Miner" only | Immediate paint from `tg.initDataUnsafe.user` + ellipsis styles; server preserves DB username |
| Profile pill squeeze (icon + name) | Removed redundant person icon |
| Bottom nav white / missing | Forced `#030b12` background; solid nav CSS |
| Topbar overlap / clip | Flex min-width + overflow fixes |
| Stale cached CSS/JS | Cache-bust query `?v=20261108-ui-fix2` + shorter max-age |
| Tag balance | All major tags balanced (8/8 sections, 173/173 divs) |

Deploy and **force-close** the Mini App in Telegram before reopening.

## White box fix
- Forced `color-scheme: dark only` on html/body + meta
- Telegram `setHeaderColor` / `setBackgroundColor` / `setBottomBarColor` → `#050b12` / `#030b12`
- Bottom nav solid `#030b12` with extended box-shadow to cover WebView safe-area gaps
- TON Connect container forced dark (library often injects white widgets)
- All major cards/inputs/loading/toast forced dark backgrounds
- Cache bust `?v=20261108-whitefix`

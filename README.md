# NexusGram Telegram Mini App — starter v0.1.1

A dark navy/cyan Telegram Mini App starter for the NXG pre-TGE community phase. It is separate from the HYPE project and does not deploy or mint a TON Jetton.

## Included
- Telegram Web App launch and server-side initData HMAC verification
- D1-backed points, energy regeneration and upgrades
- Daily check-in, referral deep-link capture, referrals list and leaderboard
- Responsive mobile UI
- AdsGram SDK placement hook; rewards disabled until publisher approval and a real block ID
- No TON wallet, deposits, withdrawals or transfers before TGE

## Production checklist
1. Rotate the previously exposed Telegram bot token in @BotFather. Add the NEW token only as a Cloudflare Worker secret named BOT_TOKEN. Never commit it.
2. Configure and verify Telegram bot membership tasks server-side before awarding points. Opening a link alone never awards a reward.
3. Configure AdsGram only after publisher approval and use a real block ID. Client completion callbacks are not cryptographic proof; use server postbacks if supported.
4. Referral activation bonus requires server-side anti-abuse and activation criteria before enabling.
5. Add Cloudflare rate limits/WAF and load-test concurrent D1 writes before public launch.
6. NXG balances are pre-TGE points only. Proposed 1B token supply/allocation is not a deployed Jetton or conversion promise.

## Deploy
Use ONLY a new Worker named nexusgram-mini-app. Do not select or overwrite any HYPE Worker.
```bash
npm install
npx wrangler login
npx wrangler d1 execute nexusgram-db --remote --file=./schema.sql
# Add BOT_TOKEN as a Cloudflare secret (new rotated token only)
npx wrangler secret put BOT_TOKEN
npx wrangler deploy
```

The D1 database ID is already set in wrangler.toml. Set the deployed HTTPS URL as the Mini App URL in BotFather. Telegram launch requests require valid initData; normal browser view is preview-only.

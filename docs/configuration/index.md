---
title: Configuration Reference
description: Every supported Sink environment variable — what it does, where to set it, and when you need it.
---

# Configuration Reference

All values are strings. Boolean switches use `true` unless noted.

**What most people need**

- Always: `NUXT_SITE_TOKEN`, D1 (`DB`), KV (`KV`), and their IDs
- For analytics: `ANALYTICS` binding + `NUXT_CF_ACCOUNT_ID` + `NUXT_CF_API_TOKEN` — see [Analytics](/features/analytics)
- Everything else is optional

## Where to put variables

Think of two moments:

| When              | Meaning                                                                | Workers                                                  | Pages                                   |
| ----------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------- |
| **At build time** | Used while Cloudflare builds/publishes the app                         | Workers Builds → Variables                               | **Settings → Variables and Secrets**    |
| **At runtime**    | Used while the live app is running                                     | Worker **Settings → Variables and Secrets**              | Same **Variables and Secrets** (shared) |
| **Both**          | Needed in the built UI and at runtime (for example public UI settings) | Set the **same** value in Builds **and** Worker settings | Set once                                |

::: tip After changing public/build values
Trigger a new deploy so the app rebuilds. On Workers, “both” values must match in both places.
:::

Names starting with `DEPLOY_*` are only for connecting resources during deploy. They rewrite placeholders in tracked `wrangler.jsonc` into gitignored `wrangler.deploy.jsonc` — set `DEPLOY_*` in `.env` or Cloudflare build variables; do not hardcode production IDs in `wrangler.jsonc`. Names starting with `NUXT_*` configure the running app.

## Cloudflare bindings

A **binding** connects a Cloudflare product to Sink under a fixed name.

| Binding     | Required?   | Description                                                                                                         |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| `DB`        | Yes         | D1 database — stores links                                                                                          |
| `KV`        | Yes         | Fast cache for redirects (+ storage-ready flag)                                                                     |
| `ANALYTICS` | Recommended | Visit events for analytics                                                                                          |
| `R2`        | Optional    | File storage for backups and social images. Workers can set `DEPLOY_R2_BUCKET_NAME`; Pages adds R2 in the dashboard |
| `AI`        | Optional    | Workers AI suggestions                                                                                              |
| `ASSETS`    | Automatic   | Static files — provided for you                                                                                     |

Analytics is optional. Without it, short links and the dashboard still work; charts stay empty. Setup: [Analytics](/features/analytics).

## Required

::: warning `NUXT_SITE_TOKEN`
Set this yourself. It is the **dashboard login password** and the **API password**. At least 8 characters without whitespace; longer is better. Keep it stable.

If you leave it empty, Sink may invent a random password at build time that can change on the next deploy.
:::

| Variable                 | When             | Where                                | Purpose                                   |
| ------------------------ | ---------------- | ------------------------------------ | ----------------------------------------- |
| `NUXT_SITE_TOKEN`        | Runtime (secret) | Encrypted secret on Workers or Pages | Login + API password                      |
| `DEPLOY_D1_DATABASE_ID`  | Build            | Workers Builds or Pages variables    | D1 database ID (from the D1 detail page)  |
| `DEPLOY_KV_NAMESPACE_ID` | Build            | Workers Builds or Pages variables    | KV namespace ID (from the KV detail page) |

## Recommended (analytics)

| Variable             | When             | Where                    | Purpose                                                       |
| -------------------- | ---------------- | ------------------------ | ------------------------------------------------------------- |
| `NUXT_CF_ACCOUNT_ID` | Runtime          | Worker or Pages variable | Your Cloudflare account ID                                    |
| `NUXT_CF_API_TOKEN`  | Runtime (secret) | Encrypted secret         | Custom Token with **Account → Account Analytics → Read** only |

Also bind `ANALYTICS`. Add `R2` for [backups](/features/backups), `AI` for [Workers AI](/features/ai). Token steps: [Analytics](/features/analytics).

## Public overrides (only if you change defaults)

On Workers, set the same value in Builds and runtime. On Pages, set once, then redeploy. The guest-link settings are read from a runtime endpoint, so they can be changed in Worker Runtime without rebuilding the UI.

| Variable                          | Default | Purpose                                                                                            |
| --------------------------------- | ------- | -------------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_PREVIEW_MODE`        | empty   | `true` = demo mode (links last 5 minutes)                                                          |
| `NUXT_PUBLIC_SLUG_DEFAULT_LENGTH` | `6`     | Length of auto-generated short codes                                                               |
| `NUXT_PUBLIC_KV_BATCH_LIMIT`      | `50`    | Export page size; import accepts at most half per request                                          |
| `NUXT_PUBLIC_MAX_URL_LENGTH`      | `16384` | Maximum target URL length in characters (256-24000)                                                |
| `NUXT_PUBLIC_HOME_URL`            | empty   | Non-empty URL redirects `/`; empty shows the Sink homepage                                         |
| `NUXT_PUBLIC_LINK_PROXY_ENABLED`  | `false` | `true` allows links to opt into reverse proxy mode; off, stored proxy links fall back to redirects |
| `NUXT_PUBLIC_GUEST_LINKS_ENABLED` | `false` | `true` enables Turnstile-protected visitor link creation                                           |
| `NUXT_PUBLIC_GUEST_LINK_PREFIX`   | `u`     | Visitor links use `/<prefix>/<slug>`; the default is `/u/<slug>`                                   |
| `NUXT_PUBLIC_TURNSTILE_SITE_KEY`  | empty   | Public Cloudflare Turnstile site key; required to enable visitor link creation                     |

Other `NUXT_PUBLIC_*` values are baked into the built UI and read at runtime, so changes need a rebuild before the client picks them up.

`NUXT_HOME_URL` is the deprecated name of `NUXT_PUBLIC_HOME_URL`. It still works, but rename it when you next change your settings.

Click analytics store the target URL in Workers Analytics Engine, which limits all blobs in a data point to 16 KB in total. When the URL plus the other click fields (user agent, referer, and so on) exceeds that size, which is possible near the default 16384-character limit, the click still redirects but is missing from analytics. Lower `NUXT_PUBLIC_MAX_URL_LENGTH` if complete analytics matter more than long URLs.

## Optional

### Build-time options

| Variable                         | Where                   | When it turns on                                                                                     |
| -------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| `NUXT_API_CORS`                  | Builds or Pages         | Exactly `true` allows browser apps on other sites to call `/api/**` (CORS). Login is still required  |
| `DEPLOY_R2_BUCKET_NAME`          | Workers Builds only     | Set to an existing R2 bucket name to attach R2 (`bucket_name`). Pages: add R2 under Bindings instead |
| `DEPLOY_KV_PREVIEW_NAMESPACE_ID` | Workers Builds or Pages | Optional Wrangler `preview_id`; defaults to `DEPLOY_KV_NAMESPACE_ID`                                 |
| `DEPLOY_R2_PREVIEW_BUCKET_NAME`  | Workers Builds only     | Optional Wrangler `preview_bucket_name`; defaults to `DEPLOY_R2_BUCKET_NAME` when R2 is enabled      |

### Runtime options

| Variable                                            | Purpose                                                                  |
| --------------------------------------------------- | ------------------------------------------------------------------------ |
| `NUXT_NOT_FOUND_REDIRECT`                           | Where to send unknown short codes (**always HTTP 302**)                  |
| `NUXT_CF_ACCESS_TEAM_DOMAIN` + `NUXT_CF_ACCESS_AUD` | Both set → enable [Cloudflare Access](./cloudflare-access)               |
| `NUXT_SAFE_BROWSING_DOH`                            | DNS-over-HTTPS URL used to check unsafe domains when `unsafe` is not set |
| `NUXT_WEBHOOK_URL`                                  | HTTP(S) URL for [click webhooks](./webhooks)                             |
| `NUXT_WEBHOOK_SECRET`                               | Optional signing secret starting with `whsec_`                           |
| `NUXT_GUEST_LINK_PREFIX_ALIASES`                    | Comma-separated previous visitor prefixes kept working after a prefix change |
| `NUXT_GUEST_LINK_DAILY_LIMIT_PER_IP`                 | Successful visitor links allowed per IP each UTC day; default `10`      |
| `NUXT_GUEST_LINK_GLOBAL_LIMIT`                       | Maximum active visitor links across the instance; default `10000`        |
| `NUXT_GUEST_LINK_EXPIRATION_DAYS`                    | Visitor link lifetime in days; default `180`, `0` means no expiry        |
| `NUXT_GUEST_LINK_CLEANUP_DAYS`                       | Days to keep expired visitor links before deletion; default `7`, `0` means next cron run |
| `NUXT_TURNSTILE_SECRET`                              | Encrypted Turnstile secret key; required to enable visitor link creation |

Safe browsing example: Cloudflare Family DNS `https://family.cloudflare-dns.com/dns-query`. See also [Link Features](/features/links).

### Expired link retention

Set runtime variable `NUXT_EXPIRED_LINK_RETENTION_DAYS=30` to permanently delete D1 links once they have been expired for 30 days. Unset or empty disables cleanup. Only non-negative integers are accepted; `0` deletes expired links on the next run. Invalid values skip cleanup and log a warning.

Cleanup requires a completed KV-to-D1 migration and Workers cron (daily at **00:00 UTC** in this repository). It runs independently of `NUXT_DISABLE_AUTO_BACKUP` and does not require R2. Pages does not run automatic cleanup. Existing R2 backups are retained.

### Visitor link limits and cleanup

The homepage visitor form is disabled by default. Create a Turnstile widget and set `NUXT_PUBLIC_TURNSTILE_SITE_KEY` plus encrypted `NUXT_TURNSTILE_SECRET`, then set `NUXT_PUBLIC_GUEST_LINKS_ENABLED=true`. Turnstile tokens are verified by the server before a link is created. Visitor links use the configurable `/u/` path segment, receive the `guest` tag, and remain manageable from the dashboard. The site key is public; the secret must remain encrypted.

`NUXT_GUEST_LINK_DAILY_LIMIT_PER_IP=10` limits successful creations per client IP per UTC day. IP addresses are stored only as keyed daily hashes. `NUXT_GUEST_LINK_GLOBAL_LIMIT=10000` caps active visitor links; expired links free capacity. The defaults are conservative and can be adjusted for your expected traffic.

`NUXT_GUEST_LINK_EXPIRATION_DAYS=180` sets the default lifetime for newly created visitor links. Set it to `0` for links without an expiry. `NUXT_GUEST_LINK_CLEANUP_DAYS=7` permanently deletes expired visitor links after the grace period. Cleanup runs on the existing Workers cron schedule after a completed KV-to-D1 migration. Pages deployments do not run this scheduled cleanup. The general `NUXT_EXPIRED_LINK_RETENTION_DAYS` setting remains separate and applies to all expired links.

If you change `NUXT_PUBLIC_GUEST_LINK_PREFIX`, add the previous value to `NUXT_GUEST_LINK_PREFIX_ALIASES` so already shared visitor links keep working. Prefixes must be a single alphanumeric or hyphenated path segment and cannot use reserved application paths.

## Advanced defaults (usually leave alone)

| Variable                      | Default                      | Purpose                                                                                                      |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `NUXT_REDIRECT_STATUS_CODE`   | `301`                        | Normal redirect code (`302` / `307` / `308` also work). Unknown-slug redirects stay 302                      |
| `NUXT_LINK_CACHE_TTL`         | `60`                         | How long KV caches a link (seconds)                                                                          |
| `NUXT_REDIRECT_WITH_QUERY`    | `false`                      | `true` appends visitor query params to the target URL                                                        |
| `NUXT_REDIRECT_NO_STORE`      | `false`                      | `true` asks browsers not to cache the redirect                                                               |
| `NUXT_CASE_SENSITIVE`         | `false`                      | `true` keeps custom short-code case (`Docs` ≠ `docs`)                                                        |
| `NUXT_DATASET`                | `sink`                       | Analytics dataset name; must match the `ANALYTICS` binding                                                   |
| `NUXT_LIST_QUERY_LIMIT`       | `500`                        | Max rows in analytics lists                                                                                  |
| `NUXT_DISABLE_BOT_ACCESS_LOG` | `false`                      | `true` drops detected bots from analytics and webhooks                                                       |
| `NUXT_DISABLE_AUTO_BACKUP`    | `false`                      | `true` turns off scheduled R2 backups                                                                        |
| `NUXT_AI_MODEL`               | `@cf/qwen/qwen3-30b-a3b-fp8` | Workers AI model                                                                                             |
| `NUXT_AI_PROMPT`              | built-in                     | Custom slug prompt must keep `{slugRegex}`                                                                   |
| `NUXT_AI_OG_PROMPT`           | built-in                     | Custom social-preview prompt                                                                                 |
| `DEPLOY_D1_DATABASE_NAME`     | `sink`                       | Overrides `d1_databases[].database_name` in generated deploy config                                          |
| `DEPLOY_ANALYTICS_DATASET`    | `sink`                       | Overrides `analytics_engine_datasets[].dataset` in generated deploy config; keep aligned with `NUXT_DATASET` |

See [Analytics](/features/analytics) and [API](/api/).

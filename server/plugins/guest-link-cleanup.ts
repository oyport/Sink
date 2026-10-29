import { cleanupExpiredGuestLinks } from '../services/guest-link-cleanup'
import { cleanupGuestLinkUsage } from '../services/guest-link-usage'

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('cloudflare:scheduled', async (event) => {
    const env = event.env as Cloudflare.Env & Record<string, unknown>
    const configuredDays = Number(env.NUXT_GUEST_LINK_CLEANUP_DAYS ?? useRuntimeConfig().guestLinkCleanupDays)
    if (!Number.isSafeInteger(configuredDays) || configuredDays < 0 || configuredDays > 3650) {
      console.warn('[guest-links] NUXT_GUEST_LINK_CLEANUP_DAYS must be an integer from 0 to 3650; skipping guest-link cleanup')
      return
    }

    const now = Math.floor(Date.now() / 1000)
    const cutoff = now - configuredDays * 86_400
    try {
      await cleanupExpiredGuestLinks(env, cutoff)
      await cleanupGuestLinkUsage(env, now)
    }
    catch (error) {
      console.error('[guest-links] Scheduled cleanup failed', error)
    }
  })
})

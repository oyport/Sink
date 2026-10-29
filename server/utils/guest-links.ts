import type { H3Event } from 'h3'

const GUEST_LINK_PREFIX_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/i
const RESERVED_GUEST_LINK_PREFIXES = new Set([
  'api',
  'assets',
  'dashboard',
  'fonts',
  'images',
  'static',
  '_assets',
  '_docs',
  '_guest',
  '_nuxt',
  'favicon',
])

function isEnabled(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1'
}

function readInteger(value: unknown, fallback: number, minimum: number, maximum: number, name: string): number {
  if (value === undefined || value === null || value === '')
    return fallback

  const parsed = typeof value === 'number' ? value : Number(value)
  if (Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum)
    return parsed

  if (value !== undefined && value !== null && value !== '')
    console.warn(`[guest-links] ${name} must be an integer from ${minimum} to ${maximum}; using ${fallback}`)
  return fallback
}

export function normalizeGuestLinkPrefix(value: unknown): string | undefined {
  if (typeof value !== 'string')
    return undefined

  const prefix = value.trim().replace(/^\/+|\/+$/g, '').toLowerCase() || 'u'
  if (!GUEST_LINK_PREFIX_PATTERN.test(prefix) || RESERVED_GUEST_LINK_PREFIXES.has(prefix))
    return undefined

  const { reserveSlug } = useAppConfig()
  if ((reserveSlug as string[]).some(slug => slug.toLowerCase() === prefix))
    return undefined

  return prefix
}

export function getGuestLinkSettings(event: H3Event) {
  const runtime = useRuntimeConfig(event)
  const prefix = normalizeGuestLinkPrefix(runtime.public.guestLinkPrefix)
  const aliases = String(runtime.guestLinkPrefixAliases ?? '')
    .split(',')
    .map(normalizeGuestLinkPrefix)
    .filter((item): item is string => !!item && item !== prefix)

  return {
    enabled: isEnabled(runtime.public.guestLinksEnabled),
    prefix,
    prefixes: [...new Set([prefix, ...aliases].filter((item): item is string => !!item))],
    turnstileSiteKey: String(runtime.public.turnstileSiteKey ?? '').trim(),
    turnstileSecret: String(runtime.turnstileSecret ?? '').trim(),
    dailyLimitPerIp: readInteger(runtime.guestLinkDailyLimitPerIp, 10, 1, 100_000, 'NUXT_GUEST_LINK_DAILY_LIMIT_PER_IP'),
    globalLimit: readInteger(runtime.guestLinkGlobalLimit, 10_000, 1, 10_000_000, 'NUXT_GUEST_LINK_GLOBAL_LIMIT'),
    expirationDays: readInteger(runtime.guestLinkExpirationDays, 180, 0, 3650, 'NUXT_GUEST_LINK_EXPIRATION_DAYS'),
    cleanupDays: readInteger(runtime.guestLinkCleanupDays, 7, 0, 3650, 'NUXT_GUEST_LINK_CLEANUP_DAYS'),
  }
}

export function isGuestLinkFeatureReady(settings: ReturnType<typeof getGuestLinkSettings>): boolean {
  return settings.enabled && !!settings.prefix && !!settings.turnstileSiteKey && !!settings.turnstileSecret
}

export function getGuestLinkPublicConfig(settings: ReturnType<typeof getGuestLinkSettings>) {
  return {
    enabled: isGuestLinkFeatureReady(settings),
    prefix: settings.prefix ?? 'u',
    turnstileSiteKey: isGuestLinkFeatureReady(settings) ? settings.turnstileSiteKey : '',
    expirationDays: settings.expirationDays,
  }
}

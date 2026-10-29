import type { H3Event } from 'h3'
import { z } from 'zod'
import { CreateLinkSchema, nanoid, UrlSchema } from '#shared/schemas/link'
import { completeGuestLinkReservation, hashGuestIp, releaseGuestLinkReservation, reserveGuestLink, utcDayStart } from '../../services/guest-link-usage'
import { assertLinkStoreReady } from '../../services/link-store/migration'
import { getGuestLinkSettings, isGuestLinkFeatureReady } from '../../utils/guest-links'
import { assertLinkWritesAllowed, saveNewLink } from '../../utils/link-processing'
import { getAuthoritativeLink } from '../../utils/link-store'

const GuestLinkRequestSchema = z.object({
  url: UrlSchema.refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'URL must use HTTP or HTTPS'),
  turnstileToken: z.string().trim().min(1).max(2048),
}).strict()

interface TurnstileValidationResponse {
  success: boolean
  hostname?: string
  action?: string
}

async function verifyTurnstile(event: H3Event, token: string, secret: string, ip: string): Promise<boolean> {
  const requestUrl = getRequestURL(event)
  const response = await $fetch<TurnstileValidationResponse>(
    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    {
      method: 'POST',
      body: { secret, response: token, remoteip: ip },
      timeout: 5000,
    },
  )

  return response.success
    && response.hostname?.toLowerCase() === requestUrl.hostname.toLowerCase()
    && response.action === 'guest_link_create'
}

function getStatusCode(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null)
    return undefined
  if ('statusCode' in error && typeof error.statusCode === 'number')
    return error.statusCode
  if ('status' in error && typeof error.status === 'number')
    return error.status
  return undefined
}

function guestShortLink(event: H3Event, prefix: string, slug: string): string {
  const requestUrl = getRequestURL(event)
  return new URL(`/${prefix}/${encodeURIComponent(slug)}`, requestUrl.origin).toString()
}

async function finishReservation(event: H3Event, reservationId: string): Promise<void> {
  try {
    await completeGuestLinkReservation(event, reservationId)
  }
  catch (error) {
    console.error('[guest-links] Could not finalize a guest-link quota reservation', error)
  }
}

async function releaseReservation(event: H3Event, reservationId: string): Promise<void> {
  try {
    await releaseGuestLinkReservation(event, reservationId)
  }
  catch (error) {
    console.error('[guest-links] Could not release a guest-link quota reservation', error)
  }
}

export default eventHandler(async (event) => {
  const settings = getGuestLinkSettings(event)
  if (!isGuestLinkFeatureReady(settings)) {
    throw createError({ statusCode: 404, statusMessage: 'Guest link creation is not enabled' })
  }

  await assertLinkStoreReady(event)
  assertLinkWritesAllowed(event, 'create guest links')

  const { url, turnstileToken } = await readValidatedBody(event, GuestLinkRequestSchema.parse)
  const ip = getHeader(event, 'cf-connecting-ip') || getRequestIP(event, { xForwardedFor: false })
  if (!ip) {
    throw createError({ statusCode: 400, statusMessage: 'Unable to determine the client IP address' })
  }

  let turnstileVerified = false
  try {
    turnstileVerified = await verifyTurnstile(event, turnstileToken, settings.turnstileSecret, ip)
  }
  catch (error) {
    console.error('[guest-links] Turnstile verification request failed', error)
    throw createError({ statusCode: 503, statusMessage: 'Guest link verification is temporarily unavailable' })
  }
  if (!turnstileVerified) {
    throw createError({ statusCode: 403, statusMessage: 'Guest link verification failed' })
  }

  const now = Math.floor(Date.now() / 1000)
  const dayStart = utcDayStart(now)
  const ipHash = await hashGuestIp(event, ip, dayStart)
  const expiration = settings.expirationDays > 0 ? now + settings.expirationDays * 86_400 : undefined
  const generateSlug = nanoid()
  const generateId = nanoid(10)
  const generateReservationId = nanoid(16)
  const reservationExpiresAt = now + 120

  for (let attempt = 0; attempt < 5; attempt++) {
    const link = CreateLinkSchema.parse({
      url,
      slug: generateSlug(),
      id: generateId(),
      createdAt: now,
      updatedAt: now,
      expiration,
      tags: ['guest'],
    })
    const reservationId = generateReservationId()
    const reservationResult = await reserveGuestLink(event, {
      id: reservationId,
      slug: link.slug,
      linkId: link.id,
      ipHash,
      createdAt: now,
      reservationExpiresAt,
    }, settings.dailyLimitPerIp, settings.globalLimit)

    if (!reservationResult.reserved) {
      throw createError({
        statusCode: 429,
        statusMessage: reservationResult.reason === 'daily' ? 'GUEST_DAILY_LIMIT_REACHED' : 'GUEST_GLOBAL_LIMIT_REACHED',
      })
    }

    try {
      const response = await saveNewLink(event, link)
      await finishReservation(event, reservationId)
      return {
        ...response,
        shortLink: guestShortLink(event, settings.prefix!, link.slug),
        expiration: link.expiration,
      }
    }
    catch (error) {
      if (getStatusCode(error) === 409) {
        await releaseReservation(event, reservationId)
        continue
      }

      try {
        const storedLink = await getAuthoritativeLink(event, link.slug)
        if (storedLink?.id === link.id) {
          await finishReservation(event, reservationId)
          return {
            link: storedLink,
            shortLink: guestShortLink(event, settings.prefix!, link.slug),
            expiration: link.expiration,
          }
        }
      }
      catch (lookupError) {
        console.error('[guest-links] Could not confirm a partially completed link creation', lookupError)
      }

      await releaseReservation(event, reservationId)
      throw error
    }
  }

  throw createError({ statusCode: 503, statusMessage: 'Could not allocate a unique short link' })
})

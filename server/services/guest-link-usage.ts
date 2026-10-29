import type { H3Event } from 'h3'

export interface GuestLinkReservation {
  id: string
  slug: string
  linkId: string
  ipHash: string
  createdAt: number
  reservationExpiresAt: number
}

export type GuestLinkReservationResult
  = { reserved: true }
    | { reserved: false, reason: 'daily' | 'global' }

function getDatabase(event: H3Event) {
  return event.context.cloudflare.env.DB
}

export function utcDayStart(timestamp: number): number {
  return Math.floor(timestamp / 86_400) * 86_400
}

export async function hashGuestIp(event: H3Event, ip: string, dayStart: number): Promise<string> {
  const secret = useRuntimeConfig(event).siteToken
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${dayStart}:${ip}`))
  return [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export async function cleanupGuestLinkUsage(env: Cloudflare.Env, now: number): Promise<number> {
  const dayStart = utcDayStart(now)
  const result = await env.DB.prepare(`
    DELETE FROM guest_link_usage
    WHERE (
      status = 'pending'
      AND COALESCE(reservation_expires_at, 0) <= ?
    OR (status = 'created' AND created_at < ?)
    )
    AND NOT EXISTS (
      SELECT 1
      FROM links
      WHERE links.slug = guest_link_usage.slug
        AND links.id = guest_link_usage.link_id
    )
  `).bind(now, dayStart).run()

  return result.meta.changes
}

export async function reserveGuestLink(event: H3Event, reservation: GuestLinkReservation, dailyLimit: number, globalLimit: number): Promise<GuestLinkReservationResult> {
  const db = getDatabase(event)
  const dayStart = utcDayStart(reservation.createdAt)
  const dayEnd = dayStart + 86_400
  await cleanupGuestLinkUsage(event.context.cloudflare.env, reservation.createdAt)

  const inserted = await db.prepare(`
    INSERT INTO guest_link_usage (
      id, slug, link_id, ip_hash, created_at, status, reservation_expires_at
    )
    SELECT ?, ?, ?, ?, ?, 'pending', ?
    WHERE (
      SELECT COUNT(*)
      FROM guest_link_usage AS usage
      WHERE usage.ip_hash = ?
        AND usage.created_at >= ?
        AND usage.created_at < ?
        AND (
          usage.status = 'created'
          OR (
            usage.status = 'pending'
            AND (
              COALESCE(usage.reservation_expires_at, 0) > ?
              OR EXISTS (
                SELECT 1 FROM links
                WHERE links.slug = usage.slug AND links.id = usage.link_id
              )
            )
          )
        )
    ) < ?
      AND (
        SELECT COUNT(*)
        FROM guest_link_usage AS usage
        WHERE (
          usage.status = 'pending'
          AND COALESCE(usage.reservation_expires_at, 0) > ?
        )
        OR EXISTS (
          SELECT 1 FROM links
          WHERE links.slug = usage.slug
            AND links.id = usage.link_id
            AND (links.effective_expires_at IS NULL OR links.effective_expires_at > ?)
        )
      ) < ?
    RETURNING id
  `).bind(
    reservation.id,
    reservation.slug,
    reservation.linkId,
    reservation.ipHash,
    reservation.createdAt,
    reservation.reservationExpiresAt,
    reservation.ipHash,
    dayStart,
    dayEnd,
    reservation.createdAt,
    dailyLimit,
    reservation.createdAt,
    reservation.createdAt,
    globalLimit,
  ).first<{ id: string }>()

  if (inserted)
    return { reserved: true }

  const dailyUsage = await db.prepare(`
    SELECT COUNT(*) AS count
    FROM guest_link_usage AS usage
    WHERE usage.ip_hash = ?
      AND usage.created_at >= ?
      AND usage.created_at < ?
      AND (
        usage.status = 'created'
        OR (
          usage.status = 'pending'
          AND (
            COALESCE(usage.reservation_expires_at, 0) > ?
            OR EXISTS (
              SELECT 1 FROM links
              WHERE links.slug = usage.slug AND links.id = usage.link_id
            )
          )
        )
      )
  `).bind(reservation.ipHash, dayStart, dayEnd, reservation.createdAt).first<{ count: number }>()

  return { reserved: false, reason: Number(dailyUsage?.count ?? 0) >= dailyLimit ? 'daily' : 'global' }
}

export async function completeGuestLinkReservation(event: H3Event, id: string): Promise<void> {
  await getDatabase(event).prepare(`
    UPDATE guest_link_usage
    SET status = 'created', reservation_expires_at = NULL
    WHERE id = ?
  `).bind(id).run()
}

export async function releaseGuestLinkReservation(event: H3Event, id: string): Promise<void> {
  await getDatabase(event).prepare('DELETE FROM guest_link_usage WHERE id = ?').bind(id).run()
}

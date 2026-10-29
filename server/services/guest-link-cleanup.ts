import { and, asc, eq, exists, inArray, lte, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/d1'
import { guestLinkUsage, links, linkTombstones } from '../database/schema'

const BATCH_SIZE = 100

export async function cleanupExpiredGuestLinks(env: Cloudflare.Env, cutoff: number): Promise<number> {
  const db = drizzle(env.DB)
  const deletedAt = Math.floor(Date.now() / 1000)
  const candidates = db.select({ slug: links.slug })
    .from(guestLinkUsage)
    .innerJoin(links, and(
      eq(guestLinkUsage.slug, links.slug),
      eq(guestLinkUsage.linkId, links.id),
    ))
    .where(lte(links.effectiveExpiresAt, cutoff))
    .orderBy(asc(links.slug))
    .limit(BATCH_SIZE)
  const isGuestLink = exists(db.select({ id: guestLinkUsage.id }).from(guestLinkUsage).where(and(
    eq(guestLinkUsage.slug, links.slug),
    eq(guestLinkUsage.linkId, links.id),
  )))
  let deleted = 0

  while (true) {
    const [, result] = await db.batch([
      db.insert(linkTombstones).select(
        db.select({ slug: links.slug, deletedAt: sql<number>`${deletedAt}`.as('deleted_at') })
          .from(links)
          .where(and(inArray(links.slug, candidates), lte(links.effectiveExpiresAt, cutoff), isGuestLink)),
      ).onConflictDoUpdate({ target: linkTombstones.slug, set: { deletedAt } }),
      db.delete(links)
        .where(and(inArray(links.slug, candidates), lte(links.effectiveExpiresAt, cutoff), isGuestLink))
        .returning({ slug: links.slug }),
    ])
    deleted += result.length
    if (result.length < BATCH_SIZE)
      return deleted
  }
}

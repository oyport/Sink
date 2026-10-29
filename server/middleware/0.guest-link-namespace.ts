import { getGuestLinkSettings } from '../utils/guest-links'

export default eventHandler((event) => {
  if (event.method !== 'GET' && event.method !== 'HEAD')
    return

  const requestUrl = getRequestURL(event)
  const segments = requestUrl.pathname.split('/').filter(Boolean)
  if (segments.length !== 2)
    return

  const [prefix, encodedSlug] = segments
  const settings = getGuestLinkSettings(event)
  if (!settings.prefixes.includes(prefix!.toLowerCase()))
    return

  let slug: string
  try {
    slug = decodeURIComponent(encodedSlug!)
  }
  catch {
    return
  }

  const { slugRegex } = useAppConfig()
  if (!slugRegex.test(slug))
    return

  setHeader(event, 'Cache-Control', 'no-store')
  return sendRedirect(event, `${requestUrl.origin}/${encodeURIComponent(slug)}${requestUrl.search}`, 302)
})

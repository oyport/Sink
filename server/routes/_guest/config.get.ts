import { getGuestLinkPublicConfig, getGuestLinkSettings } from '../../utils/guest-links'

export default eventHandler((event) => {
  const settings = getGuestLinkSettings(event)
  return getGuestLinkPublicConfig(settings)
})

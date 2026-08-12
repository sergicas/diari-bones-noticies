import { describe, expect, it } from 'vitest'
import { validateFeedActivation } from '../rss/feedActivation.js'

const now = Date.parse('2026-08-12T12:00:00Z')
const feed = {
  name: 'Font de prova',
  reuseLicense: 'CC BY 4.0',
  activation: { required: true, licenseConfirmed: true },
}
const recentRss = `<?xml version="1.0"?><rss><channel><item><title>Peça recent</title><link>https://example.test/a</link><pubDate>Mon, 10 Aug 2026 12:00:00 +0000</pubDate></item></channel></rss>`

describe('validació recurrent d’activació de fonts', () => {
  it('només activa HTTP/XML ja comprovat quan té ítem recent i llicència', () => {
    expect(validateFeedActivation(feed, recentRss, now)).toMatchObject({ active: true })
  })

  it('falla tancat si l’XML, la llicència o la frescor no compleixen', () => {
    expect(validateFeedActivation(feed, '<html>no és un feed</html>', now).active).toBe(false)
    expect(validateFeedActivation({ ...feed, reuseLicense: '' }, recentRss, now).active).toBe(false)
    const old = recentRss.replace('10 Aug 2026', '10 Jan 2026')
    expect(validateFeedActivation(feed, old, now).active).toBe(false)
  })
})

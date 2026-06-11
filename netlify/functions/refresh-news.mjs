import { getLiveNewsPayload } from '../lib/liveNews.mjs'

export default async () => {
  try {
    const payload = await getLiveNewsPayload({ force: true })

    return new Response(
      JSON.stringify({
        ok: true,
        count: payload.stories.length,
        nextRefreshAt: payload.nextRefreshAt,
        updatedAt: payload.updatedAt,
      }),
      {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      },
    )
  } catch (error) {
    console.error('No s’ha pogut executar l’actualització programada', error)

    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: {
        'content-type': 'application/json; charset=utf-8',
      },
    })
  }
}

export const config = {
  schedule: '0 */4 * * *',
}

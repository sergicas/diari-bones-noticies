import { getLiveNewsPayload } from '../lib/liveNews.mjs'

export default async (request) => {
  try {
    const url = new URL(request.url)
    const force = url.searchParams.get('force') === '1'
    const payload = await getLiveNewsPayload({ force })

    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'cache-control': 'public, max-age=300, stale-while-revalidate=43200',
        'content-type': 'application/json; charset=utf-8',
      },
    })
  } catch (error) {
    console.error('No s’ha pogut carregar el radar en viu', error)

    return new Response(
      JSON.stringify({
        error: 'No s’ha pogut carregar el radar en viu.',
        stories: [],
      }),
      {
        status: 500,
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
      },
    )
  }
}

export const config = {
  path: '/api/live-news',
}

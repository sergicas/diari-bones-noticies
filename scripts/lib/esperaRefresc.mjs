// ESPERES DEL REFRESC MANUAL, compartides pels dos scripts.
//
// Viuen aquí, i no dins de cada script, per dues raons: perquè els dos feien la
// mateixa cosa de maneres lleugerament diferents (i un dels dos anunciava èxit
// quan no en tenia), i perquè així es poden provar.
//
// Dues esperes, i cap de les dues pot acabar dient que sí sense estar-ne segura:
//
// 1. La FEINA de la cua, per clau d'idempotència. Sondejar la data del lot
//    enganya en totes dues direccions: una feina aliena que acabi primer la
//    canvia, i una de pròpia que acabi sense novetats no la canvia.
//
// 2. La VISIBILITAT del lot. KV és eventualment coherent: la feina pot constar
//    acabada i la lectura encara donar la versió vella. Cloudflare documenta
//    que la propagació pot passar del minut, així que arribar al límit d'espera
//    NO confirma res — ha de ser un error, no un èxit.

export class RefrescNoConfirmat extends Error {}

const dorm = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Espera que la feina encuada acabi. Torna la feina si acaba bé.
 * Llança si falla o si s'exhaureix el temps.
 */
export async function esperaFeina(
  statusUrl,
  token,
  { maxMs = 3 * 60 * 1000, intervalMs = 3000, onTick = () => {}, fetchImpl = fetch } = {},
) {
  const limit = Date.now() + maxMs
  while (Date.now() < limit) {
    await dorm(intervalMs)
    const res = await fetchImpl(statusUrl, {
      headers: { authorization: `Bearer ${token}` },
    })
    if (!res.ok) {
      throw new RefrescNoConfirmat(`l’estat de la feina no es pot llegir (${res.status})`)
    }
    const feina = await res.json()
    if (feina.status === 'completed') return feina
    if (feina.status === 'failed') {
      throw new RefrescNoConfirmat(
        `la feina ha fallat: ${feina.error || 'sense detall'}`,
      )
    }
    onTick()
  }
  throw new RefrescNoConfirmat(
    `el radar no ha acabat en ${Math.round(maxMs / 1000)} s (la feina pot seguir a la cua)`,
  )
}

/**
 * Espera que el lot públic reflecteixi la data que la feina diu haver escrit.
 * Llança si no hi arriba: arribar al límit no vol dir que s'hagi publicat.
 */
export async function esperaLotVisible(
  llegeixLot,
  updatedAtEsperat,
  { maxMs = 60 * 1000, intervalMs = 2000, onTick = () => {} } = {},
) {
  let lot = await llegeixLot()
  if (!updatedAtEsperat) return lot
  const objectiu = new Date(updatedAtEsperat).getTime()
  const arribat = () => lot?.updatedAt && new Date(lot.updatedAt).getTime() >= objectiu
  const limit = Date.now() + maxMs
  while (!arribat() && Date.now() < limit) {
    await dorm(intervalMs)
    onTick()
    lot = await llegeixLot()
  }
  if (!arribat()) {
    throw new RefrescNoConfirmat(
      `el lot públic encara no mostra l’edició nova després de ${Math.round(maxMs / 1000)} s. `
        + 'KV pot trigar a propagar-se; torna-ho a mirar d’aquí una estona.',
    )
  }
  return lot
}

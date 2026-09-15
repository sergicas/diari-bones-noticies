export const scheduledRefreshGraceMs = 5 * 1000

// Sincronitza una pestanya oberta amb l'hora de publicació que anuncia el
// servidor. El petit marge evita consultar mentre la cua encara està acabant
// d'escriure l'edició nova.
export function getScheduledRefreshDelay(
  nextRefreshAt,
  now = Date.now(),
  graceMs = scheduledRefreshGraceMs,
) {
  const target = new Date(nextRefreshAt || '').getTime()
  if (Number.isNaN(target)) return null

  return Math.max(0, target - now + graceMs)
}

const LEAD_TOPICS = new Set(['Literatura', 'Filosofia'])

export function isLeadHumanitiesStory(story) {
  return LEAD_TOPICS.has(String(story?.topic || '').trim())
}

// Literatura i Filosofia comparteixen la prioritat màxima. El comparador rebut
// continua decidint l'ordre dins d'aquest bloc i dins de la resta de peces.
export function prioritizeLiteratureAndPhilosophy(compareWithinGroup) {
  return (leftStory, rightStory) => {
    const leftIsLead = isLeadHumanitiesStory(leftStory)
    const rightIsLead = isLeadHumanitiesStory(rightStory)

    if (leftIsLead !== rightIsLead) {
      return leftIsLead ? -1 : 1
    }

    return compareWithinGroup(leftStory, rightStory)
  }
}

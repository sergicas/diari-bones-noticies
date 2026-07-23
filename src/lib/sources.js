// Catàleg editorial públic. No és una còpia de totes les URL tècniques del
// Worker: explica quin paper té cada font i amb quin grau d'automatització
// s'utilitza. Les fonts marcades com a "Connectada" entren al radar; les de
// "Consulta editorial" serveixen per contrastar o preparar peces pròpies.

export const SOURCE_STATUS = {
  connected: 'Connectada',
  radar: 'Radar',
  editorial: 'Consulta editorial',
  next: 'Propera connexió',
}

export const SOURCE_TIERS = {
  A: 'Font primària',
  B: 'Font periodística',
  C: 'Pista per verificar',
}

export const SOURCE_GROUPS = [
  {
    scope: 'Dades i documents',
    description:
      'La base per mesurar avenços i comprovar anuncis amb dades originals.',
    sources: [
      {
        name: 'Idescat',
        url: 'https://www.idescat.cat/dades/obertes/',
        tier: 'A',
        status: 'connected',
      },
      {
        name: 'Dades Obertes de Catalunya',
        url: 'https://analisi.transparenciacatalunya.cat/',
        tier: 'A',
        status: 'connected',
      },
      {
        name: 'DOGC',
        url: 'https://dogc.gencat.cat/ca/inici/',
        tier: 'A',
        status: 'connected',
      },
      {
        name: 'Eurostat',
        url: 'https://ec.europa.eu/eurostat/web/main/data/web-services',
        tier: 'A',
        status: 'next',
      },
    ],
  },
  {
    scope: 'Servei i oportunitats',
    description:
      'Agenda, tràmits, ajuts i recursos que el lector pot aprofitar.',
    sources: [
      {
        name: 'Agenda Cultural',
        url: 'https://agenda.cultura.gencat.cat/content/agenda/ca/rss.html',
        tier: 'A',
        status: 'connected',
      },
      {
        name: 'Canal Empresa',
        url: 'https://canalempresa.gencat.cat/ca/tramits-i-formularis/ajuts-i-subvencions/',
        tier: 'A',
        status: 'editorial',
      },
      {
        name: 'Tràmits Gencat',
        url: 'https://web.gencat.cat/ca/tramits',
        tier: 'A',
        status: 'editorial',
      },
      {
        name: 'Feina Activa',
        url: 'https://feinaactiva.gencat.cat/',
        tier: 'A',
        status: 'editorial',
      },
    ],
  },
  {
    scope: 'Verificació',
    description:
      'Desmentiments i comprovacions amb metodologia i fonts transparents.',
    sources: [
      {
        name: 'Verificat',
        url: 'https://www.verificat.cat/',
        tier: 'B',
        status: 'connected',
      },
      {
        name: '3CatInfo Verifica',
        url: 'https://www.3cat.cat/3catinfo/estatiques/verificacio/metodologia/',
        tier: 'B',
        status: 'editorial',
      },
      {
        name: 'EFE Verifica',
        url: 'https://verifica.efe.com/',
        tier: 'B',
        status: 'editorial',
      },
    ],
  },
  {
    scope: 'Solucions',
    description:
      'Respostes a problemes reals: mecanisme, evidència, límits i aprenentatge.',
    sources: [
      {
        name: 'Positive News',
        url: 'https://www.positive.news/',
        tier: 'B',
        status: 'connected',
      },
      {
        name: 'Reasons to be Cheerful',
        url: 'https://reasonstobecheerful.world/',
        tier: 'B',
        status: 'radar',
      },
      {
        name: 'Solutions Story Tracker',
        url: 'https://www.solutionsjournalism.org/storytracker',
        tier: 'B',
        status: 'editorial',
      },
      {
        name: 'Fix The News',
        url: 'https://fixthenews.com/',
        tier: 'C',
        status: 'editorial',
      },
    ],
  },
  {
    scope: 'Radar informatiu',
    description:
      'Mitjans que detecten històries; Bondiari les filtra i n’enllaça l’original.',
    sources: [
      { name: 'Vilaweb', url: 'https://www.vilaweb.cat/', tier: 'B', status: 'radar' },
      { name: 'Nació', url: 'https://naciodigital.cat/', tier: 'B', status: 'radar' },
      { name: 'ARA', url: 'https://www.ara.cat/', tier: 'B', status: 'radar' },
      { name: 'Capgròs', url: 'https://capgros.elnacional.cat/', tier: 'B', status: 'radar' },
      { name: 'Betevé', url: 'https://beteve.cat/', tier: 'B', status: 'radar' },
      { name: 'Crític', url: 'https://www.elcritic.cat/', tier: 'B', status: 'radar' },
      { name: 'RTVE', url: 'https://www.rtve.es/noticias/', tier: 'B', status: 'radar' },
      { name: 'BBC', url: 'https://www.bbc.com/news', tier: 'B', status: 'radar' },
      {
        name: 'The Conversation',
        url: 'https://theconversation.com/',
        tier: 'B',
        status: 'radar',
      },
    ],
  },
]

export const TOTAL_CATALOGUED_SOURCES = SOURCE_GROUPS.reduce(
  (sum, group) => sum + group.sources.length,
  0,
)

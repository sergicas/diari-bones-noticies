// Llista de fonts del radar, per mostrar-la públicament al manifest.
// (El Worker manté la seva pròpia llista amb les URLs RSS a
// src/server/liveNews.js; aquesta és només per a presentació editorial.)

export const SOURCE_GROUPS = [
  {
    scope: 'Catalunya',
    description: 'El primer cercle: el que passa a prop.',
    sources: ['3CatInfo', 'Vilaweb', 'ARA', 'El Punt Avui', 'Betevé', 'Crític', 'Nació Digital'],
  },
  {
    scope: 'Espanya',
    description: 'Mitjans de referència de l’Estat.',
    sources: ['La Vanguardia', 'El País', 'elDiario', 'RTVE'],
  },
  {
    scope: 'Món',
    description: 'Capçaleres internacionals en anglès.',
    sources: [
      'BBC', 'CNN', 'The Guardian', 'Wall Street Journal', 'Al Jazeera',
      'Washington Post', 'New York Times', 'Bloomberg', 'Financial Times',
      'MIT Technology Review', 'The Conversation',
    ],
  },
  {
    scope: 'Europa',
    description: 'Veus del continent en altres llengües.',
    sources: ['Le Monde', 'Deutsche Welle', 'Euronews'],
  },
]

export const TOTAL_SOURCES = SOURCE_GROUPS.reduce(
  (sum, group) => sum + group.sources.length,
  0,
)

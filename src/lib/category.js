// Mapatge de categories del RSS a un conjunt canònic.
// El radar agrega 25 fonts en català, castellà, anglès i francès. Cada font
// posa el seu propi vocabulari (POLíTICA, Politics, Reino Unido, ECONOMIA -
// POLíTICA, Mail Obert, etc.). Aquest fitxer ho redueix a una llista controlada
// per evitar pastilles llardoses a les targetes.

export const CANONICAL_CATEGORIES = [
  'Política',
  'Societat',
  'Cultura',
  'Esports',
  'Salut',
  'Medi ambient',
  'Ciència',
  'Tecnologia',
  'Economia',
  'Món',
  'Europa',
  'Espanya',
  'Catalunya',
  'Educació',
  'Barcelona',
  'Opinió',
  'Actualitat',
]

const CATEGORY_MAP = {
  // Política
  'política': 'Política', 'politica': 'Política', 'politics': 'Política',
  'politique': 'Política', 'política nacional': 'Política',
  'parlament': 'Política', 'government': 'Política', 'elections': 'Política',

  // Societat
  'societat': 'Societat', 'sociedad': 'Societat', 'society': 'Societat',
  'société': 'Societat', 'social': 'Societat',

  // Cultura
  'cultura': 'Cultura', 'culture': 'Cultura', 'arts': 'Cultura',
  'art i disseny': 'Cultura', 'arte': 'Cultura', 'llibres': 'Cultura',
  'literatura': 'Cultura', 'literature': 'Cultura', 'cinema': 'Cultura',
  'film': 'Cultura', 'film/tv': 'Cultura', 'music': 'Cultura',
  'música': 'Cultura', 'musica': 'Cultura',

  // Esports
  'esports': 'Esports', 'esport': 'Esports', 'deportes': 'Esports',
  'deporte': 'Esports', 'sports': 'Esports', 'sport': 'Esports',
  'football': 'Esports', 'fútbol': 'Esports', 'futbol': 'Esports',

  // Salut
  'salut': 'Salut', 'salud': 'Salut', 'health': 'Salut', 'santé': 'Salut',
  'wellbeing': 'Salut', 'well-being': 'Salut', 'mental health': 'Salut',

  // Medi ambient
  'medi ambient': 'Medi ambient', 'medio ambiente': 'Medi ambient',
  'environment': 'Medi ambient', 'climate': 'Medi ambient',
  'climate change': 'Medi ambient', 'clima': 'Medi ambient',
  'environnement': 'Medi ambient', 'natura': 'Medi ambient',
  'naturaleza': 'Medi ambient', 'nature': 'Medi ambient',

  // Ciència
  'ciència': 'Ciència', 'ciencia': 'Ciència', 'science': 'Ciència',
  'recerca': 'Ciència', 'research': 'Ciència', 'investigación': 'Ciència',
  'astronomy': 'Ciència', 'biology': 'Ciència',

  // Tecnologia
  'tecnologia': 'Tecnologia', 'tecnología': 'Tecnologia',
  'technology': 'Tecnologia', 'tech': 'Tecnologia',
  'món digital': 'Tecnologia', 'mon digital': 'Tecnologia',
  'digital': 'Tecnologia', 'ia': 'Tecnologia', 'ai': 'Tecnologia',
  'intel·ligència artificial': 'Tecnologia',

  // Economia
  'economia': 'Economia', 'economía': 'Economia', 'economy': 'Economia',
  'business': 'Economia', 'negocis': 'Economia', 'negocios': 'Economia',
  'finance': 'Economia', 'finanzas': 'Economia', 'finances': 'Economia',
  'markets': 'Economia', 'mercados': 'Economia', 'workplace': 'Economia',

  // Món
  'món': 'Món', 'mon': 'Món', 'mundo': 'Món', 'world': 'Món',
  'monde': 'Món', 'internacional': 'Món', 'international': 'Món',
  'global': 'Món', 'asia': 'Món', 'africa': 'Món', 'américa': 'Món',
  'reino unido': 'Món', 'royaume-uni': 'Món', 'united kingdom': 'Món', 'uk': 'Món',
  'eua': 'Món', 'eeuu': 'Món', 'usa': 'Món', 'us': 'Món',
  'china': 'Món', 'xina': 'Món', 'iran': 'Món', 'israel': 'Món',

  // Europa
  'europa': 'Europa', 'europe': 'Europa', 'ue': 'Europa', 'eu': 'Europa',
  'unión europea': 'Europa', 'union européenne': 'Europa',

  // Espanya / Catalunya (eixos geogràfics propers)
  'espanya': 'Espanya', 'españa': 'Espanya', 'spain': 'Espanya',
  'catalunya': 'Catalunya', 'cataluña': 'Catalunya', 'catalonia': 'Catalunya',

  // Educació
  'educació': 'Educació', 'educación': 'Educació', 'education': 'Educació',
  'éducation': 'Educació', 'universitats': 'Educació', 'universidades': 'Educació',
  'estudiants': 'Educació', 'students': 'Educació', 'selectivitat': 'Educació',

  // Barcelona (Betevé)
  'barcelona': 'Barcelona', 'bcn': 'Barcelona',
  'metropolitana': 'Barcelona', 'mobilitat': 'Barcelona',

  // Opinió
  'opinió': 'Opinió', 'opinion': 'Opinió', 'opinión': 'Opinió',
  'editorial': 'Opinió', 'columnes': 'Opinió', 'editoriales': 'Opinió',
  'mail obert': 'Opinió', 'tribuna': 'Opinió', 'cartas': 'Opinió',
}

function tryMatch(token) {
  if (!token) return ''
  const normalized = token.toLowerCase().trim()
  return CATEGORY_MAP[normalized] || ''
}

// Pren una cadena de categoria del RSS (que pot ser "ECONOMIA - POLíTICA",
// "Reino Unido", "Sports/Football", etc.) i retorna la canònica, o `null`
// si no en trobem cap. El cridant pot llavors fer servir el fallback del feed.
export function canonicalizeCategory(raw) {
  if (!raw) return null
  const direct = tryMatch(raw)
  if (direct) return direct
  // Provem dividint per separadors típics (guió, slash, coma, pipe).
  for (const piece of String(raw).split(/[\s\-/,|·]+/).filter(Boolean)) {
    const match = tryMatch(piece)
    if (match) return match
  }
  return null
}

// Si la categoria del RSS no entra al mapatge, sempre podem retrocedir al
// fallback que defineix el feed (defaultCategory) o, en últim recurs, a
// "Actualitat".
export function normalizeCategory(raw, fallback) {
  return canonicalizeCategory(raw) || fallback || 'Actualitat'
}

// --- Correcció de categoria per CONTINGUT -----------------------------------
// La categoria ve del feed d'origen (forceCategory), no del contingut. Això fa
// que una peça pugui heretar una etiqueta equivocada: p. ex. un tema de TV que
// ve d'un feed d'esports acaba etiquetat com a "Esports". Aquesta capa mira el
// títol + resum i corregeix la categoria quan hi ha un senyal temàtic clar.
// L'ordre importa: la primera regla que coincideix guanya.
const CONTENT_CATEGORY_RULES = [
  { cat: 'Cultura', rx: /(fotografi|exposici[óo]|mostra fotogr|museu|museo|museum|pintur|escultur|galer[íi]a d'?art|retrospectiva|\bcinema\b|\bcine\b|pel·?l[íi]cula|pel[íi]cula|\bfilm\b|documental|teatre|teatro|[òo]pera|concert|concierto|festival de (cinema|m[úu]sica|cine|teatre)|novel·?la|novela|\bllibre\b|\blibro\b|poesia|poes[íi]a|[àa]lbum|banda sonora|exposici)/i },
  { cat: 'Esports', rx: /(f[úu]tbol|b[àa]squet|handbol|waterpolo|tenis|tennis|\bliga\b|lliga|partit\b|partido\b|golejador|\bgol\b|golejada|jugador|entrenador|selecci[óo] (espanyola|catalana|de f[úu]tbol)|mundial de|ol[íi]mpi[ck]|maratón|marató|ciclisme|ciclismo|\bmotogp\b|f[óo]rmula 1|\bnba\b|\bipl\b|campionat|campeonato)/i },
  { cat: 'Salut', rx: /(hospital|vacuna|c[àa]ncer|c[áa]ncer|tractament m[èe]dic|tratamiento m[ée]dico|pacient|paciente|sanitat|sanidad|medicament|assaig cl[íi]nic|ensayo cl[íi]nico)/i },
  { cat: 'Medi ambient', rx: /(biodiversitat|biodiversidad|reforestaci|energia renovable|energía renovable|esp[èe]cie amenaç|especie amenaz|reciclatge|reciclaje|arrecife|escull|aiguamoll)/i },
  { cat: 'Ciència', rx: /(recerca cient[íi]fica|investigaci[óo]n cient[íi]fica|astronom|gal[àa]xia|galaxia|telescopi|f[òo]ssil|f[óo]sil|genoma|ADN\b|part[íi]cula)/i },
]

export function refineCategoryByContent(category, title = '', summary = '') {
  const text = `${title} ${summary}`.toLowerCase()
  for (const rule of CONTENT_CATEGORY_RULES) {
    if (rule.rx.test(text)) return rule.cat
  }
  // Etiquetada com a Esports però SENSE cap senyal esportiu → no és esport.
  // (Cas real: "'El sótano club', de Alba Carrillo" colat com a Esports.)
  if (category === 'Esports' && !CONTENT_CATEGORY_RULES[1].rx.test(text)) {
    return 'Societat'
  }
  return category
}

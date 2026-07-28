// Versió del lot editorial. La fan servir el Worker (server/liveNews.js) per
// marcar les peces que genera i el front (App.jsx) per descartar les peces
// del cache local d'una versió anterior. Pujar aquesta constant invalida el
// cache antic de tots els navegadors sense haver de fer res més.
//
// IMPORTANT: aquesta marca també és el senyal de "les regles editorials han
// canviat". Les peces que el lot arrossega d'un refresc a l'altre es conserven
// mentre la seva marca coincideixi amb aquesta (vegeu el carryover a
// server/liveNews.js). Per això, sempre que s'endureixi el filtre editorial
// —paraules noves als diccionaris negatius, blocs durs nous, criteris nous—
// s'ha de PUJAR aquest número: altrament les peces velles que ara ja no
// passarien es quedarien al lot fins a caducar soles.
export const LIVE_EDITORIAL_VERSION = 19

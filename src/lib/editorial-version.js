// Versió del lot editorial. La fan servir el Worker (server/liveNews.js) per
// marcar les peces que genera i el front (App.jsx) per descartar les peces
// del cache local d'una versió anterior. Pujar aquesta constant invalida el
// cache antic de tots els navegadors sense haver de fer res més.
export const LIVE_EDITORIAL_VERSION = 14

# El Bon Diari

Una app conceptual d'un diari que només publica bones notícies.

## Què inclou ara mateix

- Portada editorial amb una història destacada
- Filtres per categoria i cerca per text
- Col·lecció de notícies positives de mostra
- Pàgines pròpies per a cada notícia amb URL
- Secció de manifest editorial
- Pàgina per publicar noves peces
- Formulari per publicar noves peces
- Persistència local al navegador amb `localStorage`

## Stack

- React 19
- Vite 8
- CSS custom, sense llibreries d'UI

## Desenvolupament

```bash
npm install
npm run dev
```

## Verificació

```bash
npm run lint
npm run check:articles
npm run build
```

`npm run check:articles` comprova que cada notícia editorial té imatge real
(`imageUrl` + `imageAlt`). S'executa automàticament abans de cada `npm run build`.

## Regla editorial: cap notícia sense fotografia original

Tota notícia que s'afegeixi a `src/data/articles.js` (i als JSON
`scripts/new-articles-*.json` que llegeix `scripts/apply-new-articles.mjs`) ha
d'incloure una **fotografia original** de la font:

- `imageUrl`: URL externa (gencat, UNESCO, etc.) o fitxer `.jpg|.jpeg|.png|.webp|.avif|.gif` a `/story-images/editorial/`.
- **NO val**: SVGs sota `/story-images/` (il·lustracions de categoria o per article), ni `/story-images/default-news.svg` (placeholder).
- `imageAlt`: text alternatiu per a accessibilitat.
- `imageCredit` + `imageAttributionUrl`: recomanats per donar crèdit a la font.

La lògica única viu a [`src/lib/imageRules.js`](src/lib/imageRules.js) i s'usa
des de tres llocs:

1. `scripts/apply-new-articles.mjs` — bloqueja l'alta si un article nou no porta foto.
2. `npm run check:articles` — auditoria manual: classifica cada article com a `photo` / `illustration` / `placeholder` / `missing` / `unknown` i imprimeix el llistat.
3. `src/App.jsx` — al carregar, filtra els articles editorials i del radar en viu i només deixa veure els que tenen `classifyImage === 'photo'`. Els altres queden ocultats i marcats amb un avís a la consola.

El build no falla per als 36 articles existents amb il·lustració; senzillament
no es renderitzen fins que tinguin foto real.

## Publicació amb domini propi

Per publicar `El Bon Diari` en un domini com `bondiari.com`, primer cal pujar la web a un hosting públic. El domini no es pot apuntar a `127.0.0.1`, perquè això només funciona al teu ordinador.

### Cas senzill: Netlify + domini a Piensa Solutions

Si ja tens compte a Netlify, fes això:

1. Executa `npm run build`
2. A Netlify, crea un site nou i puja la carpeta `dist/`, o connecta aquest projecte amb el repositori
3. A Netlify, ves a `Domain management` i afegeix `bondiari.com`
4. Netlify et dirà quins registres DNS has de posar a Piensa Solutions
5. A Piensa Solutions, obre el gestor DNS del domini i copia exactament els valors que t’hagi donat Netlify

Notes útils:

- Aquest projecte ja inclou `_redirects` per a Netlify i `.htaccess` per a Apache
- També inclou `netlify.toml` amb `build = "npm run build"` i `publish = "dist"`
- Això fa que rutes com `/noticia/...`, `/manifest` i `/publicar` funcionin bé quan la web estigui publicada

### Fonts oficials

- Netlify: [Assign a domain to your site or app](https://docs.netlify.com/manage/domains/manage-domains/assign-a-domain-to-your-site-app/)
- Netlify: [Configure external DNS for a custom domain](https://docs.netlify.com/domains/configure-domains/configure-external-dns/)
- Netlify: [Redirects and rewrites](https://docs.netlify.com/manage/routing/redirects/overview/)

## Properes passes naturals

- Afegir autenticació i perfils d'editors
- Connectar fonts reals o un CMS
- Moderació abans de publicar aportacions
- Guardar imatges i adjunts
- Crear una vista d'article completa amb rutes

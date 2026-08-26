# Fase 5: proximitat territorial

## Abast

La primera versió cobreix dues comarques, amb els codis oficials d’Idescat:

| Codi | Comarca | Agenda | RAISC territorial |
| --- | --- | --- | --- |
| `13` | Barcelonès | `agenda:ubicacions/barcelona/barcelones` | `13_08` |
| `21` | Maresme | `agenda:ubicacions/barcelona/maresme` | `21_08` |

La ruta pública és `/territori` i l’API és
`GET /api/territorial?comarca=13|21`. La portada i el cron editorial no
precuinen cap comarca. `NOMES_FONTS_DEL_GIR` continua sent `true` i les fonts
territorials només es consulten quan un lector obre aquesta vista.

## Contracte HTTP

- `GET` i `HEAD` són els únics mètodes acceptats.
- Una comarca absent o fora de l’allowlist respon `400`.
- Una resposta completa, buida o parcial respon `200`.
- Si fallen les tres fonts i no hi ha cap còpia retinguda, respon `503`.
- `Cache-Control: no-store` evita que una còpia del navegador amagui l’estat de
  KV; `X-Bondiari-Cache` indica `hit`, `miss`, `refresh` o `none`.

Forma estable de la resposta:

```json
{
  "version": 1,
  "ok": true,
  "status": "ready",
  "comarca": { "id": "21", "slug": "maresme", "name": "Maresme" },
  "updatedAt": "2026-08-26T18:00:00.000Z",
  "freshUntil": "2026-08-26T19:00:00.000Z",
  "retainedUntil": "2026-08-27T18:00:00.000Z",
  "cache": {
    "status": "miss",
    "freshTtlSeconds": 3600,
    "retentionTtlSeconds": 86400
  },
  "sources": {
    "agenda": {
      "status": "ok",
      "label": "Agenda Cultural",
      "observedAt": "2026-08-26T18:00:00.000Z",
      "retainedUntil": "2026-08-27T18:00:00.000Z",
      "items": []
    },
    "raisc": { "status": "empty", "label": "Concessions culturals · RAISC", "items": [] },
    "idescat": { "status": "stale", "label": "Idescat", "items": [] }
  }
}
```

Els estats de font són `ok`, `empty`, `error` i `stale`. `stale` vol dir que la
font ha fallat i s’ha recuperat només aquella secció des d’una còpia anterior.

## Memòria cau i pressupost

La clau és `territorial:v1:<codi>` dins `LIVE_NEWS_KV`, separada per entorn pels
bindings ja existents.

- Resposta completa o buida: fresca durant **1 hora**.
- Resposta parcial/degradada: fresca durant **15 minuts**, per tornar a provar
  aviat sense provocar una allau.
- Retenció màxima: **24 hores**, exclusivament com a `stale-if-error`. Cada font
  conserva el seu `observedAt` i `retainedUntil`; un refresc parcial no n’allarga
  la caducitat original, i `freshUntil` mai no la pot superar.
- Hit fresc: **0 fetches externs** i 1 lectura KV.
- Cold miss o refresc: **màxim 3 fetches externs**, en paral·lel, més 1 lectura i
  com a màxim 1 escriptura KV.

Cada col·lector fa una única petició. No hi ha reintents ni fan-out per element.
El límit de tres és una invariant de l’aplicació, independent del pressupost
global del Worker, que també serveix el pipeline editorial. El fetch d’Agenda
demana 10 elements i el payload públic n’exposa com a màxim 6 per font; RAISC
també en retorna com a màxim 6 i Idescat demana només 3 indicadors.

## Fonts oficials verificades

### Agenda Cultural

S’utilitza el [giny oficial reutilitzable](https://agenda.cultura.gencat.cat/ca/posa.html),
no una URL inventada. La petició aplica el tag de comarca, els nou àmbits
culturals oficials i `limit=10`. El giny aporta títol, lloc, dates i enllaç a la
fitxa oficial en una única resposta HTML acotada.

Qualitat coneguda: una activitat pot ser multilocalitat o no informar d’un lloc
concret. La interfície mostra literalment el lloc retornat i no infereix cap
municipi. Horaris, preus i canvis sempre es confirmen a la fitxa oficial.

### RAISC

S’utilitza el dataset oficial
[Concessions del RAISC](https://analisi.transparenciacatalunya.cat/d/s9xt-n979).
Són ajuts **ja atorgats**, no convocatòries obertes. La consulta filtra pel codi
territorial comarcal, per `finalitat_p_blica = 'Cultura'` i pels darrers 365
dies; després agrega import i nombre de concessions per convocatòria.

No es demanen ni es retornen `cif_beneficiari`, `ra_social_del_beneficiari`,
`clau` ni cap registre individual. La font s’actualitza diàriament, però la seva
[nota metodològica](https://analisi.transparenciacatalunya.cat/api/views/khxn-nv6a/files/bf08beb7-d33d-4426-a01f-c34aecfc4bdd?download=true)
adverteix que hi pot haver exclusions tècniques i revisions durant l’any.

### Idescat

S’utilitza l’API oficial
[El municipi en xifres](https://www.idescat.cat/dev/api/emex/):
`/emex/v1/dades.json?id=<13|21>&i=f171,f261,f262&lang=ca`. Els tres indicadors
són població, superfície i densitat; del vector comparatiu es mostra el valor
de la comarca. La resposta conserva l’atribució i enllaça la taula d’Idescat.

## Privacitat

La comarca preferida es desa a `localStorage` amb la clau
`bondiari-territorial-comarca-v1`. No es crea cap compte ni perfil al servidor.
El navegador envia només `13` o `21` quan demana la vista. El Worker no llegeix
`request.cf`, cap IP ni cap capçalera de geolocalització; la política de permisos
manté `geolocation=()`.

Els logs estructurats només inclouen codi de comarca, estat de cache, durada i
estat de cada font. No inclouen dades de lector ni contingut de notificacions.

## Degradació, qualitat i reversió

- Una font fallida no elimina les altres dues.
- Una font vàlida sense resultats es mostra com a buida, no com a error.
- Les URL externes han de ser HTTPS i els textos upstream es tracten com a text,
  mai com a HTML renderitzable.
- La resposta de l’Agenda té límit de 150 KB. Els JSON de RAISC i Idescat tenen
  un límit de 300 KB, a més de `select`, rang temporal i `limit`.
- El canvi no afegeix secrets, bindings, crons ni migracions.

Per revertir staging, es pot tornar a la versió anterior del Worker. Les claus
`territorial:v1:*` expiren soles en 24 hores i no afecten `latest` ni cap dada
editorial. Producció no s’ha de publicar sense confirmació explícita.

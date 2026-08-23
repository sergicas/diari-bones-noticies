# Fase editorial prioritària — qualitat abans que volum

Data d’inici: 27 de juliol de 2026  
Estat: implementada i desplegada; la Fase 4 funcional queda en pausa fins que
una edició automàtica completa superi l’observació editorial

## Per què existeix

L’auditoria de producció del 27 de juliol va trobar 14 peces amb una mediana
d’unes 30 paraules, cap cos de més de 43, sis peces de Cultura i quatre
verificacions amb la mateixa plantilla. El problema no era visual: el pipeline
considerava “propi” qualsevol cos no buit i només facilitava a la reescriptura
un resum molt curt.

La regla nova és: **una peça generada no és necessàriament publicable**.

## Estàndard mínim per format

| Format | Cos mínim | Frases mínimes | Impacte mínim |
|---|---:|---:|---:|
| Notícia constructiva | 45 paraules | 2 | 8 paraules |
| Verificació | 45 paraules | 2 | 8 paraules |
| Agenda | 40 paraules | 2 | 8 paraules |
| Oportunitat | 30 paraules | 2 | 8 paraules |
| Dada pública | 25 paraules | 1 | 8 paraules |

A més:

- titular de 5 a 20 paraules;
- font i URL obligatòries;
- cap plantilla genèrica ni instrucció de “consultar la font” com a substitut
  del contingut;
- l’impacte no pot repetir literalment el cos;
- frases com “Permet conèixer” o “Informa sobre” no superen la barrera;
- si el material factual és insuficient, la peça no es publica.

La implementació executable és a `src/server/editorialQuality.js`.

## Canvis de pipeline

1. El context intern de la font pot arribar a 1.400 caràcters i aprofita també
   `content:encoded` dels RSS.
2. Aquest context només serveix per reescriure: s’elimina abans de desar o
   retornar la peça.
3. La reescriptura demana entre 80 i 150 paraules, de quatre a sis frases i un
   mínim de tres fets concrets.
4. Les verificacions ja no reben una plantilla automàtica: han d’explicar
   afirmació, veredicte i evidència.
5. Agenda sense prou detalls no entra. RAISC i Idescat produeixen peces de
   servei estructurades amb dades concretes.
6. La portada té un màxim de 12 peces, un sostre estricte de tres per font i
   límits per categoria. Si no hi ha prou diversitat, l'edició queda més curta:
   els excedents d'una font no es recuperen per omplir-la.
7. Les reescriptures antigues queden invalidades (`own:v2`) i les URL es tornen
   a avaluar amb la memòria `seen-urls-v4`.
8. Les fonts declarades com a no obertes al mateix catàleg s’han retirat del
   radar actiu.
9. La ruta pública és només de lectura: mai inicia una regeneració llarga. El
   cron, la cua o l’endpoint manual preparen l’edició fora de la visita.
10. Si hi ha menys de sis peces actuals publicables, la portada es completa amb
    articles de fons de l’hemeroteca, amb la data original i un avís explícit.

## Estat de producció del 27 de juliol

- dues peces actuals de fonts oficials han superat la barrera i s’han restaurat
  a KV;
- l’API pública respon amb HTTP 200 sense regeneració síncrona;
- la portada conserva un mínim de sis peces llegibles sense presentar
  l’hemeroteca com si fos actualitat;
- versió desplegada del Worker:
  `d03ef1d2-aafc-48a2-9de5-e69116acb64a`;
- validació: 228 proves, lint, build, auditor d’articles i dry-run del Worker.

## Condició per reprendre la Fase 4

Durant una edició real a `bondiari.com`:

- totes les peces superen la barrera automàtica;
- no hi ha cossos repetits;
- cap categoria ocupa més del límit establert;
- una revisió manual confirma fidelitat, utilitat i correspondència visual;
- la suite completa, lint, build i dry-run del Worker són verds.

La barrera és un mínim, no un substitut de l’edició humana.

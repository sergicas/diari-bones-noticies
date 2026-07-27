# Fase 3: centre d’operacions

## Què aporta

La ruta privada `/diagnostic` respon una pregunta senzilla: **el diari està
funcionant bé ara mateix?**

La pantalla reuneix:

- fonts de notícies operatives o temporalment pausades;
- hora i durada de l’última actualització;
- notícies i edicions guardades a D1;
- tasques completades, actives, fallides o encallades;
- missatges pendents a les cues d’ingesta i distribució;
- alertes amb prioritat d’avís o crítica;
- recompte i llista privada de subscriptors confirmats o pendents;
- historial dels darrers trenta dies.

## Accés

L’accés requereix `BONDIARI_FEED_HEALTH_TOKEN`. El token s’envia en una
capçalera, es guarda només a `sessionStorage` i s’esborra en tancar la sessió
del panell. No apareix en URLs, logs del navegador ni al repositori.

La secció de subscriptors llegeix el registre canònic que utilitza el butlletí.
Només mostra correu, idioma, estat i dates. Els tokens de confirmació i de baixa
no formen part de la resposta de l’API.

## Significat dels estats

- **Operació normal:** no hi ha incidències.
- **Seguiment recomanat:** el sistema continua publicant, però hi ha alguna
  font pausada, job fallit, cua endarrerida o falta telemetria recent.
- **Intervenció necessària:** D1 no respon, un job porta més de quinze minuts
  encallat, el cron ha perdut dues finestres o una cua supera els llindars
  crítics.

## Llindars

| Senyal | Avís | Crític |
| --- | --- | --- |
| Telemetria del cron | més de 14 h | més de 26 h |
| Backlog d’una cua | 10 missatges | 100 missatges |
| Missatge més antic | 15 min | 60 min |
| Job en processament | — | més de 15 min |

Els llindars són a `src/server/operationsHealth.js` i tenen proves
automatitzades.

## Seguretat operativa

El panell és de lectura. No permet reenviar jobs, purgar cues, modificar
notícies ni enviar correus. Les recuperacions continuen sent procediments
deliberats descrits a `docs/PHASE2-OPERATIONS.md`.

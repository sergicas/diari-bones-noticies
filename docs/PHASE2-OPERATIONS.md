# Fase 2: operativa editorial

## Arquitectura

La fase 2 separa el pipeline editorial en tres responsabilitats:

1. **KV** continua sent la memòria cau de lectura ràpida i la font compatible
   del butlletí durant la transició.
2. **D1** desa edicions, peces, historial de jobs, lliuraments i el mirall dels
   subscriptors.
3. **Queues** desacobla els crons de la ingesta i de la distribució. Cada
   missatge té una clau d’idempotència i els errors es reintenten abans d’anar
   a una DLQ.

La lectura d’una notícia consulta D1 primer i conserva KV i els articles
estàtics com a fallback. Les altes i confirmacions del butlletí fan dual-write;
la baixa esborra l’adreça de tots dos magatzems.

## Recursos

| Entorn | D1 | Cua d’ingesta | Cua de distribució |
| --- | --- | --- | --- |
| Producció | `bondiari-editorial` | `bondiari-ingest` | `bondiari-distribute` |
| Staging | `bondiari-editorial-staging` | `bondiari-ingest-staging` | `bondiari-distribute-staging` |

Cada cua té una DLQ homònima amb el sufix `-dlq`. Els namespaces KV de staging
també són independents. Els IDs i bindings són a `wrangler.jsonc`.

## Migracions

```bash
npm run db:migrate:local
npm run db:migrate:staging
npm run db:migrate:production
```

Ordre de publicació: migració compatible, verificació, staging, prova
d’ingesta, producció. Les migracions destructives s’han de dividir en
`expandir → migrar dades → canviar lectures → retirar` i mai compartir el
mateix desplegament que introdueix el nou lector.

## Prova segura del pipeline

Configura un token diferent a cada entorn:

```bash
npx wrangler secret put BONDIARI_REFRESH_TOKEN --env staging
```

Una ingesta manual sense distribució:

```bash
curl -X POST \
  -H "Authorization: Bearer $BONDIARI_REFRESH_TOKEN" \
  -H "Idempotency-Key: smoke-$(date +%Y%m%d)-1" \
  -H "Content-Type: application/json" \
  --data '{"distribution":"none"}' \
  https://bondiari-staging.sergicas.workers.dev/api/pipeline-trigger
```

`distribution` només admet `none`, `daily` o `social`. A staging s’ha d’usar
`none` excepte en una prova deliberada dels canals.

## Diagnòstic

L’estat combinat de D1 i les cues és privat:

```bash
curl \
  -H "Authorization: Bearer $BONDIARI_REFRESH_TOKEN" \
  https://bondiari-staging.sergicas.workers.dev/api/pipeline-health
```

Consultes útils:

```bash
npx wrangler d1 execute EDITORIAL_DB --env staging --remote \
  --command "SELECT idempotency_key, job_type, status, attempts, last_error, updated_at FROM pipeline_jobs ORDER BY updated_at DESC LIMIT 20"

npx wrangler queues info bondiari-ingest-staging
npx wrangler queues info bondiari-distribute-staging
```

Els logs estructurats utilitzen els esdeveniments:

- `cron.refresh.queued`
- `pipeline.message.completed`
- `pipeline.message.failed`
- `pipeline.health.failed`
- `newsletter.d1-mirror.failed`

## Recuperació

- **Job fallit:** corregeix la causa i torna a enviar-lo amb una nova
  `Idempotency-Key`.
- **Missatges a DLQ:** inspecciona primer els logs i D1. No purguis ni
  reprodueixis missatges sense identificar-ne l’efecte extern.
- **D1 no disponible:** les lectures de notícia mantenen el fallback a KV i al
  paquet estàtic. El cron no perd el missatge perquè Queues el reintenta.
- **Desplegament defectuós:** restaura la versió anterior del Worker; no
  reverteixis una migració compatible. Publica una migració correctiva.
- **Staging actiu accidentalment:** confirma que `env.staging.triggers.crons`
  continua sent una llista buida.

## Pas a producció

Abans d’activar el codi nou al Worker principal:

1. `npm run verify`
2. comprovar un job complet a D1 de staging;
3. comprovar que no hi ha missatges a les DLQ;
4. `npm run db:migrate:production`;
5. `npm run deploy`;
6. consultar `/api/pipeline-health` i els logs després del primer cron.

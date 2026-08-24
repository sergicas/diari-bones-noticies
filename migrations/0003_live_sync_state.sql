-- L'APROVACIÓ HUMANA NO ES DESFÀ MAI (14-08-2026)
--
-- Fins ara, si la peça no arribava al web s'anul·lava l'aprovació i tornava a
-- la sala. Semblava prudent i era just al revés: KV té consistència eventual,
-- de manera que "no ho he pogut confirmar" NO vol dir "no s'ha publicat". Una
-- lectura endarrerida feia que una peça aprovada per una persona tornés a
-- constar com a esborrany mentre continuava sent pública. Exactament la
-- inversió que la porta d'aprovació ha d'evitar.
--
-- Ara la decisió humana és definitiva a D1 i el que té estat és la SINCRONIA
-- amb el web:
--   pending → aprovada, encara no confirmada al lot públic
--   live    → confirmada
--
-- El radar, que ja reescriu el lot a cada passada, s'encarrega de posar-hi les
-- que hagin quedat pendents. És idempotent: reconstruir sempre dona el mateix.

ALTER TABLE stories ADD COLUMN live_state TEXT;

-- Les que ja eren públiques abans d'aquesta migració ja hi són: no s'han de
-- tornar a sincronitzar.
UPDATE stories
   SET live_state = 'live'
 WHERE human_decision = 'approve';

CREATE INDEX IF NOT EXISTS stories_live_state_idx
  ON stories (live_state, published_at DESC);

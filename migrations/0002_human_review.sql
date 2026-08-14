-- RASTRE D'APROVACIÓ HUMANA (14-08-2026)
--
-- La porta d'aprovació donava per bona qualsevol fila de D1 amb estat públic.
-- Però la taula porta 209 peces publicades per l'automatisme ANTERIOR, d'abans
-- del gir editorial i d'abans que existís cap revisió humana. Si una d'aquelles
-- es tornava a recollir, entrava a portada sola: el sistema no sabia distingir
-- "ho va aprovar una persona" de "ho va publicar el robot d'abans".
--
-- Aquestes dues columnes ho fan explícit. Les files antigues queden a NULL i,
-- per tant, tornen a revisió si mai reapareixen.
--
-- També és el començament del registre d'auditoria: qui decideix, quan, i què.

ALTER TABLE stories ADD COLUMN human_reviewed_at TEXT;
ALTER TABLE stories ADD COLUMN human_decision TEXT;

-- Consultar les pendents i les decidides ha de ser barat: la sala de revisió
-- ho fa a cada visita i l'avís del matí hi compta.
CREATE INDEX IF NOT EXISTS stories_human_decision_idx
  ON stories (human_decision, human_reviewed_at DESC);

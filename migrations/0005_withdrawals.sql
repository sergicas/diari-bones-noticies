-- RETIRAR UNA PEÇA ÉS UNA ORDRE DURABLE, NO UNA ESCRIPTURA DES DE LA SALA
-- (15-08-2026)
--
-- El primer intent retirava la peça escrivint directament a KV des de la
-- petició de la sala. Això reobria el problema que hem passat tot el projecte
-- tancant: dos escriptors del lot públic. `max_concurrency: 1` serialitza el
-- consumidor de la cua, no les peticions HTTP; i KV no té operacions atòmiques
-- de llegir-modificar-escriure, així que les dues escriptures es poden
-- trepitjar. A sobre, si la retirada fallava, la sala deia "Descartada"
-- igualment i la còpia story:<id> es quedava pública.
--
-- Ara la persona grava una ORDRE a D1 i el radar —únic escriptor del lot— la
-- compleix. I mentre l'ordre existeix, D1 fa de veto: les lectures públiques
-- la consulten abans de creure's res del que hi hagi a KV.

ALTER TABLE stories ADD COLUMN withdrawal TEXT;

CREATE INDEX IF NOT EXISTS stories_withdrawal_idx
  ON stories (withdrawal);

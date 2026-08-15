-- L'AJUDANT DE REDACCIÓ DECIDEIX, PERÒ MAI ES FA PASSAR PER UNA PERSONA
-- (15-08-2026)
--
-- Sergi ha demanat que el diari es publiqui sol i que la revisió diària deixi
-- de ser una obligació. Això vol dir que hi haurà peces publicades sense que
-- ningú les hagi llegides.
--
-- La condició per fer-ho amb cara i ulls és que MAI es confongui qui ha
-- decidit. `human_decision` es reserva per a les persones i no la toca ningú
-- més; les decisions de la màquina viuen a part, amb el seu motiu escrit.
--
-- Així, en qualsevol moment es pot respondre: qui va deixar passar això, i per
-- què. I si un dia es vol tornar enrere, se sap exactament quines peces va
-- publicar la màquina tota sola.

ALTER TABLE stories ADD COLUMN auto_decision TEXT;
ALTER TABLE stories ADD COLUMN auto_reason TEXT;
ALTER TABLE stories ADD COLUMN auto_decided_at TEXT;

-- La sala llegeix per aquí per ensenyar què ha fet sol i deixar-ho desfer.
CREATE INDEX IF NOT EXISTS stories_auto_decision_idx
  ON stories (auto_decision, auto_decided_at DESC);

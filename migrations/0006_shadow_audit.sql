-- L'OMBRA HA DE DEIXAR PROVES, NO RECOMPTES (15-08-2026)
--
-- El primer mode d'ombra només escrivia al registre quantes peces hauria
-- publicat i cinc exemples. Amb això no es pot avaluar res: passats uns dies
-- no hi ha manera de comparar, peça a peça, què hauria fet l'ajudant amb què
-- va fer la persona.
--
-- Aquestes columnes desen el veredicte de CADA candidata, amb el motiu, la
-- data i la versió del model i del prompt. Són independents d'`auto_decision`
-- perquè en ombra l'ajudant no decideix res: només opina, i l'opinió s'ha de
-- poder contrastar després amb la decisió humana de la mateixa peça.

ALTER TABLE stories ADD COLUMN shadow_decision TEXT;
ALTER TABLE stories ADD COLUMN shadow_reason TEXT;
ALTER TABLE stories ADD COLUMN shadow_at TEXT;
ALTER TABLE stories ADD COLUMN shadow_version TEXT;

CREATE INDEX IF NOT EXISTS stories_shadow_idx
  ON stories (shadow_decision, shadow_at DESC);

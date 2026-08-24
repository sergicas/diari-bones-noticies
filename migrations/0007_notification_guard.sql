-- NOTIFICACIONS ASSENYADES (24-08-2026)
--
-- D1 fa de pany atòmic abans de cada enviament. KV continua guardant la
-- subscripció del dispositiu i l'opció triada, però no és prou consistent per
-- garantir tot sol el topall irreversible d'un avís al dia.

CREATE TABLE IF NOT EXISTS notification_delivery_claims (
  delivery_day TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('web', 'apns')),
  recipient_hash TEXT NOT NULL,
  story_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (delivery_day, channel, recipient_hash)
);

CREATE INDEX IF NOT EXISTS notification_delivery_claims_created_idx
  ON notification_delivery_claims (created_at DESC);

CREATE TABLE IF NOT EXISTS notification_selections (
  delivery_day TEXT PRIMARY KEY,
  story_id TEXT NOT NULL,
  category TEXT,
  impact_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

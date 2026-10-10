CREATE TABLE ceyhan_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  revision INTEGER NOT NULL DEFAULT 0,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO ceyhan_state (id) VALUES (1);

CREATE TABLE ceyhan_records (
  collection TEXT NOT NULL CHECK (collection IN ('garaj', 'giderler', 'kiralar', 'satislar')),
  id TEXT NOT NULL,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (collection, id)
);

CREATE INDEX ceyhan_expense_tractor ON ceyhan_records ((data ->> 'traktorId')) WHERE collection = 'giderler';

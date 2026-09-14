-- migrations/custom-tables.sql

-- Баланс кредитов пользователей (1 картинка = 1 кредит)
CREATE TABLE IF NOT EXISTS credits (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ключи HuggingFace с квотой ZeroGPU
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hf_base INTEGER,
  hf_current REAL,
  hf_resets_at TIMESTAMPTZ,
  hf_checked_at TIMESTAMPTZ,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- История генераций
CREATE TABLE IF NOT EXISTS generations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  model VARCHAR(50) NOT NULL DEFAULT 'Turbo',
  width INTEGER NOT NULL DEFAULT 1024,
  height INTEGER NOT NULL DEFAULT 1024,
  steps INTEGER NOT NULL DEFAULT 8,
  seed INTEGER,
  image_key TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  duration_ms INTEGER,
  api_key_id TEXT REFERENCES api_keys(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generations_user_id ON generations(user_id);
CREATE INDEX IF NOT EXISTS idx_generations_created_at ON generations(created_at);

-- Миграция: замена used_today/daily_limit на hf_* колонки (для существующих БД)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'api_keys' AND column_name = 'used_today') THEN
    ALTER TABLE api_keys DROP COLUMN used_today;
    ALTER TABLE api_keys DROP COLUMN daily_limit;
    ALTER TABLE api_keys DROP COLUMN last_used_at;
    ALTER TABLE api_keys DROP COLUMN last_reset_at;
    ALTER TABLE api_keys ADD COLUMN hf_base INTEGER;
    ALTER TABLE api_keys ADD COLUMN hf_current REAL;
    ALTER TABLE api_keys ADD COLUMN hf_resets_at TIMESTAMPTZ;
    ALTER TABLE api_keys ADD COLUMN hf_checked_at TIMESTAMPTZ;
  END IF;
END $$;

-- migrations/custom-tables.sql

-- Баланс кредитов пользователей (1 картинка = 1 кредит)
CREATE TABLE IF NOT EXISTS credits (
  user_id TEXT PRIMARY KEY,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Ключи HuggingFace с квотой ZeroGPU (секунды + суточные прогоны runs)
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  hf_base INTEGER,
  hf_current REAL,
  hf_resets_at TIMESTAMPTZ,
  hf_checked_at TIMESTAMPTZ,
  hf_runs_remaining INTEGER,
  hf_runs_limit INTEGER,
  hf_runs_resets_at TIMESTAMPTZ,
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

-- Провайдеры ключей: huggingface (картинки) | poolside (LLM-обогащение промпта)
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS provider VARCHAR(20) NOT NULL DEFAULT 'huggingface';
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_limit INTEGER;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_remaining INTEGER;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS rl_checked_at TIMESTAMPTZ;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS requests_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tokens_total BIGINT NOT NULL DEFAULT 0;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Суточный лимит прогонов ZeroGPU (runs): без него ключи выжигались при остатке секунд
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'api_keys' AND column_name = 'hf_runs_remaining'
  ) THEN
    -- разово возвращаем в строй HF-ключи, отключённые старой логикой при исчерпании прогонов;
    -- дальше доступность определяет фильтр по квоте, а не is_active
    UPDATE api_keys SET is_active = TRUE WHERE provider = 'huggingface' AND is_active = FALSE;
  END IF;
END $$;

ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS hf_runs_remaining INTEGER;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS hf_runs_limit INTEGER;
ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS hf_runs_resets_at TIMESTAMPTZ;

-- Обогащение промпта (LLM-слой 42-стиля)
ALTER TABLE generations ADD COLUMN IF NOT EXISTS enhanced_prompt TEXT;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS llm_key_id TEXT REFERENCES api_keys(id);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS llm_model VARCHAR(64);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS llm_tokens INTEGER;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS enhance_ms INTEGER;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS style_version VARCHAR(16);

-- Удаление использованного LLM-ключа не должно падать: ссылка обнуляется
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_llm_key_id_fkey'
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE generations DROP CONSTRAINT generations_llm_key_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generations_llm_key_id_fkey'
  ) THEN
    ALTER TABLE generations
      ADD CONSTRAINT generations_llm_key_id_fkey
      FOREIGN KEY (llm_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Движок генерации (krea | ideogram) и списанная за неё стоимость в кредитах
ALTER TABLE generations ADD COLUMN IF NOT EXISTS engine VARCHAR(20) NOT NULL DEFAULT 'krea';
ALTER TABLE generations ADD COLUMN IF NOT EXISTS cost INTEGER NOT NULL DEFAULT 1;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generations_engine_check'
  ) THEN
    ALTER TABLE generations
      ADD CONSTRAINT generations_engine_check
      CHECK (engine IN ('krea', 'ideogram'));
  END IF;
END $$;

-- Неуспешные генерации тоже пишутся (status = 'failed', причина в error_message)
-- и чаще ссылаются на HF-ключ: удаление ключа обнуляет ссылку, а не падает
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'generations_api_key_id_fkey'
      AND confdeltype <> 'n'
  ) THEN
    ALTER TABLE generations DROP CONSTRAINT generations_api_key_id_fkey;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'generations_api_key_id_fkey'
  ) THEN
    ALTER TABLE generations
      ADD CONSTRAINT generations_api_key_id_fkey
      FOREIGN KEY (api_key_id) REFERENCES api_keys(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_generations_status ON generations(status);

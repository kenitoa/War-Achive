CREATE TABLE IF NOT EXISTS members (
  id text PRIMARY KEY,
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_sessions (
  token_hash text PRIMARY KEY,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_sessions_member ON member_sessions(member_id);
CREATE INDEX IF NOT EXISTS member_sessions_expiry ON member_sessions(expires_at);
CREATE TABLE IF NOT EXISTS member_shelves (
  member_id text PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS member_reset_tokens (
  token_hash text PRIMARY KEY,
  member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS member_reset_expiry ON member_reset_tokens(expires_at);

ALTER TABLE jobs DROP CONSTRAINT jobs_kind_check;
ALTER TABLE jobs ADD CONSTRAINT jobs_kind_check CHECK(kind IN ('collect','normalize','publish','produce','cleanup'));
CREATE TABLE productions (id text PRIMARY KEY,record_id text NOT NULL REFERENCES records(id),revision integer NOT NULL,data jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX productions_record ON productions(record_id,created_at DESC);

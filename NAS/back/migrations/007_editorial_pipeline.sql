CREATE TABLE editorial_articles (
 id text PRIMARY KEY,
 slug text NOT NULL UNIQUE,
 status text NOT NULL CHECK(status IN ('draft','review','approved','scheduled','publishing','published','failed','withdrawn')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 document jsonb NOT NULL,
 automatic_key text UNIQUE,
 run_at timestamptz NOT NULL DEFAULT now(),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 lease_until timestamptz,
 owner text,
 last_error text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX editorial_ready ON editorial_articles(status,run_at);
CREATE TABLE editorial_versions (
 article_id text NOT NULL REFERENCES editorial_articles(id),
 revision integer NOT NULL,
 document jsonb NOT NULL,
 status text NOT NULL,
 actor text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(article_id,revision)
);
CREATE TABLE blog_publications (
 article_id text NOT NULL REFERENCES editorial_articles(id),
 revision integer NOT NULL,
 slug text NOT NULL,
 document jsonb NOT NULL,
 sha256 text NOT NULL,
 published_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(article_id,revision)
);
CREATE INDEX blog_recent ON blog_publications(published_at DESC);

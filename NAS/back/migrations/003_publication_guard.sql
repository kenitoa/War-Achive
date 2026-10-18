CREATE TABLE IF NOT EXISTS publication_guard (id integer PRIMARY KEY CHECK(id=1));
INSERT INTO publication_guard(id) VALUES(1) ON CONFLICT DO NOTHING;

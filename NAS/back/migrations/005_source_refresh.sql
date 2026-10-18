ALTER TABLE raw_items ADD COLUMN ingest_sequence bigint GENERATED ALWAYS AS IDENTITY;
CREATE INDEX raw_items_latest ON raw_items(source_id,identifier,ingest_sequence DESC);

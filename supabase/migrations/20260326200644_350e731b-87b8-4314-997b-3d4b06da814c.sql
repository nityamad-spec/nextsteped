ALTER TABLE concepts RENAME COLUMN concept_id TO concept_code;
ALTER TABLE concepts ADD CONSTRAINT concepts_concept_code_unique UNIQUE (concept_code);
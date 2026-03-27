ALTER TABLE diagnostic_results
  ADD COLUMN question_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN course_id uuid;
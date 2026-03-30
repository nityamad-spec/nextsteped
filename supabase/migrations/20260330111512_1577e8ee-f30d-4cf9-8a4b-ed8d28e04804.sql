ALTER TABLE course_ta_settings
  ADD COLUMN quiz_day1_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN quiz_day2_enabled boolean NOT NULL DEFAULT false;
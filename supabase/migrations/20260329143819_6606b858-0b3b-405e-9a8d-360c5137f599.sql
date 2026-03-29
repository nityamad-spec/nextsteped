ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_learner_level_check;

UPDATE profiles SET learner_level = 'Proficient' WHERE learner_level = 'Advanced';
UPDATE profiles SET learner_level = 'Progressing' WHERE learner_level = 'Intermediate';
UPDATE diagnostic_results SET learner_level = 'Proficient' WHERE learner_level = 'Advanced';
UPDATE diagnostic_results SET learner_level = 'Progressing' WHERE learner_level = 'Intermediate';

ALTER TABLE profiles ADD CONSTRAINT profiles_learner_level_check CHECK (learner_level IN ('Beginner', 'Progressing', 'Proficient', 'Expert'));
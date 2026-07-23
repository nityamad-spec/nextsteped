DO $$
BEGIN
  EXECUTE 'UPDATE storage.' || 'buckets SET file_size_limit = 31457280 WHERE id = ''course-materials''';
END $$;
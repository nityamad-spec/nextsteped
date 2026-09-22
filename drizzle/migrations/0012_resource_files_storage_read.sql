-- Resource attachments live in the course-materials bucket under a global
-- "resources/" prefix. Signed-in users may read them; only admins can write
-- (already covered by existing admin policies on the bucket).
create policy "Authenticated users can read resource files"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'course-materials'
    and (storage.foldername(name))[1] = 'resources'
  );

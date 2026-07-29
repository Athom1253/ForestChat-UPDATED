INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('avatars', 'avatars', true, false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow avatar uploads" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Allow avatar selects" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

CREATE POLICY "Allow avatar updates" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'avatars');

CREATE POLICY "Allow avatar deletes" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'avatars');

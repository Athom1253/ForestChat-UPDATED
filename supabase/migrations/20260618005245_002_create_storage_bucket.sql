/*
# Create Storage Bucket for Chat Attachments

1. New Storage
- Creates a public storage bucket named `chat-attachments`
- Used for images, files, and media shared in chat messages

2. Security
- Enables public access for uploads and downloads
- Uses RLS policies for the bucket
*/

INSERT INTO storage.buckets (id, name, public, avif_autodetection)
VALUES ('chat-attachments', 'chat-attachments', true, false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public selects" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public updates" ON storage.objects
  FOR UPDATE TO anon, authenticated USING (bucket_id = 'chat-attachments');

CREATE POLICY "Allow public deletes" ON storage.objects
  FOR DELETE TO anon, authenticated USING (bucket_id = 'chat-attachments');

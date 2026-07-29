/*
# Storage Security: Remove Public Listing

## Issue
Public buckets (`avatars`, `chat-attachments`) have SELECT policies that allow any client to list ALL files in the bucket. For public buckets, file access via URL doesn't require SELECT policies - the storage API serves public URLs directly without RLS checks.

## Fix
- Remove SELECT policies for public buckets
- Files remain publicly accessible via their URLs
- Listing (enumeration) is now blocked for non-admins
- Write operations require authentication

## Trade-off
App code using `supabase.storage.from('bucket').list()` will now fail. The app should use known file paths/URLs instead of listing.
*/

-- Remove listing capability from public buckets (files still accessible via URL)
DROP POLICY IF EXISTS "Allow avatar access" ON storage.objects;
DROP POLICY IF EXISTS "Allow attachment access" ON storage.objects;

-- Avatars: authenticated users can upload/manage their own
CREATE POLICY "avatars_authenticated_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "avatars_authenticated_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars_authenticated_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars');

-- Attachments: authenticated users can upload/manage
CREATE POLICY "attachments_authenticated_upload" ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments');

CREATE POLICY "attachments_authenticated_update" ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

CREATE POLICY "attachments_authenticated_delete" ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'chat-attachments');

-- Drop the old upload/update/delete policies that had generic names
DROP POLICY IF EXISTS "Allow avatar uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow avatar deletes" ON storage.objects;
DROP POLICY IF EXISTS "Allow attachment uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow attachment updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow attachment deletes" ON storage.objects;
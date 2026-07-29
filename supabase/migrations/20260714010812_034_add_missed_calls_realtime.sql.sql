/*
# Add missed_calls to realtime publication
*/

ALTER PUBLICATION supabase_realtime ADD TABLE public.missed_calls;
ALTER TABLE public.missed_calls REPLICA IDENTITY FULL;

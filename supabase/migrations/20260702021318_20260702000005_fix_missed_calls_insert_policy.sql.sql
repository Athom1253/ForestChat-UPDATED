/*
# Fix missed_calls INSERT policy

## Issue
The missed_calls INSERT policy required auth.uid() = caller_id, but the app
inserts missed call records from the CALLEE's side (when they decline a call).
The callee is auth.uid(), not the caller — so the insert was blocked by RLS.

## Fix
Allow either the caller or the callee to insert a missed call record, since
either party may record a missed/declined call.
*/
DROP POLICY IF EXISTS "missed_calls_insert" ON missed_calls;

CREATE POLICY "missed_calls_insert" ON missed_calls FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = caller_id OR auth.uid() = callee_id);

/*
# Clean up orphaned 1-member DMs from old bug

Two DMs (fd492a36, 1945aedd) have only 1 member — the second membership
was never created due to the old get_or_create_dm bug that failed before
inserting the second membership.

These orphaned DMs:
- Have 1 message each ("Hi" and "Test")
- Were created by "amy test" (7d0fa80e) trying to DM "amy" (7d0ebdfb)
- The "amy" membership was never added
- They clutter the sidebar and can never be properly used

The messages are preserved by moving them to the correct DM (8a2816cb)
which is the actual DM between "amy test" and "amy" that was created later
with both memberships.

After moving messages, the orphaned chats and their memberships are deleted.
*/

-- Move messages from orphaned DMs to the correct DM between amy test and amy
UPDATE messages
SET chat_id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34'
WHERE chat_id IN ('fd492a36-6d43-44c0-87eb-03e3f9efe194', '1945aedd-8048-4d60-ac3f-a78aef0e045f');

-- Delete orphaned DM memberships (only the 1 member)
DELETE FROM chat_memberships
WHERE chat_id IN ('fd492a36-6d43-44c0-87eb-03e3f9efe194', '1945aedd-8048-4d60-ac3f-a78aef0e045f');

-- Delete orphaned DM chats
DELETE FROM chats
WHERE id IN ('fd492a36-6d43-44c0-87eb-03e3f9efe194', '1945aedd-8048-4d60-ac3f-a78aef0e045f');

-- Update last_message_at for the correct DM
UPDATE chats
SET last_message_at = (SELECT MAX(created_at) FROM messages WHERE chat_id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34'),
    last_message_preview = (SELECT LEFT(content, 80) FROM messages WHERE chat_id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34' ORDER BY created_at DESC LIMIT 1)
WHERE id = '8a2816cb-58a2-4010-8ecb-f3b691cb6f34';

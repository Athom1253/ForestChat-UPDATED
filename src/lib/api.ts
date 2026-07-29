import { supabase } from './supabase'
import type { AppUser, Chat, ChatMembership, Message, ChatInvite, Friend, InviteCode } from './types'
import type { AnimationPrefs } from './store'
import { logAction, startAction, endAction } from '../components/DebugPanel'

// ── Users ─────────────────────────────────────────────────────────────────────

export async function createUser(username: string, displayName?: string, avatarUrl?: string): Promise<AppUser> {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Not authenticated')

  const { data: existing } = await supabase
    .from('app_users')
    .select('id')
    .eq('id', authUser.id)
    .maybeSingle()

  if (existing) throw new Error('User profile already exists')

  const { data: usernameExists } = await supabase
    .from('app_users')
    .select('id')
    .eq('username', username)
    .maybeSingle()

  if (usernameExists) throw new Error('Username already taken')

  // First registered user becomes admin automatically
  const { count } = await supabase
    .from('app_users')
    .select('*', { count: 'exact', head: true })
  const isFirstUser = (count ?? 0) === 0

  const { data, error } = await supabase
    .from('app_users')
    .insert({
      id: authUser.id,
      username,
      display_name: displayName || username,
      avatar_url: avatarUrl || null,
      status: 'online',
      last_seen: new Date().toISOString(),
      is_admin: isFirstUser,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function getUserByUsername(username: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('username', username)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getUserById(id: string): Promise<AppUser | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateUser(id: string, updates: Partial<AppUser>): Promise<AppUser> {
  const { data, error } = await supabase
    .from('app_users')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateLastSeen(id: string) {
  await supabase
    .from('app_users')
    .update({ last_seen: new Date().toISOString(), status: 'online' })
    .eq('id', id)
}

export async function setUserOffline(id: string) {
  await supabase
    .from('app_users')
    .update({ status: 'offline', last_seen: new Date().toISOString() })
    .eq('id', id)
}

export async function saveAnimationPrefs(userId: string, prefs: AnimationPrefs): Promise<void> {
  await supabase
    .from('app_users')
    .update({ animation_prefs: prefs as any })
    .eq('id', userId)
}

export async function loadAnimationPrefs(userId: string): Promise<AnimationPrefs | null> {
  const { data, error } = await supabase
    .from('app_users')
    .select('animation_prefs')
    .eq('id', userId)
    .maybeSingle()

  if (error || !data) return null
  return data.animation_prefs as AnimationPrefs | null
}

export async function getAllUsers(limit = 100): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .order('last_seen', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}

export async function searchUsers(query: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('app_users')
    .select('*')
    .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
    .limit(20)

  if (error) throw error
  return data || []
}

// ── Chats ─────────────────────────────────────────────────────────────────────

export async function createChat(
  name: string,
  type: 'group' | 'dm',
  _userId?: string,
  _members: string[] = [],
  description?: string,
  avatarUrl?: string,
  inviteCode?: string
): Promise<Chat> {
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser) throw new Error('Not authenticated')
  const userId = authUser.id

  // Use the SECURITY DEFINER RPC to create the chat + owner membership
  // atomically. A plain .insert().select() fails because the chats SELECT
  // policy (is_chat_member) filters the RETURNING clause before the
  // creator's membership row exists — a chicken-and-egg RLS problem.
  // The RPC runs as the table owner (RLS bypassed) and verifies the
  // caller via auth.uid(), so authorization stays server-side.
  if (type === 'group') {
    const { data: chatId, error: rpcError } = await supabase.rpc('create_group_chat', {
      p_name: name,
      p_description: description || '',
      p_avatar_url: avatarUrl || null,
      p_invite_code: inviteCode || null,
      p_owner_id: userId,
    })
    if (rpcError) throw rpcError

    const { data: chat, error: fetchError } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single()
    if (fetchError) throw fetchError
    return chat
  }

  // DMs already use create_dm_with_members (another SECURITY DEFINER RPC)
  const { data: dmChatId, error: dmError } = await supabase.rpc('create_dm_with_members', {
    p_user_a: userId,
    p_user_b: _members[0] || userId,
  })
  if (dmError) throw dmError
  const { data: dmChat, error: dmFetchError } = await supabase
    .from('chats')
    .select('*')
    .eq('id', dmChatId)
    .single()
  if (dmFetchError) throw dmFetchError
  return dmChat
}

export async function getChatsForUser(_userId?: string) {
  const { data, error } = await supabase
    .from('chat_memberships')
    .select('chat_id, role, is_muted, is_pinned, is_archived, joined_at, chats(*)')

  if (error) throw error
  return data || []
}

export async function getChatById(chatId: string): Promise<Chat | null> {
  const { data, error } = await supabase
    .from('chats')
    .select('*')
    .eq('id', chatId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateChat(chatId: string, updates: Partial<Chat>) {
  const { data, error } = await supabase
    .from('chats')
    .update(updates)
    .eq('id', chatId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteChat(chatId: string) {
  await supabase.from('chats').delete().eq('id', chatId)
}

export async function regenerateInviteCode(chatId: string, createdBy: string): Promise<string> {
  const newCode = Math.random().toString(36).slice(2, 10).toUpperCase()
  await supabase.from('chats').update({ invite_code: newCode }).eq('id', chatId)
  const { data: existing } = await supabase
    .from('chat_invites')
    .select('id')
    .eq('chat_id', chatId)
    .maybeSingle()
  if (existing) {
    await supabase
      .from('chat_invites')
      .update({ code: newCode, uses_count: 0 })
      .eq('chat_id', chatId)
  } else {
    await supabase.from('chat_invites').insert({ chat_id: chatId, code: newCode, created_by: createdBy })
  }
  return newCode
}

export async function getChatMembers(chatId: string): Promise<AppUser[]> {
  const { data, error } = await supabase
    .from('chat_memberships')
    .select('user_id, role, app_users(*)')
    .eq('chat_id', chatId)

  if (error) throw error
  return (data || []).map((row: any) => ({ ...row.app_users, _role: row.role } as AppUser & { _role: string }))
}

export async function getChatMembership(chatId: string, userId: string): Promise<ChatMembership | null> {
  const { data, error } = await supabase
    .from('chat_memberships')
    .select('*')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function joinChatByInvite(code: string, userId: string): Promise<{ success: boolean; chatId?: string; error?: string }> {
  // Look up the chat via chat_invites (readable by authenticated users) rather
  // than chats (which requires membership — the joining user isn't a member yet).
  const { data: invite } = await supabase
    .from('chat_invites')
    .select('chat_id')
    .eq('code', code)
    .maybeSingle()

  if (!invite) {
    // Fallback: some chats store invite_code on the chats table directly.
    // We can't read chats without membership, so try inserting membership by
    // matching the chats.invite_code via an RPC-like approach is not available;
    // instead return invalid. (chat_invites is the canonical source.)
    return { success: false, error: 'Invalid invite code' }
  }

  const chatId = invite.chat_id

  const { data: existing } = await supabase
    .from('chat_memberships')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) return { success: true, chatId }

  const { error: memError } = await supabase.from('chat_memberships').insert({
    chat_id: chatId,
    user_id: userId,
    role: 'member',
  })
  if (memError) throw memError

  return { success: true, chatId }
}

export async function leaveChat(chatId: string, userId: string) {
  await supabase
    .from('chat_memberships')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
}

export async function kickMember(chatId: string, userId: string) {
  await supabase
    .from('chat_memberships')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
}

export async function updateMemberRole(chatId: string, userId: string, role: 'admin' | 'member') {
  await supabase
    .from('chat_memberships')
    .update({ role })
    .eq('chat_id', chatId)
    .eq('user_id', userId)
}

export async function updateMembership(chatId: string, userId: string, updates: Partial<ChatMembership>) {
  await supabase
    .from('chat_memberships')
    .update(updates)
    .eq('chat_id', chatId)
    .eq('user_id', userId)
}

export async function clearChatHistory(chatId: string) {
  await supabase.from('messages').delete().eq('chat_id', chatId)
}

// ── Messages ──────────────────────────────────────────────────────────────────

export async function sendMessage(
  chatId: string,
  userId: string,
  content: string,
  parentId?: string,
  attachments?: Array<{ name: string; url: string; type: string; size?: number }>,
  messageType?: string
): Promise<Message> {
  const timer = startAction('sendMessage', userId)
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        chat_id: chatId,
        user_id: userId,
        content,
        parent_id: parentId || null,
        attachments: attachments || [],
        message_type: messageType || 'text',
      })
      .select()
      .single()

    if (error) throw error
    endAction(timer, 'sendMessage', 'success', `msg=${data.id.slice(0, 8)}`, userId)
    return data
  } catch (e: any) {
    endAction(timer, 'sendMessage', 'error', e.message, userId)
    throw e
  }
}

export async function getMessages(chatId: string, limit = 50, before?: string): Promise<Message[]> {
  let query = supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (before) {
    query = query.lt('created_at', before)
  }

  const { data, error } = await query
  if (error) throw error
  return (data || []).reverse()
}

export async function editMessage(messageId: string, content: string) {
  await supabase
    .from('messages')
    .update({ content, is_edited: true })
    .eq('id', messageId)
}

export async function softDeleteMessage(messageId: string) {
  const { data: msg } = await supabase.from('messages').select('content').eq('id', messageId).maybeSingle()
  const { data: { user } } = await supabase.auth.getUser()
  await supabase
    .from('messages')
    .update({ is_deleted: true, content: '', deleted_content: msg?.content || null, deleted_by: user?.id || null })
    .eq('id', messageId)
}

export async function restoreMessage(messageId: string) {
  const { data: msg } = await supabase.from('messages').select('deleted_content').eq('id', messageId).maybeSingle()
  await supabase
    .from('messages')
    .update({ is_deleted: false, content: msg?.deleted_content || '', deleted_content: null, deleted_by: null })
    .eq('id', messageId)
}

export async function purgeMessage(messageId: string) {
  await supabase
    .from('messages')
    .delete()
    .eq('id', messageId)
}

export async function pinMessage(messageId: string, pinned: boolean) {
  await supabase
    .from('messages')
    .update({ is_pinned: pinned })
    .eq('id', messageId)
}

export async function getPinnedMessages(chatId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('is_pinned', true)
    .order('created_at', { ascending: false })
    .limit(10)

  if (error) throw error
  return data || []
}

export async function searchMessages(chatId: string, query: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('chat_id', chatId)
    .eq('is_deleted', false)
    .ilike('content', `%${query}%`)
    .limit(50)

  if (error) throw error
  return data || []
}

// ── Reactions ─────────────────────────────────────────────────────────────────

export async function toggleReaction(messageId: string, userId: string, emoji: string) {
  const { data: existing } = await supabase
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle()

  if (existing) {
    await supabase.from('message_reactions').delete().eq('id', existing.id)
  } else {
    await supabase.from('message_reactions').insert({
      message_id: messageId,
      user_id: userId,
      emoji,
    })
  }
}

export async function getReactions(messageId: string) {
  const { data, error } = await supabase
    .from('message_reactions')
    .select('*')
    .eq('message_id', messageId)

  if (error) throw error
  return data || []
}

// ── Read Receipts ─────────────────────────────────────────────────────────────

export async function updateReadReceipt(chatId: string, userId: string, messageId: string) {
  const { data: existing } = await supabase
    .from('read_receipts')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('read_receipts')
      .update({ last_read_message_id: messageId, last_read_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase.from('read_receipts').insert({
      chat_id: chatId,
      user_id: userId,
      last_read_message_id: messageId,
    })
  }
}

export async function getUnreadCount(chatId: string, userId: string): Promise<number> {
  const { data: receipt } = await supabase
    .from('read_receipts')
    .select('last_read_at')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!receipt?.last_read_at) {
    const { count } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('chat_id', chatId)
      .eq('is_deleted', false)
    return Math.min(count || 0, 99)
  }

  const { count } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('chat_id', chatId)
    .eq('is_deleted', false)
    .gt('created_at', receipt.last_read_at)

  return Math.min(count || 0, 99)
}

// ── Typing ────────────────────────────────────────────────────────────────────

export async function updateTyping(chatId: string, userId: string) {
  const { data: existing } = await supabase
    .from('typing_indicators')
    .select('id')
    .eq('chat_id', chatId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase
      .from('typing_indicators')
      .update({ started_at: new Date().toISOString() })
      .eq('id', existing.id)
  } else {
    await supabase.from('typing_indicators').insert({
      chat_id: chatId,
      user_id: userId,
    })
  }
}

export async function clearTyping(chatId: string, userId: string) {
  await supabase
    .from('typing_indicators')
    .delete()
    .eq('chat_id', chatId)
    .eq('user_id', userId)
}

export async function getTypingUsers(chatId: string): Promise<AppUser[]> {
  const cutoff = new Date(Date.now() - 5000).toISOString()
  const { data, error } = await supabase
    .from('typing_indicators')
    .select('user_id, app_users(*)')
    .eq('chat_id', chatId)
    .gt('started_at', cutoff)

  if (error) throw error
  return (data || []).map((row: any) => row.app_users as AppUser)
}

// ── Friends ───────────────────────────────────────────────────────────────────

export async function sendFriendRequest(requesterId: string, addresseeId: string): Promise<Friend> {
  const timer = startAction('sendFriendRequest', requesterId)
  try {
    const { data: existing } = await supabase
      .from('friends')
      .select('id, status')
      .or(`and(requester_id.eq.${requesterId},addressee_id.eq.${addresseeId}),and(requester_id.eq.${addresseeId},addressee_id.eq.${requesterId})`)
      .maybeSingle()

    if (existing) {
      if (existing.status === 'accepted') {
        endAction(timer, 'sendFriendRequest', 'error', 'Already friends', requesterId)
        throw new Error('Already friends')
      }
      endAction(timer, 'sendFriendRequest', 'success', 'existing request found', requesterId)
      return existing as Friend
    }

    const { data, error } = await supabase
      .from('friends')
      .insert({ requester_id: requesterId, addressee_id: addresseeId, status: 'pending' })
      .select()
      .single()

    if (error) throw error
    endAction(timer, 'sendFriendRequest', 'success', `friend=${data.id.slice(0, 8)}`, requesterId)
    return data
  } catch (e: any) {
    endAction(timer, 'sendFriendRequest', 'error', e.message, requesterId)
    throw e
  }
}

export async function updateFriendStatus(id: string, status: 'accepted' | 'blocked' | 'pending') {
  await supabase
    .from('friends')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
}

export async function deleteFriend(id: string) {
  await supabase.from('friends').delete().eq('id', id)
}

export async function getFriends(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .eq('status', 'accepted')

  if (error) throw error
  return data || []
}

export async function getPendingRequests(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .eq('addressee_id', userId)
    .eq('status', 'pending')

  if (error) throw error
  return data || []
}

export async function getSentRequests(userId: string): Promise<Friend[]> {
  const { data, error } = await supabase
    .from('friends')
    .select('*')
    .eq('requester_id', userId)
    .eq('status', 'pending')

  if (error) throw error
  return data || []
}

// ── Block ─────────────────────────────────────────────────────────────────────

export async function blockUser(blockerId: string, blockedId: string) {
  await supabase.from('blocked_users').insert({ blocker_id: blockerId, blocked_id: blockedId })
}

export async function unblockUser(blockerId: string, blockedId: string) {
  await supabase
    .from('blocked_users')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId)
}

export async function getBlockedUsers(blockerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('blocked_users')
    .select('blocked_id')
    .eq('blocker_id', blockerId)

  if (error) throw error
  return (data || []).map((row) => row.blocked_id)
}

export async function isBlocked(userId: string, otherId: string): Promise<boolean> {
  const { data } = await supabase
    .from('blocked_users')
    .select('id')
    .or(`and(blocker_id.eq.${userId},blocked_id.eq.${otherId}),and(blocker_id.eq.${otherId},blocked_id.eq.${userId})`)
    .maybeSingle()

  return !!data
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

export async function bookmarkMessage(userId: string, messageId: string): Promise<boolean> {
  const { data: existing } = await supabase
    .from('bookmarks')
    .select('id')
    .eq('user_id', userId)
    .eq('message_id', messageId)
    .maybeSingle()

  if (existing) {
    await supabase.from('bookmarks').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('bookmarks').insert({ user_id: userId, message_id: messageId })
    return true
  }
}

export async function getBookmarks(userId: string): Promise<Message[]> {
  const { data, error } = await supabase
    .from('bookmarks')
    .select('message_id, messages(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row: any) => row.messages as Message).filter(Boolean)
}

// ── DMs ───────────────────────────────────────────────────────────────────────

export async function findDM(userId: string, otherId: string): Promise<Chat | null> {
  const { data: memberships } = await supabase
    .from('chat_memberships')
    .select('chat_id')
    .eq('user_id', userId)

  if (!memberships?.length) return null

  const chatIds = memberships.map((m) => m.chat_id)
  const { data: otherMemberships } = await supabase
    .from('chat_memberships')
    .select('chat_id')
    .in('chat_id', chatIds)
    .eq('user_id', otherId)

  if (!otherMemberships?.length) return null

  const commonChatIds = otherMemberships.map((m) => m.chat_id)
  const { data: chat } = await supabase
    .from('chats')
    .select('*')
    .in('id', commonChatIds)
    .eq('type', 'dm')
    .maybeSingle()

  return chat
}

export async function createOrGetDM(userId: string, otherId: string): Promise<Chat> {
  const timer = startAction('createOrGetDM', userId)
  try {
    const { data: chatId, error } = await supabase.rpc('get_or_create_dm', {
      user_a: userId,
      user_b: otherId,
    })
    if (error) throw error
    if (!chatId) throw new Error('DM creation returned no chat ID')
    endAction(timer, 'createOrGetDM', 'success', `chat=${chatId.slice(0, 8)}`, userId)
    const { data: chat, error: fetchErr } = await supabase
      .from('chats')
      .select('*')
      .eq('id', chatId)
      .single()
    if (fetchErr) throw fetchErr
    if (!chat.name) {
      logAction('createOrGetDM', 'error', 'Returned chat has null name — DB function may need updating', { userId })
    }
    return chat
  } catch (e: any) {
    endAction(timer, 'createOrGetDM', 'error', e.message, userId)
    throw e
  }
}

// ── Files ─────────────────────────────────────────────────────────────────────

export async function uploadFile(file: File): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const filePath = `${crypto.randomUUID()}.${fileExt}`

  const { error } = await supabase.storage.from('chat-attachments').upload(filePath, file)
  if (error) throw error

  const { data } = supabase.storage.from('chat-attachments').getPublicUrl(filePath)
  return data.publicUrl
}

export async function uploadAvatar(file: File, userId: string): Promise<string> {
  const fileExt = file.name.split('.').pop()
  const filePath = `${userId}/avatar.${fileExt}`

  const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
  if (error) throw error

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return `${data.publicUrl}?t=${Date.now()}`
}

// ── Polls ─────────────────────────────────────────────────────────────────────

export async function createPoll(
  chatId: string,
  userId: string,
  question: string,
  options: string[],
  allowMultiple = false
): Promise<{ id: string }> {
  const { data, error } = await supabase
    .from('polls')
    .insert({ chat_id: chatId, user_id: userId, question, options, allow_multiple: allowMultiple })
    .select('id')
    .single()
  if (error) throw error
  return data
}

export async function votePoll(pollId: string, userId: string, optionIndex: number): Promise<void> {
  const { data: existing } = await supabase
    .from('poll_votes')
    .select('id')
    .eq('poll_id', pollId)
    .eq('user_id', userId)
    .eq('option_index', optionIndex)
    .maybeSingle()

  if (existing) {
    await supabase.from('poll_votes').delete().eq('id', existing.id)
  } else {
    await supabase.from('poll_votes').insert({ poll_id: pollId, user_id: userId, option_index: optionIndex })
  }
}

export async function getPollVotes(pollId: string): Promise<{ user_id: string; option_index: number }[]> {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('user_id, option_index')
    .eq('poll_id', pollId)
  if (error) throw error
  return data || []
}


// ── Missed Calls ──────────────────────────────────────────────────────────────

export interface MissedCall {
  id: string
  caller_id: string
  callee_id: string
  chat_id: string | null
  mode: 'voice' | 'video'
  called_at: string
  seen: boolean
  caller?: AppUser
}

export async function getMissedCalls(userId: string): Promise<MissedCall[]> {
  const { data, error } = await supabase
    .from('missed_calls')
    .select('*')
    .eq('callee_id', userId)
    .order('called_at', { ascending: false })
    .limit(50)
  if (error) throw error
  const calls = data || []
  const callerIds = [...new Set(calls.map((c) => c.caller_id))]
  const callers = await Promise.all(callerIds.map((id) => getUserById(id)))
  const callerMap: Record<string, AppUser> = {}
  callers.forEach((u) => { if (u) callerMap[u.id] = u })
  return calls.map((c) => ({ ...c, caller: callerMap[c.caller_id] }))
}

export async function markMissedCallsSeen(userId: string): Promise<void> {
  await supabase
    .from('missed_calls')
    .update({ seen: true })
    .eq('callee_id', userId)
    .eq('seen', false)
}

export async function getUnseenMissedCallCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from('missed_calls')
    .select('*', { count: 'exact', head: true })
    .eq('callee_id', userId)
    .eq('seen', false)
  return count ?? 0
}

// ── Public Rooms ──────────────────────────────────────────────────────────────

export async function getPublicRooms(): Promise<(Chat & { member_count: number })[]> {
  const { data, error } = await supabase.rpc('public_rooms')
  if (error) throw error
  return (data || []).map((c: any) => ({ ...c, member_count: Number(c.member_count) }))
}

export type InviteValidation =
  | { valid: true; inviteId: string }
  | { valid: false; reason: string }

export async function validateInviteCode(code: string): Promise<InviteValidation> {
  const clean = code.trim().toUpperCase()
  const { data, error } = await supabase
    .from('invite_codes')
    .select('id, max_uses, uses_count, expires_at, is_active')
    .eq('code', clean)
    .maybeSingle()

  if (error || !data) return { valid: false, reason: 'Invalid invite code.' }
  if (!data.is_active) return { valid: false, reason: 'This invite code has been revoked.' }
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    return { valid: false, reason: 'This invite code has expired.' }
  }
  if (data.uses_count >= data.max_uses) {
    return { valid: false, reason: 'This invite code has reached its usage limit.' }
  }
  return { valid: true, inviteId: data.id }
}

export async function redeemInviteCode(inviteId: string, userId: string, code: string): Promise<void> {
  const clean = code.trim().toUpperCase()
  // Atomically increment uses_count and record redemption via RPC
  const { error } = await supabase.rpc('redeem_invite_code', {
    p_code: clean,
    p_user_id: userId,
  })
  if (error) throw error
  await supabase.from('app_users').update({ invite_code_used: clean }).eq('id', userId)
}

export async function createInviteCode(
  createdBy: string,
  opts: { code?: string; maxUses?: number; expiresAt?: string | null; note?: string }
): Promise<InviteCode> {
  const code = (opts.code?.trim().toUpperCase()) ||
    Math.random().toString(36).slice(2, 6).toUpperCase() +
    '-' +
    Math.random().toString(36).slice(2, 6).toUpperCase()

  const { data, error } = await supabase
    .from('invite_codes')
    .insert({
      code,
      created_by: createdBy,
      max_uses: opts.maxUses ?? 1,
      expires_at: opts.expiresAt ?? null,
      note: opts.note ?? null,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function listAllInviteCodes(): Promise<InviteCode[]> {
  const { data, error } = await supabase
    .from('invite_codes')
    .select('*, redemptions:invite_redemptions(redeemed_at, user:app_users(username))')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data || []).map((row: any) => ({
    ...row,
    redemptions: (row.redemptions || []).map((r: any) => ({
      username: r.user?.username ?? 'unknown',
      redeemed_at: r.redeemed_at,
    })),
  }))
}

export async function revokeInviteCode(id: string): Promise<void> {
  await supabase.from('invite_codes').update({ is_active: false }).eq('id', id)
}

export async function deleteInviteCode(id: string): Promise<void> {
  await supabase.from('invite_codes').delete().eq('id', id)
}

export async function updateInviteCode(
  id: string,
  updates: { max_uses?: number; expires_at?: string | null; note?: string; is_active?: boolean }
): Promise<void> {
  await supabase.from('invite_codes').update(updates).eq('id', id)
}

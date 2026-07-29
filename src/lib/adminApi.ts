import { supabase } from './supabase'
import type {
  AdminUser, AdminAuditLog, AdminReport, AdminNote, AdminAnnouncement,
  AdminNotification, SignInActivity, AdminStats, AdminChat, AdminGlobalSearchResult,
  DeletedMessage, AppUser,
} from './types'

// ── Users ──

export async function adminGetAllUsers(): Promise<AdminUser[]> {
  const { data, error } = await supabase.rpc('admin_get_all_users')
  if (error) throw error
  return (data || []) as AdminUser[]
}

export async function adminDisableUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_disable_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminEnableUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_enable_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminSuspendUser(userId: string, until: string): Promise<void> {
  const { error } = await supabase.rpc('admin_suspend_user', { p_user_id: userId, p_until: until })
  if (error) throw error
}

export async function adminDeleteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminResetUserProfile(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_reset_user_profile', { p_user_id: userId })
  if (error) throw error
}

export async function adminPromoteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_promote_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminDemoteUser(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_demote_user', { p_user_id: userId })
  if (error) throw error
}

export async function adminForceSignOut(userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_force_signout', { p_user_id: userId })
  if (error) throw error
}

// ── Sign-in activity ──

export async function adminGetSignInActivity(userId: string): Promise<SignInActivity[]> {
  const { data, error } = await supabase
    .from('sign_in_activity')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function recordSignIn(): Promise<void> {
  await supabase.rpc('record_sign_in_activity')
}

// ── Chats ──

export async function adminGetAllChats(): Promise<AdminChat[]> {
  const { data, error } = await supabase.rpc('admin_get_all_chats')
  if (error) throw error
  return (data || []).map((c: any) => ({ ...c, member_count: Number(c.member_count) })) as AdminChat[]
}

export async function adminJoinChat(chatId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_join_chat', { p_chat_id: chatId })
  if (error) throw error
}

export async function adminDeleteChat(chatId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_chat', { p_chat_id: chatId })
  if (error) throw error
}

export async function adminRemoveFromChat(chatId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_remove_from_chat', { p_chat_id: chatId, p_user_id: userId })
  if (error) throw error
}

export async function adminTransferOwnership(chatId: string, newOwnerId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_transfer_ownership', { p_chat_id: chatId, p_new_owner_id: newOwnerId })
  if (error) throw error
}

// ── Messages ──

export async function adminGetDeletedMessages(chatId?: string): Promise<DeletedMessage[]> {
  const { data, error } = await supabase.rpc('admin_get_deleted_messages', {
    p_chat_id: chatId || null,
  })
  if (error) throw error
  return data || []
}

export async function adminDeleteMessage(messageId: string): Promise<void> {
  const { error } = await supabase.rpc('admin_delete_message', { p_message_id: messageId })
  if (error) throw error
}

export async function adminRestoreMessage(messageId: string): Promise<void> {
  const { data: msg } = await supabase.from('messages').select('deleted_content').eq('id', messageId).maybeSingle()
  const { error } = await supabase
    .from('messages')
    .update({ is_deleted: false, content: msg?.deleted_content || '', deleted_content: null, deleted_by: null })
    .eq('id', messageId)
  if (error) throw error
}

// ── Reports ──

export async function adminGetReports(status?: string): Promise<AdminReport[]> {
  let query = supabase.from('admin_reports').select('*').order('created_at', { ascending: false }).limit(100)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function adminResolveReport(reportId: string, notes: string): Promise<void> {
  const { error } = await supabase
    .from('admin_reports')
    .update({ status: 'resolved', resolution_notes: notes, resolved_by: (await supabase.auth.getUser()).data.user?.id, resolved_at: new Date().toISOString() })
    .eq('id', reportId)
  if (error) throw error
}

// ── Audit log ──

export async function adminGetAuditLog(limit = 100): Promise<AdminAuditLog[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  return data || []
}

export async function adminExportAuditLog(): Promise<AdminAuditLog[]> {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5000)
  if (error) throw error
  return data || []
}

// ── Admin notes ──

export async function adminGetNotes(userId: string): Promise<AdminNote[]> {
  const { data, error } = await supabase
    .from('admin_notes')
    .select('*')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function adminAddNote(userId: string, note: string): Promise<void> {
  const { error } = await supabase
    .from('admin_notes')
    .insert({ target_user_id: userId, note })
  if (error) throw error
}

export async function adminDeleteNote(noteId: string): Promise<void> {
  await supabase.from('admin_notes').delete().eq('id', noteId)
}

// ── Announcements ──

export async function adminGetAnnouncements(): Promise<AdminAnnouncement[]> {
  const { data, error } = await supabase
    .from('admin_announcements')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function adminCreateAnnouncement(
  title: string, body: string, dismissible: boolean = true, expiresAt?: string
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_create_announcement', {
    p_title: title, p_body: body, p_dismissible: dismissible, p_expires_at: expiresAt || null,
  })
  if (error) throw error
  return data
}

export async function adminDeleteAnnouncement(id: string): Promise<void> {
  await supabase.from('admin_announcements').delete().eq('id', id)
}

export async function adminUpdateAnnouncement(id: string, updates: Partial<AdminAnnouncement>): Promise<void> {
  await supabase.from('admin_announcements').update(updates).eq('id', id)
}

// ── Notifications ──

export async function adminSendNotification(
  targetUserId: string, title: string, body: string, type: string = 'system'
): Promise<string> {
  const { data, error } = await supabase.rpc('admin_send_notification', {
    p_target_user_id: targetUserId, p_title: title, p_body: body, p_type: type,
  })
  if (error) throw error
  return data
}

export async function getUserNotifications(userId: string): Promise<AdminNotification[]> {
  const { data, error } = await supabase
    .from('admin_notifications')
    .select('*')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data || []
}

export async function markNotificationRead(id: string): Promise<void> {
  await supabase.from('admin_notifications').update({ is_read: true }).eq('id', id)
}

// ── Stats ──

export async function adminGetStats(): Promise<AdminStats> {
  const { data, error } = await supabase.rpc('admin_get_stats')
  if (error) throw error
  return data as AdminStats
}

// ── Global search ──

export async function adminGlobalSearch(query: string): Promise<AdminGlobalSearchResult> {
  const { data, error } = await supabase.rpc('admin_global_search', { p_query: query })
  if (error) throw error
  return data as AdminGlobalSearchResult
}

// ── Impersonation ──
// Admin "logs in as" another user by fetching their profile and setting it as currentUser.
// The service role key is NOT used; this is a read-only profile swap with a banner.
// A full impersonation would require a custom JWT, which isn't available client-side.
// We store the original admin ID so we can restore.

export function startImpersonation(targetUser: AppUser): void {
  const current = useStore.getState().currentUser
  if (!current?.is_admin) throw new Error('Not authorized')
  useStore.getState().setImpersonation(true, current.id)
  useStore.getState().setCurrentUser(targetUser)
}

export function stopImpersonation(): void {
  const originalId = useStore.getState().impersonatingOriginalId
  if (!originalId) return
  useStore.getState().setImpersonation(false, null)
  import('./api').then(({ getUserById }) => {
    getUserById(originalId).then((user) => {
      if (user) useStore.getState().setCurrentUser(user)
    })
  })
}

export function getImpersonationState(): { isImpersonating: boolean; originalId: string | null; targetId: string | null } {
  const state = useStore.getState()
  return {
    isImpersonating: state.isImpersonating,
    originalId: state.impersonatingOriginalId,
    targetId: state.isImpersonating ? state.currentUser?.id ?? null : null,
  }
}

// Avoid circular import — import lazily
import { useStore } from './store'

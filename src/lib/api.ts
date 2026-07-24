import { supabase } from './supabase'
import type { BotCard, BotMove, CardVersion } from './types'

const client = () => {
  if (!supabase) throw new Error('Supabase is not configured yet.')
  return supabase
}

const first = <T,>(value: T | T[] | null | undefined): T | undefined => Array.isArray(value) ? value[0] : value ?? undefined

export async function getCards(status?: string): Promise<BotCard[]> {
  let query = client().from('cards').select('id, creator_id, name, art_path, status, review_feedback, reviewed_by, reviewed_at, current_version_id, created_at, profiles!cards_creator_id_fkey(display_name), card_versions!cards_current_version_fkey(id, card_id, version_number, health, moves, mechanic_notes, created_at)').order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((row: any) => ({ ...row, creator: first(row.profiles), version: first(row.card_versions) }))
}

export async function getCardArtUrl(path: string) {
  const { data, error } = await client().storage.from('card-art').createSignedUrl(path, 60 * 60)
  if (error) throw error
  return data.signedUrl
}

export async function submitCard(input: { name: string; health: number; moves: BotMove[]; mechanicNotes: string; art: Blob; userId: string }) {
  const storagePath = `${input.userId}/${crypto.randomUUID()}.png`
  const { error: uploadError } = await client().storage.from('card-art').upload(storagePath, input.art, { contentType: 'image/png', upsert: false })
  if (uploadError) throw uploadError
  const { data: card, error: cardError } = await client().from('cards').insert({ creator_id: input.userId, name: input.name, art_path: storagePath }).select('id').single()
  if (cardError) throw cardError
  const { data: version, error: versionError } = await client().from('card_versions').insert({ card_id: card.id, version_number: 1, health: input.health, moves: input.moves, mechanic_notes: input.mechanicNotes || null, created_by: input.userId }).select('id').single()
  if (versionError) throw versionError
  const { error: updateError } = await client().from('cards').update({ current_version_id: version.id }).eq('id', card.id)
  if (updateError) throw updateError
}

export async function reviewCard(cardId: string, decision: 'approved' | 'rejected', feedback: string, reviewerId: string, version?: CardVersion) {
  const payload: Record<string, unknown> = { status: decision, review_feedback: feedback || null, reviewed_by: reviewerId, reviewed_at: new Date().toISOString() }
  if (decision === 'approved' && version) payload.current_version_id = version.id
  const { error } = await client().from('cards').update(payload).eq('id', cardId)
  if (error) throw error
  const { error: reviewError } = await client().from('card_reviews').insert({ card_id: cardId, reviewer_id: reviewerId, decision, feedback: feedback || null })
  if (reviewError) throw reviewError
}

export async function gameCommand(action: string, payload: Record<string, unknown>) {
  const { data, error } = await client().functions.invoke('game-command', { body: { action, payload } })
  if (error) throw error
  return data
}

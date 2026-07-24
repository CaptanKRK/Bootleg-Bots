import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

type Effect = { type: 'damage' | 'heal' | 'immunity' | 'dodge' | 'disable_move' | 'custom'; amount?: number; duration?: number; target?: string; note?: string }
type Move = { id: string; name: string; description: string; effects: Effect[] }
type Bot = { id: string; name: string; artPath: string; health: number; maxHealth: number; moves: Move[]; statuses?: Record<string, number> }
type Player = { id: string; name: string; seat: number; remaining: number; active?: Bot; eliminated?: boolean }
type State = { players: Player[]; turn: string | null; round: number; message?: string; pendingReplacement?: string | null; nextTurn?: string | null }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const fail = (message: string, status = 400) => json({ error: message }, status)
const code = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[n % 32]).join('')
const shuffle = <T,>(items: T[]) => { const copy = [...items]; for (let i = copy.length - 1; i > 0; i--) { const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1); [copy[i], copy[j]] = [copy[j], copy[i]] } return copy }
const nextLiving = (players: Player[], current: string) => { const active = players.filter(p => !p.eliminated); const index = active.findIndex(p => p.id === current); return active[(index + 1) % active.length]?.id ?? null }
const hasStatus = (bot: Bot, status: string) => (bot.statuses?.[status] ?? 0) > 0
const tick = (bot: Bot) => { if (!bot.statuses) return bot; const statuses = Object.fromEntries(Object.entries(bot.statuses).map(([key, value]) => [key, value - 1]).filter(([, value]) => value > 0)); return { ...bot, statuses } }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const auth = req.headers.get('Authorization')
    if (!auth) return fail('Sign in to play.', 401)
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } })
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return fail('Sign in to play.', 401)
    const { action, payload = {} } = await req.json()
    const { data: profile } = await admin.from('profiles').select('id, display_name').eq('id', user.id).single()
    if (!profile) return fail('Player profile not found.', 404)

    if (action === 'create_lobby') {
      const maxPlayers = Number(payload.maxPlayers ?? 2)
      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 8) return fail('Choose between 2 and 8 players.')
      let lobbyCode = code(); while ((await admin.from('lobbies').select('id').eq('code', lobbyCode).maybeSingle()).data) lobbyCode = code()
      const { data: lobby, error } = await admin.from('lobbies').insert({ code: lobbyCode, host_id: user.id, max_players: maxPlayers }).select().single(); if (error) throw error
      await admin.from('lobby_members').insert({ lobby_id: lobby.id, user_id: user.id, seat: 1 })
      return json({ lobby })
    }
    if (action === 'join_lobby') {
      const lobbyCode = String(payload.code ?? '').trim().toUpperCase(); const { data: lobby } = await admin.from('lobbies').select('*').eq('code', lobbyCode).maybeSingle()
      if (!lobby || lobby.status !== 'waiting') return fail('That lobby is not accepting players.', 404)
      const { data: members } = await admin.from('lobby_members').select('user_id, seat').eq('lobby_id', lobby.id)
      if (members?.some(m => m.user_id === user.id)) return json({ lobby })
      if ((members?.length ?? 0) >= lobby.max_players) return fail('That lobby is full.')
      const used = new Set(members?.map(m => m.seat)); const seat = Array.from({ length: lobby.max_players }, (_, i) => i + 1).find(n => !used.has(n))!
      const { error } = await admin.from('lobby_members').insert({ lobby_id: lobby.id, user_id: user.id, seat }); if (error) throw error
      return json({ lobby })
    }
    if (action === 'start_lobby') {
      const { data: lobby } = await admin.from('lobbies').select('*').eq('id', payload.lobbyId).single(); if (!lobby || lobby.host_id !== user.id || lobby.status !== 'waiting') return fail('Only the host can start this lobby.')
      const { data: members } = await admin.from('lobby_members').select('user_id, seat, profiles!lobby_members_user_id_fkey(display_name)').eq('lobby_id', lobby.id).order('seat')
      if (!members || members.length < 2) return fail('At least two players are needed.')
      const { data: cards } = await admin.from('cards').select('id,name,art_path,card_versions!cards_current_version_fkey(id,health,moves)').eq('status', 'approved').not('current_version_id', 'is', null)
      if (!cards || cards.length < members.length * 10) return fail(`Need ${members.length * 10} approved bots to deal this match.`)
      const matchId = crypto.randomUUID(); const deal = shuffle(cards).slice(0, members.length * 10)
      const players: Player[] = members.map((member: any, index) => ({ id: member.user_id, name: member.profiles.display_name, seat: member.seat, remaining: 10 }))
      const { error: matchError } = await admin.from('matches').insert({ id: matchId, lobby_id: lobby.id, public_state: { players, turn: null, round: 0, message: 'Choose your opening bot.' } }); if (matchError) throw matchError
      for (let index = 0; index < members.length; index++) { const hand = deal.slice(index * 10, index * 10 + 10).map((card: any) => { const version = Array.isArray(card.card_versions) ? card.card_versions[0] : card.card_versions; return { id: version.id, name: card.name, artPath: card.art_path, health: version.health, maxHealth: version.health, moves: version.moves, statuses: {} } }); await admin.from('match_members').insert({ match_id: matchId, user_id: members[index].user_id, seat: members[index].seat }); await admin.from('match_hands').insert({ match_id: matchId, user_id: members[index].user_id, cards: hand }) }
      await admin.from('matches').update({ status: 'selecting' }).eq('id', matchId); await admin.from('lobbies').update({ status: 'selecting' }).eq('id', lobby.id)
      return json({ matchId })
    }
    if (action === 'select_opening' || action === 'choose_replacement') {
      const { data: match } = await admin.from('matches').select('*').eq('id', payload.matchId).single(); if (!match || match.status === 'finished') return fail('Match not found.', 404)
      const state = match.public_state as State; if (action === 'choose_replacement' && state.pendingReplacement !== user.id) return fail('You do not need a replacement right now.')
      const { data: handRow } = await admin.from('match_hands').select('cards').eq('match_id', match.id).eq('user_id', user.id).single(); const hand = (handRow?.cards ?? []) as Bot[]; const bot = hand.find(card => card.id === payload.cardId); if (!bot) return fail('That bot is not in your hand.')
      const players = state.players.map(player => player.id === user.id ? { ...player, active: bot, remaining: hand.length - 1 } : player); const remainingHand = hand.filter(card => card.id !== bot.id)
      await admin.from('match_hands').update({ cards: remainingHand }).eq('match_id', match.id).eq('user_id', user.id)
      let nextState: State = { ...state, players, pendingReplacement: null }
      const allReady = players.every(player => player.active || player.eliminated)
      if (allReady && match.status === 'selecting') { const first = shuffle(players.filter(p => !p.eliminated))[0].id; nextState = { ...nextState, turn: first, round: 1, message: 'The first turn begins.' }; await admin.from('matches').update({ status: 'in_progress', current_player_id: first }).eq('id', match.id); await admin.from('lobbies').update({ status: 'in_progress' }).eq('id', match.lobby_id) }
      if (action === 'choose_replacement' && state.nextTurn) nextState = { ...nextState, turn: state.nextTurn, nextTurn: null, message: 'Replacement deployed.' }
      await admin.from('matches').update({ public_state: nextState, current_player_id: nextState.turn }).eq('id', match.id); await admin.from('match_events').insert({ match_id: match.id, actor_id: user.id, event_type: action, payload: { cardId: bot.id } })
      return json({ state: nextState })
    }
    if (action === 'take_move') {
      const { data: match } = await admin.from('matches').select('*').eq('id', payload.matchId).single(); if (!match || match.status !== 'in_progress') return fail('This match is not active.', 404)
      const state = match.public_state as State; if (state.turn !== user.id || state.pendingReplacement) return fail('It is not your turn.')
      const actor = state.players.find(p => p.id === user.id); const target = state.players.find(p => p.id === payload.targetId); if (!actor?.active || !target?.active || actor.id === target.id || target.eliminated) return fail('Choose a living opponent.')
      const selected = actor.active.moves.find(m => m.id === payload.moveId); if (!selected || hasStatus(actor.active, `disabled:${selected.id}`)) return fail('That move cannot be used.')
      let nextTarget = { ...target.active, statuses: { ...target.active.statuses } }; let nextActor = { ...actor.active, statuses: { ...actor.active.statuses } }; const notes: string[] = []
      for (const effect of selected.effects) { if (effect.type === 'damage') { if (hasStatus(nextTarget, 'dodge')) notes.push(`${target.name} dodged.`); else { nextTarget.health = Math.max(0, nextTarget.health - Number(effect.amount ?? 0)); notes.push(`${effect.amount ?? 0} damage`) } } if (effect.type === 'heal') nextActor.health = Math.min(nextActor.maxHealth, nextActor.health + Number(effect.amount ?? 0)); if (effect.type === 'immunity' || effect.type === 'dodge') nextActor.statuses![effect.type] = Number(effect.duration ?? 1); if (effect.type === 'disable_move' && effect.note) nextTarget.statuses![`disabled:${effect.note}`] = Number(effect.duration ?? 1); if (effect.type === 'custom') notes.push('Custom mechanic pending admin ruleset.') }
      const afterActor = tick(nextActor); const players = state.players.map(player => player.id === actor.id ? { ...player, active: afterActor } : player.id === target.id ? { ...player, active: nextTarget } : player); const next = nextLiving(players, actor.id); let nextState: State = { ...state, players, turn: next, round: state.round + 1, message: `${actor.name} used ${selected.name}: ${notes.join(', ') || 'effect resolved'}.` }
      if (nextTarget.health <= 0) { const hand = (await admin.from('match_hands').select('cards').eq('match_id', match.id).eq('user_id', target.id).single()).data?.cards as Bot[] ?? []; const updated = players.map(player => player.id === target.id ? { ...player, active: undefined, remaining: hand.length, eliminated: hand.length === 0 } : player); const survivors = updated.filter(player => !player.eliminated); if (survivors.length === 1) { nextState = { ...nextState, players: updated, turn: null, message: `${survivors[0].name} wins!` }; await admin.from('matches').update({ status: 'finished', winner_id: survivors[0].id, finished_at: new Date().toISOString() }).eq('id', match.id) } else nextState = { ...nextState, players: updated, turn: null, pendingReplacement: target.id, nextTurn: next, message: `${target.name}'s bot was destroyed. Choose a replacement.` } }
      await admin.from('matches').update({ public_state: nextState, current_player_id: nextState.turn }).eq('id', match.id); await admin.from('match_events').insert({ match_id: match.id, actor_id: user.id, event_type: 'move', payload: { moveId: selected.id, targetId: target.id, notes } })
      return json({ state: nextState })
    }
    return fail('Unknown game action.')
  } catch (error) { console.error(error); return fail(error instanceof Error ? error.message : 'Game command failed.', 500) }
})

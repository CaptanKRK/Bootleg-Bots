export type AppRole = 'player' | 'admin'
export type CardStatus = 'pending' | 'approved' | 'rejected' | 'archived'

export type Effect = {
  type: 'damage' | 'heal' | 'immunity' | 'dodge' | 'disable_move' | 'custom'
  amount?: number
  duration?: number
  target?: 'self' | 'opponent' | 'all_opponents'
  note?: string
}

export type BotMove = {
  id: string
  name: string
  description: string
  effects: Effect[]
}

export type Profile = {
  id: string
  email: string
  display_name: string
  role: AppRole
}

export type CardVersion = {
  id: string
  card_id: string
  version_number: number
  health: number
  moves: BotMove[]
  mechanic_notes: string | null
  created_at: string
}

export type BotCard = {
  id: string
  creator_id: string
  name: string
  art_path: string
  status: CardStatus
  review_feedback: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  current_version_id: string | null
  created_at: string
  creator?: Pick<Profile, 'display_name'>
  version?: CardVersion
}

export type MatchPlayer = {
  id: string
  name: string
  seat: number
  remaining: number
  active?: { cardId: string; name: string; health: number; maxHealth: number; artPath: string; moves: BotMove[] }
  eliminated?: boolean
}

export type PublicMatchState = { players: MatchPlayer[]; turn: string | null; round: number; message?: string }

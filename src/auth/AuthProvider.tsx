import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'

type AuthState = { session: Session | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void>; signOut: () => Promise<void> }
const AuthContext = createContext<AuthState | null>(null)

async function readProfile(userId: string): Promise<Profile | null> {
  if (!supabase) return null
  const { data } = await supabase.from('profiles').select('id, email, display_name, role').eq('id', userId).maybeSingle()
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const refreshProfile = async () => { if (session) setProfile(await readProfile(session.user.id)) }
  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(async ({ data }) => { setSession(data.session); setProfile(data.session ? await readProfile(data.session.user.id) : null); setLoading(false) })
    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => { setSession(nextSession); setProfile(nextSession ? await readProfile(nextSession.user.id) : null); setLoading(false) })
    return () => listener.subscription.unsubscribe()
  }, [])
  const signOut = async () => { await supabase?.auth.signOut() }
  return <AuthContext.Provider value={{ session, profile, loading, refreshProfile, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const state = useContext(AuthContext)
  if (!state) throw new Error('useAuth must be inside AuthProvider')
  return state
}

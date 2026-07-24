import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

// This client deliberately uses only the browser-safe publishable key.
// Server-only Supabase keys must never be imported by frontend code.
// A placeholder keeps local builds type-safe before configuration is supplied.
// UI checks `isSupabaseConfigured` before making any real backend request.
export const supabase = createClient(
  supabaseUrl ?? 'https://bootleg-bots-unconfigured.invalid',
  supabasePublishableKey ?? 'unconfigured-publishable-key',
)

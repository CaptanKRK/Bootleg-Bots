import { createClient } from 'npm:@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return respond({ error: 'Sign in first.' }, 401)
    const url = Deno.env.get('SUPABASE_URL')!
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const requester = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authorization } } })
    const { data: { user } } = await requester.auth.getUser()
    if (!user) return respond({ error: 'Sign in first.' }, 401)
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
    if (profile?.role !== 'admin') return respond({ error: 'Administrators only.' }, 403)
    const { email, displayName } = await req.json()
    if (typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) return respond({ error: 'Enter a valid email address.' }, 400)
    const redirectTo = Deno.env.get('SITE_URL') ?? 'https://captankrk.github.io/Bootleg-Bots/'
    const { error } = await admin.auth.admin.inviteUserByEmail(email.trim().toLowerCase(), { redirectTo, data: { display_name: String(displayName || '').trim().slice(0, 30) || undefined } })
    if (error) return respond({ error: error.message }, 400)
    return respond({ ok: true })
  } catch (error) {
    return respond({ error: error instanceof Error ? error.message : 'Invite failed.' }, 500)
  }
})

# Supabase deployment

The migration in `migrations/` creates the complete v1 database, storage bucket, RLS policies, and real-time publication.

Deploy it with either a Supabase personal access token (`SUPABASE_ACCESS_TOKEN`) and the project ref, or a database password:

```powershell
npx supabase login
npx supabase link --project-ref tvbgmsfynfxoxiswodid
npx supabase db push
```

After the first invited account is created, promote it exactly once in the Supabase SQL editor:

```sql
update public.profiles set role = 'admin' where email = 'YOUR_ADMIN_EMAIL';
```

Do not run this migration against a production project with existing application tables without reviewing it first.

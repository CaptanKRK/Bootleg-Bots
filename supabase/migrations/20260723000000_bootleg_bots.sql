-- Bootleg Bots v1: accounts, moderated cards, private lobbies, and matches.
create extension if not exists pgcrypto;

create type public.app_role as enum ('player', 'admin');
create type public.card_status as enum ('pending', 'approved', 'rejected', 'archived');
create type public.lobby_status as enum ('waiting', 'selecting', 'in_progress', 'finished', 'cancelled');
create type public.match_status as enum ('selecting', 'in_progress', 'finished', 'cancelled');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (char_length(display_name) between 2 and 30),
  role public.app_role not null default 'player',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 60),
  art_path text not null,
  status public.card_status not null default 'pending',
  review_feedback text,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.card_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  health integer not null check (health between 1 and 999),
  moves jsonb not null check (jsonb_typeof(moves) = 'array' and jsonb_array_length(moves) between 1 and 4),
  mechanic_notes text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (card_id, version_number)
);

alter table public.cards
  add constraint cards_current_version_fkey foreign key (current_version_id)
  references public.card_versions(id) on delete set null;

create table public.card_reviews (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  decision public.card_status not null check (decision in ('approved', 'rejected')),
  feedback text,
  created_at timestamptz not null default now()
);

create table public.lobbies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{6}$'),
  host_id uuid not null references public.profiles(id) on delete restrict,
  max_players integer not null default 2 check (max_players between 2 and 8),
  status public.lobby_status not null default 'waiting',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.lobby_members (
  lobby_id uuid not null references public.lobbies(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat integer not null check (seat between 1 and 8),
  opening_card_id uuid references public.card_versions(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id),
  unique (lobby_id, seat)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid unique references public.lobbies(id) on delete set null,
  status public.match_status not null default 'selecting',
  current_player_id uuid references public.profiles(id) on delete set null,
  winner_id uuid references public.profiles(id) on delete set null,
  public_state jsonb not null default '{"players":[],"turn":null,"round":0}'::jsonb,
  disconnected_deadlines jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz
);

create table public.match_members (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat integer not null check (seat between 1 and 8),
  eliminated_at timestamptz,
  primary key (match_id, user_id),
  unique (match_id, seat)
);

create table public.match_hands (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cards jsonb not null default '[]'::jsonb,
  primary key (match_id, user_id)
);

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index cards_status_idx on public.cards(status, created_at desc);
create index card_versions_card_idx on public.card_versions(card_id, version_number desc);
create index lobbies_code_idx on public.lobbies(code);
create index match_events_match_idx on public.match_events(match_id, id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles for each row execute function public.touch_updated_at();
create trigger cards_touch_updated_at before update on public.cards for each row execute function public.touch_updated_at();
create trigger lobbies_touch_updated_at before update on public.lobbies for each row execute function public.touch_updated_at();
create trigger matches_touch_updated_at before update on public.matches for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(left(new.raw_user_meta_data ->> 'display_name', 30), ''), split_part(coalesce(new.email, 'bot'), '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.protect_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'Only administrators can change account roles';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role before update on public.profiles for each row execute function public.protect_profile_role();

create or replace function public.is_lobby_member(p_lobby_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lobby_members where lobby_id = p_lobby_id and user_id = auth.uid());
$$;

create or replace function public.is_match_member(p_match_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_members where match_id = p_match_id and user_id = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.card_versions enable row level security;
alter table public.card_reviews enable row level security;
alter table public.lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.matches enable row level security;
alter table public.match_members enable row level security;
alter table public.match_hands enable row level security;
alter table public.match_events enable row level security;

create policy "profiles are visible to signed-in players" on public.profiles for select to authenticated using (true);
create policy "players update their profile" on public.profiles for update to authenticated using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

create policy "approved cards are readable" on public.cards for select to authenticated using (status = 'approved' or creator_id = auth.uid() or public.is_admin());
create policy "players submit cards" on public.cards for insert to authenticated with check (creator_id = auth.uid() and status = 'pending');
create policy "creators edit pending cards" on public.cards for update to authenticated using ((creator_id = auth.uid() and status = 'pending') or public.is_admin()) with check ((creator_id = auth.uid() and status = 'pending') or public.is_admin());
create policy "card versions follow card visibility" on public.card_versions for select to authenticated using (exists (select 1 from public.cards c where c.id = card_id and (c.status = 'approved' or c.creator_id = auth.uid() or public.is_admin())));
create policy "creators add pending versions" on public.card_versions for insert to authenticated with check (created_by = auth.uid() and exists (select 1 from public.cards c where c.id = card_id and c.creator_id = auth.uid() and c.status = 'pending'));
create policy "reviews visible to creator or admins" on public.card_reviews for select to authenticated using (public.is_admin() or exists (select 1 from public.cards c where c.id = card_id and c.creator_id = auth.uid()));
create policy "admins review cards" on public.card_reviews for insert to authenticated with check (public.is_admin() and reviewer_id = auth.uid());

create policy "lobby members read lobbies" on public.lobbies for select to authenticated using (host_id = auth.uid() or public.is_lobby_member(id));
create policy "players create lobbies" on public.lobbies for insert to authenticated with check (host_id = auth.uid());
create policy "hosts update lobbies" on public.lobbies for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());
create policy "members read lobby members" on public.lobby_members for select to authenticated using (public.is_lobby_member(lobby_id));
create policy "players join lobbies" on public.lobby_members for insert to authenticated with check (user_id = auth.uid());
create policy "players leave or choose opening bots" on public.lobby_members for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "players leave their lobbies" on public.lobby_members for delete to authenticated using (user_id = auth.uid());

create policy "match participants read public state" on public.matches for select to authenticated using (public.is_match_member(id));
create policy "match participants read members" on public.match_members for select to authenticated using (public.is_match_member(match_id));
create policy "players read only their hand" on public.match_hands for select to authenticated using (user_id = auth.uid());
create policy "participants read events" on public.match_events for select to authenticated using (public.is_match_member(match_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('card-art', 'card-art', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public;

create policy "players upload their own card art" on storage.objects for insert to authenticated with check (bucket_id = 'card-art' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "players read card art they can access" on storage.objects for select to authenticated using (bucket_id = 'card-art');
create policy "players replace their own pending art" on storage.objects for update to authenticated using (bucket_id = 'card-art' and owner_id = auth.uid()) with check (bucket_id = 'card-art' and owner_id = auth.uid());
create policy "players delete their own art" on storage.objects for delete to authenticated using (bucket_id = 'card-art' and owner_id = auth.uid());

alter publication supabase_realtime add table public.lobbies, public.lobby_members, public.matches, public.match_events;

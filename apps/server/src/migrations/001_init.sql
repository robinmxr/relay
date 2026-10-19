-- Idempotent schema, applied on every start.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  token_hash text primary key,
  user_id uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text not null default '',
  is_private boolean not null default false,
  is_dm boolean not null default false,
  -- Sorted member ids for a DM, so each pair has exactly one DM channel.
  dm_key text unique,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists channels_name_unique on channels (lower(name)) where not is_dm;

create table if not exists channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user on channel_members (user_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references users(id),
  parent_id uuid references messages(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);

create index if not exists messages_channel_created on messages (channel_id, created_at desc) where parent_id is null;
create index if not exists messages_parent on messages (parent_id, created_at);

create table if not exists reactions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

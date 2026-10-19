-- Workspaces: several teams on one server. Users are global; everything else belongs to a workspace.
create table if not exists workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text not null unique,
  created_by uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user on workspace_members (user_id);

-- Existing single-workspace data moves into a default workspace.
insert into workspaces (name, join_code)
select 'Relay HQ', 'relay-hq'
where not exists (select 1 from workspaces);

alter table channels add column if not exists workspace_id uuid references workspaces(id) on delete cascade;
update channels set workspace_id = (select id from workspaces order by created_at limit 1) where workspace_id is null;
alter table channels alter column workspace_id set not null;

insert into workspace_members (workspace_id, user_id)
select (select id from workspaces order by created_at limit 1), id from users
on conflict do nothing;

drop index if exists channels_name_unique;
create unique index if not exists channels_workspace_name_unique on channels (workspace_id, lower(name)) where not is_dm;
create index if not exists channels_workspace on channels (workspace_id);

-- Edits and deletes. A deleted message that still has replies stays as a placeholder.
alter table messages add column if not exists deleted_at timestamptz;

create table if not exists message_mentions (
  message_id uuid not null references messages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  primary key (message_id, user_id)
);

create index if not exists message_mentions_user on message_mentions (user_id);

-- Uploads belong to a channel, and to a message once it is sent.
create table if not exists files (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  uploader_id uuid not null references users(id),
  message_id uuid references messages(id) on delete cascade,
  name text not null,
  mime text not null,
  size bigint not null,
  storage_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists files_message on files (message_id);

create index if not exists messages_search on messages using gin (to_tsvector('simple', body));

create table if not exists settings (
  key text primary key,
  value text not null
);

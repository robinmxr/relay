-- Profile: avatar and status.
alter table users add column if not exists avatar_key text;
alter table users add column if not exists avatar_mime text;
alter table users add column if not exists status_emoji text;
alter table users add column if not exists status_text text;
alter table users add column if not exists status_expires_at timestamptz;

-- Per-user preferences. Missing row means all defaults.
create table if not exists user_settings (
  user_id uuid primary key references users(id) on delete cascade,
  theme text not null default 'system' check (theme in ('system', 'light', 'dark')),
  sound boolean not null default true,
  desktop_notifications boolean not null default true,
  notify_level text not null default 'all' check (notify_level in ('all', 'mentions'))
);

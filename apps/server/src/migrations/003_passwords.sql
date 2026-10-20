-- Passwords and session tracking.
alter table users add column if not exists password_hash text;
-- Shown once at password creation; a new one is issued whenever the password changes.
alter table users add column if not exists recovery_hash text;
-- Set for pre-password accounts given the default starting password: they must pick their own at first sign-in.
alter table users add column if not exists must_change boolean not null default false;

-- Accounts that predate passwords get "password" as a starting point so nobody is locked out.
-- The sign-in screen makes each of them set a real one immediately after.
update users
set password_hash = 'scrypt$16384$8$1$OM7G86nstb66yVhz1Vw2lA==$+EcQAzO8iQSA9Bxu5E/NEkX3P6oP/HrVzz32K9Va3Aw=', must_change = true
where password_hash is null;

-- Opaque id for the sessions API, so the token hash never leaves the server.
alter table sessions add column if not exists id uuid default gen_random_uuid();
update sessions set id = gen_random_uuid() where id is null;
alter table sessions alter column id set default gen_random_uuid();
alter table sessions alter column id set not null;
create unique index if not exists sessions_id on sessions (id);

alter table sessions add column if not exists user_agent text;
alter table sessions add column if not exists last_seen_at timestamptz not null default now();

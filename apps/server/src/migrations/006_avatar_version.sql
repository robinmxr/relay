-- Avatar cache-busting. The signed URL only varies by day, so a replaced avatar
-- would keep its old URL (and the browser its cached image) until the day rolls over.
-- Bumping the timestamp changes the URL, so the new picture shows up immediately.
alter table users add column if not exists avatar_updated_at timestamptz;

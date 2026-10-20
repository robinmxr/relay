-- Channel archiving: archived channels stay readable but refuse new messages.
alter table channels add column if not exists archived_at timestamptz;

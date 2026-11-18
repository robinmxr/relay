-- An earlier 003 gave every pre-password account the password "password" (must_change = true).
-- Anyone who has not replaced it yet loses it: the account has no password until the workspace
-- owner resets it. The hash below is only matched against, never granted.
update users
set password_hash = null
where must_change
  and password_hash = 'scrypt$16384$8$1$OM7G86nstb66yVhz1Vw2lA==$+EcQAzO8iQSA9Bxu5E/NEkX3P6oP/HrVzz32K9Va3Aw=';

-- Début de l'envoi sur GitHub : sans lui, un envoi resté « en cours » (travail perdu) ne peut pas être reconnu comme tel.
alter table generations add column push_started_at timestamptz;

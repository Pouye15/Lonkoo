-- Index des recherches fréquentes (V1 et V2 n'indexaient que les clés primaires et les versions).

-- Liste des projets d'un utilisateur (la clé primaire commence par project_id).
create index project_members_par_utilisateur on project_members (user_id);
-- Canvas d'un projet.
create index canvases_par_projet on canvases (project_id);
-- Liens de partage d'un canvas (comptage des liens actifs, purge).
create index share_links_par_canvas on share_links (canvas_id);
-- Recherche dans le journal d'une cible (project:…, canvas:…, user:…).
create index audit_log_par_cible on audit_log (target);

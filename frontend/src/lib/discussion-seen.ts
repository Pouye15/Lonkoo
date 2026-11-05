/**
 * Dernier message de la discussion que cette personne a vu, par projet : de quoi compter les messages non lus.
 * Gardé dans le navigateur (jamais envoyé au serveur). Le stockage peut manquer ou refuser (navigation privée, données
 * bloquées) : la valeur reste alors en mémoire pour la session, et rien ne plante.
 */

const memory = new Map<string, number>();

const keyOf = (projectId: string) => `lonkoo.discussion.seen.${projectId}`;

/** Le dernier identifiant vu pour ce projet, ou `null` si la personne n'a encore rien vu. */
export function readSeen(projectId: string): number | null {
  try {
    const raw = window.localStorage.getItem(keyOf(projectId));
    if (raw !== null) {
      const value = Number(raw);
      if (Number.isInteger(value) && value >= 0) return value;
    }
  } catch {
    // stockage indisponible : on se rabat sur la mémoire
  }
  return memory.get(projectId) ?? null;
}

/** Retient l'identifiant vu. Il ne recule jamais : relire un ancien message ne fait pas réapparaître de non lus. */
export function markSeen(projectId: string, messageId: number): void {
  const known = readSeen(projectId);
  if (known !== null && known >= messageId) return;
  memory.set(projectId, messageId);
  try {
    window.localStorage.setItem(keyOf(projectId), String(messageId));
  } catch {
    // stockage indisponible ou plein : la mémoire suffit pour la session
  }
}

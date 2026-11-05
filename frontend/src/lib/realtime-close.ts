/**
 * Codes de fermeture que le serveur temps réel envoie quand il coupe une connexion pour une raison qui n'est pas une
 * panne du réseau (realtime/src/limits.js, docs/DEPLOIEMENT.md, « Limites du canvas en direct »).
 */

/** Une modification de cette connexion ferait dépasser la taille maximale du canvas : elle n'a pas été enregistrée. */
export const CLOSE_CANVAS_TOO_LARGE = 4413;

/** Cette connexion envoyait trop de messages : le serveur l'a coupée. Le fournisseur se reconnecte seul. */
export const CLOSE_TOO_MANY_MESSAGES = 4429;

export const CANVAS_TOO_LARGE_MESSAGE =
  "Ce canvas est trop volumineux : votre dernière modification n'a pas été enregistrée. " +
  "Supprimez du contenu ou restaurez une version, puis rechargez la page.";

/**
 * Vrai si la connexion ne doit pas être rouverte toute seule. Après 4413, le navigateur garde la modification refusée
 * dans son document et la renverrait à chaque reconnexion (le fournisseur réessaie une seconde après chaque coupure),
 * pour être coupé à nouveau : on s'arrête, et la personne recharge la page.
 */
export function stopsReconnection(code: number | undefined): boolean {
  return code === CLOSE_CANVAS_TOO_LARGE;
}

/**
 * Client HTTP interne vers le backend (routes /internal).
 * Le serveur temps réel charge l'état et réécrit via ces routes, avec le jeton de service.
 */

/** Échec d'un appel au backend ; `status` est absent quand le backend est injoignable ou trop lent. */
export class BackendError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/** Une nouvelle tentative a un sens si le backend est injoignable ou en erreur, pas s'il refuse (4xx). */
export function isRetryable(error) {
  return !(error instanceof BackendError) || error.status === undefined || error.status >= 500;
}

export function createBackendClient(baseUrl, serviceToken, { timeoutMs = 5000 } = {}) {
  async function call(path, options = {}) {
    try {
      return await fetch(`${baseUrl}${path}`, {
        ...options,
        headers: { Authorization: `Bearer ${serviceToken}`, ...options.headers },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (cause) {
      throw new BackendError(`Backend injoignable ou trop lent (${cause.name})`);
    }
  }

  /** État d'un canvas : `{ state: "<base64>" | null, seed: {…} | null }`. Un canvas inconnu (404) est refusé. */
  async function getState(canvasId) {
    const res = await call(`/internal/canvases/${canvasId}/state`);
    if (!res.ok) {
      throw new BackendError(`Backend getState ${res.status}`, res.status);
    }
    return res.json();
  }

  async function putState(canvasId, base64) {
    const res = await call(`/internal/canvases/${canvasId}/state`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: base64 }),
    });
    if (!res.ok) {
      throw new BackendError(`Backend putState ${res.status}`, res.status);
    }
  }

  /**
   * Rôle que chacune de ces personnes a maintenant sur le canvas : `{ "<id>": "<rôle>" }`, sans entrée pour qui n'a
   * plus accès. Sert à couper les connexions de qui a perdu l'accès (retrait, projet repassé en privé).
   */
  async function getAccess(canvasId, userIds) {
    const res = await call(`/internal/canvases/${canvasId}/access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userIds }),
    });
    if (!res.ok) {
      throw new BackendError(`Backend getAccess ${res.status}`, res.status);
    }
    return (await res.json()).roles ?? {};
  }

  return { getState, putState, getAccess };
}

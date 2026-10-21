/**
 * Client HTTP interne vers le backend (routes /internal).
 * Le serveur temps réel charge l'état et réécrit via ces routes.
 */
export function createBackendClient(baseUrl, serviceToken) {
  async function getState(canvasId) {
    const res = await fetch(`${baseUrl}/internal/canvases/${canvasId}/state`, {
      headers: { Authorization: `Bearer ${serviceToken}` },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      throw new Error(`Backend getState ${res.status}`);
    }
    return res.json(); // { state: "<base64>" | null, seed: {…} | null }
  }

  async function putState(canvasId, base64) {
    const res = await fetch(`${baseUrl}/internal/canvases/${canvasId}/state`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ state: base64 }),
    });
    if (!res.ok) {
      throw new Error(`Backend putState ${res.status}`);
    }
  }

  return { getState, putState };
}
import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional
import httpx
from fastapi import HTTPException

from validator import validate_canvas

logger = logging.getLogger("agent_ia.gemini")

DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai"
DEFAULT_MODEL = "gemini-3.8-flash"
# Délai par appel au modèle, en secondes. Contrat partagé avec le backend : voir README.
DEFAULT_TIMEOUT_SECONDS = 30.0


def read_timeout_seconds(env: Optional[Dict[str, str]] = None) -> float:
    """Lit AI_TIMEOUT_SECONDS (délai par appel au modèle, défaut 30 s)."""
    source = env if env is not None else os.environ
    raw = (source.get("AI_TIMEOUT_SECONDS") or "").strip()
    if not raw:
        return DEFAULT_TIMEOUT_SECONDS
    try:
        value = float(raw)
    except ValueError:
        logger.warning("AI_TIMEOUT_SECONDS illisible, valeur par défaut appliquée (%s s)", DEFAULT_TIMEOUT_SECONDS)
        return DEFAULT_TIMEOUT_SECONDS
    if value <= 0:
        logger.warning("AI_TIMEOUT_SECONDS non positif, valeur par défaut appliquée (%s s)", DEFAULT_TIMEOUT_SECONDS)
        return DEFAULT_TIMEOUT_SECONDS
    return value


class GeminiClient:
    """Client du fournisseur de modèle, compatible avec l'API de complétion de chat d'OpenAI.

    Le client HTTP est partagé : il est fourni par le cycle de vie de l'application
    (`attach_http_client`) afin de réutiliser les connexions d'un appel à l'autre.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
    ):
        self.api_key = api_key or os.getenv("AI_API_KEY", "")
        raw_base = base_url or os.getenv("AI_BASE_URL", DEFAULT_BASE_URL)
        self.base_url = raw_base.rstrip("/") if raw_base else DEFAULT_BASE_URL
        self.model = model or os.getenv("AI_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
        self.timeout = timeout if timeout is not None else read_timeout_seconds()
        self._http: Optional[httpx.AsyncClient] = None

    # ------------------------------------------------------------------
    # Client HTTP partagé
    # ------------------------------------------------------------------

    def attach_http_client(self, client: Optional[httpx.AsyncClient]) -> None:
        """Associe (ou détache) le client HTTP partagé géré par le cycle de vie de l'application."""
        self._http = client

    @property
    def http(self) -> httpx.AsyncClient:
        if self._http is None:
            logger.error("Client HTTP partagé absent : le cycle de vie de l'application n'a pas été exécuté")
            raise HTTPException(status_code=503, detail="Le service IA n'est pas initialisé.")
        return self._http

    def _headers(self) -> Dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["x-goog-api-key"] = self.api_key
        return headers

    # ------------------------------------------------------------------
    # Appels au modèle
    # ------------------------------------------------------------------

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        json_format: bool = True,
        temperature: float = 0.2,
    ) -> str:
        """Appelle l'endpoint de complétion de chat (un seul appel, borné par self.timeout)."""
        endpoint = f"{self.base_url}/chat/completions"

        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_format:
            body["response_format"] = {"type": "json_object"}

        try:
            response = await self.http.post(
                endpoint, json=body, headers=self._headers(), timeout=self.timeout
            )
        except httpx.TimeoutException:
            logger.error("Délai d'attente dépassé vers le fournisseur LLM")
            raise HTTPException(status_code=504, detail="Le fournisseur d'IA n'a pas répondu à temps.")
        except httpx.RequestError:
            # Jamais le détail de l'exception : il peut contenir l'URL et des en-têtes.
            logger.error("Erreur réseau vers le fournisseur LLM")
            raise HTTPException(status_code=502, detail="Fournisseur d'IA injoignable.")

        if response.status_code == 429:
            logger.warning("Quota dépassé auprès du fournisseur d'IA (429)")
            raise HTTPException(status_code=503, detail="Le service IA est temporairement saturé.")

        if response.status_code in (401, 403):
            logger.error("Authentification refusée par le fournisseur d'IA (%d)", response.status_code)
            raise HTTPException(status_code=503, detail="Clé d'API du fournisseur d'IA invalide ou refusée.")

        if response.status_code != 200:
            # On ne journalise que le code HTTP : le corps peut contenir la saisie ou la clé.
            logger.error("Réponse d'erreur du fournisseur d'IA (code HTTP %d)", response.status_code)
            raise HTTPException(status_code=502, detail="Erreur du fournisseur d'IA.")

        try:
            data = response.json()
            content = data["choices"][0]["message"]["content"]
        except Exception:
            logger.error("Structure de réponse du fournisseur d'IA inattendue")
            raise HTTPException(status_code=502, detail="Réponse invalide du fournisseur d'IA.")

        return content if isinstance(content, str) else ""

    async def stream_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        """Appelle l'endpoint de complétion en streaming et relaie des événements SSE."""
        endpoint = f"{self.base_url}/chat/completions"

        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }

        try:
            async with self.http.stream(
                "POST", endpoint, json=body, headers=self._headers(), timeout=self.timeout
            ) as response:
                if response.status_code != 200:
                    await response.aread()
                    logger.error("Erreur du fournisseur d'IA en streaming (code HTTP %d)", response.status_code)
                    yield f"data: {json.dumps({'error': 'Erreur du fournisseur IA'}, ensure_ascii=False)}\n\n"
                    return

                async for raw_line in response.aiter_lines():
                    line = raw_line.strip()
                    if not line:
                        continue
                    if line.startswith("data: "):
                        payload = line[6:].strip()
                        if payload == "[DONE]":
                            yield "data: [DONE]\n\n"
                            break
                        try:
                            chunk = json.loads(payload)
                            delta = chunk.get("choices", [{}])[0].get("delta", {}).get("content", "")
                            if delta:
                                yield f"data: {json.dumps({'content': delta}, ensure_ascii=False)}\n\n"
                        except Exception:
                            continue
        except Exception:
            # Message générique : le détail de l'exception peut porter l'URL ou la clé.
            logger.error("Échec du streaming vers le fournisseur d'IA")
            yield f"data: {json.dumps({'error': 'Le service IA est temporairement indisponible.'}, ensure_ascii=False)}\n\n"

    # ------------------------------------------------------------------
    # Génération de canvas
    # ------------------------------------------------------------------

    async def ask_for_canvas(self, system_prompt: str, user_content: str) -> Dict[str, Any]:
        """Génère un canvas, avec au plus une reprise si le contrat est violé.

        La reprise rejoue la conversation complète (consigne, sortie fautive, erreurs du
        validateur) afin que le modèle voie sa propre sortie. Aucune correction silencieuse :
        si la reprise échoue, la requête est refusée.
        """
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        raw_output = await self.call_llm(messages, json_format=True)
        parsed = self.extract_json(raw_output)
        canvas = self._unwrap_canvas(parsed)

        errors = validate_canvas(canvas) if canvas else ["Réponse JSON invalide ou structure de canvas manquante"]
        if errors:
            logger.info("Contrat canvas non respecté (%d erreurs). Tentative de reprise unique.", len(errors))
            retry_messages = messages + [
                {"role": "assistant", "content": raw_output or ""},
                {
                    "role": "user",
                    "content": (
                        "Ta réponse précédente (ci-dessus) viole le contrat du canvas :\n- "
                        + "\n- ".join(errors)
                        + "\n\nCorrige toutes ces erreurs et renvoie l'objet JSON complet et conforme, "
                        "sans texte autour."
                    ),
                },
            ]
            raw_output = await self.call_llm(retry_messages, json_format=True)
            parsed = self.extract_json(raw_output)
            canvas = self._unwrap_canvas(parsed)

            final_errors = validate_canvas(canvas) if canvas else ["Réponse de reprise invalide"]
            if final_errors:
                logger.error("Échec persistant du contrat canvas après la reprise (%d erreurs)", len(final_errors))
                raise HTTPException(
                    status_code=502,
                    detail=f"La proposition de l'IA ne respecte pas le contrat : {final_errors[0]}"
                )

        summary = (parsed or {}).get("summary") or "Proposition d'architecture générée par l'IA."
        return {
            "canvas": canvas,
            "summary": summary,
            "demo": False,
        }

    def extract_json(self, text: str) -> Optional[Dict[str, Any]]:
        """Analyse la sortie du modèle en objet JSON.

        Renvoie `None` quand la sortie est inutilisable (vide, non JSON, ou JSON qui n'est
        pas un objet) : l'appelant doit alors refuser la requête, jamais la considérer comme
        un résultat vide.
        """
        if not text:
            return None
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        try:
            parsed = json.loads(cleaned)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None

    def _unwrap_canvas(self, data: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not isinstance(data, dict):
            return None
        if "canvas" in data and isinstance(data["canvas"], dict):
            return data["canvas"]
        if "schemaVersion" in data and "nodes" in data:
            return data
        return None

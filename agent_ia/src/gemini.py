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


class GeminiClient:
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: float = 45.0,
    ):
        self.api_key = api_key or os.getenv("AI_API_KEY", "")
        raw_base = base_url or os.getenv("AI_BASE_URL", DEFAULT_BASE_URL)
        self.base_url = raw_base.rstrip("/") if raw_base else DEFAULT_BASE_URL
        self.model = model or os.getenv("AI_MODEL", DEFAULT_MODEL) or DEFAULT_MODEL
        self.timeout = timeout

    async def call_llm(
        self,
        messages: List[Dict[str, str]],
        json_format: bool = True,
        temperature: float = 0.2,
    ) -> str:
        """Appelle l'endpoint de complétion de chat."""
        endpoint = f"{self.base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["x-goog-api-key"] = self.api_key

        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
        }
        if json_format:
            body["response_format"] = {"type": "json_object"}

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                response = await client.post(endpoint, json=body, headers=headers)
            except httpx.TimeoutException:
                logger.error("Délai d'attente dépassé vers le fournisseur LLM")
                raise HTTPException(status_code=504, detail="Le fournisseur d'IA n'a pas répondu à temps.")
            except httpx.RequestError as exc:
                logger.error("Erreur réseau vers le fournisseur LLM : %s", self._redact(str(exc)))
                raise HTTPException(status_code=502, detail="Fournisseur d'IA injoignable.")

        if response.status_code == 429:
            logger.warning("Quota dépassé auprès du fournisseur d'IA (429)")
            raise HTTPException(status_code=503, detail="Le service IA est temporairement saturé.")

        if response.status_code in (401, 403):
            logger.error("Authentification refusée par le fournisseur d'IA (%d)", response.status_code)
            raise HTTPException(status_code=503, detail="Clé d'API du fournisseur d'IA invalide ou refusée.")

        if response.status_code != 200:
            logger.error("Réponse d'erreur du fournisseur d'IA : %d - %s", response.status_code, self._redact(response.text[:200]))
            raise HTTPException(status_code=502, detail="Erreur du fournisseur d'IA.")

        try:
            data = response.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error("Structure de réponse LLM inattendue : %s", e)
            raise HTTPException(status_code=502, detail="Réponse invalide du fournisseur d'IA.")

    def _redact(self, text: str) -> str:
        """Masque la clé d'API dans un texte destiné aux journaux (un fournisseur peut la répéter dans une erreur)."""
        return text.replace(self.api_key, "***") if self.api_key else text

    async def stream_llm(
        self,
        messages: List[Dict[str, str]],
        temperature: float = 0.4,
    ) -> AsyncGenerator[str, None]:
        """Appelle l'endpoint de complétion en streaming SSE."""
        endpoint = f"{self.base_url}/chat/completions"

        headers = {
            "Content-Type": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
            headers["x-goog-api-key"] = self.api_key

        body: Dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            try:
                async with client.stream("POST", endpoint, json=body, headers=headers) as response:
                    if response.status_code != 200:
                        error_text = await response.aread()
                        logger.error("Erreur stream LLM : %d - %s", response.status_code, self._redact(error_text.decode("utf-8", "replace")[:200]))
                        yield f"data: {json.dumps({'error': 'Erreur du fournisseur IA'})}\n\n"
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
                                    yield f"data: {json.dumps({'content': delta})}\n\n"
                            except Exception:
                                continue
            except Exception as e:
                logger.error("Exception streaming LLM: %s", self._redact(str(e)))
                yield f"data: {json.dumps({'error': 'Erreur du fournisseur IA'})}\n\n"

    async def ask_for_canvas(self, system_prompt: str, user_content: str) -> Dict[str, Any]:
        """Génère un canvas avec tentative unique de reprise si le contrat est violé."""
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]

        raw_output = await self.call_llm(messages, json_format=True)
        parsed = self._extract_json(raw_output)
        canvas = self._unwrap_canvas(parsed)

        errors = validate_canvas(canvas) if canvas else ["Réponse JSON invalide ou structure de canvas manquante"]
        if errors:
            logger.info("Contrat canvas non respecté (%d erreurs). Tentative de correction...", len(errors))
            retry_content = (
                f"{user_content}\n\n[ATTENTION : Ta réponse précédente a violé le contrat du canvas :\n- "
                + "\n- ".join(errors)
                + "\n\nCorrige immédiatement toutes ces erreurs et renvoie l'objet JSON complet conforme.]"
            )
            retry_messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": retry_content},
            ]
            raw_output = await self.call_llm(retry_messages, json_format=True)
            parsed = self._extract_json(raw_output)
            canvas = self._unwrap_canvas(parsed)

            final_errors = validate_canvas(canvas) if canvas else ["Réponse de reprise invalide"]
            if final_errors:
                logger.error("Échec persistant du contrat canvas après tentative : %s", final_errors)
                raise HTTPException(
                    status_code=502,
                    detail=f"La proposition de l'IA ne respecte pas le contrat : {final_errors[0]}"
                )

        summary = parsed.get("summary", "Proposition d'architecture générée par l'IA.")
        return {
            "canvas": canvas,
            "summary": summary,
            "demo": False,
        }

    def _extract_json(self, text: str) -> Dict[str, Any]:
        if not text:
            return {}
        cleaned = text.strip()
        if cleaned.startswith("```json"):
            cleaned = cleaned[7:]
        elif cleaned.startswith("```"):
            cleaned = cleaned[3:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        try:
            return json.loads(cleaned)
        except Exception:
            return {}

    def _unwrap_canvas(self, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        if not isinstance(data, dict):
            return None
        if "canvas" in data and isinstance(data["canvas"], dict):
            return data["canvas"]
        if "schemaVersion" in data and "nodes" in data:
            return data
        return None

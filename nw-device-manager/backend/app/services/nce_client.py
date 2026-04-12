"""iMaster NCE-T REST NBI client.

Handles token authentication and provides methods to fetch
NE, card (board), and LTP (port) data from the NCE controller.

Verified endpoints against LAB NCE (V800R020C05):
  - Session:  PUT /rest/plat/smapp/v1/sessions
  - NE list:  GET /restconf/v2/data/huawei-nce-resource-inventory:network-elements
  - Cards:    GET /restconf/v2/data/huawei-nce-resource-inventory:cards
  - LTPs:     GET /restconf/v2/data/huawei-nce-resource-inventory:ltps
"""

import logging
from datetime import datetime, timezone

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# NCE REST NBI endpoints
_SESSION_PATH = "/rest/plat/smapp/v1/sessions"
_NE_LIST_PATH = "/restconf/v2/data/huawei-nce-resource-inventory:network-elements"
_CARD_LIST_PATH = "/restconf/v2/data/huawei-nce-resource-inventory:cards"
_LTP_LIST_PATH = "/restconf/v2/data/huawei-nce-resource-inventory:ltps"

# Response structure: {"network-elements": {"network-element": [...]}}
#                     {"cards": {"card": [...]}}
#                     {"ltps": {"ltp": [...]}}


class NCEAuthError(Exception):
    """Raised when NCE authentication fails."""


class NCEAPIError(Exception):
    """Raised when an NCE API call fails."""


class NCEClient:
    """Async client for iMaster NCE-T REST NBI."""

    def __init__(self) -> None:
        self._token: str | None = None
        self._token_expires: datetime | None = None
        self._base_url = settings.NCE_BASE_URL.rstrip("/")

    @property
    def is_configured(self) -> bool:
        return bool(self._base_url and settings.NCE_USERNAME)

    def _http_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self._base_url,
            verify=settings.NCE_VERIFY_SSL,
            timeout=httpx.Timeout(300.0, connect=15.0),
        )

    async def authenticate(self) -> str:
        """Obtain an access token from NCE.

        PUT /rest/plat/smapp/v1/sessions
        Body: {"grantType": "password", "userName": "...", "value": "..."}
        Returns the accessSession token string.
        """
        async with self._http_client() as client:
            resp = await client.put(
                _SESSION_PATH,
                json={
                    "grantType": "password",
                    "userName": settings.NCE_USERNAME,
                    "value": settings.NCE_PASSWORD,
                },
            )
        if resp.status_code != 200:
            raise NCEAuthError(
                f"NCE authentication failed: {resp.status_code} {resp.text[:200]}"
            )
        data = resp.json()
        if "exceptionId" in data:
            raise NCEAuthError(f"NCE login error: {data.get('exceptionId')}")
        token = data.get("accessSession")
        if not token:
            raise NCEAuthError(f"NCE response has no accessSession: {data}")

        self._token = token
        self._token_expires = datetime.now(timezone.utc)
        logger.info("NCE authentication successful (expires in %ss)", data.get("expires", "?"))
        return token

    def _auth_headers(self) -> dict[str, str]:
        if not self._token:
            raise NCEAuthError("Not authenticated. Call authenticate() first.")
        return {"X-AUTH-TOKEN": self._token}

    async def _get_all(self, path: str) -> list[dict]:
        """Fetch all items from an NCE REST endpoint.

        NCE LAB returns all items in a single response regardless of
        pageSize, so we fetch once with a large pageSize and return.
        For production NCE with pagination, we support multi-page fetching.
        """
        all_items: list[dict] = []
        page_size = 5000  # Large enough to get all items in one request
        page_index = 1

        async with self._http_client() as client:
            resp = await client.get(
                path,
                headers=self._auth_headers(),
                params={"pageIndex": page_index, "pageSize": page_size},
            )
            if resp.status_code == 401:
                await self.authenticate()
                resp = await client.get(
                    path,
                    headers=self._auth_headers(),
                    params={"pageIndex": page_index, "pageSize": page_size},
                )
            if resp.status_code != 200:
                raise NCEAPIError(
                    f"NCE API error {path}: {resp.status_code} {resp.text[:300]}"
                )

            body = resp.json()
            items = self._extract_items(body)
            all_items.extend(items)

            # If items == pageSize, there may be more pages
            while len(items) == page_size:
                page_index += 1
                resp = await client.get(
                    path,
                    headers=self._auth_headers(),
                    params={"pageIndex": page_index, "pageSize": page_size},
                )
                if resp.status_code != 200:
                    break
                body = resp.json()
                items = self._extract_items(body)
                if not items:
                    break
                all_items.extend(items)

        logger.info("NCE %s: fetched %d items", path.split(":")[-1], len(all_items))
        return all_items

    @staticmethod
    def _extract_items(body: dict) -> list[dict]:
        """Extract the item list from NCE response.

        NCE wraps data as: {"<plural>": {"<singular>": [...]}}
        e.g. {"network-elements": {"network-element": [...]}}
             {"cards": {"card": [...]}}
             {"ltps": {"ltp": [...]}}
        """
        if isinstance(body, list):
            return body
        for key, val in body.items():
            if isinstance(val, dict):
                for inner_key, inner_val in val.items():
                    if isinstance(inner_val, list):
                        return inner_val
            if isinstance(val, list):
                return val
        return []

    async def get_network_elements(self) -> list[dict]:
        """Fetch all NE (Network Element) records."""
        return await self._get_all(_NE_LIST_PATH)

    async def get_cards(self) -> list[dict]:
        """Fetch all card (board/slot) records."""
        return await self._get_all(_CARD_LIST_PATH)

    async def get_ports(self) -> list[dict]:
        """Fetch all LTP (port) records."""
        return await self._get_all(_LTP_LIST_PATH)

    async def test_connection(self) -> dict:
        """Test NCE connectivity: authenticate and fetch NE summary."""
        if not self.is_configured:
            return {
                "status": "not_configured",
                "message": "NCE接続情報が設定されていません (NCE_BASE_URL, NCE_USERNAME)",
            }
        try:
            await self.authenticate()
        except NCEAuthError as e:
            return {"status": "auth_failed", "message": str(e)}
        except httpx.ConnectError as e:
            return {"status": "connect_failed", "message": f"NCEサーバーに接続できません: {e}"}
        except Exception as e:
            return {"status": "error", "message": str(e)}

        try:
            async with self._http_client() as client:
                resp = await client.get(
                    _NE_LIST_PATH,
                    headers=self._auth_headers(),
                    params={"pageIndex": 1, "pageSize": 1},
                )
            if resp.status_code == 200:
                body = resp.json()
                items = self._extract_items(body)
                total = len(items) if items else 0
                return {
                    "status": "ok",
                    "message": f"NCE接続成功 — NE総数: {total}+",
                    "total_ne": total,
                }
            return {
                "status": "api_error",
                "message": f"NE取得テスト失敗: {resp.status_code}",
            }
        except Exception as e:
            return {"status": "error", "message": str(e)}


# Module-level singleton
nce_client = NCEClient()

import asyncio
import copy
import json
import logging
from pathlib import Path
from typing import Any

log = logging.getLogger("qwen2api.db")


class _BaseDocumentDB:
    def __init__(self, default_data: Any = None):
        self.default_data = copy.deepcopy(default_data if default_data is not None else [])
        self._lock = asyncio.Lock()
        self._data: Any = None
        self.saved_snapshots: list[Any] | None = None

    def _clone_default(self) -> Any:
        return copy.deepcopy(self.default_data)


class AsyncJsonDB:
    """带异步读写锁的 JSON 文件存储，防止并发损坏。"""
    def __init__(self, path: str | Path, default_data: Any = None):
        self._base = _BaseDocumentDB(default_data=default_data)
        self.path = Path(path)
        self._init_file()

    @property
    def saved_snapshots(self) -> list[Any] | None:
        return self._base.saved_snapshots

    @saved_snapshots.setter
    def saved_snapshots(self, value: list[Any] | None) -> None:
        self._base.saved_snapshots = value

    @property
    def _lock(self) -> asyncio.Lock:
        return self._base._lock

    @property
    def _data(self) -> Any:
        return self._base._data

    @_data.setter
    def _data(self, value: Any) -> None:
        self._base._data = value

    @property
    def default_data(self) -> Any:
        return self._base.default_data

    def _clone_default(self) -> Any:
        return self._base._clone_default()

    def _init_file(self):
        if not self.path.exists():
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(json.dumps(self.default_data, indent=2, ensure_ascii=False), encoding="utf-8")

    async def load(self) -> Any:
        async with self._lock:
            if not self.path.exists():
                self._data = self._clone_default()
                return self._data
            try:
                # 为了不阻塞事件循环，本应用可使用 asyncio.to_thread 或者直接读，因为文件很小
                content = self.path.read_text(encoding="utf-8")
                self._data = json.loads(content)
            except Exception as e:
                log.error(f"Failed to load JSON from {self.path}: {e}")
                self._data = self._clone_default()
            return self._data

    async def save(self, data: Any):
        async with self._lock:
            self._data = data
            try:
                self.path.write_text(json.dumps(self._data, indent=2, ensure_ascii=False), encoding="utf-8")
            except Exception as e:
                log.error(f"Failed to save JSON to {self.path}: {e}")

    async def get(self) -> Any:
        if self._data is None:
            return await self.load()
        return self._data


class AsyncMongoDB:
    """将整个逻辑数据作为单文档持久化到 Mongo collection。"""

    def __init__(self, collection, default_data: Any = None, *, document_id: str = "root"):
        self._base = _BaseDocumentDB(default_data=default_data)
        self.collection = collection
        self.document_id = document_id

    @property
    def saved_snapshots(self) -> list[Any] | None:
        return self._base.saved_snapshots

    @saved_snapshots.setter
    def saved_snapshots(self, value: list[Any] | None) -> None:
        self._base.saved_snapshots = value

    @property
    def _lock(self) -> asyncio.Lock:
        return self._base._lock

    @property
    def _data(self) -> Any:
        return self._base._data

    @_data.setter
    def _data(self, value: Any) -> None:
        self._base._data = value

    def _clone_default(self) -> Any:
        return self._base._clone_default()

    async def load(self) -> Any:
        async with self._lock:
            try:
                document = await asyncio.to_thread(
                    self.collection.find_one,
                    {"_id": self.document_id},
                )
            except Exception as exc:
                log.error("Failed to load Mongo document from %s: %s", self.collection.name, exc)
                raise

            if not isinstance(document, dict):
                self._data = self._clone_default()
                return self._data

            self._data = document.get("data", self._clone_default())
            snapshots = document.get("saved_snapshots")
            self.saved_snapshots = list(snapshots) if isinstance(snapshots, list) else None
            return self._data

    async def save(self, data: Any):
        async with self._lock:
            self._data = data
            document = {"_id": self.document_id, "data": data}
            if isinstance(self.saved_snapshots, list):
                document["saved_snapshots"] = self.saved_snapshots
            try:
                await asyncio.to_thread(
                    self.collection.replace_one,
                    {"_id": self.document_id},
                    document,
                    True,
                )
            except Exception as exc:
                log.error("Failed to save Mongo document to %s: %s", self.collection.name, exc)
                raise

    async def get(self) -> Any:
        if self._data is None:
            return await self.load()
        return self._data


class LocalApiKeyStore:
    def __init__(self, path: str | Path):
        self.path = Path(path)

    def load(self) -> set[str]:
        if not self.path.exists():
            return set()
        try:
            with self.path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
        except Exception as exc:
            log.warning("Failed to load API keys from %s: %s", self.path, exc)
            return set()
        return {str(item) for item in data.get("keys", []) if str(item)}

    def save(self, keys: set[str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self.path.open("w", encoding="utf-8") as handle:
            json.dump({"keys": sorted(keys)}, handle, indent=2, ensure_ascii=False)


class MongoApiKeyStore:
    def __init__(self, collection, *, document_id: str = "root"):
        self.collection = collection
        self.document_id = document_id

    def load(self) -> set[str]:
        document = self.collection.find_one({"_id": self.document_id}) or {}
        return {str(item) for item in document.get("keys", []) if str(item)}

    def save(self, keys: set[str]) -> None:
        self.collection.replace_one(
            {"_id": self.document_id},
            {"_id": self.document_id, "keys": sorted(keys)},
            upsert=True,
        )

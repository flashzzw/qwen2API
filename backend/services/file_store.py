from __future__ import annotations

import asyncio
import hashlib
import mimetypes
import time
import uuid
from pathlib import Path
from typing import Any

from gridfs import GridFSBucket
from gridfs.errors import NoFile


def _build_file_meta(
    *,
    file_id: str,
    filename: str,
    content_type: str,
    raw: bytes,
    owner_token: str | None,
    purpose: str,
    path: str = "",
    storage_backend: str = "local",
) -> dict[str, Any]:
    return {
        "id": file_id,
        "path": path,
        "filename": filename,
        "content_type": content_type or "application/octet-stream",
        "size": len(raw),
        "sha256": hashlib.sha256(raw).hexdigest(),
        "created_at": time.time(),
        "owner_token": owner_token or "",
        "purpose": purpose,
        "storage_backend": storage_backend,
    }


class LocalFileStore:
    strict_storage_errors = False

    def __init__(self, root_dir: str, metadata_db=None):
        self.root_dir = Path(root_dir)
        self.root_dir.mkdir(parents=True, exist_ok=True)
        self.metadata_db = metadata_db
        self._metadata: dict[str, dict[str, Any]] = {}
        self._loaded = False

    async def load(self):
        if self.metadata_db is None:
            return
        data = await self.metadata_db.load()
        self._metadata = {}
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and item.get("id"):
                    self._metadata[item["id"]] = item
        self._loaded = True

    async def save(self):
        if self.metadata_db is None:
            return
        await self.metadata_db.save(list(self._metadata.values()))

    async def save_bytes(self, filename: str, content_type: str, raw: bytes, purpose: str, owner_token: str | None = None) -> dict:
        file_id = uuid.uuid4().hex
        suffix = Path(filename).suffix or mimetypes.guess_extension(content_type or "") or ""
        safe_name = (Path(filename).stem or "file").replace(" ", "_")
        final_name = f"{safe_name}{suffix}"
        target = self.root_dir / purpose / f"{file_id}_{final_name}"
        target.parent.mkdir(parents=True, exist_ok=True)
        await asyncio.to_thread(target.write_bytes, raw)
        meta = _build_file_meta(
            file_id=file_id,
            filename=final_name,
            content_type=content_type,
            raw=raw,
            owner_token=owner_token,
            purpose=purpose,
            path=str(target),
            storage_backend="local",
        )
        self._metadata[file_id] = meta
        await self.save()
        return meta

    async def save_text(self, filename: str, text: str, content_type: str = "text/plain", purpose: str = "context", owner_token: str | None = None) -> dict:
        raw = text.encode("utf-8")
        return await self.save_bytes(filename, content_type, raw, purpose, owner_token=owner_token)

    async def get(self, file_id: str) -> dict[str, Any] | None:
        if not self._loaded and self.metadata_db is not None:
            await self.load()
        return self._metadata.get(file_id)

    async def read_bytes(self, file_id: str) -> bytes:
        meta = await self.get(file_id)
        if meta is None or not meta.get("path"):
            raise FileNotFoundError(file_id)
        return await asyncio.to_thread(Path(meta["path"]).read_bytes)

    async def delete(self, file_id: str) -> None:
        meta = await self.get(file_id)
        if meta and meta.get("path"):
            await self.delete_path(meta["path"])
        self._metadata.pop(file_id, None)
        await self.save()

    async def delete_path(self, path: str) -> None:
        target = Path(path)
        try:
            await asyncio.to_thread(target.unlink)
        except FileNotFoundError:
            pass
        remove_id = None
        for file_id, meta in self._metadata.items():
            if meta.get("path") == str(target):
                remove_id = file_id
                break
        if remove_id:
            self._metadata.pop(remove_id, None)
            await self.save()

    async def cleanup_expired(self, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        cutoff = time.time() - ttl_seconds
        expired_ids: list[str] = []
        for file_id, meta in list(self._metadata.items()):
            if meta.get("created_at", 0) < cutoff:
                expired_ids.append(file_id)
        for file_id in expired_ids:
            meta = self._metadata.get(file_id, {})
            path = meta.get("path")
            if path:
                try:
                    await asyncio.to_thread(Path(path).unlink)
                except FileNotFoundError:
                    pass
            self._metadata.pop(file_id, None)
        if expired_ids:
            await self.save()


class MongoGridFSFileStore:
    strict_storage_errors = True

    def __init__(self, mongo_db, metadata_db=None, *, bucket_name: str = "uploaded_files"):
        self.bucket = GridFSBucket(mongo_db, bucket_name=bucket_name)
        self.metadata_db = metadata_db
        self._metadata: dict[str, dict[str, Any]] = {}
        self._loaded = False

    async def load(self):
        if self.metadata_db is None:
            return
        data = await self.metadata_db.load()
        self._metadata = {}
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict) and item.get("id"):
                    self._metadata[item["id"]] = item
        self._loaded = True

    async def save(self):
        if self.metadata_db is None:
            return
        await self.metadata_db.save(list(self._metadata.values()))

    async def save_bytes(self, filename: str, content_type: str, raw: bytes, purpose: str, owner_token: str | None = None) -> dict[str, Any]:
        file_id = uuid.uuid4().hex
        suffix = Path(filename).suffix or mimetypes.guess_extension(content_type or "") or ""
        safe_name = (Path(filename).stem or "file").replace(" ", "_")
        final_name = f"{safe_name}{suffix}"
        meta = _build_file_meta(
            file_id=file_id,
            filename=final_name,
            content_type=content_type,
            raw=raw,
            owner_token=owner_token,
            purpose=purpose,
            path=f"gridfs://{file_id}",
            storage_backend="gridfs",
        )

        await asyncio.to_thread(
            self._upload_bytes_sync,
            file_id,
            final_name,
            content_type or "application/octet-stream",
            raw,
            purpose,
        )
        self._metadata[file_id] = meta
        try:
            await self.save()
        except Exception:
            self._metadata.pop(file_id, None)
            await self._delete_gridfs(file_id)
            raise
        return meta

    def _upload_bytes_sync(self, file_id: str, filename: str, content_type: str, raw: bytes, purpose: str) -> None:
        with self.bucket.open_upload_stream_with_id(
            file_id,
            filename,
            metadata={"content_type": content_type, "purpose": purpose},
        ) as stream:
            stream.write(raw)

    async def save_text(self, filename: str, text: str, content_type: str = "text/plain", purpose: str = "context", owner_token: str | None = None) -> dict[str, Any]:
        return await self.save_bytes(filename, content_type, text.encode("utf-8"), purpose, owner_token=owner_token)

    async def get(self, file_id: str) -> dict[str, Any] | None:
        if not self._loaded and self.metadata_db is not None:
            await self.load()
        return self._metadata.get(file_id)

    async def read_bytes(self, file_id: str) -> bytes:
        meta = await self.get(file_id)
        if meta is None:
            raise FileNotFoundError(file_id)
        try:
            return await asyncio.to_thread(self._read_bytes_sync, file_id)
        except NoFile as exc:
            raise FileNotFoundError(file_id) from exc

    def _read_bytes_sync(self, file_id: str) -> bytes:
        with self.bucket.open_download_stream(file_id) as stream:
            return stream.read()

    async def delete(self, file_id: str) -> None:
        await self._delete_gridfs(file_id)
        self._metadata.pop(file_id, None)
        await self.save()

    async def delete_path(self, path: str) -> None:
        if not path.startswith("gridfs://"):
            return
        await self.delete(path[len("gridfs://"):])

    async def _delete_gridfs(self, file_id: str) -> None:
        try:
            await asyncio.to_thread(self.bucket.delete, file_id)
        except NoFile:
            return

    async def cleanup_expired(self, ttl_seconds: int) -> None:
        if ttl_seconds <= 0:
            return
        cutoff = time.time() - ttl_seconds
        expired_ids = [
            file_id
            for file_id, meta in list(self._metadata.items())
            if float(meta.get("created_at", 0) or 0) < cutoff
        ]
        for file_id in expired_ids:
            await self._delete_gridfs(file_id)
            self._metadata.pop(file_id, None)
        if expired_ids:
            await self.save()

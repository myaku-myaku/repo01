"""In-memory import task manager.

Tracks background import tasks so the frontend can poll for progress
even after navigating away from the page.
"""

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETE = "complete"
    FAILED = "failed"


@dataclass
class ImportTask:
    id: str
    status: TaskStatus = TaskStatus.PENDING
    current: int = 0
    total: int = 0
    phase: str = ""
    message: str = ""
    created_hosts: int = 0
    created_slots: int = 0
    created_ports: int = 0
    skipped_no_office: int = 0
    total_records: int = 0
    error: str | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "status": self.status.value,
            "current": self.current,
            "total": self.total,
            "phase": self.phase,
            "message": self.message,
            "created_hosts": self.created_hosts,
            "created_slots": self.created_slots,
            "created_ports": self.created_ports,
            "skipped_no_office": self.skipped_no_office,
            "total_records": self.total_records,
            "error": self.error,
        }


class TaskManager:
    def __init__(self) -> None:
        self._tasks: dict[str, ImportTask] = {}

    def create_task(self) -> ImportTask:
        task_id = uuid.uuid4().hex[:12]
        task = ImportTask(id=task_id)
        self._tasks[task_id] = task
        return task

    def get_task(self, task_id: str) -> ImportTask | None:
        return self._tasks.get(task_id)

    def get_latest_task(self) -> ImportTask | None:
        if not self._tasks:
            return None
        return max(self._tasks.values(), key=lambda t: t.created_at)

    def cleanup_old_tasks(self, keep: int = 10) -> None:
        """Keep only the most recent tasks."""
        if len(self._tasks) <= keep:
            return
        sorted_tasks = sorted(self._tasks.values(), key=lambda t: t.created_at)
        for task in sorted_tasks[: len(sorted_tasks) - keep]:
            del self._tasks[task.id]


# Singleton
task_manager = TaskManager()

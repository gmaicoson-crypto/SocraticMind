"""Synchronous SQLAlchemy saver for the bounded learning workflow.

Each instance is bound to an authorized AgentRun, not an arbitrary client thread.
Whole checkpoints are small because workflow state contains identities, not prompts.
The future task worker can fence writes with a transaction-local lease guard.
"""

from contextlib import contextmanager
from threading import RLock

from langgraph.checkpoint.base import BaseCheckpointSaver, CheckpointTuple, WRITES_IDX_MAP
from langgraph.checkpoint.serde.jsonplus import JsonPlusSerializer

from core.errors import ApiError
from models import AgentCheckpoint, AgentCheckpointWrite, AgentRun

MAX_CHECKPOINT_BYTES = 2_000_000


class SQLRunCheckpointer(BaseCheckpointSaver):
    def __init__(self, session_factory, *, run_id, user_id, write_guard=None):
        super().__init__(
            serde=JsonPlusSerializer(
                pickle_fallback=False,
                allowed_json_modules=[],
                allowed_msgpack_modules=[
                    ("langgraph.types", "Interrupt"),
                    ("langgraph.types", "Send"),
                ],
            )
        )
        self.session_factory = session_factory
        self.run_id, self.user_id = run_id, user_id
        self.write_guard = write_guard
        self._lock = RLock()

    @contextmanager
    def _session(self):
        # LangGraph schedules checkpoint and pending-write saves on background
        # threads even with sync durability. Serialize this saver's DB work.
        with self._lock, self.session_factory() as db:
            yield db

    def _identity(self, config):
        values = config["configurable"]
        if values.get("thread_id") != self.run_id:
            raise ApiError(status_code=404, code="RUN_NOT_FOUND", message="流程不存在")
        namespace = values.get("checkpoint_ns", "")
        if not isinstance(namespace, str) or len(namespace) > 96:
            raise ValueError("Unsupported checkpoint namespace")
        return namespace, values.get("checkpoint_id")

    def _authorize(self, db, *, write=False):
        exists = db.query(AgentRun.id).filter_by(id=self.run_id, user_id=self.user_id).first()
        if exists is None:
            raise ApiError(status_code=404, code="RUN_NOT_FOUND", message="流程不存在")
        if write and self.write_guard is not None:
            self.write_guard(db)

    def _config(self, namespace, checkpoint_id):
        return {
            "configurable": {
                "thread_id": self.run_id,
                "checkpoint_ns": namespace,
                "checkpoint_id": checkpoint_id,
            }
        }

    def _dump(self, value):
        kind, payload = self.serde.dumps_typed(value)
        if len(payload) > MAX_CHECKPOINT_BYTES:
            raise ValueError("Checkpoint size limit exceeded")
        return kind, payload

    def _tuple(self, db, row):
        writes = (
            db.query(AgentCheckpointWrite)
            .filter_by(
                run_id=self.run_id,
                namespace=row.namespace,
                checkpoint_id=row.checkpoint_id,
            )
            .order_by(AgentCheckpointWrite.task_id, AgentCheckpointWrite.write_index)
            .all()
        )
        return CheckpointTuple(
            config=self._config(row.namespace, row.checkpoint_id),
            checkpoint=self.serde.loads_typed((row.value_type, row.payload)),
            metadata=row.metadata_json,
            parent_config=self._config(row.namespace, row.parent_id) if row.parent_id else None,
            pending_writes=[
                (w.task_id, w.channel, self.serde.loads_typed((w.value_type, w.payload)))
                for w in writes
            ],
        )

    def get_tuple(self, config):
        namespace, checkpoint_id = self._identity(config)
        with self._session() as db:
            self._authorize(db)
            query = db.query(AgentCheckpoint).filter_by(run_id=self.run_id, namespace=namespace)
            if checkpoint_id:
                query = query.filter_by(checkpoint_id=checkpoint_id)
            row = query.order_by(AgentCheckpoint.checkpoint_id.desc()).first()
            return self._tuple(db, row) if row else None

    def list(self, config, *, filter=None, before=None, limit=None):
        namespace, _ = self._identity(config or self._config("", None))
        before_id = self._identity(before)[1] if before else None
        remaining = limit if limit is not None else 100
        if remaining < 0 or remaining > 1000:
            raise ValueError("Checkpoint history limit must be between 0 and 1000")
        # Keyset pages keep both transactions and allocations bounded.
        while remaining:
            with self._session() as db:
                self._authorize(db)
                query = db.query(AgentCheckpoint).filter_by(run_id=self.run_id, namespace=namespace)
                if before_id:
                    query = query.filter(AgentCheckpoint.checkpoint_id < before_id)
                rows = query.order_by(AgentCheckpoint.checkpoint_id.desc()).limit(50).all()
                page = [
                    self._tuple(db, row)
                    for row in rows
                    if not filter or all(row.metadata_json.get(k) == v for k, v in filter.items())
                ]
                before_id = rows[-1].checkpoint_id if rows else None
            for item in page:
                yield item
                remaining -= 1
                if not remaining:
                    return
            if len(rows) < 50:
                return

    def put(self, config, checkpoint, metadata, new_versions):
        namespace, parent_id = self._identity(config)
        kind, payload = self._dump(checkpoint)
        # Do not copy runtime config: it may hold credentials or injected dependencies.
        safe_metadata = {k: metadata[k] for k in ("source", "step", "parents") if k in metadata}
        with self._session() as db:
            self._authorize(db, write=True)
            db.merge(
                AgentCheckpoint(
                    run_id=self.run_id,
                    namespace=namespace,
                    checkpoint_id=checkpoint["id"],
                    parent_id=parent_id,
                    value_type=kind,
                    payload=payload,
                    metadata_json=safe_metadata,
                )
            )
            db.commit()
        return self._config(namespace, checkpoint["id"])

    def put_writes(self, config, writes, task_id, task_path=""):
        namespace, checkpoint_id = self._identity(config)
        if not checkpoint_id:
            raise ValueError("Checkpoint id is required for task writes")
        with self._session() as db:
            self._authorize(db, write=True)
            for index, (channel, value) in enumerate(writes):
                index = WRITES_IDX_MAP.get(channel, index)
                key = (self.run_id, namespace, checkpoint_id, task_id, index)
                existing = db.get(AgentCheckpointWrite, key)
                if existing is not None and index >= 0:
                    continue  # A completed task's first successful write wins.
                kind, payload = self._dump(value)
                db.merge(
                    AgentCheckpointWrite(
                        run_id=self.run_id,
                        namespace=namespace,
                        checkpoint_id=checkpoint_id,
                        task_id=task_id,
                        write_index=index,
                        channel=channel,
                        value_type=kind,
                        payload=payload,
                    )
                )
            db.commit()

    def delete_thread(self, thread_id):
        self._identity({"configurable": {"thread_id": thread_id}})
        with self._session() as db:
            self._authorize(db, write=True)
            db.query(AgentCheckpointWrite).filter_by(run_id=self.run_id).delete()
            db.query(AgentCheckpoint).filter_by(run_id=self.run_id).delete()
            db.commit()

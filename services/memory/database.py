import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any


class DatabaseManager:
    """
    Gestor de persistência local SQLite do JARVIS AI HUB.
    Controla tabelas estruturadas, integridade referencial e migrações automáticas.
    """

    def __init__(self, db_path: str = "data/jarvis.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA busy_timeout = 5000;")
        conn.execute("PRAGMA cache_size = -64000;")
        conn.execute("PRAGMA mmap_size = 268435456;")
        conn.execute("PRAGMA temp_store = MEMORY;")
        return conn

    def _init_schema(self) -> None:
        with self._get_connection() as conn:
            conn.executescript("""
            CREATE TABLE IF NOT EXISTS user_settings (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS inference_cache (
                prompt_hash TEXT PRIMARY KEY,
                prompt TEXT NOT NULL,
                model_name TEXT NOT NULL,
                response_text TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                hit_count INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                root_path TEXT NOT NULL,
                mode TEXT NOT NULL DEFAULT 'read_only',
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS tasks (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                project_id TEXT,
                prompt TEXT NOT NULL,
                intent TEXT,
                state_json TEXT NOT NULL,
                is_completed INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                project_id TEXT,
                role TEXT NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                tool_calls_json TEXT,
                tool_call_id TEXT,
                tool_name TEXT,
                created_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS approvals (
                id TEXT PRIMARY KEY,
                task_id TEXT NOT NULL,
                agent_role TEXT NOT NULL,
                operation TEXT NOT NULL,
                impact_summary TEXT NOT NULL,
                affected_resources_json TEXT NOT NULL,
                proposed_diff TEXT,
                status TEXT NOT NULL DEFAULT 'pending',
                decided_by TEXT,
                decision_reason TEXT,
                requested_at TIMESTAMP NOT NULL,
                decided_at TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS project_memory (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                sources_json TEXT NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE(project_id, category, key),
                FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS agent_memories (
                id TEXT PRIMARY KEY,
                agent_role TEXT NOT NULL,
                category TEXT NOT NULL,
                key TEXT NOT NULL,
                content TEXT NOT NULL,
                context TEXT,
                importance INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL,
                UNIQUE(agent_role, category, key)
            );
            CREATE INDEX IF NOT EXISTS idx_agent_memories_role ON agent_memories(agent_role);
            CREATE INDEX IF NOT EXISTS idx_tasks_session ON tasks(session_id);
            CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
            CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, id);
            CREATE INDEX IF NOT EXISTS idx_approvals_task ON approvals(task_id);
            CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
            CREATE INDEX IF NOT EXISTS idx_project_memory_proj ON project_memory(project_id);

            CREATE TABLE IF NOT EXISTS agent_configs (
                role TEXT PRIMARY KEY,
                system_prompt TEXT,
                preferred_model TEXT,
                allowed_tools_json TEXT,
                is_read_only INTEGER DEFAULT 1,
                assigned_key_id TEXT,
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS user_skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                version TEXT NOT NULL DEFAULT '1.0.0',
                origin TEXT NOT NULL DEFAULT 'user_created',
                domain TEXT NOT NULL,
                description TEXT NOT NULL,
                instructions TEXT NOT NULL,
                assigned_agents_json TEXT NOT NULL,
                is_approved INTEGER NOT NULL DEFAULT 1,
                created_at TIMESTAMP NOT NULL,
                updated_at TIMESTAMP NOT NULL
            );

            CREATE TABLE IF NOT EXISTS knowledge_vault (
                id TEXT PRIMARY KEY,
                doc_name TEXT NOT NULL,
                file_type TEXT NOT NULL,
                category TEXT NOT NULL DEFAULT 'geral',
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL,
                file_size_formatted TEXT,
                source_path TEXT,
                created_at TIMESTAMP NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_kv_doc ON knowledge_vault(doc_name);
            CREATE INDEX IF NOT EXISTS idx_kv_cat ON knowledge_vault(category);

            CREATE TABLE IF NOT EXISTS mobile_devices (
                device_id TEXT PRIMARY KEY,
                device_name TEXT NOT NULL,
                token_hash TEXT NOT NULL UNIQUE,
                scopes_json TEXT NOT NULL,
                is_revoked INTEGER NOT NULL DEFAULT 0,
                paired_at TIMESTAMP NOT NULL,
                last_seen_at TIMESTAMP NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_devices_hash ON mobile_devices(token_hash);
            CREATE INDEX IF NOT EXISTS idx_devices_revoked ON mobile_devices(is_revoked);

            CREATE TABLE IF NOT EXISTS user_sessions (
                session_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                role TEXT NOT NULL,
                scopes_json TEXT NOT NULL,
                created_at TIMESTAMP NOT NULL,
                expires_at TIMESTAMP NOT NULL,
                last_seen_at TIMESTAMP NOT NULL,
                is_revoked INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_sessions_user ON user_sessions(user_id);
            CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
            CREATE INDEX IF NOT EXISTS idx_sessions_revoked ON user_sessions(is_revoked);

            CREATE TABLE IF NOT EXISTS audit_events (
                id TEXT PRIMARY KEY,
                timestamp TIMESTAMP NOT NULL,
                severity TEXT NOT NULL,
                user_id TEXT,
                agent_role TEXT,
                project_id TEXT,
                operation TEXT NOT NULL,
                tool_name TEXT,
                parameters_redacted_json TEXT,
                status TEXT NOT NULL,
                reason TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_events(timestamp DESC);
            CREATE INDEX IF NOT EXISTS idx_audit_operation ON audit_events(operation);


            -- Semeia modelos de alta velocidade para CPU (3B) por padrão
            INSERT OR IGNORE INTO agent_configs (role, preferred_model, updated_at) VALUES
            ('jarvis_master', 'llama3.2:3b', datetime('now')),
            ('software_architect', 'llama3.2:3b', datetime('now')),
            ('project_manager', 'llama3.2:3b', datetime('now')),
            ('general_assistant', 'llama3.2:3b', datetime('now')),
            ('code_explanation', 'llama3.2:3b', datetime('now')),
            ('requirements_analyst', 'llama3.2:3b', datetime('now'));
            """)
            try:
                conn.execute("ALTER TABLE approvals ADD COLUMN reversible INTEGER DEFAULT 1;")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE agent_configs ADD COLUMN is_read_only INTEGER DEFAULT 1;")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE agent_configs ADD COLUMN assigned_key_id TEXT;")
            except Exception:
                pass
            self._apply_migrations(conn)

    @staticmethod
    def _apply_migrations(conn: sqlite3.Connection) -> None:
        """Aplica migrações sequenciais, mantendo registos legados sem proprietário."""
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at TEXT NOT NULL
            )
            """
        )

        version_one = conn.execute(
            "SELECT 1 FROM schema_migrations WHERE version = 1"
        ).fetchone()
        if not version_one:
            private_tables = (
                "projects", "tasks", "chat_messages", "approvals",
                "project_memory", "agent_memories", "user_skills", "knowledge_vault",
            )
            conn.execute("SAVEPOINT account_ownership_migration")
            try:
                for table in private_tables:
                    columns = {
                        row["name"]
                        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
                    }
                    if "owner_user_id" not in columns:
                        conn.execute(f"ALTER TABLE {table} ADD COLUMN owner_user_id TEXT")
                    conn.execute(
                        f"CREATE INDEX IF NOT EXISTS idx_{table}_owner_user "
                        f"ON {table}(owner_user_id)"
                    )
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, name, applied_at)
                    VALUES (1, 'account_ownership_columns', ?)
                    """,
                    (datetime.now(UTC).isoformat(),),
                )
                conn.execute("RELEASE SAVEPOINT account_ownership_migration")
            except Exception:
                conn.execute("ROLLBACK TO SAVEPOINT account_ownership_migration")
                conn.execute("RELEASE SAVEPOINT account_ownership_migration")
                raise

        version_two = conn.execute(
            "SELECT 1 FROM schema_migrations WHERE version = 2"
        ).fetchone()
        if not version_two:
            # A antiga UNIQUE(agent_role, category, key) misturava todas as contas.
            # Reconstruímos a tabela para permitir a mesma chave em contas distintas,
            # mantendo uma regra de unicidade separada para dados legados sem dono.
            conn.execute("SAVEPOINT agent_memory_owner_migration")
            try:
                conn.execute(
                    """
                    CREATE TABLE agent_memories_new (
                        id TEXT PRIMARY KEY,
                        agent_role TEXT NOT NULL,
                        category TEXT NOT NULL,
                        key TEXT NOT NULL,
                        content TEXT NOT NULL,
                        context TEXT,
                        importance INTEGER NOT NULL DEFAULT 1,
                        created_at TIMESTAMP NOT NULL,
                        updated_at TIMESTAMP NOT NULL,
                        owner_user_id TEXT
                    )
                    """
                )
                conn.execute(
                    """
                    INSERT INTO agent_memories_new (
                        id, agent_role, category, key, content, context,
                        importance, created_at, updated_at, owner_user_id
                    )
                    SELECT id, agent_role, category, key, content, context,
                           importance, created_at, updated_at, owner_user_id
                    FROM agent_memories
                    """
                )
                conn.execute("DROP TABLE agent_memories")
                conn.execute(
                    "ALTER TABLE agent_memories_new RENAME TO agent_memories"
                )
                conn.execute(
                    "CREATE INDEX idx_agent_memories_role ON agent_memories(agent_role)"
                )
                conn.execute(
                    "CREATE INDEX idx_agent_memories_owner_user "
                    "ON agent_memories(owner_user_id)"
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX uq_agent_memories_legacy
                    ON agent_memories(agent_role, category, key)
                    WHERE owner_user_id IS NULL
                    """
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX uq_agent_memories_owner
                    ON agent_memories(owner_user_id, agent_role, category, key)
                    WHERE owner_user_id IS NOT NULL
                    """
                )
                conn.execute(
                    """
                    INSERT INTO schema_migrations (version, name, applied_at)
                    VALUES (2, 'agent_memory_owner_scoped_uniqueness', ?)
                    """,
                    (datetime.now(UTC).isoformat(),),
                )
                conn.execute("RELEASE SAVEPOINT agent_memory_owner_migration")
            except Exception:
                conn.execute("ROLLBACK TO SAVEPOINT agent_memory_owner_migration")
                conn.execute("RELEASE SAVEPOINT agent_memory_owner_migration")
                raise

    def register_project(
        self, project_id: str, name: str, root_path: str, mode: str = "read_only",
        owner_user_id: str | None = None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            if owner_user_id is not None:
                existing = conn.execute(
                    "SELECT owner_user_id FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                if existing and existing["owner_user_id"] != owner_user_id:
                    raise PermissionError("Projeto pertence a outra conta ou é um registo legado sem proprietário.")
            conn.execute(
                """
                INSERT INTO projects (id, name, root_path, mode, created_at, updated_at, owner_user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name=excluded.name,
                    root_path=excluded.root_path,
                    mode=excluded.mode,
                    updated_at=excluded.updated_at
                WHERE projects.owner_user_id IS excluded.owner_user_id
                """,
                (project_id, name, root_path, mode, now, now, owner_user_id),
            )

    def save_task(
        self,
        task_id: str,
        session_id: str,
        prompt: str,
        state_dict: dict[str, Any],
        project_id: str | None = None,
        owner_user_id: str | None = None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        state_json = json.dumps(state_dict, default=str)
        intent = state_dict.get("classified_intent")
        is_completed = 1 if state_dict.get("is_completed") else 0

        with self._get_connection() as conn:
            if owner_user_id is not None:
                existing = conn.execute(
                    "SELECT owner_user_id FROM tasks WHERE id = ?", (task_id,)
                ).fetchone()
                if existing and existing["owner_user_id"] != owner_user_id:
                    raise PermissionError("Tarefa pertence a outra conta ou é um registo legado sem proprietário.")
                if project_id:
                    project = conn.execute(
                        "SELECT owner_user_id FROM projects WHERE id = ?", (project_id,)
                    ).fetchone()
                    if not project or project["owner_user_id"] != owner_user_id:
                        raise PermissionError("Projeto inexistente ou não pertence à conta autenticada.")
            conn.execute(
                """
                INSERT INTO tasks (
                    id, session_id, project_id, prompt, intent, state_json,
                    is_completed, created_at, updated_at, owner_user_id
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    prompt=excluded.prompt,
                    intent=excluded.intent,
                    state_json=excluded.state_json,
                    is_completed=excluded.is_completed,
                    updated_at=excluded.updated_at
                WHERE tasks.owner_user_id IS excluded.owner_user_id
                """,
                (
                    task_id, session_id, project_id, prompt, intent, state_json,
                    is_completed, now, now, owner_user_id,
                ),
            )

    @staticmethod
    def _decode_task_row(row: sqlite3.Row) -> dict[str, Any]:
        data = dict(row)
        data["state"] = json.loads(data["state_json"])
        return data

    def get_task(
        self, task_id: str, owner_user_id: str | None = None
    ) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            if owner_user_id is None:
                row = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,)).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM tasks WHERE id = ? AND owner_user_id = ?",
                    (task_id, owner_user_id),
                ).fetchone()
            return self._decode_task_row(row) if row else None

    def list_tasks(
        self, limit: int = 50, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            query = "SELECT id, session_id, project_id, prompt, intent, is_completed, created_at FROM tasks"
            params: list[Any] = []
            if owner_user_id is not None:
                query += " WHERE owner_user_id = ?"
                params.append(owner_user_id)
            query += " ORDER BY created_at DESC LIMIT ?"
            params.append(max(1, min(limit, 500)))
            return [dict(r) for r in conn.execute(query, params).fetchall()]

    def list_chat_sessions(
        self, limit: int = 50, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = """
            SELECT session_id, MIN(prompt) as first_prompt, COUNT(*) as task_count,
                   MAX(created_at) as last_activity, MIN(intent) as first_intent
            FROM tasks
            WHERE session_id IS NOT NULL AND session_id != ''
        """
        params: list[Any] = []
        if owner_user_id is not None:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += " GROUP BY session_id ORDER BY last_activity DESC LIMIT ?"
        params.append(max(1, min(limit, 500)))
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            result = []
            for row in rows:
                data = dict(row)
                prompt = data.get("first_prompt") or "Conversa sem título"
                data["title"] = (prompt[:55] + "...") if len(prompt) > 55 else prompt
                result.append(data)
            return result

    def get_session_tasks(
        self, session_id: str, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM tasks WHERE session_id = ?"
        params: list[Any] = [session_id]
        if owner_user_id is not None:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += " ORDER BY created_at ASC"
        with self._get_connection() as conn:
            return [self._decode_task_row(r) for r in conn.execute(query, params).fetchall()]

    def delete_session(
        self, session_id: str, owner_user_id: str | None = None
    ) -> int:
        with self._get_connection() as conn:
            if owner_user_id is None:
                conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
                cur = conn.execute("DELETE FROM tasks WHERE session_id = ?", (session_id,))
                return cur.rowcount
            conn.execute(
                "DELETE FROM chat_messages WHERE session_id = ? AND owner_user_id = ?",
                (session_id, owner_user_id),
            )
            cur = conn.execute(
                "DELETE FROM tasks WHERE session_id = ? AND owner_user_id = ?",
                (session_id, owner_user_id),
            )
            return cur.rowcount

    # --- Mensagens individuais do agente de código (histórico fiel) ---

    def add_chat_message(
        self, session_id: str, role: str, content: str = "",
        project_id: str | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None, tool_name: str | None = None,
        owner_user_id: str | None = None,
    ) -> int:
        """Persiste mensagem vinculada à conta quando owner_user_id é fornecido."""
        now = datetime.now(UTC).isoformat()
        tool_calls_json = json.dumps(tool_calls, default=str) if tool_calls else None
        with self._get_connection() as conn:
            if owner_user_id is not None and project_id:
                project = conn.execute(
                    "SELECT owner_user_id FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                if not project or project["owner_user_id"] != owner_user_id:
                    raise PermissionError("Projeto inexistente ou não pertence à conta autenticada.")
            cur = conn.execute(
                """
                INSERT INTO chat_messages (
                    session_id, project_id, role, content, tool_calls_json,
                    tool_call_id, tool_name, created_at, owner_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (session_id, project_id, role, content, tool_calls_json,
                 tool_call_id, tool_name, now, owner_user_id),
            )
            return int(cur.lastrowid or 0)

    def list_chat_messages(
        self, session_id: str, limit: int = 200, ascending: bool = True,
        owner_user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Recupera mensagens somente da conta solicitante quando informada."""
        limit = max(1, min(limit, 1000))
        order = "ASC" if ascending else "DESC"
        query = f"""
            SELECT id, session_id, project_id, role, content, tool_calls_json,
                   tool_call_id, tool_name, created_at
            FROM chat_messages WHERE session_id = ?
        """
        params: list[Any] = [session_id]
        if owner_user_id is not None:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += f" ORDER BY id {order} LIMIT ?"
        params.append(limit)
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        result = []
        for row in rows:
            data = dict(row)
            raw_calls = data.pop("tool_calls_json", None)
            try:
                data["tool_calls"] = json.loads(raw_calls) if raw_calls else []
            except Exception:
                data["tool_calls"] = []
            result.append(data)
        return result

    def clear_session_messages(
        self, session_id: str, owner_user_id: str | None = None
    ) -> int:
        with self._get_connection() as conn:
            if owner_user_id is None:
                cur = conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
            else:
                cur = conn.execute(
                    "DELETE FROM chat_messages WHERE session_id = ? AND owner_user_id = ?",
                    (session_id, owner_user_id),
                )
            return cur.rowcount

    def search_chat_history(
        self, query: str, limit: int = 20, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Busca histórico de texto limitado à conta autenticada."""
        if not query or not query.strip():
            return []
        term = f"%{query.strip().lower()}%"
        sql = """
            SELECT id, session_id, prompt, intent, project_id, created_at, state_json
            FROM tasks
            WHERE (lower(prompt) LIKE ? OR lower(state_json) LIKE ?)
        """
        params: list[Any] = [term, term]
        if owner_user_id is not None:
            sql += " AND owner_user_id = ?"
            params.append(owner_user_id)
        sql += " ORDER BY created_at DESC LIMIT ?"
        params.append(max(1, min(limit, 500)))
        with self._get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
        results = []
        for row in rows:
            data = dict(row)
            try:
                state = json.loads(data.pop("state_json"))
                data["final_summary"] = state.get("final_summary", "")
                data["agents"] = state.get("selected_agents", [])
            except Exception:
                data["final_summary"] = ""
                data["agents"] = []
            results.append(data)
        return results

    def export_session_markdown(
        self, session_id: str, owner_user_id: str | None = None
    ) -> str:
        """Exporta somente tarefas pertencentes à conta solicitante."""
        tasks = self.get_session_tasks(session_id, owner_user_id=owner_user_id)
        if not tasks:
            return f"# Sessão {session_id}\n\nNenhuma interação encontrada para esta sessão."

        lines = [
            f"# 📜 Histórico de Sessão JARVIS AI Hub",
            f"**Sessão ID:** `{session_id}`  ",
            f"**Total de Interações:** {len(tasks)}  ",
            f"**Exportado em:** {datetime.now(UTC).strftime('%d/%m/%Y %H:%M:%S UTC')}\n",
            "---",
            "",
        ]

        for idx, t in enumerate(tasks, start=1):
            prompt = t.get("prompt", "")
            created = t.get("created_at", "")
            state = t.get("state", {})
            summary = state.get("final_summary", "")
            intent = t.get("intent", "interação")
            agents = state.get("selected_agents", [])

            lines.append(f"## 👤 Interação #{idx} • {created[:19].replace('T', ' ')}")
            lines.append(f"**Intenção:** `{intent}` | **Especialistas:** `{', '.join(agents) or 'JARVIS Master'}`\n")
            lines.append("### 💬 Solicitação do Usuário:")
            lines.append(f"> {prompt}\n")

            if summary:
                lines.append("### 🤖 Resposta & Resolução do JARVIS:")
                lines.append(f"{summary}\n")

            agent_outputs = state.get("agent_outputs", [])
            if agent_outputs:
                lines.append("#### 📋 Ações e Evidências Técnicas:")
                for ao in agent_outputs:
                    role = ao.get("agent_role", "agente")
                    evs = ao.get("evidence", [])
                    aff = ao.get("affected_files", [])
                    if evs:
                        lines.append(f"- **{role}**: {'; '.join(evs)}")
                    if aff:
                        lines.append(f"  - *Arquivos afetados*: {', '.join(aff)}")
                lines.append("")

            lines.append("---\n")

        return "\n".join(lines)

    def purge_old_tasks(
        self, days_retention: int = 30, owner_user_id: str | None = None
    ) -> int:
        cutoff = (datetime.now(UTC) - timedelta(days=days_retention)).isoformat()
        with self._get_connection() as conn:
            if owner_user_id is None:
                cur = conn.execute("DELETE FROM tasks WHERE created_at < ?", (cutoff,))
            else:
                cur = conn.execute(
                    "DELETE FROM tasks WHERE created_at < ? AND owner_user_id = ?",
                    (cutoff, owner_user_id),
                )
            return cur.rowcount

    def delete_task(
        self, task_id: str, owner_user_id: str | None = None
    ) -> bool:
        with self._get_connection() as conn:
            if owner_user_id is None:
                cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            else:
                cur = conn.execute(
                    "DELETE FROM tasks WHERE id = ? AND owner_user_id = ?",
                    (task_id, owner_user_id),
                )
            return cur.rowcount > 0

    def export_project_data(
        self, project_id: str, owner_user_id: str | None = None
    ) -> dict[str, Any]:
        with self._get_connection() as conn:
            if owner_user_id is None:
                proj = conn.execute(
                    "SELECT * FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                owner_filter = ""
                params: tuple[Any, ...] = (project_id,)
            else:
                proj = conn.execute(
                    "SELECT * FROM projects WHERE id = ? AND owner_user_id = ?",
                    (project_id, owner_user_id),
                ).fetchone()
                owner_filter = " AND owner_user_id = ?"
                params = (project_id, owner_user_id)
            if not proj:
                raise ValueError(f"Projeto '{project_id}' não encontrado.")
            tasks = conn.execute(
                "SELECT id, session_id, prompt, intent, is_completed, created_at "
                "FROM tasks WHERE project_id = ?" + owner_filter,
                params,
            ).fetchall()
            memory = conn.execute(
                "SELECT category, key, content, sources_json, updated_at "
                "FROM project_memory WHERE project_id = ?" + owner_filter,
                params,
            ).fetchall()
            return {
                "project": dict(proj),
                "tasks": [dict(t) for t in tasks],
                "memory": [dict(m) for m in memory],
                "exported_at": datetime.now(UTC).isoformat(),
            }

    def set_project_memory(
        self,
        project_id: str,
        category: str,
        key: str,
        content: str,
        sources: list[str] | None = None,
        owner_user_id: str | None = None,
    ) -> None:
        import uuid
        now = datetime.now(UTC).isoformat()
        mem_id = f"mem-{uuid.uuid4().hex[:8]}"
        sources_json = json.dumps(sources or [])
        with self._get_connection() as conn:
            if owner_user_id is None:
                project = conn.execute(
                    "SELECT owner_user_id FROM projects WHERE id = ?", (project_id,)
                ).fetchone()
                if project is None:
                    conn.execute(
                        """
                        INSERT INTO projects (
                            id, name, root_path, mode, created_at, updated_at, owner_user_id
                        ) VALUES (?, ?, ?, 'read_only', ?, ?, NULL)
                        """,
                        (project_id, project_id, f"workspace/{project_id}", now, now),
                    )
                    project = {"owner_user_id": None}
                elif project["owner_user_id"] is not None:
                    raise PermissionError("É necessário informar o proprietário do projeto.")
            else:
                project = conn.execute(
                    "SELECT owner_user_id FROM projects WHERE id = ? AND owner_user_id = ?",
                    (project_id, owner_user_id),
                ).fetchone()
            if not project:
                raise ValueError("Projeto não encontrado para a conta autenticada.")
            conn.execute(
                """
                INSERT INTO project_memory (
                    id, project_id, category, key, content, sources_json,
                    updated_at, owner_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, category, key) DO UPDATE SET
                    content=excluded.content,
                    sources_json=excluded.sources_json,
                    updated_at=excluded.updated_at
                WHERE project_memory.owner_user_id IS excluded.owner_user_id
                """,
                (mem_id, project_id, category, key, content, sources_json, now, owner_user_id),
            )

    def list_project_memory(
        self, project_id: str, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = (
            "SELECT id, project_id, category, key, content, sources_json, updated_at "
            "FROM project_memory WHERE project_id = ?"
        )
        params: list[Any] = [project_id]
        if owner_user_id is not None:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += " ORDER BY updated_at DESC"
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        result = []
        for row in rows:
            data = dict(row)
            data["sources"] = json.loads(data["sources_json"])
            result.append(data)
        return result

    def set_agent_memory(
        self,
        agent_role: str,
        category: str,
        key: str,
        content: str,
        context: str | None = None,
        importance: int = 1,
        owner_user_id: str | None = None,
    ) -> str:
        """Guarda memória do agente no espaço privado da conta ou no legado."""
        import uuid
        now = datetime.now(UTC).isoformat()
        mem_id = f"amem-{uuid.uuid4().hex[:8]}"
        clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
        values = (
            mem_id, clean_role, category.lower(), key.strip(), content.strip(),
            context, max(1, min(5, importance)), now, now, owner_user_id,
        )
        with self._get_connection() as conn:
            if owner_user_id is None:
                conn.execute(
                    """
                    INSERT INTO agent_memories (
                        id, agent_role, category, key, content, context,
                        importance, created_at, updated_at, owner_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                    ON CONFLICT(agent_role, category, key) WHERE owner_user_id IS NULL
                    DO UPDATE SET
                        content=excluded.content,
                        context=coalesce(excluded.context, agent_memories.context),
                        importance=excluded.importance,
                        updated_at=excluded.updated_at
                    """,
                    values[:9],
                )
            else:
                conn.execute(
                    """
                    INSERT INTO agent_memories (
                        id, agent_role, category, key, content, context,
                        importance, created_at, updated_at, owner_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(owner_user_id, agent_role, category, key)
                    WHERE owner_user_id IS NOT NULL
                    DO UPDATE SET
                        content=excluded.content,
                        context=coalesce(excluded.context, agent_memories.context),
                        importance=excluded.importance,
                        updated_at=excluded.updated_at
                    """,
                    values,
                )
        return mem_id

    def list_agent_memories(
        self,
        agent_role: str | None = None,
        category: str | None = None,
        limit: int = 20,
        owner_user_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Lista memórias apenas do proprietário informado."""
        query = "SELECT id, agent_role, category, key, content, context, importance, created_at, updated_at FROM agent_memories WHERE owner_user_id IS ?"
        params: list[Any] = [owner_user_id]
        if agent_role:
            clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
            query += " AND agent_role = ?"
            params.append(clean_role)
        if category:
            query += " AND category = ?"
            params.append(category.lower())
        query += " ORDER BY importance DESC, updated_at DESC LIMIT ?"
        params.append(max(1, min(limit, 500)))
        with self._get_connection() as conn:
            return [dict(row) for row in conn.execute(query, params).fetchall()]

    def delete_agent_memory(
        self, memory_id: str, owner_user_id: str | None = None
    ) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM agent_memories WHERE id = ? AND owner_user_id IS ?",
                (memory_id, owner_user_id),
            )
            return cur.rowcount > 0

    def clear_agent_memories(
        self, agent_role: str, owner_user_id: str | None = None
    ) -> int:
        clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM agent_memories WHERE agent_role = ? AND owner_user_id IS ?",
                (clean_role, owner_user_id),
            )
            return cur.rowcount

    def set_agent_config(
        self,
        role: str,
        system_prompt: str | None = None,
        preferred_model: str | None = None,
        allowed_tools: list[str] | None = None,
        is_read_only: bool | None = None,
        assigned_key_id: str | None = None,
    ) -> None:
        """Persiste customizações de prompt, modelo, chaves e ferramentas para um especialista."""
        clean_role = role.value if hasattr(role, "value") else str(role)
        now = datetime.now(UTC).isoformat()
        tools_json = json.dumps(allowed_tools) if allowed_tools is not None else None

        with self._get_connection() as conn:
            existing = conn.execute("SELECT system_prompt, preferred_model, allowed_tools_json, is_read_only, assigned_key_id FROM agent_configs WHERE role = ?", (clean_role,)).fetchone()
            ro_val = (1 if is_read_only else 0) if is_read_only is not None else (existing["is_read_only"] if existing and "is_read_only" in existing.keys() else 1)
            cur_key = assigned_key_id if assigned_key_id is not None else (existing["assigned_key_id"] if existing and "assigned_key_id" in existing.keys() else None)
            if existing:
                cur_prompt = system_prompt if system_prompt is not None else existing["system_prompt"]
                cur_model = preferred_model if preferred_model is not None else existing["preferred_model"]
                cur_tools = tools_json if tools_json is not None else existing["allowed_tools_json"]
                conn.execute(
                    """
                    UPDATE agent_configs
                    SET system_prompt = ?, preferred_model = ?, allowed_tools_json = ?, is_read_only = ?, assigned_key_id = ?, updated_at = ?
                    WHERE role = ?
                    """,
                    (cur_prompt, cur_model, cur_tools, ro_val, cur_key, now, clean_role),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO agent_configs (role, system_prompt, preferred_model, allowed_tools_json, is_read_only, assigned_key_id, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (clean_role, system_prompt, preferred_model, tools_json, ro_val, cur_key, now),
                )

    def get_agent_configs(self) -> dict[str, dict[str, Any]]:
        """Recupera todas as customizações salvas de especialistas."""
        with self._get_connection() as conn:
            cur = conn.execute("SELECT role, system_prompt, preferred_model, allowed_tools_json, is_read_only, assigned_key_id, updated_at FROM agent_configs")
            configs: dict[str, dict[str, Any]] = {}
            for row in cur.fetchall():
                r_dict = dict(row)
                if "is_read_only" in r_dict and r_dict["is_read_only"] is not None:
                    r_dict["is_read_only"] = bool(r_dict["is_read_only"])
                if r_dict.get("allowed_tools_json"):
                    try:
                        r_dict["allowed_tools"] = json.loads(r_dict["allowed_tools_json"])
                    except Exception:
                        r_dict["allowed_tools"] = []
                configs[r_dict["role"]] = r_dict
            return configs

    def get_user_profile(self) -> dict[str, Any]:
        """Recupera dados de perfil do desenvolvedor persistidos no SQLite."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT value_json FROM user_settings WHERE key = 'developer_profile'").fetchone()
            if row:
                try:
                    return json.loads(row["value_json"])
                except Exception:
                    pass
        return {
            "displayName": "Desenvolvedor",
            "avatarIcon": "💻",
            "developerRole": "fullstack",
            "seniorityLevel": "senior",
            "responseStyle": "concise",
            "customInstructions": "",
            "huggingfaceToken": "",
            "groqApiKey": "",
            "geminiApiKey": "",
        }

    def set_user_profile(self, profile: dict[str, Any]) -> None:
        """Salva configurações e preferências do desenvolvedor no banco SQLite."""
        now = datetime.now(UTC).isoformat()
        val_str = json.dumps(profile)
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_settings (key, value_json, updated_at)
                VALUES ('developer_profile', ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                (val_str, now),
            )

    def get_cached_inference(self, prompt_hash: str) -> str | None:
        """Busca resposta em cache local para evitar inferência repetida na CPU."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT response_text FROM inference_cache WHERE prompt_hash = ?", (prompt_hash,)).fetchone()
            if row:
                conn.execute("UPDATE inference_cache SET hit_count = hit_count + 1 WHERE prompt_hash = ?", (prompt_hash,))
                return row["response_text"]
        return None

    def set_cached_inference(self, prompt_hash: str, prompt: str, model_name: str, response: str) -> None:
        """Armazena resposta no cache local SQLite."""
        now = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO inference_cache (prompt_hash, prompt, model_name, response_text, created_at, hit_count)
                VALUES (?, ?, ?, ?, ?, 1)
                """,
                (prompt_hash, prompt[:500], model_name, response, now),
            )

    def create_database_backup(self, backup_dir: Path | str = "backups") -> str:
        """Cria uma cópia física segura de backup do banco de dados SQLite."""
        b_dir = Path(backup_dir)
        b_dir.mkdir(parents=True, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_file = b_dir / f"jarvis_backup_{timestamp}.db"

        with self._get_connection() as src_conn:
            with sqlite3.connect(str(backup_file)) as dst_conn:
                src_conn.backup(dst_conn)

        return str(backup_file.resolve())

    # --- Métodos de Configuração do Modo Ponytail ---

    def get_ponytail_level(self) -> str:
        """Retorna o nível ativo do Modo Ponytail ('off', 'lite', 'senior', 'ultra')."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT value_json FROM user_settings WHERE key = 'ponytail_level'").fetchone()
            if row:
                try:
                    return json.loads(row["value_json"])
                except Exception:
                    return str(row["value_json"])
        return "senior"  # Padrão: Senior YAGNI

    def set_ponytail_level(self, level: str) -> None:
        """Salva a preferência de nível do Modo Ponytail."""
        now = datetime.now(UTC).isoformat()
        val_str = json.dumps(str(level).lower().strip())
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_settings (key, value_json, updated_at)
                VALUES ('ponytail_level', ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                (val_str, now),
            )

    def get_hardware_performance_config(self) -> dict[str, Any]:
        """Recupera as preferências de desempenho de hardware e threads do Ollama."""
        with self._get_connection() as conn:
            row = conn.execute("SELECT value_json FROM user_settings WHERE key = 'hardware_performance'").fetchone()
            if row:
                try:
                    return json.loads(row["value_json"])
                except Exception:
                    pass
        return {
            "mode": "auto",
            "cpu_threads": 6,
            "eco_model": "llama3.2:3b",
        }

    def set_hardware_performance_config(self, config: dict[str, Any]) -> None:
        """Salva as preferências de modo de desempenho e threads do Ollama no SQLite."""
        now = datetime.now(UTC).isoformat()
        val_str = json.dumps(config)
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_settings (key, value_json, updated_at)
                VALUES ('hardware_performance', ?, ?)
                ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
                """,
                (val_str, now),
            )

    # --- Métodos de Gerenciamento de Skills ECC Customizadas ---

    def save_user_skill(self, skill: dict[str, Any]) -> dict[str, Any]:
        """Salva ou atualiza uma skill personalizada do ECC no SQLite."""
        now = datetime.now(UTC).isoformat()
        agents_json = json.dumps(skill.get("assigned_agents", ["jarvis_master"]))
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_skills (
                    id, name, version, origin, domain, description, instructions,
                    assigned_agents_json, is_approved, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    version = excluded.version,
                    origin = excluded.origin,
                    domain = excluded.domain,
                    description = excluded.description,
                    instructions = excluded.instructions,
                    assigned_agents_json = excluded.assigned_agents_json,
                    is_approved = excluded.is_approved,
                    updated_at = excluded.updated_at
                """,
                (
                    skill["id"],
                    skill["name"],
                    skill.get("version", "1.0.0"),
                    skill.get("origin", "user_created"),
                    skill.get("domain", "backend"),
                    skill.get("description", ""),
                    skill["instructions"],
                    agents_json,
                    1 if skill.get("is_approved", True) else 0,
                    now,
                    now,
                ),
            )
        return skill

    def list_user_skills(self) -> list[dict[str, Any]]:
        """Retorna todas as skills adicionadas pelo usuário."""
        with self._get_connection() as conn:
            rows = conn.execute("SELECT * FROM user_skills ORDER BY created_at DESC").fetchall()
            skills = []
            for r in rows:
                s = dict(r)
                try:
                    s["assigned_agents"] = json.loads(s.get("assigned_agents_json") or "[]")
                except Exception:
                    s["assigned_agents"] = ["jarvis_master"]
                s["is_approved"] = bool(s.get("is_approved", 1))
                skills.append(s)
            return skills

    def delete_user_skill(self, skill_id: str) -> bool:
        """Remove uma skill customizada do banco de dados."""
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM user_skills WHERE id = ?", (skill_id,))
            return cur.rowcount > 0

    # --- Métodos da Base de Conhecimento RAG Local (Knowledge Vault) ---

    def insert_knowledge_chunks(
        self,
        doc_name: str,
        file_type: str,
        category: str,
        chunks: list[str],
        file_size_formatted: str = "",
        source_path: str = "",
        owner_user_id: str | None = None,
    ) -> int:
        """Substitui chunks apenas do mesmo documento e proprietário."""
        now = datetime.now(UTC).isoformat()
        inserted_count = 0
        owner_key = owner_user_id or "legacy"
        doc_hash = hashlib.sha256(owner_key.encode("utf-8")).hexdigest()[:10]
        with self._get_connection() as conn:
            if owner_user_id is None:
                conn.execute(
                    "DELETE FROM knowledge_vault WHERE doc_name = ? AND owner_user_id IS NULL",
                    (doc_name,),
                )
            else:
                conn.execute(
                    "DELETE FROM knowledge_vault WHERE doc_name = ? AND owner_user_id = ?",
                    (doc_name, owner_user_id),
                )
            for idx, chunk in enumerate(chunks):
                chunk_id = f"{doc_hash}_{doc_name}_{idx}_{now[:10]}"
                conn.execute(
                    """
                    INSERT INTO knowledge_vault (
                        id, doc_name, file_type, category, chunk_index,
                        content, file_size_formatted, source_path, created_at, owner_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id, doc_name, file_type, category, idx, chunk.strip(),
                        file_size_formatted, source_path, now, owner_user_id,
                    ),
                )
                inserted_count += 1
        return inserted_count

    def list_knowledge_documents(
        self, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Lista somente documentos do proprietário informado."""
        with self._get_connection() as conn:
            rows = conn.execute(
                """
                SELECT doc_name, file_type, category, file_size_formatted, source_path,
                       count(*) as total_chunks, max(created_at) as created_at
                FROM knowledge_vault
                WHERE owner_user_id IS ?
                GROUP BY doc_name, file_type, category, file_size_formatted, source_path
                ORDER BY created_at DESC
                """,
                (owner_user_id,),
            ).fetchall()
            return [dict(row) for row in rows]

    def delete_knowledge_document(
        self, doc_name: str, owner_user_id: str | None = None
    ) -> bool:
        """Exclui chunks somente do documento pertencente à conta."""
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM knowledge_vault WHERE doc_name = ? AND owner_user_id IS ?",
                (doc_name, owner_user_id),
            )
            return cur.rowcount > 0

    def search_knowledge_vault(
        self, query: str, limit: int = 4, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        """Busca textual restrita ao proprietário informado."""
        if not query or not query.strip():
            return []
        keywords = [word.lower().strip() for word in query.split() if len(word) > 2]
        if not keywords:
            keywords = [query.lower().strip()]
        conditions = " OR ".join(["lower(content) LIKE ?" for _ in keywords])
        params: list[Any] = [f"%{word}%" for word in keywords]
        params.append(owner_user_id)
        params.append(max(1, min(limit, 100)))
        sql = f"""
            SELECT doc_name, category, chunk_index, content, source_path
            FROM knowledge_vault
            WHERE ({conditions}) AND owner_user_id IS ?
            LIMIT ?
        """
        with self._get_connection() as conn:
            rows = conn.execute(sql, params).fetchall()
            return [dict(row) for row in rows]

    # =========================================================================
    # SecurityCore Persistence Methods (Approvals, Devices, Sessions, Audit)
    # =========================================================================

    def save_approval(
        self,
        id: str,
        task_id: str,
        agent_role: str,
        operation: str,
        impact_summary: str,
        affected_resources: list[str] | None = None,
        proposed_diff: str | None = None,
        reversible: bool = True,
        status: str = "pending",
        requested_at: str | datetime | None = None,
        decided_at: str | datetime | None = None,
        decided_by: str | None = None,
        decision_reason: str | None = None,
        owner_user_id: str | None = None,
    ) -> None:
        req_at = (
            requested_at.isoformat()
            if isinstance(requested_at, datetime)
            else (requested_at or datetime.now(UTC).isoformat())
        )
        dec_at = decided_at.isoformat() if isinstance(decided_at, datetime) else decided_at
        resources_json = json.dumps(affected_resources or [])
        rev_int = 1 if reversible else 0
        with self._get_connection() as conn:
            if owner_user_id is not None:
                task = conn.execute(
                    "SELECT owner_user_id FROM tasks WHERE id = ?", (task_id,)
                ).fetchone()
                # O grafo cria a aprovação antes de persistir o resultado da tarefa.
                # Se a tarefa já existir, a propriedade tem de coincidir; se ainda
                # não existir, o owner vem do principal autenticado no servidor.
                if task and task["owner_user_id"] != owner_user_id:
                    raise PermissionError("Tarefa pertence a outra conta ou é um registo legado.")
                existing = conn.execute(
                    "SELECT owner_user_id FROM approvals WHERE id = ?", (id,)
                ).fetchone()
                if existing and existing["owner_user_id"] != owner_user_id:
                    raise PermissionError("Aprovação pertence a outra conta.")
            conn.execute(
                """
                INSERT INTO approvals (
                    id, task_id, agent_role, operation, impact_summary,
                    affected_resources_json, proposed_diff, reversible, status,
                    requested_at, decided_at, decided_by, decision_reason, owner_user_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    task_id=excluded.task_id,
                    agent_role=excluded.agent_role,
                    operation=excluded.operation,
                    impact_summary=excluded.impact_summary,
                    affected_resources_json=excluded.affected_resources_json,
                    proposed_diff=excluded.proposed_diff,
                    reversible=excluded.reversible,
                    status=excluded.status,
                    decided_at=excluded.decided_at,
                    decided_by=excluded.decided_by,
                    decision_reason=excluded.decision_reason
                WHERE approvals.owner_user_id IS excluded.owner_user_id
                """,
                (
                    id, task_id, agent_role, operation, impact_summary, resources_json,
                    proposed_diff, rev_int, status, req_at, dec_at, decided_by,
                    decision_reason, owner_user_id,
                ),
            )

    def get_approval(
        self, approval_id: str, owner_user_id: str | None = None
    ) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            if owner_user_id is None:
                row = conn.execute(
                    "SELECT * FROM approvals WHERE id = ?", (approval_id,)
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM approvals WHERE id = ? AND owner_user_id = ?",
                    (approval_id, owner_user_id),
                ).fetchone()
        if not row:
            return None
        result = dict(row)
        try:
            result["affected_resources"] = json.loads(
                result.get("affected_resources_json") or "[]"
            )
        except Exception:
            result["affected_resources"] = []
        result["reversible"] = bool(result.get("reversible", 1))
        return result

    def list_approvals(
        self, status: str | None = None, owner_user_id: str | None = None
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM approvals WHERE 1=1"
        params: list[Any] = []
        if status:
            query += " AND status = ?"
            params.append(status)
        if owner_user_id is not None:
            query += " AND owner_user_id = ?"
            params.append(owner_user_id)
        query += " ORDER BY requested_at DESC"
        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
        result = []
        for row in rows:
            item = dict(row)
            try:
                item["affected_resources"] = json.loads(
                    item.get("affected_resources_json") or "[]"
                )
            except Exception:
                item["affected_resources"] = []
            item["reversible"] = bool(item.get("reversible", 1))
            result.append(item)
        return result

    def consume_approved_approval(
        self, approval_id: str, owner_user_id: str | None = None
    ) -> bool:
        """Consome atomicamente uma aprovação da conta solicitante."""
        with self._get_connection() as conn:
            if owner_user_id is None:
                cur = conn.execute(
                    "UPDATE approvals SET status = 'consumed' "
                    "WHERE id = ? AND status = 'approved'",
                    (approval_id,),
                )
            else:
                cur = conn.execute(
                    "UPDATE approvals SET status = 'consumed' "
                    "WHERE id = ? AND status = 'approved' AND owner_user_id = ?",
                    (approval_id, owner_user_id),
                )
            return cur.rowcount == 1

    def update_approval_decision(
        self,
        approval_id: str,
        status: str,
        decided_by: str,
        decision_reason: str | None = None,
        decided_at: str | datetime | None = None,
    ) -> bool:
        dec_at = (
            decided_at.isoformat()
            if isinstance(decided_at, datetime)
            else (decided_at or datetime.now(UTC).isoformat())
        )
        with self._get_connection() as conn:
            cur = conn.execute(
                """
                UPDATE approvals
                SET status = ?, decided_by = ?, decision_reason = ?, decided_at = ?
                WHERE id = ?
                """,
                (status, decided_by, decision_reason, dec_at, approval_id),
            )
            return cur.rowcount > 0

    def save_device(
        self,
        device_id: str,
        device_name: str,
        token_hash: str,
        scopes: list[str] | None = None,
        is_revoked: bool = False,
        paired_at: str | datetime | None = None,
        last_seen_at: str | datetime | None = None,
    ) -> None:
        p_at = (
            paired_at.isoformat()
            if isinstance(paired_at, datetime)
            else (paired_at or datetime.now(UTC).isoformat())
        )
        ls_at = (
            last_seen_at.isoformat()
            if isinstance(last_seen_at, datetime)
            else (last_seen_at or datetime.now(UTC).isoformat())
        )
        scopes_json = json.dumps(scopes or [])
        rev_int = 1 if is_revoked else 0
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO mobile_devices (
                    device_id, device_name, token_hash, scopes_json,
                    is_revoked, paired_at, last_seen_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(device_id) DO UPDATE SET
                    device_name=excluded.device_name,
                    token_hash=excluded.token_hash,
                    scopes_json=excluded.scopes_json,
                    is_revoked=excluded.is_revoked,
                    last_seen_at=excluded.last_seen_at
                """,
                (device_id, device_name, token_hash, scopes_json, rev_int, p_at, ls_at),
            )

    def get_device(self, device_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM mobile_devices WHERE device_id = ?", (device_id,))
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["scopes"] = json.loads(res.get("scopes_json") or "[]")
            except Exception:
                res["scopes"] = []
            res["is_revoked"] = bool(res.get("is_revoked", 0))
            return res

    def get_device_by_token_hash(self, token_hash: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM mobile_devices WHERE token_hash = ?", (token_hash,)
            )
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["scopes"] = json.loads(res.get("scopes_json") or "[]")
            except Exception:
                res["scopes"] = []
            res["is_revoked"] = bool(res.get("is_revoked", 0))
            return res

    def list_devices(self, include_revoked: bool = True) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            if include_revoked:
                cur = conn.execute("SELECT * FROM mobile_devices ORDER BY paired_at DESC")
            else:
                cur = conn.execute(
                    "SELECT * FROM mobile_devices WHERE is_revoked = 0 ORDER BY paired_at DESC"
                )
            rows = cur.fetchall()
            result = []
            for r in rows:
                item = dict(r)
                try:
                    item["scopes"] = json.loads(item.get("scopes_json") or "[]")
                except Exception:
                    item["scopes"] = []
                item["is_revoked"] = bool(item.get("is_revoked", 0))
                result.append(item)
            return result

    def revoke_device(self, device_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute(
                "UPDATE mobile_devices SET is_revoked = 1 WHERE device_id = ?",
                (device_id,),
            )
            return cur.rowcount > 0

    def update_device_last_seen(
        self, device_id: str, last_seen_at: str | datetime | None = None
    ) -> bool:
        ls_at = (
            last_seen_at.isoformat()
            if isinstance(last_seen_at, datetime)
            else (last_seen_at or datetime.now(UTC).isoformat())
        )
        with self._get_connection() as conn:
            cur = conn.execute(
                "UPDATE mobile_devices SET last_seen_at = ? WHERE device_id = ?",
                (ls_at, device_id),
            )
            return cur.rowcount > 0

    def delete_revoked_devices(self) -> int:
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM mobile_devices WHERE is_revoked = 1")
            return cur.rowcount

    def save_session(
        self,
        session_id: str,
        user_id: str,
        role: str,
        scopes: list[str] | None = None,
        created_at: str | datetime | None = None,
        expires_at: str | datetime | None = None,
        last_seen_at: str | datetime | None = None,
        is_revoked: bool = False,
    ) -> None:
        c_at = (
            created_at.isoformat()
            if isinstance(created_at, datetime)
            else (created_at or datetime.now(UTC).isoformat())
        )
        exp_at = (
            expires_at.isoformat()
            if isinstance(expires_at, datetime)
            else (expires_at or (datetime.now(UTC) + timedelta(hours=24)).isoformat())
        )
        ls_at = (
            last_seen_at.isoformat()
            if isinstance(last_seen_at, datetime)
            else (last_seen_at or c_at)
        )
        scopes_json = json.dumps(scopes or [])
        rev_int = 1 if is_revoked else 0
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO user_sessions (
                    session_id, user_id, role, scopes_json,
                    created_at, expires_at, last_seen_at, is_revoked
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(session_id) DO UPDATE SET
                    user_id=excluded.user_id,
                    role=excluded.role,
                    scopes_json=excluded.scopes_json,
                    expires_at=excluded.expires_at,
                    last_seen_at=excluded.last_seen_at,
                    is_revoked=excluded.is_revoked
                """,
                (session_id, user_id, role, scopes_json, c_at, exp_at, ls_at, rev_int),
            )

    def get_session(self, session_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM user_sessions WHERE session_id = ?", (session_id,)
            )
            row = cur.fetchone()
            if not row:
                return None
            res = dict(row)
            try:
                res["scopes"] = json.loads(res.get("scopes_json") or "[]")
            except Exception:
                res["scopes"] = []
            res["is_revoked"] = bool(res.get("is_revoked", 0))
            return res

    def list_sessions(self, include_revoked: bool = False) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            if include_revoked:
                cur = conn.execute("SELECT * FROM user_sessions ORDER BY created_at DESC")
            else:
                cur = conn.execute(
                    "SELECT * FROM user_sessions WHERE is_revoked = 0 ORDER BY created_at DESC"
                )
            rows = cur.fetchall()
            result = []
            for r in rows:
                item = dict(r)
                try:
                    item["scopes"] = json.loads(item.get("scopes_json") or "[]")
                except Exception:
                    item["scopes"] = []
                item["is_revoked"] = bool(item.get("is_revoked", 0))
                result.append(item)
            return result

    def revoke_session(self, session_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute(
                "UPDATE user_sessions SET is_revoked = 1 WHERE session_id = ?",
                (session_id,),
            )
            return cur.rowcount > 0

    def revoke_all_sessions_for_user(self, user_id: str) -> int:
        with self._get_connection() as conn:
            cur = conn.execute(
                "UPDATE user_sessions SET is_revoked = 1 WHERE user_id = ? AND is_revoked = 0",
                (user_id,),
            )
            return cur.rowcount

    def update_session_last_seen(
        self, session_id: str, last_seen_at: str | datetime | None = None
    ) -> bool:
        ls_at = (
            last_seen_at.isoformat()
            if isinstance(last_seen_at, datetime)
            else (last_seen_at or datetime.now(UTC).isoformat())
        )
        with self._get_connection() as conn:
            cur = conn.execute(
                "UPDATE user_sessions SET last_seen_at = ? WHERE session_id = ?",
                (ls_at, session_id),
            )
            return cur.rowcount > 0

    def purge_expired_sessions(self) -> int:
        now = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM user_sessions WHERE expires_at <= ? OR is_revoked = 1",
                (now,),
            )
            return cur.rowcount

    def save_audit_event(
        self,
        id: str,
        timestamp: str | datetime,
        severity: str,
        operation: str,
        status: str,
        user_id: str | None = None,
        agent_role: str | None = None,
        project_id: str | None = None,
        tool_name: str | None = None,
        parameters_redacted: dict[str, Any] | None = None,
        reason: str | None = None,
    ) -> None:
        ts = (
            timestamp.isoformat()
            if isinstance(timestamp, datetime)
            else str(timestamp)
        )
        params_json = json.dumps(parameters_redacted or {})
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO audit_events (
                    id, timestamp, severity, user_id, agent_role,
                    project_id, operation, tool_name, parameters_redacted_json,
                    status, reason
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    status=excluded.status,
                    reason=excluded.reason
                """,
                (
                    id,
                    ts,
                    severity,
                    user_id,
                    agent_role,
                    project_id,
                    operation,
                    tool_name,
                    params_json,
                    status,
                    reason,
                ),
            )

    def list_audit_events(
        self,
        project_id: str | None = None,
        agent_role: str | None = None,
        severity: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        conditions: list[str] = []
        params: list[Any] = []
        if project_id:
            conditions.append("project_id = ?")
            params.append(project_id)
        if agent_role:
            conditions.append("agent_role = ?")
            params.append(agent_role)
        if severity:
            conditions.append("severity = ?")
            params.append(severity)
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        sql = f"SELECT * FROM audit_events {where_clause} ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        with self._get_connection() as conn:
            cur = conn.execute(sql, tuple(params))
            rows = cur.fetchall()
            result = []
            for r in rows:
                item = dict(r)
                try:
                    item["parameters_redacted"] = json.loads(
                        item.get("parameters_redacted_json") or "{}"
                    )
                except Exception:
                    item["parameters_redacted"] = {}
                result.append(item)
            return result




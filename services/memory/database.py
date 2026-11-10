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
                conn.execute("ALTER TABLE agent_configs ADD COLUMN is_read_only INTEGER DEFAULT 1;")
            except Exception:
                pass
            try:
                conn.execute("ALTER TABLE agent_configs ADD COLUMN assigned_key_id TEXT;")
            except Exception:
                pass

    def register_project(
        self, project_id: str, name: str, root_path: str, mode: str = "read_only"
    ) -> None:
        now = datetime.now(UTC).isoformat()
        with self._get_connection() as conn:
            conn.execute(
                """
            INSERT INTO projects (id, name, root_path, mode, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                root_path=excluded.root_path,
                mode=excluded.mode,
                updated_at=excluded.updated_at
            """,
                (project_id, name, root_path, mode, now, now),
            )

    def save_task(
        self,
        task_id: str,
        session_id: str,
        prompt: str,
        state_dict: dict[str, Any],
        project_id: str | None = None,
    ) -> None:
        now = datetime.now(UTC).isoformat()
        state_json = json.dumps(state_dict, default=str)
        intent = state_dict.get("classified_intent")
        is_completed = 1 if state_dict.get("is_completed") else 0

        with self._get_connection() as conn:
            conn.execute(
                """
            INSERT INTO tasks (id, session_id, project_id, prompt, intent, state_json, is_completed, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                prompt=excluded.prompt,
                intent=excluded.intent,
                state_json=excluded.state_json,
                is_completed=excluded.is_completed,
                created_at=excluded.created_at,
                updated_at=excluded.updated_at
            """,
                (
                    task_id,
                    session_id,
                    project_id,
                    prompt,
                    intent,
                    state_json,
                    is_completed,
                    now,
                    now,
                ),
            )

    def get_task(self, task_id: str) -> dict[str, Any] | None:
        with self._get_connection() as conn:
            cur = conn.execute("SELECT * FROM tasks WHERE id = ?", (task_id,))
            row = cur.fetchone()
            if not row:
                return None
            data = dict(row)
            data["state"] = json.loads(data["state_json"])
            return data

    def list_tasks(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT id, session_id, project_id, prompt, intent, is_completed, created_at FROM tasks ORDER BY created_at DESC LIMIT ?",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]

    def list_chat_sessions(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT 
                    session_id,
                    MIN(prompt) as first_prompt,
                    COUNT(*) as task_count,
                    MAX(created_at) as last_activity,
                    MIN(intent) as first_intent
                FROM tasks
                WHERE session_id IS NOT NULL AND session_id != ''
                GROUP BY session_id
                ORDER BY last_activity DESC
                LIMIT ?
                """,
                (limit,),
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                p = d.get("first_prompt") or "Conversa sem título"
                d["title"] = (p[:55] + "...") if len(p) > 55 else p
                rows.append(d)
            return rows

    def get_session_tasks(self, session_id: str) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT * FROM tasks WHERE session_id = ? ORDER BY created_at ASC",
                (session_id,),
            )
            tasks = []
            for r in cur.fetchall():
                d = dict(r)
                d["state"] = json.loads(d["state_json"])
                tasks.append(d)
            return tasks

    def delete_session(self, session_id: str) -> int:
        with self._get_connection() as conn:
            conn.execute("DELETE FROM chat_messages WHERE session_id = ?", (session_id,))
            cur = conn.execute("DELETE FROM tasks WHERE session_id = ?", (session_id,))
            return cur.rowcount

    # --- Mensagens individuais do agente de código (histórico fiel) ---

    def add_chat_message(
        self,
        session_id: str,
        role: str,
        content: str = "",
        project_id: str | None = None,
        tool_calls: list[dict[str, Any]] | None = None,
        tool_call_id: str | None = None,
        tool_name: str | None = None,
    ) -> int:
        """Persiste uma mensagem individual (user/assistant/tool) da sessão."""
        now = datetime.now(UTC).isoformat()
        tool_calls_json = json.dumps(tool_calls, default=str) if tool_calls else None
        with self._get_connection() as conn:
            cur = conn.execute(
                """
                INSERT INTO chat_messages (
                    session_id, project_id, role, content, tool_calls_json,
                    tool_call_id, tool_name, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    project_id,
                    role,
                    content,
                    tool_calls_json,
                    tool_call_id,
                    tool_name,
                    now,
                ),
            )
            return int(cur.lastrowid or 0)

    def list_chat_messages(
        self,
        session_id: str,
        limit: int = 200,
        ascending: bool = True,
    ) -> list[dict[str, Any]]:
        """Recupera as mensagens de uma sessão em ordem cronológica."""
        limit = max(1, min(limit, 1000))
        order = "ASC" if ascending else "DESC"
        with self._get_connection() as conn:
            cur = conn.execute(
                f"""
                SELECT id, session_id, project_id, role, content, tool_calls_json,
                       tool_call_id, tool_name, created_at
                FROM chat_messages
                WHERE session_id = ?
                ORDER BY id {order}
                LIMIT ?
                """,
                (session_id, limit),
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                raw_calls = d.pop("tool_calls_json", None)
                try:
                    d["tool_calls"] = json.loads(raw_calls) if raw_calls else []
                except Exception:
                    d["tool_calls"] = []
                rows.append(d)
            return rows

    def clear_session_messages(self, session_id: str) -> int:
        """Remove todo o histórico de mensagens de uma sessão."""
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM chat_messages WHERE session_id = ?", (session_id,)
            )
            return cur.rowcount

    def search_chat_history(self, query: str, limit: int = 20) -> list[dict[str, Any]]:
        """Busca em todas as tarefas e conversas anteriores com filtro por texto."""
        if not query or not query.strip():
            return []
        term = f"%{query.strip().lower()}%"
        with self._get_connection() as conn:
            cur = conn.execute(
                """
                SELECT id, session_id, prompt, intent, project_id, created_at, state_json
                FROM tasks
                WHERE lower(prompt) LIKE ? OR lower(state_json) LIKE ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (term, term, limit),
            )
            results = []
            for r in cur.fetchall():
                d = dict(r)
                try:
                    state = json.loads(d.pop("state_json"))
                    d["final_summary"] = state.get("final_summary", "")
                    d["agents"] = state.get("selected_agents", [])
                except Exception:
                    d["final_summary"] = ""
                    d["agents"] = []
                results.append(d)
            return results

    def export_session_markdown(self, session_id: str) -> str:
        """Gera um arquivo Markdown completo e estruturado de toda a sessão de conversa."""
        tasks = self.get_session_tasks(session_id)
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

    def purge_old_tasks(self, days_retention: int = 30) -> int:
        cutoff = (datetime.now(UTC) - timedelta(days=days_retention)).isoformat()
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM tasks WHERE created_at < ?", (cutoff,))
            return cur.rowcount

    def delete_task(self, task_id: str) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM tasks WHERE id = ?", (task_id,))
            return cur.rowcount > 0

    def export_project_data(self, project_id: str) -> dict[str, Any]:
        with self._get_connection() as conn:
            proj = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
            if not proj:
                raise ValueError(f"Projeto '{project_id}' não encontrado.")
            tasks = conn.execute(
                "SELECT id, session_id, prompt, intent, is_completed, created_at FROM tasks WHERE project_id = ?",
                (project_id,),
            ).fetchall()
            memory = conn.execute(
                "SELECT category, key, content, sources_json, updated_at FROM project_memory WHERE project_id = ?",
                (project_id,),
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
    ) -> None:
        import uuid
        now = datetime.now(UTC).isoformat()
        mem_id = f"mem-{uuid.uuid4().hex[:8]}"
        sources_json = json.dumps(sources or [])
        # Garante que o projeto está registrado para integridade referencial
        self.register_project(project_id, project_id, f"workspace/{project_id}")
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO project_memory (id, project_id, category, key, content, sources_json, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(project_id, category, key) DO UPDATE SET
                    content=excluded.content,
                    sources_json=excluded.sources_json,
                    updated_at=excluded.updated_at
                """,
                (mem_id, project_id, category, key, content, sources_json, now),
            )

    def list_project_memory(self, project_id: str) -> list[dict[str, Any]]:
        with self._get_connection() as conn:
            cur = conn.execute(
                "SELECT id, project_id, category, key, content, sources_json, updated_at FROM project_memory WHERE project_id = ? ORDER BY updated_at DESC",
                (project_id,),
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                d["sources"] = json.loads(d["sources_json"])
                rows.append(d)
            return rows

    def set_agent_memory(
        self,
        agent_role: str,
        category: str,
        key: str,
        content: str,
        context: str | None = None,
        importance: int = 1,
    ) -> str:
        """Salva ou atualiza uma memória episódica transversal para um especialista específico."""
        import uuid
        now = datetime.now(UTC).isoformat()
        mem_id = f"amem-{uuid.uuid4().hex[:8]}"
        clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
        with self._get_connection() as conn:
            conn.execute(
                """
                INSERT INTO agent_memories (id, agent_role, category, key, content, context, importance, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(agent_role, category, key) DO UPDATE SET
                    content=excluded.content,
                    context=coalesce(excluded.context, agent_memories.context),
                    importance=excluded.importance,
                    updated_at=excluded.updated_at
                """,
                (mem_id, clean_role, category.lower(), key.strip(), content.strip(), context, max(1, min(5, importance)), now, now),
            )
        return mem_id

    def list_agent_memories(
        self,
        agent_role: str | None = None,
        category: str | None = None,
        limit: int = 20,
    ) -> list[dict[str, Any]]:
        """Lista memórias episódicas filtradas por papel de especialista e/ou categoria."""
        query = "SELECT id, agent_role, category, key, content, context, importance, created_at, updated_at FROM agent_memories WHERE 1=1"
        params: list[Any] = []
        if agent_role:
            clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
            query += " AND agent_role = ?"
            params.append(clean_role)
        if category:
            query += " AND category = ?"
            params.append(category.lower())
        query += " ORDER BY importance DESC, updated_at DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            cur = conn.execute(query, params)
            return [dict(r) for r in cur.fetchall()]

    def delete_agent_memory(self, memory_id: str) -> bool:
        """Remove uma memória episódica específica por ID."""
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM agent_memories WHERE id = ?", (memory_id,))
            return cur.rowcount > 0

    def clear_agent_memories(self, agent_role: str) -> int:
        """Limpa todas as memórias acumuladas de um especialista específico."""
        clean_role = agent_role.value if hasattr(agent_role, "value") else str(agent_role)
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM agent_memories WHERE agent_role = ?", (clean_role,))
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
    ) -> int:
        """Insere trechos de um documento processado na Base de Conhecimento."""
        now = datetime.now(UTC).isoformat()
        inserted_count = 0
        with self._get_connection() as conn:
            # Remove versão anterior do documento se já existia
            conn.execute("DELETE FROM knowledge_vault WHERE doc_name = ?", (doc_name,))
            for idx, chunk in enumerate(chunks):
                chunk_id = f"{doc_name}_{idx}_{now[:10]}"
                conn.execute(
                    """
                    INSERT INTO knowledge_vault (
                        id, doc_name, file_type, category, chunk_index,
                        content, file_size_formatted, source_path, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        doc_name,
                        file_type,
                        category,
                        idx,
                        chunk.strip(),
                        file_size_formatted,
                        source_path,
                        now,
                    ),
                )
                inserted_count += 1
        return inserted_count

    def list_knowledge_documents(self) -> list[dict[str, Any]]:
        """Lista resumos dos documentos indexados na Base de Conhecimento."""
        with self._get_connection() as conn:
            rows = conn.execute(
                """
                SELECT doc_name, file_type, category, file_size_formatted, source_path,
                       count(*) as total_chunks, max(created_at) as created_at
                FROM knowledge_vault
                GROUP BY doc_name, file_type, category, file_size_formatted, source_path
                ORDER BY created_at DESC
                """
            ).fetchall()
            return [dict(r) for r in rows]

    def delete_knowledge_document(self, doc_name: str) -> bool:
        """Exclui um documento e todos os seus chunks da Base de Conhecimento."""
        with self._get_connection() as conn:
            cur = conn.execute("DELETE FROM knowledge_vault WHERE doc_name = ?", (doc_name,))
            return cur.rowcount > 0

    def search_knowledge_vault(self, query: str, limit: int = 4) -> list[dict[str, Any]]:
        """Realiza busca textual relacional de alta precisão na Base de Conhecimento."""
        if not query or not query.strip():
            return []
        keywords = [k.lower().strip() for k in query.split() if len(k) > 2]
        if not keywords:
            keywords = [query.lower().strip()]

        with self._get_connection() as conn:
            # Query com LIKE múltiplo por termos de busca
            conditions = " OR ".join(["lower(content) LIKE ?" for _ in keywords])
            params = [f"%{k}%" for k in keywords]
            sql = f"""
                SELECT doc_name, category, chunk_index, content, source_path
                FROM knowledge_vault
                WHERE {conditions}
                LIMIT ?
            """
            rows = conn.execute(sql, (*params, limit)).fetchall()
            return [dict(r) for r in rows]



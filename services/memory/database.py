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
            "FROM project_memory WHERE project_id = ? AND owner_user_id IS ?"
        )
        params: list[Any] = [project_id, owner_user_id]
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
            mem_id,
            clean_role,
            category.lower(),
            key.strip(),
            content.strip(),
            context,
            max(1, min(5, importance)),
            now,
            now,
            owner_user_id,
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
            persisted = conn.execute(
                """
                SELECT id
                FROM agent_memories
                WHERE owner_user_id IS ?
                  AND agent_role = ?
                  AND category = ?
                  AND key = ?
                """,
                (owner_user_id, clean_role, category.lower(), key.strip()),
            ).fetchone()
            if persisted is None:
                raise RuntimeError("A memória do agente não foi confirmada após a gravação.")
            mem_id = str(persisted["id"])
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

    def delete_agent_memory(self, memory_id: str, owner_user_id: str | None = None) -> bool:
        with self._get_connection() as conn:
            cur = conn.execute(
                "DELETE FROM agent_memories WHERE id = ? AND owner_user_id IS ?",
                (memory_id, owner_user_id),
            )
            return cur.rowcount > 0

    def clear_agent_memories(self, agent_role: str, owner_user_id: str | None = None) -> int:
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
            existing = conn.execute(
                "SELECT system_prompt, preferred_model, allowed_tools_json, is_read_only, assigned_key_id FROM agent_configs WHERE role = ?",
                (clean_role,),
            ).fetchone()
            ro_val = (
                bool(is_read_only)
                if is_read_only is not None
                else (
                    bool(existing["is_read_only"])
                    if existing and "is_read_only" in existing.keys() and existing["is_read_only"] is not None
                    # Sem valor explícito e sem registo anterior: NULL significa
                    # "não definido" e não aplica restrição de escrita ao agente.
                    else None
                )
            )
            cur_key = (
                assigned_key_id
                if assigned_key_id is not None
                else (
                    existing["assigned_key_id"]
                    if existing and "assigned_key_id" in existing.keys()  # noqa: SIM118 - sqlite3.Row membership checks values, keys() checks schema.
                    else None
                )
            )
            if existing:
                cur_prompt = (
                    system_prompt if system_prompt is not None else existing["system_prompt"]
                )
                cur_model = (
                    preferred_model if preferred_model is not None else existing["preferred_model"]
                )
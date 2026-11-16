import pytest
from httpx import ASGITransport, AsyncClient

from apps.api.main import app


@pytest.mark.asyncio
async def test_teammates_endpoints_full_cycle():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # 1. Spawn
        spawn_res = await client.post(
            "/api/v1/teammates/spawn",
            json={
                "name": "Architect Teammate",
                "role": "software_architect",
                "project_id": "proj-e2e",
            },
        )
        assert spawn_res.status_code == 200
        teammate = spawn_res.json()
        t_id = teammate["id"]
        assert teammate["name"] == "Architect Teammate"

        # 2. List
        list_res = await client.get("/api/v1/teammates")
        assert list_res.status_code == 200
        all_t = list_res.json()
        assert any(t["id"] == t_id for t in all_t)

        # 3. Get by ID
        get_res = await client.get(f"/api/v1/teammates/{t_id}")
        assert get_res.status_code == 200
        assert get_res.json()["id"] == t_id

        # 4. Dispatch task
        dispatch_res = await client.post(
            f"/api/v1/teammates/{t_id}/dispatch",
            json={"task": "Elaborar diagrama C4 do subsistema de visão"},
        )
        assert dispatch_res.status_code == 200
        assert dispatch_res.json()["status"] == "completed"

        # 5. Delete
        del_res = await client.delete(f"/api/v1/teammates/{t_id}")
        assert del_res.status_code == 200
        assert del_res.json()["success"] is True

        # Verify not found
        get_after = await client.get(f"/api/v1/teammates/{t_id}")
        assert get_after.status_code == 404

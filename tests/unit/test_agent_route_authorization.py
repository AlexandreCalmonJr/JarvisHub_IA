from apps.api.auth import AuthService, Principal, required_permission


def test_agent_route_endpoints_have_explicit_permissions():
    assert required_permission("GET", "/api/v1/agent-routes") == "agents:read"
    assert required_permission("PUT", "/api/v1/agent-routes/qa_engineer") == "agents:write"
    assert required_permission("DELETE", "/api/v1/agent-routes/qa_engineer") == "agents:write"


def test_developer_can_manage_own_agent_routes():
    service = object.__new__(AuthService)
    developer = Principal(subject_id="dev-1", kind="human", role="developer")

    assert service.authorize(developer, "GET", "/api/v1/agent-routes") == (True, None)
    assert service.authorize(developer, "PUT", "/api/v1/agent-routes/qa_engineer") == (
        True,
        None,
    )
    assert service.authorize(developer, "DELETE", "/api/v1/agent-routes/qa_engineer") == (
        True,
        None,
    )


def test_auditor_can_read_but_cannot_change_agent_routes():
    service = object.__new__(AuthService)
    auditor = Principal(subject_id="audit-1", kind="human", role="auditor")

    assert service.authorize(auditor, "GET", "/api/v1/agent-routes") == (True, None)
    assert service.authorize(auditor, "PUT", "/api/v1/agent-routes/qa_engineer") == (
        False,
        "agents:write",
    )
    assert service.authorize(auditor, "DELETE", "/api/v1/agent-routes/qa_engineer") == (
        False,
        "agents:write",
    )

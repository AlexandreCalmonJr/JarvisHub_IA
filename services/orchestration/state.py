from typing import Any, TypedDict


class TaskState(TypedDict):
    """
    Estado com checkpoints do fluxo do JARVIS Master em LangGraph.
    Permite pausas para aprovação humana e recuperação determinística.
    """

    task_id: str
    session_id: str
    user_prompt: str
    project_id: str | None
    classified_intent: str | None
    plan_steps: list[str]
    selected_agents: list[str]
    policy_verified: bool
    policy_violations: list[str]
    approval_required: bool
    approval_id: str | None
    current_step: int
    agent_outputs: list[dict[str, Any]]
    final_summary: str | None
    is_completed: bool
    error: str | None

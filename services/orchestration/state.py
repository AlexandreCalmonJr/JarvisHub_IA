from typing import TypedDict, List, Optional, Dict, Any


class TaskState(TypedDict):
    """
    Estado com checkpoints do fluxo do JARVIS Master em LangGraph.
    Permite pausas para aprovação humana e recuperação determinística.
    """
    task_id: str
    session_id: str
    user_prompt: str
    project_id: Optional[str]
    classified_intent: Optional[str]
    plan_steps: List[str]
    selected_agents: List[str]
    policy_verified: bool
    policy_violations: List[str]
    approval_required: bool
    approval_id: Optional[str]
    current_step: int
    agent_outputs: List[Dict[str, Any]]
    final_summary: Optional[str]
    is_completed: bool
    error: Optional[str]

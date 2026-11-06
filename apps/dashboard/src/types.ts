export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'offline';
  components: {
    security_core: string;
    approval_engine: string;
    model_runtime: string;
    inference_queue: {
      active: number;
      waiting: number;
    };
    kill_switch: {
      global_killed: boolean;
    };
  };
}

export interface ApprovalRequestItem {
  id: string;
  task_id: string;
  agent_role: string;
  operation: string;
  impact_summary: string;
  affected_resources: string[];
  proposed_diff?: string;
  reversible: boolean;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  requested_at: string;
}

export interface TaskStateResponse {
  task_id: string;
  session_id: string;
  user_prompt: string;
  project_id?: string;
  classified_intent?: string;
  plan_steps: string[];
  selected_agents: string[];
  policy_verified: boolean;
  policy_violations: string[];
  approval_required: boolean;
  approval_id?: string;
  final_summary?: string;
  is_completed: boolean;
}

export interface AgentInfo {
  role: string;
  name: string;
  mission: string;
  preferred_model: string;
  is_read_only: boolean;
  allowed_tools: string[];
}

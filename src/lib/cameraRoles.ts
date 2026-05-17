/** Papéis no agente (agent_configs.cameras JSON). */
export type AgentCameraRole = 'counting' | 'cash';

/** Papéis na tabela cameras do painel. */
export type PanelCameraType = 'people_counting' | 'cash_register';

export function panelTypeToAgentRole(type: PanelCameraType): AgentCameraRole {
  return type === 'cash_register' ? 'cash' : 'counting';
}

export function agentRoleToPanelType(role: AgentCameraRole): PanelCameraType {
  return role === 'cash' ? 'cash_register' : 'people_counting';
}

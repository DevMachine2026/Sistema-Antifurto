/** Limites padrão de leitura no painel — evita full table scan em produção. */
export const QUERY_LIMITS = {
  transactions: 500,
  alerts: 200,
  batches: 50,
  peopleCount24h: 2000,
  cashEvents: 300,
} as const;

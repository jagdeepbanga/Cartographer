import type { CreateShoppingPlanInput, ShoppingPlan } from '@/types';

export function executeCreateShoppingPlan(input: CreateShoppingPlanInput): ShoppingPlan {
  return {
    goal: input.goal,
    total_budget_aud: input.total_budget_aud,
    categories: input.categories,
  };
}

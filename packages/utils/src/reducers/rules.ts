import { Rule, RulesState, RulesStateAction } from "@konfi/types";

export const initialRulesQueries = (rules: Rule[]) =>
  Array.from({ length: rules.length }, () => []);

export const initialValues = (rules: Rule[]) =>
  Array.from({ length: rules.length }, () => []);

export function rulesStateReducer(
  state: RulesState,
  action: RulesStateAction,
): RulesState {
  switch (action.type) {
    case "INIT":
      return {
        ...state,
        rulesQueries: action.rulesQueries,
        values: action.values,
        presetEnabled: action.presetEnabled,
        enabledPresetIndex: action.enabledPresetIndex,
        enabledPresetId: action.enabledPresetId ?? null,
      };
    default:
      return state;
  }
}

import { DEFAULT_CHART_ENTER_TRANSITION } from "./animation";
import type { Transition } from "motion/react";

export function transitionWithDelay(
  transition: Transition | undefined,
  delaySeconds: number,
  fallback: Transition = DEFAULT_CHART_ENTER_TRANSITION
): Transition {
  const base = transition ?? fallback;
  return { ...base, delay: delaySeconds };
}

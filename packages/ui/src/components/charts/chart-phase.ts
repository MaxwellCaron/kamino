export type ChartStatus = "loading" | "ready";

/** Loading animation style: the default traveling pulse, or a diagonal
 * shimmer that sweeps across the skeleton. */
export type LoadingStyle = "pulse" | "sweep";

export type ChartPhase =
  | "loading"
  | "exiting"
  | "gridTweenReady"
  | "revealing"
  | "ready"
  | "exitingReady"
  | "gridTweenLoading"
  | "revealingLoading";

export const DEFAULT_CHART_STATUS: ChartStatus = "ready";

export const DEFAULT_Y_DOMAIN_TWEEN_MS = 500;

/** Relative domain delta below which Y tween may be skipped (see plan). */
export const Y_DOMAIN_TWEEN_SKIP_THRESHOLD = 0.02;

export function resolveRestingChartPhase(status: ChartStatus): ChartPhase {
  return status === "loading" ? "loading" : "ready";
}

export function isChartInteractionPhase(phase: ChartPhase): boolean {
  return phase === "ready";
}

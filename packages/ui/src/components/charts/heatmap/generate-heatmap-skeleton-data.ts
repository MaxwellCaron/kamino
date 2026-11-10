import type { HeatmapColumn } from "./heatmap-context";

export function generateHeatmapSkeletonFromTarget(
  target: Array<HeatmapColumn>
): Array<HeatmapColumn> {
  return target.map((column) => ({
    bin: column.bin,
    bins: column.bins.map((bin) => ({
      bin: bin.bin,
      count: 0,
      date: bin.date,
    })),
  }));
}

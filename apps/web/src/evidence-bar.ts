/**
 * The Evidence Bar shows a score as its five scoring dimensions, each as wide as
 * its policy weight. A dimension with no evidence is a hatched gap rather than a
 * zero or a pass, so missing evidence is visible at a glance.
 */
export const DIMENSIONS = [
  { key: "outcome", label: "Outcome", weight: 35 },
  { key: "tests", label: "Tests", weight: 30 },
  { key: "efficiency", label: "Efficiency", weight: 15 },
  { key: "autonomy", label: "Autonomy", weight: 10 },
  { key: "safety", label: "Safety", weight: 10 },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]["key"];
export type Band = "good" | "mid" | "bad";
export type DimensionScores = Partial<Record<DimensionKey, number | null | undefined>>;

export interface Segment {
  key: DimensionKey;
  label: string;
  weight: number;
  /** 0-100, or null when the dimension has no evidence. */
  score: number | null;
  band: Band | null;
}

export function bandOf(score: number): Band {
  return score >= 80 ? "good" : score >= 60 ? "mid" : "bad";
}

export function buildSegments(scores: DimensionScores): Segment[] {
  return DIMENSIONS.map((dimension) => {
    const raw = scores[dimension.key];
    const score = typeof raw === "number" && Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : null;
    return { ...dimension, score, band: score === null ? null : bandOf(score) };
  });
}

/** Plain-language equivalent of the bar, for screen readers and tooltips. */
export function describeSegments(segments: Segment[]): string {
  return segments
    .map((segment) => `${segment.label} ${segment.score === null ? "not assessed" : Math.round(segment.score)}`)
    .join(", ");
}

/** How many dimensions have evidence behind them. */
export function assessedCount(segments: Segment[]): number {
  return segments.filter((segment) => segment.score !== null).length;
}

import { buildSegments, describeSegments, type DimensionScores } from "./evidence-bar";

export default function EvidenceBar({ scores, size = "sm", labels = false }: { scores: DimensionScores; size?: "sm" | "lg"; labels?: boolean }) {
  const segments = buildSegments(scores);
  return <span className={"ebar ebar-" + size} role="img" aria-label={describeSegments(segments)} title={describeSegments(segments)}>
    {segments.map((segment) => <span key={segment.key} className={"ebar-seg" + (segment.score === null ? " is-missing" : "")} style={{ flexGrow: segment.weight }}>
      <i className={segment.band ? "band-" + segment.band : undefined} style={{ width: (segment.score ?? 0) + "%" }} />
      {labels && <small>{segment.label}<b>{segment.score === null ? "no data" : Math.round(segment.score)}</b></small>}
    </span>)}
  </span>;
}

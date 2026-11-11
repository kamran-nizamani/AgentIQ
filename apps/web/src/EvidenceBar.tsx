import { buildSegments, describeSegments, type DimensionScores } from "./evidence-bar";

export default function EvidenceBar({ scores, size = "sm", labels = false }: { scores: DimensionScores; size?: "sm" | "lg"; labels?: boolean }) {
  const segments = buildSegments(scores);
  return <span className={"ebar-wrap"}><span className={"ebar ebar-" + size} role="img" aria-label={describeSegments(segments)} title={describeSegments(segments)}>
    {segments.map((segment) => <span key={segment.key} className={"ebar-seg" + (segment.score === null ? " is-missing" : "")} style={{ flexGrow: segment.weight }}>
      <i className={segment.band ? "band-" + segment.band : undefined} style={{ width: (segment.score ?? 0) + "%" }} />
      {labels && <small>{segment.label}<b>{segment.score === null ? "no data" : Math.round(segment.score)}</b></small>}
    </span>)}
  </span>{labels && <ul className="ebar-legend" aria-hidden="true">
    {segments.map((segment) => <li key={segment.key}><i className={segment.band ? "band-" + segment.band : "is-none"} />{segment.label}<b>{segment.score === null ? "no data" : Math.round(segment.score)}</b></li>)}
  </ul>}</span>;
}

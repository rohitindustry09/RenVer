import { percentLabel, type GaugeTone } from "@/lib/gauge";

interface Props {
  /** 0 to 1. */
  ratio: number;
  tone: GaugeTone;
  label: string;
  size?: number;
}

const STROKE = 5;

/** A small round progress meter with the percentage in the middle. */
export function Gauge({ ratio, tone, label, size = 44 }: Props) {
  const radius = (size - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = Math.min(1, Math.max(0, ratio));
  return (
    <span className="gauge" style={{ width: size, height: size }} role="img" aria-label={`${label}: ${percentLabel(filled)}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className="gauge-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={STROKE} />
        <circle
          className={`gauge-fill ${tone}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - filled)}
        />
      </svg>
      <span className="gauge-center" aria-hidden="true">{percentLabel(filled)}</span>
    </span>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  url: string;
  host: string;
}

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;

/** A small live view of the running site: the real page, shrunk to fit and not clickable. Click it to open the site. */
export function LivePreview({ url, host }: Props) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.3);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / VIEWPORT_WIDTH);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <a className="live-preview" href={url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${host}`}>
      <div className="live-preview-frame" ref={frameRef} style={{ aspectRatio: `${VIEWPORT_WIDTH} / ${VIEWPORT_HEIGHT}` }}>
        {!isLoaded && <span className="live-preview-wait small muted">Loading preview…</span>}
        <iframe
          src={url}
          title={`Preview of ${host}`}
          tabIndex={-1}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          style={{ width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT, transform: `scale(${scale})` }}
        />
      </div>
      <span className="live-preview-bar mono small">{host}<span aria-hidden="true"> ↗</span></span>
    </a>
  );
}

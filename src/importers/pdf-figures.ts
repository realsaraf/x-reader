export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface DiagramText {
  x: number;
  y: number;
  right: number;
  height: number;
  text: string;
}
export interface RecordedBoxes {
  isEmpty(index: number): boolean;
  minX(index: number): number;
  minY(index: number): number;
  maxX(index: number): number;
  maxY(index: number): number;
}

const area = (r: Rect) => (r.right - r.left) * (r.bottom - r.top);

export function encloses(outer: Rect, inner: Rect): boolean {
  const tolerance = 1 / 256; // Precision of PDF.js recorded coordinates.
  return (
    inner.left >= outer.left - tolerance &&
    inner.top >= outer.top - tolerance &&
    inner.right <= outer.right + tolerance &&
    inner.bottom <= outer.bottom + tolerance
  );
}

export function lineIn(rect: Rect, line: DiagramText, width: number, height: number) {
  return encloses(rect, {
    left: line.x / width,
    top: (line.y - line.height * 0.65) / height,
    right: line.right / width,
    bottom: line.y / height,
  });
}

/** Crop a framed figure only when it contains multiple drawn elements and no body-length
 * lines. Rules, page backgrounds and ordinary text frames should stay out of reading flow. */
export function framedDiagrams(
  boxes: RecordedBoxes,
  pathIndices: number[],
  lines: DiagramText[],
  width: number,
  height: number,
): Rect[] {
  const paths = pathIndices
    .filter((i) => !boxes.isEmpty(i))
    .map((i) => ({
      left: boxes.minX(i),
      top: boxes.minY(i),
      right: boxes.maxX(i),
      bottom: boxes.maxY(i),
    }));
  const frames = paths
    .filter((r) => r.right - r.left > 0.18 && r.bottom - r.top > 0.09 && area(r) < 0.78)
    .sort((a, b) => area(b) - area(a));
  const chosen: Rect[] = [];
  for (const frame of frames) {
    if (chosen.some((r) => encloses(r, frame))) continue;
    if (lines.some((line) => line.text.trim().length >= 58 && lineIn(frame, line, width, height)))
      continue;
    let inside = 0;
    for (const path of paths) {
      if (area(path) < area(frame) * 0.85 && encloses(frame, path) && ++inside >= 3) break;
    }
    if (inside >= 3) chosen.push(frame);
  }
  return chosen;
}

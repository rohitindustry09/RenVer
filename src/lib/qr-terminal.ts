import qrcode from "qrcode-generator";

/** Draws a QR code in a terminal, so a setup key can be scanned without sending it through any website. */

const TYPE_AUTO = 0;
const ERROR_CORRECTION = "M";
const DEFAULT_QUIET_ZONE = 2;
const ESC = "\u001b";
const BLACK = 0;
const WHITE = 7;

/** The code as rows of modules: true is a dark one. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(TYPE_AUTO, ERROR_CORRECTION);
  qr.addData(text);
  qr.make();
  const size = qr.getModuleCount();
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, col) => qr.isDark(row, col)));
}

/**
 * Two module rows per text line: the "upper half block" character is painted with the top module's colour in front and
 * the bottom module's behind it. Colours are set explicitly (black and white), so it scans the same on dark and light
 * terminals. The light margin around the code is part of the QR standard, not decoration.
 */
export function renderQr(matrix: boolean[][], options: { quietZone?: number } = {}): string {
  if (matrix.length === 0) return "";
  const margin = options.quietZone ?? DEFAULT_QUIET_ZONE;
  const width = matrix[0]!.length + margin * 2;
  const rows: boolean[][] = [
    ...Array.from({ length: margin }, () => new Array<boolean>(width).fill(false)),
    ...matrix.map((row) => [...new Array<boolean>(margin).fill(false), ...row, ...new Array<boolean>(margin).fill(false)]),
    ...Array.from({ length: margin }, () => new Array<boolean>(width).fill(false)),
  ];

  const lines: string[] = [];
  for (let y = 0; y < rows.length; y += 2) {
    const top = rows[y]!;
    const bottom = rows[y + 1] ?? new Array<boolean>(width).fill(false);
    let line = "";
    for (let x = 0; x < width; x++) {
      line += `${ESC}[3${top[x] ? BLACK : WHITE}m${ESC}[4${bottom[x] ? BLACK : WHITE}m▀`;
    }
    lines.push(`${line}${ESC}[0m`);
  }
  return lines.join("\n");
}

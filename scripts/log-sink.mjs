// Appends what the panel prints to a file the Settings page can show live. The file is kept small: when it passes
// the limit it is moved to "<file>.1" (replacing the previous one) and a fresh file starts. It never throws: losing
// a log line must not stop the panel.
import fs from "node:fs";
import path from "node:path";

export function createLogSink(file, maxBytes) {
  let size = 0;
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  } catch {
    /* the folder cannot be made: writes below will fail quietly */
  }

  return {
    write(text) {
      try {
        if (size > 0 && size + Buffer.byteLength(text) > maxBytes) {
          fs.rmSync(`${file}.1`, { force: true });
          fs.renameSync(file, `${file}.1`);
          size = 0;
        }
        fs.appendFileSync(file, text);
        size += Buffer.byteLength(text);
      } catch {
        /* ignore */
      }
    },
  };
}

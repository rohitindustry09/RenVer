// Reads and edits RenVer's .env file. One reader for everything (the launcher, the setup wizard), so a value means the
// same thing everywhere: no "$" expansion, "\r" from Windows line endings is dropped, and quotes are removed.

const LINE = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/** KEY=value lines of a .env file as an object. Later lines win. */
export function parseEnv(text) {
  const values = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = LINE.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }
    values[match[1]] = value;
  }
  return values;
}

/** Text that reads back as exactly this value: quoted when it holds spaces, "#", "$", quotes or edge whitespace. */
export function formatEnvValue(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]*$/.test(value)) return value;
  if (!value.includes("'")) return `'${value}'`;
  if (!value.includes('"')) return `"${value}"`;
  throw new Error("A value cannot contain both ' and \" characters.");
}

/**
 * Sets values in a .env file's text, keeping everything else (comments, order). A key that is already there is
 * replaced; a commented-out example ("# KEY=...") is switched on; a new key is added at the end.
 * An undefined value leaves that key alone.
 */
export function updateEnvText(text, updates) {
  const lines = text === "" ? [] : text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) continue;
    const written = `${key}=${formatEnvValue(value)}`;
    const active = lines.findIndex((l) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(l));
    if (active >= 0) {
      lines[active] = written;
      continue;
    }
    const commented = lines.findIndex((l) => new RegExp(`^\\s*#\\s*${key}\\s*=`).test(l));
    if (commented >= 0) lines[commented] = written;
    else lines.push(written);
  }
  return `${lines.join("\n")}\n`;
}

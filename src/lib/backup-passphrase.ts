/**
 * The passphrase new backups are encrypted with (RENVER_BACKUP_PASSPHRASE). It lives outside the data folder on purpose:
 * a passphrase stored next to the backups would protect nothing.
 */
export function backupPassphrase(): string | undefined {
  const value = process.env.RENVER_BACKUP_PASSPHRASE;
  return value ? value : undefined;
}

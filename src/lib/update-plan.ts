const DEPENDENCY_FILES = new Set(["package.json", "package-lock.json"]);

/** Whether packages must be installed again: only when the dependency files themselves changed. */
export const needsInstall = (changedFiles: string[]): boolean => changedFiles.some((file) => DEPENDENCY_FILES.has(file.trim()));

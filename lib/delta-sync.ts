export interface DeltaSourceFile {
  path: string;
  content: string;
  size: number;
}

export interface DeltaFileItem {
  path: string;
  status: string; // 'added' | 'modified' | 'removed' | 'renamed'
}

/**
 * Merges delta files into an existing activeFiles array.
 * Removes files with status 'removed', and merges or overwrites freshModifiedFiles.
 */
export function applyFileDelta<T extends DeltaSourceFile>(
  activeFiles: T[],
  modifiedFiles: DeltaFileItem[],
  freshModifiedFiles: T[]
): T[] {
  const removedPaths = new Set(
    modifiedFiles.filter((f) => f.status === 'removed').map((f) => f.path)
  );
  const fileMap = new Map<string, T>(activeFiles.map((f) => [f.path, f]));
  removedPaths.forEach((p) => fileMap.delete(p));
  freshModifiedFiles.forEach((f) => fileMap.set(f.path, f));
  return Array.from(fileMap.values());
}

/**
 * Checks if a delta result is valid for fast-forward incremental sync.
 */
export function canApplyDelta(delta: {
  isFastForward: boolean;
  modifiedFiles: Array<{ path: string; status: string }>;
}): boolean {
  return delta.isFastForward;
}

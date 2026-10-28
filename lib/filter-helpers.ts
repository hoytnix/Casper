// Capped file-list filtering for INP-sensitive filter-as-you-type inputs.
// The Context Inspector can hold thousands of files; rendering every match
// per keystroke blocks the input (long render + input delay in INP traces).
// This pure helper keeps query semantics (case-insensitive path substring)
// while capping the rows a caller renders; `total` still reports the full
// match count so the UI can say "Showing N of M".
export const MAX_VISIBLE_FILES = 200;

export function filterFilesByQuery<T extends { path: string }>(
  files: T[],
  query: string,
  limit: number = MAX_VISIBLE_FILES
): { visible: T[]; total: number } {
  const q = query.trim().toLowerCase();
  const matched = q
    ? files.filter((f) => f.path.toLowerCase().includes(q))
    : files;
  return { visible: matched.slice(0, limit), total: matched.length };
}

import { GitTreeItem, SourceFile, IngestionSnapshot } from '@/types';

// Standard ignore patterns
const DEFAULT_IGNORED_DIRS = [
  '.git/',
  'node_modules/',
  'dist/',
  'build/',
  '.next/',
  '.turbo/',
  '.vercel/',
  '.output/',
  'coverage/',
  '.cache/',
  '.vscode/',
  '.idea/',
  '__pycache__/',
  '.pytest_cache/',
  'target/',
  'vendor/',
];

const DEFAULT_IGNORED_FILES = [
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'cargo.lock',
  'poetry.lock',
  'bun.lockb',
  'composer.lock',
  'gemfile.lock',
];

const BINARY_EXTENSIONS = [
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
  '.bmp',
  '.tiff',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.otf',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.wasm',
  '.mp4',
  '.webm',
  '.mp3',
  '.wav',
  '.mov',
  '.avi',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.pyc',
  '.class',
  '.o',
  '.obj',
  '.iso',
  '.dmg',
];

export function parseRepoInput(input: string): { owner: string; repo: string } | null {
  if (!input) return null;
  const trimmed = input.trim();

  // Pattern 1: https://github.com/owner/repo or http://... or git@github.com:owner/repo
  const urlMatch = trimmed.match(
    /(?:https?:\/\/)?(?:www\.)?github\.com[/:]([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(?:\.git|\/|$)/
  );
  if (urlMatch && urlMatch[1] && urlMatch[2]) {
    return {
      owner: urlMatch[1],
      repo: urlMatch[2].replace(/\.git$/, ''),
    };
  }

  // Pattern 2: owner/repo
  const slugMatch = trimmed.match(/^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/);
  if (slugMatch && slugMatch[1] && slugMatch[2]) {
    return {
      owner: slugMatch[1],
      repo: slugMatch[2].replace(/\.git$/, ''),
    };
  }

  return null;
}

export async function fetchRepoMetadata(
  owner: string,
  repo: string,
  pat?: string
): Promise<{
  owner: string;
  repo: string;
  defaultBranch: string;
  description: string;
  stars: number;
  isPrivate: boolean;
}> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (pat && pat.trim()) {
    headers.Authorization = `Bearer ${pat.trim()}`;
  }

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Repository "${owner}/${repo}" was not found or is private.`);
    }
    if (res.status === 403) {
      const rateLimitReset = res.headers.get('x-ratelimit-reset');
      let msg = 'GitHub API rate limit exceeded.';
      if (rateLimitReset) {
        const resetDate = new Date(parseInt(rateLimitReset, 10) * 1000);
        msg += ` Resets at ${resetDate.toLocaleTimeString()}.`;
      }
      msg += ' Please configure a GitHub Personal Access Token in Settings.';
      throw new Error(msg);
    }
    throw new Error(`GitHub API error (${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  return {
    owner: data.owner?.login || owner,
    repo: data.name || repo,
    defaultBranch: data.default_branch || 'main',
    description: data.description || 'No description provided.',
    stars: data.stargazers_count || 0,
    isPrivate: !!data.private,
  };
}

export async function fetchRepoBranches(
  owner: string,
  repo: string,
  pat?: string
): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (pat && pat.trim()) {
    headers.Authorization = `Bearer ${pat.trim()}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/branches?per_page=30`,
      { headers }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data.map((b: { name: string }) => b.name) : [];
  } catch {
    return [];
  }
}

export async function fetchRepoTree(
  owner: string,
  repo: string,
  branch: string,
  pat?: string
): Promise<{ sha: string; tree: GitTreeItem[] }> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (pat && pat.trim()) {
    headers.Authorization = `Bearer ${pat.trim()}`;
  }

  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers }
  );

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error(`Branch or commit "${branch}" not found in ${owner}/${repo}.`);
    }
    if (res.status === 403) {
      throw new Error(
        'GitHub API rate limit exceeded on tree query. Configure a GitHub Personal Access Token in Settings to bypass rate limits.'
      );
    }
    throw new Error(`Failed to fetch git tree (${res.status}): ${res.statusText}`);
  }

  const data = await res.json();
  return {
    sha: data.sha || 'HEAD',
    tree: (data.tree || []) as GitTreeItem[],
  };
}

export function shouldIncludeFile(
  path: string,
  size?: number,
  customExcludes?: string[]
): boolean {
  const lowerPath = path.toLowerCase();

  // 1. Check directory prefixes
  for (const dir of DEFAULT_IGNORED_DIRS) {
    if (lowerPath.startsWith(dir) || lowerPath.includes('/' + dir)) {
      return false;
    }
  }

  // 2. Check lockfiles
  const fileName = lowerPath.split('/').pop() || '';
  if (DEFAULT_IGNORED_FILES.includes(fileName)) {
    return false;
  }

  // 3. Check binary & media extensions
  for (const ext of BINARY_EXTENSIONS) {
    if (fileName.endsWith(ext)) {
      return false;
    }
  }

  // 4. Check file size (> 250KB individual file limit to prevent token blowup)
  if (size && size > 250 * 1024) {
    return false;
  }

  // 5. Check custom user exclusion patterns
  if (customExcludes && customExcludes.length > 0) {
    for (const pattern of customExcludes) {
      const cleanPattern = pattern.trim().toLowerCase();
      if (!cleanPattern) continue;
      if (cleanPattern.endsWith('/')) {
        if (lowerPath.startsWith(cleanPattern) || lowerPath.includes('/' + cleanPattern)) {
          return false;
        }
      } else if (cleanPattern.startsWith('*.')) {
        const ext = cleanPattern.slice(1);
        if (fileName.endsWith(ext)) return false;
      } else {
        if (lowerPath.includes(cleanPattern)) return false;
      }
    }
  }

  return true;
}

export async function downloadSourceFiles(
  owner: string,
  repo: string,
  branch: string,
  filesToDownload: Array<{ path: string; mode?: string; type?: string; sha?: string; size?: number; url?: string }>,
  pat: string | undefined,
  onProgress?: (loaded: number, total: number) => void
): Promise<SourceFile[]> {
  const results: SourceFile[] = [];
  const total = filesToDownload.length;
  let completed = 0;
  const batchSize = 15;

  for (let i = 0; i < total; i += batchSize) {
    const chunk = filesToDownload.slice(i, i + batchSize);

    const chunkResults = await Promise.all(
      chunk.map(async (item) => {
        try {
          let content = '';

          if (!pat || !pat.trim()) {
            // Public Repo: 100% CORS-safe raw GitHub URL
            // Encode URI components per path segment
            const encodedPath = item.path
              .split('/')
              .map(encodeURIComponent)
              .join('/');
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
            const res = await fetch(url);
            if (res.ok) {
              content = await res.text();
            } else {
              content = `// [Error loading content: HTTP ${res.status}]`;
            }
          } else {
            // Private Repo or With PAT: Use GitHub Contents API with raw accept header
            const encodedPath = item.path
              .split('/')
              .map(encodeURIComponent)
              .join('/');
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
            const res = await fetch(url, {
              headers: {
                Accept: 'application/vnd.github.v3.raw',
                Authorization: `Bearer ${pat.trim()}`,
              },
            });
            if (res.ok) {
              content = await res.text();
            } else {
              content = `// [Error loading content: HTTP ${res.status}]`;
            }
          }

          return {
            path: item.path,
            content,
            size: content.length,
          };
        } catch (err) {
          return {
            path: item.path,
            content: `// [Error reading file: ${err instanceof Error ? err.message : String(err)}]`,
            size: 0,
          };
        }
      })
    );

    results.push(...chunkResults);
    completed += chunk.length;
    if (onProgress) {
      onProgress(Math.min(completed, total), total);
    }
  }

  return results;
}

export function assembleRepositoryContextPayload(
  allTreePaths: string[],
  files: SourceFile[],
  owner: string,
  repo: string,
  branch: string,
  commitSha: string
): { payload: string; charCount: number; estimatedTokens: number; treeListing: string } {
  // 1. Build Directory Tree formatted as @[/path/to/file]
  const treeLines = allTreePaths
    .map((p) => `@[/${p.replace(/^\//, '')}]`)
    .sort();
  const treeListing = treeLines.join('\n');

  // 2. Assemble Context Text
  let payload = `### REPOSITORY ARCHITECTURE SNAPSHOT
Target Repository: ${owner}/${repo}
Branch: ${branch}
Commit SHA: ${commitSha}
Total Files Ingested: ${files.length}

=== DIRECTORY TREE ===
${treeListing}
=== END DIRECTORY TREE ===

=== REPOSITORY SOURCE CODE ===\n`;

  for (const file of files) {
    const formattedPath = `@[/${file.path.replace(/^\//, '')}]`;
    payload += `\n--- START FILE: ${formattedPath} ---\n`;
    payload += file.content;
    payload += `\n--- END FILE: ${formattedPath} ---\n`;
  }

  payload += '\n=== END REPOSITORY SOURCE CODE ===\n';

  const charCount = payload.length;
  const estimatedTokens = Math.ceil(charCount / 4);

  return {
    payload,
    charCount,
    estimatedTokens,
    treeListing,
  };
}

export function normalizeRepoPath(filePath: string): string {
  if (!filePath) return '';
  return filePath
    .trim()
    .replace(/^["'`]|["'`]$/g, '') // remove surrounding quotes
    .replace(/^@\[?/, '')           // remove leading @ or @[
    .replace(/\]$/, '')             // remove trailing ]
    .replace(/^\.?\/+/, '')         // remove leading ./ or /
    .trim();
}

export async function fetchSingleFileContent(
  owner: string,
  repo: string,
  branch: string,
  filePath: string,
  pat?: string
): Promise<SourceFile> {
  const cleanPath = normalizeRepoPath(filePath);
  const encodedPath = cleanPath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  try {
    if (!pat || !pat.trim()) {
      const url = `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${encodedPath}`;
      const res = await fetch(url);
      if (!res.ok) {
        return {
          path: cleanPath,
          content: `// [Could not fetch file: HTTP ${res.status}]`,
          size: 0,
        };
      }
      const text = await res.text();
      return {
        path: cleanPath,
        content: text,
        size: text.length,
      };
    } else {
      const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, {
        headers: {
          Accept: 'application/vnd.github.v3.raw',
          Authorization: `Bearer ${pat.trim()}`,
        },
      });
      if (!res.ok) {
        return {
          path: cleanPath,
          content: `// [Could not fetch file: HTTP ${res.status}]`,
          size: 0,
        };
      }
      const text = await res.text();
      return {
        path: cleanPath,
        content: text,
        size: text.length,
      };
    }
  } catch (err) {
    return {
      path: cleanPath,
      content: `// [Error reading file: ${err instanceof Error ? err.message : String(err)}]`,
      size: 0,
    };
  }
}

export async function fetchFilesOnDemand(
  owner: string,
  repo: string,
  branch: string,
  filePaths: string[],
  pat?: string
): Promise<SourceFile[]> {
  const uniquePaths = Array.from(new Set(filePaths.map((p) => p.replace(/^\.?\//, ''))));
  const results = await Promise.all(
    uniquePaths.map((p) => fetchSingleFileContent(owner, repo, branch, p, pat))
  );
  return results;
}

export async function fetchRepoDelta(
  owner: string,
  repo: string,
  lastSha: string,
  currentSha: string,
  pat?: string
): Promise<{ modifiedFiles: Array<{ path: string; status: string }>; isFastForward: boolean }> {
  if (lastSha === currentSha) {
    return { modifiedFiles: [], isFastForward: true };
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (pat && pat.trim()) {
    headers.Authorization = `Bearer ${pat.trim()}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/compare/${encodeURIComponent(lastSha)}...${encodeURIComponent(currentSha)}`,
      { headers }
    );

    if (!res.ok) {
      // If compare fails (e.g. force push, truncated history, or 404), fall back to full tree sync
      return { modifiedFiles: [], isFastForward: false };
    }

    const data = await res.json();
    const files = Array.isArray(data.files)
      ? data.files.map((f: { filename?: string; status?: string }) => ({
          path: f.filename || '',
          status: f.status || 'modified',
        })).filter((f: { path: string }) => !!f.path)
      : [];

    return {
      modifiedFiles: files,
      isFastForward: data.status === 'identical' || data.ahead_by >= 0 || data.status === 'ahead',
    };
  } catch (err) {
    console.warn('fetchRepoDelta error, falling back to full sync:', err);
    return { modifiedFiles: [], isFastForward: false };
  }
}

export function applyFileDelta(
  activeFiles: SourceFile[],
  modifiedFiles: Array<{ path: string; status: string }>,
  freshModifiedFiles: SourceFile[]
): SourceFile[] {
  const removedPaths = new Set(
    modifiedFiles.filter((f) => f.status === 'removed').map((f) => f.path)
  );
  const fileMap = new Map<string, SourceFile>(activeFiles.map((f) => [f.path, f]));
  removedPaths.forEach((p) => fileMap.delete(p));
  freshModifiedFiles.forEach((f) => fileMap.set(f.path, f));
  return Array.from(fileMap.values());
}



import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Sanitizes and formats the compiled execution prompt.
 * Strips outer enclosing code fences (e.g. ````markdown ... ````, ```markdown ... ```, or ``markdown ... ``)
 * and stray leading/trailing backticks while preserving all internal code blocks, @[/paths], and formatting.
 */
export function formatCompiledPrompt(content: string): string {
  if (!content) return '';
  let cleaned = content.trim();

  // Pattern 1: Exact outer code block with 2, 3, 4, or 5 backticks or tildes with optional markdown/md tag
  const fullBlockRegex = /^(`{2,5}|~{2,5})(?:markdown|md)?\s*[\r\n]+([\s\S]*?)[\r\n]+\s*\1\s*$/i;
  const match = cleaned.match(fullBlockRegex);
  if (match && match[2]) {
    cleaned = match[2].trim();
  } else {
    // Pattern 2: Strip leading fence (2-5 backticks/tildes with optional markdown/md tag)
    // Handles in-flight streams or mismatched backticks (e.g. 4 at start, 2 at end)
    cleaned = cleaned.replace(/^(`{2,5}|~{2,5})(?:markdown|md)?(?:\s*[\r\n]|\s+|$)/i, '');

    // Pattern 3: Strip trailing fence on its own line
    cleaned = cleaned.replace(/[\r\n]+\s*(`{2,5}|~{2,5})\s*$/i, '');

    // Pattern 4: Strip trailing stray backticks attached to or following text on the final line
    cleaned = cleaned.replace(/(?:\s+|(?<=[^\s]))(`{2,5}|~{2,5})\s*$/i, '');
  }

  return cleaned.trim();
}


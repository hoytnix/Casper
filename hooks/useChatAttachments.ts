'use client';

import { useCallback, useRef, useState } from 'react';
import type { ImageAttachment } from '@/types';
import {
  MAX_IMAGES_PER_MESSAGE,
  chatImagesSchema,
  clipboardItemsToFiles,
  fileToImageAttachment,
} from '@/lib/image-attachments';

// Image attachment management, extracted verbatim from ChatCompiler:
// capped ingest with Zod validation, clipboard-paste interception,
// preview removal, and submit-time reset. The textarea value never holds
// base64; the copy path stays text-only at the call site.
export function useChatAttachments() {
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ingestImageFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setImageError(null);
    const room = MAX_IMAGES_PER_MESSAGE - attachments.length;
    if (room <= 0) {
      setImageError(`Limit ${MAX_IMAGES_PER_MESSAGE} images per message — remove one first.`);
      return;
    }
    const accepted = files.slice(0, room);
    if (files.length > room) {
      setImageError(`Only ${room} more image${room === 1 ? '' : 's'} fit (limit ${MAX_IMAGES_PER_MESSAGE} at 5MB each).`);
    }
    // Show feedback synchronously, then yield one macrotask so the
    // "Attaching…" paint lands BEFORE the decode/encode work below —
    // otherwise the whole interaction (paste → thumbnails) reads as one
    // unresponsive block in INP.
    setIsProcessingImages(true);
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      for (const file of accepted) {
        try {
          const attachment = await fileToImageAttachment(file);
          setAttachments((prev) => {
            if (prev.length >= MAX_IMAGES_PER_MESSAGE) return prev;
            const checked = chatImagesSchema.safeParse([...prev, attachment]);
            if (!checked.success) {
              setImageError('Image rejected: exceeds size limits (5MB each, 7MB total).');
              return prev;
            }
            return [...prev, attachment];
          });
        } catch (err) {
          setImageError(err instanceof Error ? err.message : `Could not attach ${file.name}.`);
        }
      }
    } finally {
      setIsProcessingImages(false);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const files = clipboardItemsToFiles(e.clipboardData?.items);
    if (files.length === 0) return;
    // Image payload present: keep it out of the text, into attachments.
    e.preventDefault();
    void ingestImageFiles(files);
  };

  const handleDropItems = (items?: DataTransferItemList | null) => {
    const files = clipboardItemsToFiles(items);
    void ingestImageFiles(files);
  };

  // Stable identity: the memoized attachment preview strip depends on it,
  // so it must not change per keystroke. Functional setState + ref only.
  const handleRemoveImage = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const resetAttachments = () => {
    setAttachments([]);
    setImageError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return {
    attachments,
    dragActive,
    setDragActive,
    imageError,
    isProcessingImages,
    fileInputRef,
    ingestImageFiles,
    handlePaste,
    handleDropItems,
    handleRemoveImage,
    resetAttachments,
  };
}

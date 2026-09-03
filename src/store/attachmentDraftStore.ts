import { create } from 'zustand';
import {
  MAX_ATTACHMENTS,
  MAX_FILE_BYTES,
  MAX_IMAGE_EDGE,
  MAX_TEXT_BYTES,
  detectKind,
  extensionOf,
  formatBytes,
  unsupportedReason,
} from '@/lib/attachments/kinds';
import type { AttachmentKind } from '@/types/domain';

export interface PendingAttachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  mime: string;
  size: number;
  /** Final bytes to store and send (images may be downscaled). */
  bytes: Uint8Array;
  previewUrl: string | null;
  width: number | null;
  height: number | null;
  textContent: string | null;
  /** Extension used for the stored file. */
  ext: string;
}

export interface RejectedFile {
  name: string;
  reason: string;
}

interface DraftState {
  pending: PendingAttachment[];
  rejected: RejectedFile[];
  add: (files: FileList | File[]) => Promise<void>;
  remove: (id: string) => void;
  clear: () => void;
  dismissRejected: () => void;
}

async function downscaleImage(
  file: File,
): Promise<{ bytes: Uint8Array; mime: string; width: number; height: number; ext: string }> {
  const original = new Uint8Array(await file.arrayBuffer());
  const bitmap = await createImageBitmap(file);
  const { width, height } = bitmap;
  const keepAsIs = file.type === 'image/gif' || Math.max(width, height) <= MAX_IMAGE_EDGE;
  if (keepAsIs) {
    bitmap.close();
    return {
      bytes: original,
      mime: file.type,
      width,
      height,
      ext: extensionOf(file.name) || 'png',
    };
  }
  const scale = MAX_IMAGE_EDGE / Math.max(width, height);
  const w = Math.round(width * scale);
  const h = Math.round(height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not create a canvas to resize the image');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // PNG keeps transparency; everything else becomes JPEG.
  const mime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, mime, mime === 'image/jpeg' ? 0.85 : undefined),
  );
  if (!blob) throw new Error('Could not encode the resized image');
  return {
    bytes: new Uint8Array(await blob.arrayBuffer()),
    mime,
    width: w,
    height: h,
    ext: mime === 'image/png' ? 'png' : 'jpg',
  };
}

async function prepare(file: File): Promise<PendingAttachment> {
  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`Larger than ${formatBytes(MAX_FILE_BYTES)}.`);
  }
  const sample = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
  const kind = detectKind(file.name, file.type, sample);
  if (!kind) throw new Error(unsupportedReason(file.name, file.type));
  const id = crypto.randomUUID();

  if (kind === 'image') {
    const img = await downscaleImage(file);
    return {
      id,
      kind,
      name: file.name,
      mime: img.mime,
      size: img.bytes.byteLength,
      bytes: img.bytes,
      previewUrl: URL.createObjectURL(new Blob([img.bytes], { type: img.mime })),
      width: img.width,
      height: img.height,
      textContent: null,
      ext: img.ext,
    };
  }
  if (kind === 'text') {
    if (file.size > MAX_TEXT_BYTES) {
      throw new Error(
        `Text files are limited to ${formatBytes(MAX_TEXT_BYTES)} to protect the context window.`,
      );
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    return {
      id,
      kind,
      name: file.name,
      mime: file.type || 'text/plain',
      size: bytes.byteLength,
      bytes,
      previewUrl: null,
      width: null,
      height: null,
      textContent: new TextDecoder().decode(bytes),
      ext: extensionOf(file.name) || 'txt',
    };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  return {
    id,
    kind: 'pdf',
    name: file.name,
    mime: 'application/pdf',
    size: bytes.byteLength,
    bytes,
    previewUrl: null,
    width: null,
    height: null,
    textContent: null,
    ext: 'pdf',
  };
}

export const useAttachmentDraft = create<DraftState>((set, get) => ({
  pending: [],
  rejected: [],

  add: async (files) => {
    const list = Array.from(files);
    const rejected: RejectedFile[] = [];
    const accepted: PendingAttachment[] = [];
    for (const f of list) {
      if (get().pending.length + accepted.length >= MAX_ATTACHMENTS) {
        rejected.push({
          name: f.name,
          reason: `At most ${MAX_ATTACHMENTS} attachments per message.`,
        });
        continue;
      }
      try {
        accepted.push(await prepare(f));
      } catch (e) {
        rejected.push({ name: f.name, reason: e instanceof Error ? e.message : String(e) });
      }
    }
    set((s) => ({ pending: [...s.pending, ...accepted], rejected: [...s.rejected, ...rejected] }));
  },

  remove: (id) => {
    const item = get().pending.find((p) => p.id === id);
    if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
    set((s) => ({ pending: s.pending.filter((p) => p.id !== id) }));
  },

  clear: () => {
    for (const p of get().pending) if (p.previewUrl) URL.revokeObjectURL(p.previewUrl);
    set({ pending: [], rejected: [] });
  },

  dismissRejected: () => set({ rejected: [] }),
}));

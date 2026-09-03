import { convertFileSrc } from '@tauri-apps/api/core';
import { appDataDir, join } from '@tauri-apps/api/path';
import { BaseDirectory, exists, mkdir, readFile, remove, writeFile } from '@tauri-apps/plugin-fs';
import type { Attachment } from '@/types/domain';

const ROOT = 'attachments';
const base = { baseDir: BaseDirectory.AppData } as const;

export function relPathFor(chatId: string, id: string, ext: string): string {
  return `${ROOT}/${chatId}/${id}${ext ? `.${ext}` : ''}`;
}

export async function writeAttachmentBytes(relPath: string, bytes: Uint8Array): Promise<void> {
  const dir = relPath.slice(0, relPath.lastIndexOf('/'));
  if (!(await exists(dir, base))) await mkdir(dir, { ...base, recursive: true });
  await writeFile(relPath, bytes, base);
}

export async function readAttachmentBytes(a: Pick<Attachment, 'relPath'>): Promise<Uint8Array> {
  return readFile(a.relPath, base);
}

export async function removeChatAttachments(chatId: string): Promise<void> {
  const dir = `${ROOT}/${chatId}`;
  if (await exists(dir, base)) await remove(dir, { ...base, recursive: true });
}

let appData: Promise<string> | null = null;

/** URL the webview can load an attachment from via the asset protocol. */
export async function attachmentSrc(relPath: string): Promise<string> {
  appData ??= appDataDir();
  return convertFileSrc(await join(await appData, relPath));
}

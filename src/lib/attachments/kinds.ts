import type { AttachmentKind } from '@/types/domain';

export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_TEXT_BYTES = 200 * 1024;
export const MAX_ATTACHMENTS = 10;
/** Longest edge for downscaled images. */
export const MAX_IMAGE_EDGE = 1568;

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'toml',
  'ini',
  'cfg',
  'env',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'svg',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'py',
  'rb',
  'rs',
  'go',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cc',
  'cs',
  'php',
  'sh',
  'zsh',
  'bash',
  'fish',
  'sql',
  'graphql',
  'gql',
  'proto',
  'dockerfile',
  'makefile',
  'log',
  'tex',
  'r',
  'lua',
  'dart',
  'scala',
  'ex',
  'exs',
  'erl',
  'hs',
  'vue',
  'svelte',
  'astro',
  'prisma',
  'gitignore',
  'editorconfig',
  'lock',
]);

export function extensionOf(name: string): string {
  const base = name.split('/').pop() ?? name;
  const i = base.lastIndexOf('.');
  if (i <= 0) return base.toLowerCase(); // Dockerfile, Makefile
  return base.slice(i + 1).toLowerCase();
}

/** Language hint for fenced code blocks. */
export function languageOf(name: string): string {
  const ext = extensionOf(name);
  const map: Record<string, string> = {
    md: 'markdown',
    markdown: 'markdown',
    yml: 'yaml',
    mjs: 'javascript',
    cjs: 'javascript',
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    kt: 'kotlin',
    sh: 'bash',
    zsh: 'bash',
    hpp: 'cpp',
    cc: 'cpp',
    cs: 'csharp',
    gql: 'graphql',
    txt: 'text',
    log: 'text',
    csv: 'csv',
    tsv: 'csv',
    jsonl: 'json',
    dockerfile: 'dockerfile',
    makefile: 'makefile',
  };
  return map[ext] ?? ext;
}

/** True when the sample decodes as UTF-8 without control characters (other than whitespace). */
export function looksLikeText(sample: Uint8Array): boolean {
  if (sample.length === 0) return true;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(sample);
    let control = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 32 && c !== 9 && c !== 10 && c !== 13) control++;
    }
    return control / text.length < 0.01;
  } catch {
    return false;
  }
}

/**
 * Classifies a file. macOS reports an empty MIME for many code files, so extension and a
 * content sniff are fallbacks. Returns null for unsupported types.
 */
export function detectKind(name: string, mime: string, sample?: Uint8Array): AttachmentKind | null {
  const m = mime.toLowerCase();
  if (IMAGE_MIMES.has(m)) return 'image';
  if (m === 'application/pdf' || extensionOf(name) === 'pdf') return 'pdf';
  if (m.startsWith('text/')) return 'text';
  if (m === 'application/json' || m === 'application/xml' || m === 'application/x-yaml')
    return 'text';
  if (m.startsWith('image/')) return null; // heic, tiff, bmp: not reliably decodable or accepted
  if (TEXT_EXTENSIONS.has(extensionOf(name))) return 'text';
  if (sample && looksLikeText(sample)) return 'text';
  return null;
}

export function unsupportedReason(name: string, mime: string): string {
  const ext = extensionOf(name);
  if (mime.startsWith('image/') || ['heic', 'heif', 'tiff', 'bmp'].includes(ext)) {
    return 'Only PNG, JPEG, WebP and GIF images are supported. Convert this image first.';
  }
  if (['docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt'].includes(ext)) {
    return 'Office documents are not supported yet. Export to PDF or plain text.';
  }
  if (mime.startsWith('audio/') || mime.startsWith('video/')) {
    return 'Audio and video are not supported yet.';
  }
  return 'Unsupported file type.';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

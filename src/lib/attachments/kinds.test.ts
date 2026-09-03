import { detectKind, extensionOf, formatBytes, languageOf, looksLikeText } from './kinds';

const enc = (s: string) => new TextEncoder().encode(s);

describe('detectKind', () => {
  it('uses mime first', () => {
    expect(detectKind('a.bin', 'image/png')).toBe('image');
    expect(detectKind('a', 'application/pdf')).toBe('pdf');
    expect(detectKind('a', 'text/plain')).toBe('text');
    expect(detectKind('a', 'application/json')).toBe('text');
  });
  it('falls back to extension when mime is empty (macOS code files)', () => {
    expect(detectKind('index.ts', '')).toBe('text');
    expect(detectKind('Dockerfile', '')).toBe('text');
    expect(detectKind('doc.pdf', '')).toBe('pdf');
  });
  it('sniffs unknown extensions', () => {
    expect(detectKind('notes.weird', '', enc('hello\nworld'))).toBe('text');
    expect(detectKind('blob.weird', '', new Uint8Array([0, 1, 2, 255, 254, 0, 0, 3]))).toBeNull();
  });
  it('rejects unsupported images and office docs', () => {
    expect(detectKind('photo.heic', 'image/heic')).toBeNull();
    expect(
      detectKind(
        'report.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toBeNull();
  });
});

describe('helpers', () => {
  it('extension and language', () => {
    expect(extensionOf('a/b/c.test.TS')).toBe('ts');
    expect(extensionOf('Makefile')).toBe('makefile');
    expect(languageOf('x.py')).toBe('python');
    expect(languageOf('x.unknownext')).toBe('unknownext');
  });
  it('looksLikeText', () => {
    expect(looksLikeText(enc('plain text\twith tabs\n'))).toBe(true);
    expect(looksLikeText(new Uint8Array([0xff, 0xfe, 0x00, 0x00]))).toBe(false);
  });
  it('formatBytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB');
  });
});

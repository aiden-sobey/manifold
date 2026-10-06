export function audioFormat(mime: string): string | null {
  const type = mime.split(';', 1)[0]?.toLowerCase();
  if (type === 'audio/webm') return 'webm';
  if (type === 'audio/mp4') return 'm4a';
  if (type === 'audio/ogg') return 'ogg';
  if (type === 'audio/wav' || type === 'audio/x-wav') return 'wav';
  if (type === 'audio/mpeg') return 'mp3';
  return null;
}

export function appendTranscript(draft: string, transcript: string): string {
  const text = transcript.trim();
  if (!text) return draft;
  return `${draft}${draft.trim() ? '\n' : ''}${text}`;
}

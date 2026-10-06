import { appendTranscript, audioFormat } from './transcription';

describe('audioFormat', () => {
  it('maps supported recorder MIME types to upload formats', () => {
    expect(audioFormat('audio/webm;codecs=opus')).toBe('webm');
    expect(audioFormat('audio/mp4')).toBe('m4a');
    expect(audioFormat('audio/ogg; codecs=opus')).toBe('ogg');
    expect(audioFormat('audio/unsupported')).toBeNull();
  });
});

describe('appendTranscript', () => {
  it('appends to the current draft without destroying existing text', () => {
    expect(appendTranscript('Keep this', '  recognized words  ')).toBe(
      'Keep this\nrecognized words',
    );
    expect(appendTranscript('', 'words')).toBe('words');
    expect(appendTranscript('draft', '  ')).toBe('draft');
  });
});

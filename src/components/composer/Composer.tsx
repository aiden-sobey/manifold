import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowUp, Loader2, Mic, Paperclip, Square, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAttachmentDraft } from '@/store/attachmentDraftStore';
import { useModels } from '@/store/modelStore';
import { supportIssues } from '@/lib/attachments/support';
import { getApiKey } from '@/lib/keychain';
import { insertSystemUsage } from '@/lib/db';
import { transcribeAudio } from '@/lib/openrouter/client';
import { supportsTools } from '@/lib/openrouter/webTools';
import { appendTranscript, audioFormat } from '@/lib/transcription';
import { shortName } from '@/lib/modelName';
import { isAndroid, isMobile } from '@/lib/platform';
import { AttachmentChips } from './AttachmentChips';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useChat } from '@/store/chatStore';
import { useSettings } from '@/store/settingsStore';
import { ModelPicker } from './ModelPicker';
import { ThinkingLevel } from './ThinkingLevel';
import { WebToggle } from './WebToggle';

export function Composer({ onOpenSettings }: { onOpenSettings: () => void }) {
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>([]);
  const streaming = useChat((s) => s.streaming);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const activeChatId = useChat((s) => s.activeChatId);
  const sendKey = useSettings((s) => s.settings.sendKey);
  const transcriptionModelId = useSettings((s) => s.settings.transcriptionModelId);
  const ref = useRef<HTMLTextAreaElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRecordingRef = useRef(false);
  const recordingChatRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const voiceRunRef = useRef(0);
  const mountedRef = useRef(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useAttachmentDraft((s) => s.pending);
  const rejected = useAttachmentDraft((s) => s.rejected);
  const addFiles = useAttachmentDraft((s) => s.add);
  const removeFile = useAttachmentDraft((s) => s.remove);
  const clearFiles = useAttachmentDraft((s) => s.clear);
  const dismissRejected = useAttachmentDraft((s) => s.dismissRejected);
  const modelId = useChat((s) => s.draftModelId);
  const draftMode = useChat((s) => s.draftMode);
  const draftLanes = useChat((s) => s.draftLanes);
  const byId = useModels((s) => s.byId);
  const compare = draftMode === 'compare';
  // Gate against every lane's model; the first blocking issue names its lane.
  const laneModelIds = compare ? draftLanes.map((l) => l.modelId) : [modelId];
  const issues = laneModelIds.flatMap((id, i) => {
    const m = byId.get(id);
    const name = m ? shortName(m.name) : id;
    return supportIssues(
      pending.map((p) => p.kind),
      m,
      compare ? `${name} (lane ${i + 1})` : name,
    );
  });
  const blocked = issues.some((i) => i.level === 'block');
  const webCapable = laneModelIds.some((id) => supportsTools(byId.get(id)));

  useEffect(() => {
    if (rejected.length === 0) return;
    for (const r of rejected) toast.error(`${r.name}: ${r.reason}`);
    dismissRejected();
  }, [rejected, dismissRejected]);

  useEffect(() => {
    // Opening or creating a chat must not summon the Android IME. Mobile users can tap the
    // composer explicitly; desktop keeps its existing autofocus workflow.
    if (!isAndroid) ref.current?.focus();
  }, [activeChatId]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, isMobile ? 48 : 72), 280)}px`;
  }, [text]);

  const releaseRecorder = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    levelTimerRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close().catch(() => {});
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  const cancelVoice = useCallback(() => {
    ++voiceRunRef.current;
    discardRecordingRef.current = true;
    abortRef.current?.abort();
    abortRef.current = null;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
    releaseRecorder();
    if (mountedRef.current) {
      setRecording(false);
      setTranscribing(false);
      setAudioLevels([]);
    }
  }, [releaseRecorder]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cancelVoice();
    };
  }, [cancelVoice]);

  useEffect(() => {
    if ((recording || transcribing) && activeChatId !== recordingChatRef.current) {
      cancelVoice();
    }
  }, [activeChatId, cancelVoice, recording, transcribing]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current?.state === 'recording') {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      recorderRef.current.stop();
    }
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      toast.error('Audio recording is not supported on this device.');
      return;
    }
    const run = ++voiceRunRef.current;
    const recordingChatId = useChat.getState().activeChatId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (
        run !== voiceRunRef.current ||
        !mountedRef.current ||
        useChat.getState().activeChatId !== recordingChatId
      ) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      chunksRef.current = [];
      discardRecordingRef.current = false;
      recordingChatRef.current = recordingChatId;
      setAudioLevels(Array(24).fill(0.08));
      try {
        const context = new AudioContext();
        const analyser = context.createAnalyser();
        analyser.fftSize = 256;
        context.createMediaStreamSource(stream).connect(analyser);
        audioContextRef.current = context;
        const samples = new Uint8Array(analyser.fftSize);
        levelTimerRef.current = setInterval(() => {
          analyser.getByteTimeDomainData(samples);
          const rms =
            Math.sqrt(
              samples.reduce((sum, sample) => sum + (sample - 128) ** 2, 0) / samples.length,
            ) / 128;
          setAudioLevels((levels) => [...levels.slice(1), Math.min(1, Math.max(0.08, rms * 5))]);
        }, 80);
      } catch {
        // Recording still works on devices without Web Audio; the level display stays minimal.
      }
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus'].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunksRef.current.push(event.data);
      };
      recorder.onerror = () => {
        toast.error('Recording failed. Please try again.');
        cancelVoice();
      };
      recorder.onstop = () => {
        const chunks = chunksRef.current;
        chunksRef.current = [];
        releaseRecorder();
        setRecording(false);
        setAudioLevels([]);
        if (!mountedRef.current || discardRecordingRef.current) return;
        const audio = new Blob(chunks, { type: recorder.mimeType || chunks[0]?.type });
        const format = audioFormat(audio.type);
        if (!format) {
          toast.error(`Unsupported recording format: ${audio.type || 'unknown'}`);
          return;
        }
        if (audio.size === 0) {
          toast.error('No audio was recorded.');
          return;
        }
        if (audio.size > 18 * 1024 * 1024) {
          toast.error('Recording is too large. Please record a shorter clip.');
          return;
        }
        if (useChat.getState().activeChatId !== recordingChatRef.current) return;
        void (async () => {
          const controller = new AbortController();
          abortRef.current = controller;
          setTranscribing(true);
          try {
            const apiKey = await getApiKey();
            if (!apiKey) throw new Error('Add your OpenRouter API key in Settings first.');
            const result = await transcribeAudio(
              apiKey,
              transcriptionModelId,
              audio,
              format,
              controller.signal,
            );
            if (run !== voiceRunRef.current || !mountedRef.current) return;
            if (!result.text.trim()) {
              toast.error('OpenRouter returned an empty transcript.');
              return;
            }
            if (useChat.getState().activeChatId !== recordingChatRef.current) return;
            setText((draft) => {
              return appendTranscript(draft, result.text);
            });
            void insertSystemUsage({
              purpose: 'transcription',
              modelId: result.modelId,
              usage: result.usage,
            }).catch(() => toast.error('Transcript added, but its usage could not be saved.'));
          } catch (e) {
            if (controller.signal.aborted || run !== voiceRunRef.current) return;
            toast.error(e instanceof Error ? e.message : String(e));
          } finally {
            if (run === voiceRunRef.current && mountedRef.current) setTranscribing(false);
            if (abortRef.current === controller) abortRef.current = null;
          }
        })();
      };
      recorder.start(1000);
      setRecording(true);
      timeoutRef.current = setTimeout(stopRecording, 5 * 60 * 1000);
    } catch (e) {
      if (run !== voiceRunRef.current) return;
      ++voiceRunRef.current;
      releaseRecorder();
      toast.error(e instanceof Error ? e.message : 'Microphone permission was denied.');
    }
  };

  const canSend = (text.trim().length > 0 || pending.length > 0) && !blocked;

  const submit = () => {
    if (!canSend || streaming) return;
    const t = text;
    const files = pending;
    if (isAndroid) ref.current?.blur();
    setText('');
    clearFiles();
    void send(t, files);
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length === 0) return;
    e.preventDefault();
    void addFiles(files);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Phone keyboards: Enter always inserts a newline; the arrow button sends.
    if (isMobile || e.key !== 'Enter') return;
    const mod = e.metaKey || e.ctrlKey;
    if (sendKey === 'enter' && !e.shiftKey && !mod) {
      e.preventDefault();
      submit();
    } else if (sendKey === 'mod-enter' && mod) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 px-2 pb-2 md:px-4 md:pb-4">
      <div className="bg-card border-border focus-within:ring-ring/30 mx-auto w-full max-w-3xl rounded-2xl border shadow-sm focus-within:ring-2">
        <AttachmentChips items={pending} issues={issues} onRemove={removeFile} />
        <Textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder="Message…"
          rows={1}
          className="max-h-[280px] min-h-[48px] resize-none rounded-none border-0 bg-transparent px-4 pt-3.5 pb-1 text-[15px] shadow-none focus-visible:ring-0 md:min-h-[72px] dark:bg-transparent"
        />
        <div className="flex items-center gap-1 px-2.5 py-2.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            // Android maps this list to MIME types and drops bare extensions, which would hide
            // most code files in the picker; detectKind() sniffs content anyway.
            accept={
              isMobile
                ? '*/*'
                : 'image/png,image/jpeg,image/webp,image/gif,application/pdf,text/*,.md,.json,.csv,.ts,.tsx,.js,.py,.rs,.go,.java,.yaml,.yml,.toml,.xml,.html,.css,.sql,.sh'
            }
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files);
              e.target.value = '';
            }}
          />
          {compare ? (
            <span className="text-muted-foreground px-2 text-xs">Sent to both models</span>
          ) : (
            <>
              <ModelPicker onOpenSettings={onOpenSettings} />
              <ThinkingLevel />
            </>
          )}
          {webCapable ? <WebToggle /> : null}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {recording ? (
              <span role="status" aria-label="Recording" className="inline-flex items-center">
                <span className="flex h-5 items-center gap-0.5" aria-hidden="true">
                  {audioLevels.map((level, index) => (
                    <span
                      key={index}
                      className="bg-destructive w-0.5 rounded-full transition-[height] duration-75"
                      style={{ height: `${Math.max(3, level * 20)}px` }}
                    />
                  ))}
                </span>
              </span>
            ) : transcribing ? (
              <span
                className="text-muted-foreground inline-flex items-center gap-1 text-xs"
                role="status"
              >
                <Loader2 className="size-3 animate-spin" /> Transcribing…
              </span>
            ) : null}
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-muted-foreground"
              aria-label="Attach files"
              title="Attach files"
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            {recording ? (
              <Button
                size="icon-sm"
                variant="destructive"
                onClick={stopRecording}
                aria-label="Stop recording"
                title="Stop recording"
              >
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : transcribing ? (
              <Button
                size="icon-sm"
                variant="secondary"
                onClick={cancelVoice}
                aria-label="Cancel transcription"
                title="Cancel transcription"
              >
                <X className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={() => void startRecording()}
                aria-label="Record voice message"
                title="Record voice message"
                disabled={streaming}
              >
                <Mic className="size-4" />
              </Button>
            )}
            {streaming ? (
              <Button size="icon-sm" variant="secondary" onClick={stop} aria-label="Stop">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={submit}
                disabled={!canSend || recording || transcribing}
                aria-label="Send"
                title={blocked ? issues.find((i) => i.level === 'block')?.message : undefined}
              >
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

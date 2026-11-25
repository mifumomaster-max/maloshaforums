import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Pause, Play, Send, Trash2 } from 'lucide-react';
import { uploadAudioToCloudinary } from '../services/cloudinaryService';
import { useLanguage } from '../context/LanguageContext';

export function formatAudioSeconds(sec?: number): string {
  const s = Math.max(0, Math.floor(sec || 0));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${String(rem).padStart(2, '0')}`;
}

interface VoiceNoteBubbleProps {
  url: string;
  durationSec?: number;
  isOwn: boolean;
}

const WAVE_BARS = [35, 65, 50, 85, 45, 95, 70, 55, 80, 40, 75, 90, 60, 45, 85, 55, 70, 40];

export const VoiceNoteBubble: React.FC<VoiceNoteBubbleProps> = ({
  url,
  durationSec = 0,
  isOwn,
}) => {
  const { tr } = useLanguage();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [totalSec, setTotalSec] = useState(durationSec);

  useEffect(() => {
    setTotalSec(durationSec);
  }, [durationSec]);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const togglePlay = () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      void el.play().catch(() => {
        setPlaying(false);
      });
    }
  };

  const progress = totalSec > 0 ? Math.min(1, currentSec / totalSec) : 0;

  return (
    <div
      className={`mb-1 flex min-w-[210px] max-w-[260px] items-center gap-2.5 rounded-xl px-2.5 py-2 ${
        isOwn ? 'bg-[#CBEFC5]/75' : 'bg-slate-100/90'
      }`}
    >
      <audio
        ref={audioRef}
        src={url}
        preload="metadata"
        onLoadedMetadata={() => {
          const d = audioRef.current?.duration;
          if (d && Number.isFinite(d) && d > 0) {
            setTotalSec(Math.round(d));
          }
        }}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentSec(audioRef.current.currentTime);
          }
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentSec(0);
        }}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? tr('Simamisha sauti', 'Pause voice note') : tr('Sikiliza sauti', 'Play voice note')}
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-xs transition-transform active:scale-95 ${
          isOwn ? 'bg-[#075E54] text-white' : 'bg-[#00A884] text-white'
        }`}
      >
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
      </button>

      <div className="min-w-0 flex-1">
        <div
          className="flex h-6 cursor-pointer items-center gap-[3px]"
          onClick={(e) => {
            const el = audioRef.current;
            if (!el || !totalSec) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            el.currentTime = ratio * totalSec;
            setCurrentSec(ratio * totalSec);
          }}
        >
          {WAVE_BARS.map((h, i) => {
            const filled = i / WAVE_BARS.length <= progress;
            return (
              <span
                key={i}
                style={{ height: `${h}%` }}
                className={`w-1 flex-1 rounded-full transition-colors ${
                  filled
                    ? isOwn
                      ? 'bg-[#075E54]'
                      : 'bg-[#00A884]'
                    : isOwn
                      ? 'bg-[#075E54]/30'
                      : 'bg-slate-300'
                }`}
              />
            );
          })}
        </div>
        <div className="mt-0.5 flex items-center justify-between text-[10px] font-semibold text-slate-600 tabular-nums">
          <span>{playing || currentSec > 0 ? formatAudioSeconds(currentSec) : formatAudioSeconds(totalSec)}</span>
          <span>{tr('Sauti', 'Voice')}</span>
        </div>
      </div>
    </div>
  );
};

interface VoiceRecorderControllerProps {
  disabled?: boolean;
  onVoiceReady: (payload: {
    url: string;
    durationSec: number;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }) => void;
  onError: (message: string) => void;
  onRecordingStateChange?: (recording: boolean) => void;
}

export const VoiceRecorderBar: React.FC<VoiceRecorderControllerProps> = ({
  disabled = false,
  onVoiceReady,
  onError,
  onRecordingStateChange,
}) => {
  const { tr } = useLanguage();
  const [recording, setRecording] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const cancelledRef = useRef(false);

  const stopTimerAndStream = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      try {
        if (recorderRef.current && recorderRef.current.state !== 'inactive') {
          recorderRef.current.stop();
        }
      } catch {
        // Ignore cleanup errors
      }
      stopTimerAndStream();
    };
  }, []);

  const startRecording = async () => {
    if (disabled || recording || uploadingAudio) return;
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      onError(
        tr(
          'Kivinjari hiki hakiungi mkono kurekodi sauti moja kwa moja.',
          'Your browser does not support direct voice recording.'
        )
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelledRef.current = false;

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setRecording(true);
      onRecordingStateChange?.(true);

      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          chunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stopTimerAndStream();
        setRecording(false);
        onRecordingStateChange?.(false);

        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }

        const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
        const finalMime = recorder.mimeType || mimeType || 'audio/webm';
        const ext = finalMime.includes('mp4') ? 'm4a' : finalMime.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(chunksRef.current, { type: finalMime });
        chunksRef.current = [];

        if (blob.size < 200) {
          onError(tr('Sauti ni fupi mno. Shikilia na zungumza kidogo.', 'Voice note too short.'));
          return;
        }

        const fileName = `voice_${Date.now()}.${ext}`;
        const file = new File([blob], fileName, { type: finalMime });
        setUploadingAudio(true);
        try {
          const uploaded = await uploadAudioToCloudinary(file);
          onVoiceReady({
            url: uploaded.secureUrl,
            durationSec: uploaded.durationSec > 0 ? Math.round(uploaded.durationSec) : durationSec,
            fileName,
            fileSize: blob.size,
            mimeType: finalMime,
          });
        } catch (err) {
          onError(
            err instanceof Error
              ? err.message
              : tr('Imeshindwa kutuma ujumbe wa sauti.', 'Failed to upload voice note.')
          );
        } finally {
          setUploadingAudio(false);
        }
      };

      recorder.start(250);
      timerRef.current = window.setInterval(() => {
        const secs = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsedSec(secs);
        if (secs >= 180) {
          recorder.stop();
        }
      }, 250);
    } catch {
      stopTimerAndStream();
      setRecording(false);
      onRecordingStateChange?.(false);
      onError(
        tr(
          'Ruhusu maikrofoni kwenye simu/kivinjari chako ili uweze kurekodi sauti.',
          'Allow microphone access to record voice messages.'
        )
      );
    }
  };

  const cancelRecording = () => {
    cancelledRef.current = true;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      } else {
        stopTimerAndStream();
        setRecording(false);
        onRecordingStateChange?.(false);
      }
    } catch {
      stopTimerAndStream();
      setRecording(false);
      onRecordingStateChange?.(false);
    }
  };

  const finishAndSendRecording = () => {
    cancelledRef.current = false;
    try {
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.stop();
      }
    } catch {
      cancelRecording();
    }
  };

  if (uploadingAudio) {
    return (
      <div className="flex h-11 items-center gap-2 rounded-full bg-emerald-50 px-3 text-xs font-bold text-[#075E54]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        <span>{tr('Inatuma sauti...', 'Sending voice...')}</span>
      </div>
    );
  }

  if (recording) {
    return (
      <div className="flex flex-1 items-center justify-between gap-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-1.5">
        <button
          type="button"
          onClick={cancelRecording}
          aria-label={tr('Futa sauti iliyorekodiwa', 'Discard voice note')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-red-600 shadow-xs hover:bg-red-100"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 text-xs font-bold text-red-700 tabular-nums">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
          <span>{formatAudioSeconds(elapsedSec)}</span>
          <span className="hidden text-[11px] font-medium text-red-600 sm:inline">
            {tr('Inarekodi sauti...', 'Recording voice...')}
          </span>
        </div>

        <button
          type="button"
          onClick={finishAndSendRecording}
          aria-label={tr('Tuma sauti sasa', 'Send voice note')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm hover:bg-[#008F6F]"
        >
          <Send className="h-4 w-4 translate-x-[1px]" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void startRecording()}
      title={tr('Rekodi ujumbe wa sauti', 'Record voice note')}
      aria-label={tr('Rekodi ujumbe wa sauti', 'Record voice note')}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#00A884] text-white shadow-sm transition-colors hover:bg-[#008F6F] disabled:cursor-not-allowed disabled:bg-slate-300"
    >
      <Mic className="h-5 w-5" aria-hidden="true" />
    </button>
  );
};

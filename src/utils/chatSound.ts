const MCHART_SOUND_MUTED_KEY = 'malosha_mchart_sound_muted';

let sharedAudioCtx: AudioContext | null = null;
let lastPlayedAtMs = 0;
let unlockInitialized = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

export function isChatSoundMuted(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(MCHART_SOUND_MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function setChatSoundMuted(muted: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MCHART_SOUND_MUTED_KEY, muted ? '1' : '0');
  } catch {
    // Ignore storage failures
  }
}

export function initChatAudioUnlock(): void {
  if (typeof window === 'undefined' || unlockInitialized) return;
  unlockInitialized = true;

  const unlock = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { passive: true, capture: true });
  window.addEventListener('touchstart', unlock, { passive: true, capture: true });
}

export function playIncomingMessageSound(force = false): void {
  if (!force && isChatSoundMuted()) return;
  const now = Date.now();
  if (!force && now - lastPlayedAtMs < 700) return;

  const ctx = getAudioContext();
  if (!ctx) return;

  const triggerNotes = () => {
    lastPlayedAtMs = Date.now();
    const start = ctx.currentTime + 0.01;

    // Gentle two-note WhatsApp-like chime: E6 (1318.5Hz) -> B6 (1975.5Hz)
    const notes = [
      { freq: 1318.51, offset: 0, duration: 0.11, peakGain: 0.085 },
      { freq: 1975.53, offset: 0.085, duration: 0.22, peakGain: 0.095 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, start + note.offset);

      gain.gain.setValueAtTime(0.0001, start + note.offset);
      gain.gain.exponentialRampToValueAtTime(note.peakGain, start + note.offset + 0.014);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start + note.offset);
      osc.stop(start + note.offset + note.duration + 0.02);
    }
  };

  if (ctx.state === 'suspended') {
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') {
          triggerNotes();
        }
      })
      .catch(() => {});
    return;
  }

  try {
    triggerNotes();
  } catch {
    // Ignore audio scheduling errors
  }
}

const MCHART_SOUND_MUTED_KEY = 'malosha_mchart_sound_muted';

export interface ConfiguredNotificationSound {
  soundUrl: string;
  soundName: string;
}

let sharedAudioCtx: AudioContext | null = null;
let sharedCompressor: DynamicsCompressorNode | null = null;
let lastPlayedAtMs = 0;
let unlockInitialized = false;
let configuredSound: ConfiguredNotificationSound = {
  soundUrl: '',
  soundName: '',
};
let customAudioEl: HTMLAudioElement | null = null;
let customAudioSrc = '';

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!sharedAudioCtx) {
    try {
      sharedAudioCtx = new Ctx();
      sharedCompressor = sharedAudioCtx.createDynamicsCompressor();
      sharedCompressor.threshold.setValueAtTime(-14, sharedAudioCtx.currentTime);
      sharedCompressor.knee.setValueAtTime(12, sharedAudioCtx.currentTime);
      sharedCompressor.ratio.setValueAtTime(8, sharedAudioCtx.currentTime);
      sharedCompressor.attack.setValueAtTime(0.003, sharedAudioCtx.currentTime);
      sharedCompressor.release.setValueAtTime(0.15, sharedAudioCtx.currentTime);
      sharedCompressor.connect(sharedAudioCtx.destination);
    } catch {
      return null;
    }
  }
  return sharedAudioCtx;
}

function getOutputNode(ctx: AudioContext): AudioNode {
  if (sharedCompressor && sharedCompressor.context === ctx) {
    return sharedCompressor;
  }
  return ctx.destination;
}

export function setConfiguredNotificationSound(config: {
  soundUrl?: string;
  soundName?: string;
}): void {
  const cleanUrl = typeof config.soundUrl === 'string' && config.soundUrl.startsWith('https://')
    ? config.soundUrl.trim()
    : '';
  const cleanName = typeof config.soundName === 'string' ? config.soundName.trim() : '';
  configuredSound = {
    soundUrl: cleanUrl,
    soundName: cleanName,
  };

  if (typeof Audio !== 'undefined' && cleanUrl) {
    if (!customAudioEl) {
      customAudioEl = new Audio();
      customAudioEl.preload = 'auto';
      customAudioEl.volume = 1.0;
    }
    if (customAudioSrc !== cleanUrl) {
      customAudioSrc = cleanUrl;
      customAudioEl.src = cleanUrl;
      try {
        customAudioEl.load();
      } catch {
        // Ignore preload error
      }
    }
  } else if (!cleanUrl && customAudioEl) {
    try {
      customAudioEl.pause();
      customAudioEl.removeAttribute('src');
    } catch {
      // Ignore cleanup error
    }
    customAudioSrc = '';
  }
}

export function getConfiguredNotificationSound(): ConfiguredNotificationSound {
  return { ...configuredSound };
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
    if (configuredSound.soundUrl && customAudioEl && customAudioEl.readyState === 0) {
      try {
        customAudioEl.load();
      } catch {
        // Ignore
      }
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true, capture: true });
  window.addEventListener('keydown', unlock, { passive: true, capture: true });
  window.addEventListener('touchstart', unlock, { passive: true, capture: true });
}

function playLoudDefaultChime(): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const triggerNotes = () => {
    lastPlayedAtMs = Date.now();
    const start = ctx.currentTime + 0.01;
    const output = getOutputNode(ctx);

    // Clear, loud, high-presence 3-note chime audible on mobile and desktop speakers
    const notes = [
      { freq: 1174.66, offset: 0, duration: 0.14, peakGain: 0.78 },
      { freq: 1567.98, offset: 0.09, duration: 0.16, peakGain: 0.85 },
      { freq: 2093.0, offset: 0.19, duration: 0.28, peakGain: 0.92 },
    ];

    for (const note of notes) {
      const oscMain = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gainMain = ctx.createGain();
      const gainHarmonic = ctx.createGain();

      oscMain.type = 'triangle';
      oscMain.frequency.setValueAtTime(note.freq, start + note.offset);

      oscHarmonic.type = 'sine';
      oscHarmonic.frequency.setValueAtTime(note.freq * 1.5, start + note.offset);

      gainMain.gain.setValueAtTime(0.0001, start + note.offset);
      gainMain.gain.exponentialRampToValueAtTime(note.peakGain, start + note.offset + 0.014);
      gainMain.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);

      gainHarmonic.gain.setValueAtTime(0.0001, start + note.offset);
      gainHarmonic.gain.exponentialRampToValueAtTime(
        note.peakGain * 0.34,
        start + note.offset + 0.014
      );
      gainHarmonic.gain.exponentialRampToValueAtTime(0.0001, start + note.offset + note.duration);

      oscMain.connect(gainMain);
      gainMain.connect(output);

      oscHarmonic.connect(gainHarmonic);
      gainHarmonic.connect(output);

      oscMain.start(start + note.offset);
      oscMain.stop(start + note.offset + note.duration + 0.025);
      oscHarmonic.start(start + note.offset);
      oscHarmonic.stop(start + note.offset + note.duration + 0.025);
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

export function playIncomingMessageSound(force = false): void {
  if (!force && isChatSoundMuted()) return;
  const now = Date.now();
  if (!force && now - lastPlayedAtMs < 650) return;
  lastPlayedAtMs = now;

  if (configuredSound.soundUrl && typeof Audio !== 'undefined') {
    try {
      if (!customAudioEl) {
        customAudioEl = new Audio(configuredSound.soundUrl);
        customAudioEl.preload = 'auto';
        customAudioSrc = configuredSound.soundUrl;
      } else if (customAudioSrc !== configuredSound.soundUrl) {
        customAudioEl.src = configuredSound.soundUrl;
        customAudioSrc = configuredSound.soundUrl;
      }
      customAudioEl.volume = 1.0;
      customAudioEl.pause();
      customAudioEl.currentTime = 0;
      const playPromise = customAudioEl.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        void playPromise.catch(() => {
          playLoudDefaultChime();
        });
      }
      return;
    } catch {
      playLoudDefaultChime();
      return;
    }
  }

  playLoudDefaultChime();
}

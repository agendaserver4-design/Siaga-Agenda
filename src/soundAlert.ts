let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
    sharedAudioCtx = new AudioCtx();
  }
  return sharedAudioCtx;
}

export async function unlockAndTestReminderSound(): Promise<boolean> {
  return playReminderChime();
}

export async function playReminderChime(): Promise<boolean> {
  const ctx = getAudioContext();
  if (!ctx) return false;

  try {
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const now = ctx.currentTime;

    const triggerTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const start = now + startOffset;
      const oscMain = ctx.createOscillator();
      const oscHarmonic = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscMain.type = 'sine';
      oscMain.frequency.setValueAtTime(freq, start);

      oscHarmonic.type = 'triangle';
      oscHarmonic.frequency.setValueAtTime(freq * 2, start);

      const harmonicGain = ctx.createGain();
      harmonicGain.gain.setValueAtTime(0.18, start);

      gainNode.gain.setValueAtTime(0.0001, start);
      gainNode.gain.linearRampToValueAtTime(peakGain, start + 0.018);
      gainNode.gain.exponentialRampToValueAtTime(0.0008, start + duration);

      oscMain.connect(gainNode);
      oscHarmonic.connect(harmonicGain);
      harmonicGain.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscMain.start(start);
      oscHarmonic.start(start);
      oscMain.stop(start + duration + 0.03);
      oscHarmonic.stop(start + duration + 0.03);
    };

    // Harmonious two-step Ding-Dong chime (E5 -> C5, followed by soft G5 -> E5 echo)
    triggerTone(659.25, 0.0, 0.58, 0.34); // Ding (E5)
    triggerTone(523.25, 0.26, 0.82, 0.38); // Dong (C5)
    triggerTone(783.99, 0.72, 0.45, 0.22); // Soft bell accent (G5)
    triggerTone(659.25, 0.94, 0.78, 0.26); // Resolve (E5)

    return ctx.state === 'running';
  } catch {
    return false;
  }
}

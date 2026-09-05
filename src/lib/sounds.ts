// ============================================================================
// _lib/sounds.ts
// ----------------------------------------------------------------------------
// Efeitos sonoros da UI. Sintetizados via Web Audio API (sem arquivo de áudio
// externo) — toca instantaneamente, não depende de asset/licenciamento, e
// nunca deve quebrar o fluxo do usuário se o navegador bloquear autoplay.
// ============================================================================

let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  if (!sharedCtx) sharedCtx = new AudioCtx();
  // Navegadores suspendem o contexto até um gesto do usuário — como isso já
  // roda a partir de um clique/drag, resume() aqui é seguro.
  if (sharedCtx.state === 'suspended') void sharedCtx.resume();
  return sharedCtx;
}

function tone(
  audioCtx: AudioContext,
  opts: { freq: number; start: number; duration: number; gain?: number; type?: OscillatorType },
) {
  const { freq, start, duration, gain = 0.25, type = 'sine' } = opts;
  const osc = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, audioCtx.currentTime + start);
  gainNode.gain.setValueAtTime(0, audioCtx.currentTime + start);
  gainNode.gain.linearRampToValueAtTime(gain, audioCtx.currentTime + start + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + start + duration);
  osc.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  osc.start(audioCtx.currentTime + start);
  osc.stop(audioCtx.currentTime + start + duration + 0.02);
}

// "Cha-ching!" — sino duplo agudo (caixa registradora) + um arpejo curto de
// "moedas caindo". Tocado quando um negócio é marcado como ganho.
export function playWinSound() {
  try {
    const audioCtx = getAudioContext();
    if (!audioCtx) return;
    tone(audioCtx, { freq: 1568, start: 0, duration: 0.18, gain: 0.22, type: 'triangle' });
    tone(audioCtx, { freq: 2093, start: 0.09, duration: 0.28, gain: 0.22, type: 'triangle' });
    [2637, 3136, 3520].forEach((freq, i) => {
      tone(audioCtx, { freq, start: 0.2 + i * 0.045, duration: 0.12, gain: 0.12, type: 'sine' });
    });
  } catch {
    // Som é cosmético — nunca deve interromper o fluxo de marcar como ganho.
  }
}

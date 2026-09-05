// ============================================================================
// _lib/sounds.ts
// ----------------------------------------------------------------------------
// Efeitos sonoros da UI. Tocado quando um negócio é marcado como ganho: um
// clipe de "caixa registradora" (public/sounds/deal-won.mp3) — nunca deve
// quebrar o fluxo do usuário se o navegador bloquear autoplay ou o arquivo
// falhar ao carregar.
// ============================================================================

let winAudio: HTMLAudioElement | null = null;

function getWinAudio(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null;
  if (!winAudio) {
    winAudio = new Audio('/sounds/deal-won.mp3');
    winAudio.preload = 'auto';
  }
  return winAudio;
}

// Som de "ganho" — reinicia do começo a cada chamada (permite tocar de novo
// em sequência, ex.: ganhos em massa).
export function playWinSound() {
  try {
    const audio = getWinAudio();
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay bloqueado ou arquivo indisponível — silencioso, não afeta o fluxo.
    });
  } catch {
    // Som é cosmético — nunca deve interromper o fluxo de marcar como ganho.
  }
}

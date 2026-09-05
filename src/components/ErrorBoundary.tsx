// ============================================================================
// components/ErrorBoundary.tsx
// ----------------------------------------------------------------------------
// Rede de segurança contra a "tela branca": qualquer erro de render (inclusive
// falha ao carregar um chunk lazy — src/app/router.tsx usa lazy() em toda
// rota) hoje derruba a árvore inteira do React sem nenhum boundary pra pegar,
// deixando a página em branco até o usuário dar F5 manualmente. Isso acontece
// sobretudo logo após um novo deploy: uma aba aberta de antes ainda referencia
// os arquivos JS do build anterior (hash no nome), o Vercel só serve o build
// mais recente, e o import() de uma página ainda não visitada nessa aba dá
// 404 → o componente lazy rejeita a promise → React derruba sem boundary.
//
// Aqui: se o erro capturado parecer chunk-load (mensagens típicas do Vite/
// browsers), recarrega a página automaticamente (1x, com trava por
// sessionStorage pra nunca entrar em loop); para qualquer outro erro, mostra
// uma tela amigável com botão de recarregar em vez de branco.
// ============================================================================

import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_GUARD_KEY = 'crm:chunk-reload-attempted-at';
// Evita loop infinito de reload: só recarrega automaticamente se a última
// tentativa foi há mais de 10s (uma falha de rede persistente não deve
// recarregar sem parar).
const RELOAD_GUARD_WINDOW_MS = 10_000;

function isChunkLoadError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|failed to import/i.test(
    msg,
  );
}

function tryAutoReload(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_GUARD_KEY) ?? '0');
    if (Date.now() - last < RELOAD_GUARD_WINDOW_MS) return false;
    sessionStorage.setItem(RELOAD_GUARD_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary capturou um erro:', error, info.componentStack);
    if (isChunkLoadError(error) && tryAutoReload()) {
      // Recarregando — não precisa renderizar a tela de erro.
      return;
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#F3FBF6] p-6 text-center">
          <p className="text-lg font-bold text-[#0F2A1C]">Ocorreu um erro ao carregar a página.</p>
          <p className="max-w-sm text-sm text-[#5B7566]">
            Isso costuma acontecer logo depois de uma atualização do sistema. Recarregar a página resolve.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-gradient-to-br from-[#14532D] to-[#16A34A] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
          >
            Recarregar página
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

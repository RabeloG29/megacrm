import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

// Depois de um novo deploy, uma aba deixada aberta ainda referencia os
// arquivos JS (com hash) do build anterior — o Vercel só serve o build mais
// recente, então o import() de uma página lazy (src/app/router.tsx) ainda não
// visitada nessa aba dá 404. O Vite dispara este evento nesse caso específico
// (bem antes de virar um erro de render) — recarregar a página busca o
// index.html novo, que já aponta pros arquivos certos, resolvendo a "tela
// branca" sem o usuário precisar descobrir sozinho que precisa dar F5.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('#root element is missing from index.html');
}

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

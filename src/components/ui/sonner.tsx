import { Toaster as SonnerToaster } from 'sonner';

export function Toaster() {
  return (
    <SonnerToaster
      theme="dark"
      position="top-right"
      richColors
      toastOptions={{
        classNames: {
          toast:
            'glass-card !border-[rgba(22,163,74,0.25)] !bg-[rgba(255,255,255,0.85)] !text-[var(--color-text-primary)]',
          description: '!text-[var(--color-text-secondary)]',
        },
      }}
    />
  );
}

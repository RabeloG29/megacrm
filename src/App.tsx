import { BrowserRouter } from 'react-router-dom';
import { SupabaseProvider } from './app/providers/SupabaseProvider';
import { AuthProvider } from './app/providers/AuthProvider';
import { AppUserProvider } from './app/providers/AppUserProvider';
import { AppRouter } from './app/router';
import { Toaster } from './components/ui/sonner';
import { ErrorBoundary } from './components/ErrorBoundary';

export default function App() {
  return (
    <ErrorBoundary>
      <SupabaseProvider>
        <AuthProvider>
          <AppUserProvider>
            <BrowserRouter>
              <AppRouter />
              <Toaster />
            </BrowserRouter>
          </AppUserProvider>
        </AuthProvider>
      </SupabaseProvider>
    </ErrorBoundary>
  );
}

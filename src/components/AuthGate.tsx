'use client';

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signIn, signUp, resetPassword } from '@/lib/auth';
import { pullFromCloud } from '@/lib/store-cloud';
import { bindLocalDataToUser, clearSensitiveLocalData } from '@/lib/store';
import { reportError } from '@/lib/sentry';

type View = 'login' | 'register' | 'reset' | 'check-email';

const BOOT_TIMEOUT_MS = 8000;
const BOOT_ERROR_MESSAGE = 'No se pudo conectar, intenta recargar.';

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [sessionError, setSessionError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const bootWatchdog = window.setTimeout(() => {
      if (cancelled) return;
      setSessionError(BOOT_ERROR_MESSAGE);
      setUser(null);
      setLoading(false);
    }, BOOT_TIMEOUT_MS);

    const finishBoot = () => {
      window.clearTimeout(bootWatchdog);
    };

    const prepareUserSession = async (nextUser: User) => {
      const cacheWasCleared = bindLocalDataToUser(nextUser.id);
      await withTimeout(pullFromCloud({ replaceEmpty: cacheWasCleared }), BOOT_TIMEOUT_MS, BOOT_ERROR_MESSAGE);
    };

    const boot = async () => {
      try {
        const {
          data: { user },
        } = await withTimeout(supabase.auth.getUser(), BOOT_TIMEOUT_MS, BOOT_ERROR_MESSAGE);
        if (cancelled) return;
        let hasSessionWarning = false;
        if (user) {
          try {
            await prepareUserSession(user);
          } catch (e) {
            reportError(e, { kind: 'authBootstrapPullFromCloud' });
            hasSessionWarning = true;
            if (!cancelled) setSessionError(BOOT_ERROR_MESSAGE);
            // Offline or Supabase unavailable: keep the user in the app with local cache.
          }
        }
        if (!cancelled) {
          setUser(user);
          if (!hasSessionWarning) setSessionError('');
          setLoading(false);
          finishBoot();
        }
      } catch (e) {
        reportError(e, { kind: 'authBootstrapGetUser' });
        if (!cancelled) {
          setUser(null);
          setSessionError(BOOT_ERROR_MESSAGE);
          setLoading(false);
          finishBoot();
        }
      }
    };

    void boot();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session?.user ?? null;
      setSessionError('');
      if (!nextUser) {
        clearSensitiveLocalData();
        setUser(null);
        setLoading(false);
        finishBoot();
        return;
      }
      if (_event === 'SIGNED_IN' || _event === 'TOKEN_REFRESHED' || _event === 'INITIAL_SESSION') {
        setLoading(true);
        try {
          await prepareUserSession(nextUser);
        } catch (e) {
          reportError(e, { kind: 'authStatePullFromCloud', event: _event });
          setSessionError(BOOT_ERROR_MESSAGE);
          // Offline or Supabase unavailable: keep the user in the app with local cache.
        }
      }
      if (cancelled) return;
      setUser(nextUser);
      setLoading(false);
      finishBoot();
    });

    return () => {
      cancelled = true;
      finishBoot();
      subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa] px-4">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-neutral-400">Conectando con Studio 24...</p>
        </div>
      </div>
    );
  }

  if (user) return <>{children}</>;

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('Ingresa email y contraseña');
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al iniciar sesión');
    }
    setSubmitting(false);
  };

  const handleRegister = async () => {
    setError('');
    if (!email || !password) {
      setError('Ingresa email y contraseña');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }
    setSubmitting(true);
    try {
      await signUp(email, password);
      setView('check-email');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al registrarse');
    }
    setSubmitting(false);
  };

  const handleReset = async () => {
    setError('');
    if (!email) {
      setError('Ingresa tu email');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword(email);
      setView('check-email');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar email');
    }
    setSubmitting(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (view === 'login') handleLogin();
      if (view === 'register') handleRegister();
      if (view === 'reset') handleReset();
    }
  };

  const inputClass =
    'w-full border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors';

  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] px-4">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Logo */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-0 mb-4">
            <span className="text-[24px] font-black tracking-[-0.03em] text-[#0a0a0a] lowercase">studio</span>
            <span className="h-[1.5px] bg-[#0a0a0a] mx-2 w-8" />
            <span className="text-[24px] font-black tracking-[-0.03em] text-[#0a0a0a]">24</span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            {view === 'login' && 'Inicia sesión para acceder'}
            {view === 'register' && 'Crea tu cuenta'}
            {view === 'reset' && 'Recupera tu contraseña'}
            {view === 'check-email' && 'Revisa tu correo'}
          </p>
        </div>

        {sessionError && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-3 text-xs font-semibold text-red-600">
            <p>{sessionError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 text-[10px] font-bold uppercase tracking-[0.08em] text-red-700 hover:underline"
            >
              Recargar
            </button>
          </div>
        )}

        {view === 'check-email' ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xl mx-auto mb-3">
              ✓
            </div>
            <p className="text-sm text-neutral-600 mb-4">
              Te enviamos un email a <strong>{email}</strong>. Revisa tu bandeja de entrada.
            </p>
            <button
              onClick={() => {
                setView('login');
                setError('');
              }}
              className="text-xs text-[#c72a09] font-bold hover:underline"
            >
              Volver al login
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3" onKeyDown={handleKeyDown}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoComplete="email"
                className={inputClass}
              />
              {view !== 'reset' && (
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Contraseña"
                  autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                  className={inputClass}
                />
              )}
              {view === 'register' && (
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmar contraseña"
                  autoComplete="new-password"
                  className={inputClass}
                />
              )}
            </div>

            {error && (
              <p className="text-xs text-red-500 font-semibold bg-red-50 rounded-xl px-3.5 py-2.5 mt-3">{error}</p>
            )}

            <button
              onClick={view === 'login' ? handleLogin : view === 'register' ? handleRegister : handleReset}
              disabled={submitting}
              className="w-full bg-[#c72a09] text-white py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors mt-4 disabled:opacity-50"
            >
              {submitting
                ? 'Cargando...'
                : view === 'login'
                  ? 'Iniciar Sesión'
                  : view === 'register'
                    ? 'Crear Cuenta'
                    : 'Enviar Email'}
            </button>

            <div className="text-center mt-4 space-y-2">
              {view === 'login' && (
                <>
                  <button
                    onClick={() => {
                      setView('register');
                      setError('');
                    }}
                    className="text-xs text-neutral-400 hover:text-[#c72a09] transition-colors block w-full"
                  >
                    ¿No tienes cuenta? <span className="font-bold">Regístrate</span>
                  </button>
                  <button
                    onClick={() => {
                      setView('reset');
                      setError('');
                    }}
                    className="text-xs text-neutral-400 hover:text-neutral-600 transition-colors block w-full"
                  >
                    ¿Olvidaste tu contraseña?
                  </button>
                </>
              )}
              {(view === 'register' || view === 'reset') && (
                <button
                  onClick={() => {
                    setView('login');
                    setError('');
                  }}
                  className="text-xs text-neutral-400 hover:text-[#c72a09] transition-colors"
                >
                  Volver al login
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

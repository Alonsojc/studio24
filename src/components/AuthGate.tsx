'use client';

import { useState, useEffect } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { signIn, signUp, resetPassword } from '@/lib/auth';
import { pullFromCloud } from '@/lib/store-cloud';

type View = 'login' | 'register' | 'reset' | 'check-email';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
      setLoading(false);
      // Sync in background — never blocks UI
      if (user) pullFromCloud().catch(() => {});
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
      // Sync in background after sign in
      if (session?.user && _event === 'SIGNED_IN') {
        pullFromCloud().catch(() => {});
      }
    });

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
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

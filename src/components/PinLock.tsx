'use client';

import { useState, useEffect, useRef } from 'react';

const PIN_HASH_KEY = 'bordados_pin_hash';
const PIN_SESSION_KEY = 'bordados_pin_session';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin + 'studio24_salt');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default function PinLock({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'loading' | 'locked' | 'setup' | 'unlocked'>(() => {
    if (typeof window === 'undefined') return 'loading';
    const stored = localStorage.getItem(PIN_HASH_KEY);
    const session = sessionStorage.getItem(PIN_SESSION_KEY);
    const setupRequest = localStorage.getItem('bordados_pin_setup');
    if (setupRequest) {
      localStorage.removeItem('bordados_pin_setup');
      return 'setup';
    }
    if (!stored) return 'unlocked';
    if (session === 'unlocked') return 'unlocked';
    return 'locked';
  });
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state === 'locked' || state === 'setup') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [state]);

  const handleUnlock = async () => {
    setError('');
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos');
      return;
    }
    const hashed = await hashPin(pin);
    const stored = localStorage.getItem(PIN_HASH_KEY);
    if (hashed === stored) {
      sessionStorage.setItem(PIN_SESSION_KEY, 'unlocked');
      setState('unlocked');
    } else {
      setError('PIN incorrecto');
      setPin('');
    }
  };

  const handleSetup = async () => {
    setError('');
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos');
      return;
    }
    if (pin !== confirmPin) {
      setError('Los PINs no coinciden');
      return;
    }
    const hashed = await hashPin(pin);
    localStorage.setItem(PIN_HASH_KEY, hashed);
    sessionStorage.setItem(PIN_SESSION_KEY, 'unlocked');
    setState('unlocked');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (state === 'locked') handleUnlock();
      if (state === 'setup') handleSetup();
    }
  };

  if (state === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#fafafa]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (state === 'unlocked') return <>{children}</>;

  if (state === 'setup') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl">
          <div className="text-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-[#c72a09] text-white flex items-center justify-center text-xl font-black mx-auto mb-4">
              S24
            </div>
            <h1 className="text-lg font-black text-[#0a0a0a]">Crear PIN de acceso</h1>
            <p className="text-xs text-neutral-400 mt-1">Protege tus datos con un PIN de al menos 4 dígitos</p>
          </div>
          <div className="space-y-3">
            <input
              ref={inputRef}
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={handleKeyDown}
              placeholder="PIN"
              maxLength={8}
              className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20"
            />
            <input
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={handleKeyDown}
              placeholder="Confirmar PIN"
              maxLength={8}
              className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20"
            />
          </div>
          {error && <p className="text-xs text-red-500 font-semibold text-center mt-3">{error}</p>}
          <button
            onClick={handleSetup}
            className="w-full bg-[#c72a09] text-white py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors mt-4"
          >
            Crear PIN
          </button>
          <button
            onClick={() => setState('unlocked')}
            className="w-full text-xs text-neutral-400 hover:text-neutral-600 mt-3 py-2 transition-colors"
          >
            Omitir por ahora
          </button>
        </div>
      </div>
    );
  }

  // locked
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a]">
      <div className="bg-white rounded-2xl p-8 w-full max-w-sm mx-4 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-[#c72a09] text-white flex items-center justify-center text-xl font-black mx-auto mb-4">
            S24
          </div>
          <h1 className="text-lg font-black text-[#0a0a0a]">Studio 24</h1>
          <p className="text-xs text-neutral-400 mt-1">Ingresa tu PIN para acceder</p>
        </div>
        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={handleKeyDown}
          placeholder="PIN"
          maxLength={8}
          className="w-full border border-neutral-200 rounded-xl px-4 py-3 text-center text-2xl tracking-[0.3em] font-bold focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20"
        />
        {error && <p className="text-xs text-red-500 font-semibold text-center mt-3">{error}</p>}
        <button
          onClick={handleUnlock}
          className="w-full bg-[#c72a09] text-white py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase hover:bg-[#a82207] transition-colors mt-4"
        >
          Desbloquear
        </button>
      </div>
    </div>
  );
}

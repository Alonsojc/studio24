'use client';

import { useState } from 'react';
import { updatePassword } from '@/lib/auth';
import { btnPrimary, inputClass, labelClass } from '@/lib/styles';

export default function PasswordRecovery({ onComplete }: { onComplete: () => void }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <main className="min-h-screen flex items-center justify-center px-4 bg-neutral-50">
      <form
        className="w-full max-w-sm space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy) return;
          if (password.length < 8) {
            setError('Usa al menos 8 caracteres.');
            return;
          }
          if (password !== confirmation) {
            setError('Las contrasenas no coinciden.');
            return;
          }
          setBusy(true);
          setError('');
          try {
            await updatePassword(password);
            onComplete();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo actualizar la contrasena.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <h1 className="text-xl font-bold">Nueva contrasena</h1>
        <label className="block">
          <span className={labelClass}>Contrasena nueva</span>
          <input
            required
            minLength={8}
            disabled={busy}
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>Confirmar contrasena</span>
          <input
            required
            disabled={busy}
            type="password"
            autoComplete="new-password"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            className={inputClass}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button disabled={busy} type="submit" className={`${btnPrimary} w-full disabled:opacity-50`}>
          {busy ? 'Guardando...' : 'Guardar contrasena'}
        </button>
      </form>
    </main>
  );
}

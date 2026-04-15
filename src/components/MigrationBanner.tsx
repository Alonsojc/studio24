'use client';

import { useState } from 'react';
import { migrateLocalToCloud } from '@/lib/store-cloud';

export default function MigrationBanner() {
  const [show, setShow] = useState(() => {
    if (typeof window === 'undefined') return false;
    // Show if there's local data that hasn't been migrated
    const migrated = localStorage.getItem('bordados_cloud_migrated');
    if (migrated === '1') return false;
    const hasLocal = localStorage.getItem('bordados_clientes') || localStorage.getItem('bordados_pedidos') || localStorage.getItem('bordados_ingresos');
    return !!hasLocal;
  });
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  if (!show) return null;

  const handleMigrate = async () => {
    setMigrating(true);
    try {
      const count = await migrateLocalToCloud();
      setResult(`${count} registros migrados a la nube.`);
      setTimeout(() => setShow(false), 3000);
    } catch (e) {
      setResult(`Error: ${e instanceof Error ? e.message : 'No se pudo migrar'}`);
    }
    setMigrating(false);
  };

  const handleSkip = () => {
    localStorage.setItem('bordados_cloud_migrated', '1');
    setShow(false);
  };

  return (
    <div className="fixed bottom-4 right-4 z-[100] max-w-sm">
      <div className="bg-[#0a0a0a] rounded-2xl p-5 shadow-2xl border border-white/10">
        {result ? (
          <p className="text-sm text-green-400 font-bold">{result}</p>
        ) : (
          <>
            <p className="text-sm font-bold text-white mb-1">Datos locales detectados</p>
            <p className="text-xs text-white/50 mb-4">
              Tienes datos guardados en este navegador. ¿Quieres subirlos a la nube para acceder desde cualquier dispositivo?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleMigrate}
                disabled={migrating}
                className="flex-1 bg-[#c72a09] text-white py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.05em] hover:bg-[#a82207] disabled:opacity-50"
              >
                {migrating ? 'Migrando...' : 'Subir a la nube'}
              </button>
              <button
                onClick={handleSkip}
                className="px-4 py-2 rounded-xl text-[10px] font-bold text-white/40 hover:text-white/60 uppercase tracking-[0.05em]"
              >
                Omitir
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

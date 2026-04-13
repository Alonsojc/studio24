'use client';

import { useEffect, useState, useRef } from 'react';
import { getConfig, saveConfig, exportAllData, importAllData, clearAllData } from '@/lib/store';
import { ConfigNegocio } from '@/lib/types';
import PageHeader from '@/components/PageHeader';

const inputClass = "w-full border border-neutral-200 rounded-xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-[#c72a09] focus:ring-1 focus:ring-[#c72a09]/20 transition-colors";
const labelClass = "block text-[10px] font-bold tracking-[0.08em] text-neutral-400 uppercase mb-1.5";

export default function AjustesPage() {
  const [config, setConfig] = useState<ConfigNegocio | null>(null);
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setConfig(getConfig()); }, []);

  if (!config) return <div className="flex items-center justify-center min-h-[60vh]"><div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" /></div>;

  const handleSave = () => {
    saveConfig(config);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleExport = () => {
    const json = exportAllData();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio24_respaldo_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        importAllData(ev.target?.result as string);
        setImported(true);
        setTimeout(() => { setImported(false); window.location.reload(); }, 1500);
      } catch {
        alert('Error: El archivo no es un respaldo valido.');
      }
    };
    reader.readAsText(file);
  };

  const handleClear = () => {
    if (confirm('Esto borrara TODOS los datos (clientes, pedidos, ingresos, egresos, etc). Esta seguro?')) {
      if (confirm('Ultima oportunidad. Descargar respaldo antes de borrar?')) {
        handleExport();
      }
      clearAllData();
      window.location.reload();
    }
  };

  return (
    <div>
      <PageHeader title="Ajustes" description="Configuracion del negocio y respaldos" />

      <div className="max-w-2xl space-y-8">
        {/* Business Info */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Datos del Negocio</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelClass}>Nombre del negocio</label><input type="text" value={config.nombreNegocio} onChange={(e) => setConfig({ ...config, nombreNegocio: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>Logo (URL)</label><input type="url" value={config.logoUrl} onChange={(e) => setConfig({ ...config, logoUrl: e.target.value })} placeholder="https://..." className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className={labelClass}>Telefono</label><input type="tel" value={config.telefono} onChange={(e) => setConfig({ ...config, telefono: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>Email</label><input type="email" value={config.email} onChange={(e) => setConfig({ ...config, email: e.target.value })} className={inputClass} /></div>
            </div>
            <div><label className={labelClass}>Direccion</label><input type="text" value={config.direccion} onChange={(e) => setConfig({ ...config, direccion: e.target.value })} className={inputClass} /></div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Datos de Pago (para cotizaciones)</h3>
          <div className="space-y-4">
            <div><label className={labelClass}>Titular de la cuenta</label><input type="text" value={config.titular} onChange={(e) => setConfig({ ...config, titular: e.target.value })} className={inputClass} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div><label className={labelClass}>Banco</label><input type="text" value={config.banco} onChange={(e) => setConfig({ ...config, banco: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>No. Cuenta</label><input type="text" value={config.numeroCuenta} onChange={(e) => setConfig({ ...config, numeroCuenta: e.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>CLABE</label><input type="text" value={config.clabe} onChange={(e) => setConfig({ ...config, clabe: e.target.value })} className={inputClass} /></div>
            </div>
          </div>
        </div>

        <button onClick={handleSave} className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-[#c72a09] text-white hover:bg-[#a82207]'}`}>
          {saved ? 'Guardado!' : 'Guardar Configuracion'}
        </button>

        {/* Backup */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Respaldo de Datos</h3>
          <p className="text-xs text-neutral-400 mb-4">Los datos se guardan en este navegador. Si cambias de compu o borras datos del navegador, los pierdes. Haz respaldos frecuentes.</p>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={handleExport} className={`py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${exported ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-[#0a0a0a] border-neutral-200 hover:border-[#c72a09]'}`}>
              {exported ? 'Descargado!' : 'Descargar Respaldo'}
            </button>
            <button onClick={() => fileRef.current?.click()} className={`py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${imported ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-[#0a0a0a] border-neutral-200 hover:border-[#c72a09]'}`}>
              {imported ? 'Importado!' : 'Importar Respaldo'}
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
        </div>

        {/* Danger Zone */}
        <div className="bg-white rounded-2xl border border-red-200 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-red-400 uppercase mb-3">Zona de Peligro</h3>
          <p className="text-xs text-neutral-400 mb-4">Borrar todos los datos para empezar de cero. Se te pedira descargar un respaldo antes.</p>
          <button onClick={handleClear} className="px-5 py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase bg-white text-red-500 border border-red-200 hover:bg-red-50 transition-colors">
            Borrar Todos los Datos
          </button>
        </div>
      </div>
    </div>
  );
}

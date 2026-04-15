'use client';

import { useState, useRef, useEffect } from 'react';
import { useRole } from '@/components/RoleProvider';
import { roleLabel, roleColor, type UserRole } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import {
  getConfig,
  exportAllData,
  importAllData,
  clearAllData,
  getClientes,
  getProveedores,
  getEgresos,
  getIngresos,
} from '@/lib/store';
import { saveConfig } from '@/lib/store-sync';
import { ConfigNegocio } from '@/lib/types';
import {
  getNotifPrefs,
  saveNotifPrefs,
  requestPermission,
  checkPendingInvoices,
  sendPendingInvoiceNotification,
  type NotifPrefs,
} from '@/lib/notifications';
import {
  getSeedClientes,
  getSeedProveedores,
  getSeedEgresos,
  getSeedIngresos,
  getSeedRecurrentes,
  getSeedPedidos,
  getSeedProductos,
} from '@/lib/seed';
import PageHeader from '@/components/PageHeader';
import { inputClass, labelClass } from '@/lib/styles';

export default function AjustesPage() {
  const [config, setConfig] = useState<ConfigNegocio | null>(() =>
    typeof window !== 'undefined' ? getConfig() : null,
  );
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const [notifPrefs, setNotifPrefs] = useState<NotifPrefs>(() =>
    typeof window !== 'undefined'
      ? getNotifPrefs()
      : { enabled: false, facturasPendientes: true, checkIntervalMinutes: 60 },
  );
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported',
  );
  const [notifTestSent, setNotifTestSent] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('operador');
  const [inviteMsg, setInviteMsg] = useState('');
  const [teamMembers, setTeamMembers] = useState<{ id: string; email: string; role: string; nombre: string }[]>([]);
  const { role } = useRole();
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (role === 'admin') {
      supabase
        .from('profiles')
        .select('*')
        .then(({ data }) => {
          if (data) setTeamMembers(data as { id: string; email: string; role: string; nombre: string }[]);
        });
    }
  }, [role]);

  if (!config)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

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
        setTimeout(() => {
          setImported(false);
          window.location.reload();
        }, 1500);
      } catch {
        alert('Error: El archivo no es un respaldo válido.');
      }
    };
    reader.readAsText(file);
  };

  const handleSeedData = () => {
    const hasData =
      getClientes().length > 0 || getProveedores().length > 0 || getEgresos().length > 0 || getIngresos().length > 0;
    if (hasData) {
      if (!confirm('Ya existen datos en el sistema. Cargar datos demo agregará registros adicionales. ¿Continuar?'))
        return;
    }
    const clientes = getSeedClientes();
    const proveedores = getSeedProveedores();
    const clienteIds = clientes.map((c) => c.id);
    const proveedorIds = proveedores.map((p) => p.id);
    const egresos = getSeedEgresos(proveedorIds);
    const ingresos = getSeedIngresos(clienteIds);
    const recurrentes = getSeedRecurrentes();
    const pedidos = getSeedPedidos(clienteIds);
    const productos = getSeedProductos();

    localStorage.setItem('bordados_clientes', JSON.stringify([...getClientes(), ...clientes]));
    localStorage.setItem('bordados_proveedores', JSON.stringify([...getProveedores(), ...proveedores]));
    localStorage.setItem('bordados_egresos', JSON.stringify([...getEgresos(), ...egresos]));
    localStorage.setItem('bordados_ingresos', JSON.stringify([...getIngresos(), ...ingresos]));
    localStorage.setItem('bordados_egresos_recurrentes', JSON.stringify(recurrentes));
    localStorage.setItem('bordados_pedidos', JSON.stringify(pedidos));
    localStorage.setItem('bordados_productos', JSON.stringify(productos));

    setSeeded(true);
    setTimeout(() => {
      setSeeded(false);
      window.location.reload();
    }, 1500);
  };

  const handleClear = () => {
    if (confirm('Esto borrará TODOS los datos (clientes, pedidos, ingresos, egresos, etc). ¿Está seguro?')) {
      if (confirm('Última oportunidad. ¿Descargar respaldo antes de borrar?')) {
        handleExport();
      }
      clearAllData();
      window.location.reload();
    }
  };

  return (
    <div>
      <PageHeader title="Ajustes" description="Configuración del negocio y respaldos" />

      <div className="max-w-2xl space-y-8">
        {/* Business Info */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Datos del Negocio</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Nombre del negocio</label>
                <input
                  type="text"
                  value={config.nombreNegocio}
                  onChange={(e) => setConfig({ ...config, nombreNegocio: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Logo (URL)</label>
                <input
                  type="url"
                  value={config.logoUrl}
                  onChange={(e) => setConfig({ ...config, logoUrl: e.target.value })}
                  placeholder="https://..."
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>RFC</label>
                <input
                  type="text"
                  value={config.rfc || ''}
                  onChange={(e) => setConfig({ ...config, rfc: e.target.value.toUpperCase() })}
                  placeholder="XAXX010101000"
                  maxLength={13}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Régimen Fiscal</label>
                <select
                  value={config.regimenFiscal || ''}
                  onChange={(e) => setConfig({ ...config, regimenFiscal: e.target.value })}
                  className={inputClass}
                >
                  <option value="">Seleccionar...</option>
                  <option value="612">612 - Persona Física Act. Empresarial</option>
                  <option value="601">601 - General de Ley</option>
                  <option value="603">603 - Autotransporte</option>
                  <option value="605">605 - Sueldos y Salarios</option>
                  <option value="606">606 - Arrendamiento</option>
                  <option value="621">621 - Incorporación Fiscal</option>
                  <option value="625">625 - RESICO</option>
                  <option value="626">626 - RESICO Confianza</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Código Postal</label>
                <input
                  type="text"
                  value={config.codigoPostal || ''}
                  onChange={(e) => setConfig({ ...config, codigoPostal: e.target.value })}
                  placeholder="76168"
                  maxLength={5}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Teléfono</label>
                <input
                  type="tel"
                  value={config.telefono}
                  onChange={(e) => setConfig({ ...config, telefono: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig({ ...config, email: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input
                type="text"
                value={config.direccion}
                onChange={(e) => setConfig({ ...config, direccion: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        {/* Payment Info */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
            Datos de Pago (para cotizaciones)
          </h3>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Titular de la cuenta</label>
              <input
                type="text"
                value={config.titular}
                onChange={(e) => setConfig({ ...config, titular: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Banco</label>
                <input
                  type="text"
                  value={config.banco}
                  onChange={(e) => setConfig({ ...config, banco: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>No. Cuenta</label>
                <input
                  type="text"
                  value={config.numeroCuenta}
                  onChange={(e) => setConfig({ ...config, numeroCuenta: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>CLABE</label>
                <input
                  type="text"
                  value={config.clabe}
                  onChange={(e) => setConfig({ ...config, clabe: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors ${saved ? 'bg-green-500 text-white' : 'bg-[#c72a09] text-white hover:bg-[#a82207]'}`}
        >
          {saved ? '¡Guardado!' : 'Guardar Configuración'}
        </button>

        {/* Notifications */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Notificaciones</h3>
          {notifPermission === 'unsupported' ? (
            <p className="text-xs text-neutral-400">Este navegador no soporta notificaciones push.</p>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-[#0a0a0a]">Activar notificaciones</p>
                  <p className="text-xs text-neutral-400 mt-0.5">
                    {notifPermission === 'denied'
                      ? 'Permiso denegado — actívalo en la configuración del navegador'
                      : 'Recibe alertas cuando tengas registros sin factura'}
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (notifPrefs.enabled) {
                      const next = { ...notifPrefs, enabled: false };
                      setNotifPrefs(next);
                      saveNotifPrefs(next);
                    } else {
                      const granted = await requestPermission();
                      setNotifPermission(Notification.permission);
                      if (granted) {
                        const next = { ...notifPrefs, enabled: true };
                        setNotifPrefs(next);
                        saveNotifPrefs(next);
                      }
                    }
                  }}
                  disabled={notifPermission === 'denied'}
                  className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${notifPrefs.enabled ? 'bg-[#c72a09]' : 'bg-neutral-200'} ${notifPermission === 'denied' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${notifPrefs.enabled ? 'left-[22px]' : 'left-0.5'}`}
                  />
                </button>
              </div>

              {notifPrefs.enabled && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-[#0a0a0a]">Facturas pendientes</p>
                      <p className="text-xs text-neutral-400 mt-0.5">Aviso de ingresos/egresos del mes sin factura</p>
                    </div>
                    <button
                      onClick={() => {
                        const next = { ...notifPrefs, facturasPendientes: !notifPrefs.facturasPendientes };
                        setNotifPrefs(next);
                        saveNotifPrefs(next);
                      }}
                      className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${notifPrefs.facturasPendientes ? 'bg-[#c72a09]' : 'bg-neutral-200'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow ${notifPrefs.facturasPendientes ? 'left-[22px]' : 'left-0.5'}`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className={labelClass}>Frecuencia de revisión</label>
                    <select
                      value={notifPrefs.checkIntervalMinutes}
                      onChange={(e) => {
                        const next = { ...notifPrefs, checkIntervalMinutes: Number(e.target.value) };
                        setNotifPrefs(next);
                        saveNotifPrefs(next);
                      }}
                      className={inputClass}
                    >
                      <option value={30}>Cada 30 minutos</option>
                      <option value={60}>Cada hora</option>
                      <option value={240}>Cada 4 horas</option>
                      <option value={1440}>Una vez al día</option>
                    </select>
                  </div>

                  <button
                    onClick={() => {
                      const report = checkPendingInvoices();
                      if (report.ingresosCount + report.egresosCount === 0) {
                        new Notification('Studio 24 — Todo en orden', {
                          body: 'No hay registros pendientes de factura este mes.',
                          icon: '/studio24/favicon.svg',
                        });
                      } else {
                        sendPendingInvoiceNotification(report);
                      }
                      setNotifTestSent(true);
                      setTimeout(() => setNotifTestSent(false), 2000);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${notifTestSent ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-neutral-500 border-neutral-200 hover:border-[#c72a09]'}`}
                  >
                    {notifTestSent ? '¡Enviada!' : 'Enviar notificación de prueba'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Backup */}
        <div className="bg-white rounded-2xl border border-neutral-100 p-6">
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Respaldo de Datos</h3>
          <p className="text-xs text-neutral-400 mb-4">
            Los datos se guardan en este navegador. Si cambias de computadora o borras datos del navegador, los pierdes.
            Haz respaldos frecuentes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExport}
              className={`py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${exported ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-[#0a0a0a] border-neutral-200 hover:border-[#c72a09]'}`}
            >
              {exported ? '¡Descargado!' : 'Descargar Respaldo'}
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className={`py-3 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${imported ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-[#0a0a0a] border-neutral-200 hover:border-[#c72a09]'}`}
            >
              {imported ? '¡Importado!' : 'Importar Respaldo'}
            </button>
            <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
          </div>
        </div>

        {/* Team Management (admin only) */}
        {role === 'admin' && (
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Equipo</h3>

            {/* Current team members */}
            {teamMembers.length > 0 && (
              <div className="space-y-2 mb-5">
                {teamMembers.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0a0a0a]">{m.nombre || m.email}</p>
                      {m.nombre && <p className="text-xs text-neutral-400">{m.email}</p>}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${roleColor(m.role as UserRole)}`}
                    >
                      {roleLabel(m.role as UserRole)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Invite form */}
            <p className="text-xs text-neutral-400 mb-3">
              Invita a alguien a tu equipo. Debe registrarse con el email que indiques.
            </p>
            <div className="flex gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@ejemplo.com"
                className={inputClass + ' flex-1'}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as UserRole)}
                className="border border-neutral-200 rounded-xl px-3 py-2.5 text-xs font-bold bg-white focus:outline-none focus:border-[#c72a09]"
              >
                <option value="operador">Operador</option>
                <option value="contador">Contador</option>
              </select>
              <button
                onClick={async () => {
                  if (!inviteEmail) return;
                  setInviteMsg('');
                  const { error } = await supabase.from('invitations').insert({ email: inviteEmail, role: inviteRole });
                  if (error) {
                    setInviteMsg('Error: ' + error.message);
                    return;
                  }
                  setInviteMsg(`Invitación guardada. ${inviteEmail} debe registrarse con ese email.`);
                  setInviteEmail('');
                }}
                className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-[0.05em] hover:bg-[#222] transition-colors shrink-0"
              >
                Invitar
              </button>
            </div>
            {inviteMsg && <p className="text-xs text-green-600 mt-2">{inviteMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

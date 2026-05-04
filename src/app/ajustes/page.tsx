'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRole } from '@/components/RoleProvider';
import { roleLabel, roleColor, type UserRole } from '@/lib/roles';
import { supabase } from '@/lib/supabase';
import {
  getTeamMembers,
  getPendingInvitations,
  cancelInvitation,
  type TeamMember,
  type PendingInvitation,
} from '@/lib/teams';
import { getConfig, exportAllData, importAllData } from '@/lib/store';
import { migrateLocalToCloud } from '@/lib/store-cloud';
import { saveConfig } from '@/lib/store-sync';
import { flushPendingSync } from '@/lib/sync-flush';
import { pauseCloudPulls } from '@/lib/sync-queue';
import { ConfigNegocio } from '@/lib/types';
import {
  getNotifPrefs,
  saveNotifPrefs,
  requestPermission,
  checkPendingInvoices,
  sendPendingInvoiceNotification,
  type NotifPrefs,
} from '@/lib/notifications';
import { listBackups, downloadBackup, autoBackupIfDue, testBackupRestore } from '@/lib/auto-backup';
import PageHeader from '@/components/PageHeader';
import { inputClass, labelClass } from '@/lib/styles';

export default function AjustesPage() {
  const [config, setConfig] = useState<ConfigNegocio | null>(() =>
    typeof window !== 'undefined' ? getConfig() : null,
  );
  const [saved, setSaved] = useState(false);
  const [exported, setExported] = useState(false);
  const [imported, setImported] = useState(false);
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
  const [inviteError, setInviteError] = useState('');
  const [inviteSending, setInviteSending] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInvitation[]>([]);
  const { role } = useRole();
  const canEditConfig = role === 'admin';
  const fileRef = useRef<HTMLInputElement>(null);

  const reloadTeam = useCallback(async () => {
    const [members, invites] = await Promise.all([getTeamMembers(), getPendingInvitations()]);
    setTeamMembers(members);
    setPendingInvites(invites);
  }, []);

  useEffect(() => {
    if (role === 'admin') {
      void Promise.resolve().then(reloadTeam);
    }
  }, [role, reloadTeam]);

  if (!config)
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const handleSave = () => {
    if (!canEditConfig) return;
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
    reader.onload = async (ev) => {
      try {
        pauseCloudPulls();
        importAllData(ev.target?.result as string);
        try {
          await migrateLocalToCloud();
          await flushPendingSync();
        } catch {
          pauseCloudPulls(5 * 60 * 1000);
        }
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

  return (
    <div>
      <PageHeader title="Ajustes" description="Configuración del negocio y respaldos" />

      <div className="max-w-2xl space-y-8">
        {!canEditConfig && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="text-xs text-amber-700">
              Solo administradores pueden editar la configuración del negocio. Tu rol puede consultar ajustes y
              respaldos, pero Supabase rechazará cambios de configuración.
            </p>
          </div>
        )}

        <fieldset disabled={!canEditConfig} className="space-y-8 disabled:opacity-60">
          {/* Business Info */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
              Datos del Negocio
            </h3>
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
            disabled={!canEditConfig}
            className={`w-full py-3.5 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400 ${saved ? 'bg-green-500 text-white' : 'bg-[#c72a09] text-white hover:bg-[#a82207]'}`}
          >
            {saved ? '¡Guardado!' : 'Guardar Configuración'}
          </button>
        </fieldset>

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

        {/* Cloud Backups */}
        <CloudBackups />

        {/* Team Management (admin only) */}
        {role === 'admin' && (
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">Equipo</h3>

            {/* Current team members */}
            {teamMembers.length > 0 && (
              <div className="space-y-2 mb-5">
                {teamMembers.map((m) => (
                  <div
                    key={m.user_id}
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

            {/* Pending invitations */}
            {pendingInvites.length > 0 && (
              <div className="space-y-2 mb-5">
                <p className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">Pendientes</p>
                {pendingInvites.map((inv) => (
                  <div
                    key={inv.id}
                    className="flex items-center justify-between py-2 border-b border-neutral-50 last:border-0"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#0a0a0a]">{inv.email}</p>
                      <p className="text-xs text-neutral-400">Esperando que acepte la invitación</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase ${roleColor(inv.role as UserRole)}`}
                      >
                        {roleLabel(inv.role as UserRole)}
                      </span>
                      <button
                        onClick={async () => {
                          await cancelInvitation(inv.id);
                          reloadTeam();
                        }}
                        className="text-xs text-neutral-400 hover:text-[#c72a09] transition-colors"
                        aria-label="Cancelar invitación"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Invite form */}
            <p className="text-xs text-neutral-400 mb-3">
              Invita a alguien a tu equipo. Le llegará un email con el enlace para unirse.
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
                disabled={inviteSending}
                onClick={async () => {
                  const email = inviteEmail.trim().toLowerCase();
                  if (!email) return;
                  setInviteMsg('');
                  setInviteError('');
                  setInviteSending(true);
                  const { error: dbError } = await supabase.from('invitations').insert({ email, role: inviteRole });
                  if (dbError) {
                    setInviteError(dbError.message);
                    setInviteSending(false);
                    return;
                  }
                  const { error: otpError } = await supabase.auth.signInWithOtp({
                    email,
                    options: {
                      emailRedirectTo: typeof window !== 'undefined' ? `${window.location.origin}/studio24` : undefined,
                    },
                  });
                  if (otpError) {
                    setInviteError(`Invitación guardada, pero no se pudo enviar el email: ${otpError.message}`);
                  } else {
                    setInviteMsg(`Invitación enviada a ${email}.`);
                    setInviteEmail('');
                    reloadTeam();
                  }
                  setInviteSending(false);
                }}
                className="bg-[#0a0a0a] text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-[0.05em] hover:bg-[#222] transition-colors shrink-0 disabled:opacity-50"
              >
                {inviteSending ? 'Enviando…' : 'Invitar'}
              </button>
            </div>
            {inviteMsg && <p className="text-xs text-green-600 mt-2">{inviteMsg}</p>}
            {inviteError && <p className="text-xs text-red-500 mt-2">{inviteError}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function CloudBackups() {
  const [backups, setBackups] = useState<{ name: string; date: string; size: number }[]>([]);
  const [loading, setLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [backupDone, setBackupDone] = useState(false);
  const [testingRestore, setTestingRestore] = useState('');
  const [restoreChecks, setRestoreChecks] = useState<Record<string, string>>({});

  const loadBackups = async () => {
    setLoading(true);
    const list = await listBackups();
    setBackups(list);
    setLoading(false);
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleBackupNow = async () => {
    setBackingUp(true);
    // Force backup regardless of interval
    localStorage.removeItem('bordados_last_backup');
    await autoBackupIfDue();
    setBackingUp(false);
    setBackupDone(true);
    setTimeout(() => setBackupDone(false), 2000);
    loadBackups();
  };

  const handleDownload = async (fileName: string) => {
    const json = await downloadBackup(fileName);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studio24_backup_${fileName}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleTestRestore = async (fileName: string) => {
    setTestingRestore(fileName);
    try {
      const preview = await testBackupRestore(fileName);
      if (!preview) {
        setRestoreChecks((current) => ({ ...current, [fileName]: 'No se pudo descargar o validar el respaldo.' }));
        return;
      }
      const sections = preview.sections
        .filter((section) => section.count > 0)
        .slice(0, 4)
        .map((section) => `${section.key}: ${section.count}`)
        .join(' · ');
      setRestoreChecks((current) => ({
        ...current,
        [fileName]: `Restore válido: ${preview.totalRecords} registros${sections ? ` (${sections})` : ''}.`,
      }));
    } catch (e) {
      setRestoreChecks((current) => ({
        ...current,
        [fileName]: e instanceof Error ? e.message : 'El respaldo no es válido.',
      }));
    } finally {
      setTestingRestore('');
    }
  };

  const handleRestore = async (fileName: string) => {
    if (
      !confirm(
        `¿Restaurar el respaldo del ${fileName.replace('.json', '')}? Esto sobreescribirá todos tus datos actuales.`,
      )
    )
      return;
    const json = await downloadBackup(fileName);
    if (!json) {
      alert('Error al descargar el respaldo');
      return;
    }
    try {
      const { importAllData } = await import('@/lib/store');
      pauseCloudPulls();
      importAllData(json);
      try {
        await migrateLocalToCloud();
        await flushPendingSync();
      } catch {
        pauseCloudPulls(5 * 60 * 1000);
      }
      alert('Respaldo restaurado. La página se recargará.');
      window.location.reload();
    } catch {
      alert('Error: el respaldo no es válido.');
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-neutral-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase">Respaldos en la Nube</h3>
          <p className="text-xs text-neutral-400 mt-1">
            Se crean automáticamente cada semana. Se guardan los últimos 4.
          </p>
        </div>
        <button
          onClick={handleBackupNow}
          disabled={backingUp}
          className={`px-4 py-2 rounded-xl text-xs font-bold tracking-[0.05em] uppercase transition-colors border ${backupDone ? 'bg-green-50 text-green-600 border-green-200' : 'bg-white text-[#0a0a0a] border-neutral-200 hover:border-[#c72a09]'} disabled:opacity-50`}
        >
          {backingUp ? 'Subiendo...' : backupDone ? '¡Listo!' : 'Respaldar ahora'}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-neutral-300 text-center py-4">Cargando...</p>
      ) : backups.length === 0 ? (
        <p className="text-xs text-neutral-300 text-center py-4">No hay respaldos en la nube todavía</p>
      ) : (
        <div className="space-y-2">
          {backups.map((b) => (
            <div key={b.name} className="py-2 border-b border-neutral-50 last:border-0">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#0a0a0a]">{b.date}</p>
                  {b.size > 0 && <p className="text-[10px] text-neutral-400">{(b.size / 1024).toFixed(0)} KB</p>}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleTestRestore(b.name)}
                    disabled={testingRestore === b.name}
                    className="text-[10px] font-bold text-neutral-400 hover:text-[#0a0a0a] uppercase tracking-wide transition-colors disabled:opacity-50"
                  >
                    {testingRestore === b.name ? 'Probando' : 'Probar'}
                  </button>
                  <button
                    onClick={() => handleDownload(b.name)}
                    className="text-[10px] font-bold text-neutral-400 hover:text-[#0a0a0a] uppercase tracking-wide transition-colors"
                  >
                    Descargar
                  </button>
                  <button
                    onClick={() => handleRestore(b.name)}
                    className="text-[10px] font-bold text-[#c72a09] hover:text-[#a82207] uppercase tracking-wide transition-colors"
                  >
                    Restaurar
                  </button>
                </div>
              </div>
              {restoreChecks[b.name] && (
                <p className="text-[10px] text-green-600 mt-1 sm:text-right">{restoreChecks[b.name]}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

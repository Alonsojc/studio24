'use client';

import { useState } from 'react';
import { Upload } from 'lucide-react';
import Modal from './Modal';
import { replaceInvoice } from '@/lib/invoice-replacement';
import { btnPrimary, labelClass } from '@/lib/styles';

export default function ReplaceInvoiceModal({
  tipo,
  id,
  onClose,
  onSaved,
}: {
  tipo: 'ingreso' | 'egreso';
  id: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [xml, setXml] = useState<File>();
  const [pdf, setPdf] = useState<File>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    if (!xml || busy) return;
    setBusy(true);
    setError('');
    try {
      await replaceInvoice(tipo, id, xml, pdf);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el reemplazo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title="Reemplazar factura"
      onClose={() => {
        if (!busy) onClose();
      }}
      dirty={Boolean(xml || pdf)}
    >
      <div className="space-y-4">
        <label className="block">
          <span className={labelClass}>XML nuevo</span>
          <input
            type="file"
            accept=".xml"
            disabled={busy}
            onChange={(e) => setXml(e.target.files?.[0])}
            className="w-full text-sm"
          />
        </label>
        <label className="block">
          <span className={labelClass}>PDF nuevo</span>
          <input
            type="file"
            accept=".pdf"
            disabled={busy}
            onChange={(e) => setPdf(e.target.files?.[0])}
            className="w-full text-sm"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button type="button" disabled={!xml || busy} onClick={save} className={`${btnPrimary} disabled:opacity-50`}>
          <Upload size={16} />
          {busy ? 'Confirmando...' : 'Guardar reemplazo'}
        </button>
      </div>
    </Modal>
  );
}

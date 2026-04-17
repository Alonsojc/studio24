'use client';

import { useEffect, useRef, useCallback } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** When true, closing via overlay click, Escape, or X button asks for confirmation first. */
  dirty?: boolean;
}

export default function Modal({ open, onClose, title, children, dirty }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  const safeClose = useCallback(() => {
    if (dirty) {
      if (!confirm('Tienes cambios sin guardar. ¿Descartar?')) return;
    }
    onClose();
  }, [dirty, onClose]);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') safeClose();
    };
    if (open) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [open, safeClose]);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === overlayRef.current) safeClose();
      }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-3 sm:mx-4 max-h-[90dvh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 sm:py-5 border-b border-neutral-100 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-bold tracking-[0.05em] text-[#0a0a0a] uppercase">{title}</h2>
          <button
            onClick={safeClose}
            className="w-11 h-11 flex items-center justify-center rounded-full hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors -mr-2"
            aria-label="Cerrar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-4 sm:p-6 pb-8">{children}</div>
      </div>
    </div>
  );
}

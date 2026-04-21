'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { uploadPhoto, deletePhoto, listPhotos, type StoredPhoto } from '@/lib/photos';
import { compressImage } from '@/lib/image';
import { reportError } from '@/lib/sentry';
import { v4 as uuid } from 'uuid';

interface PhotoGalleryProps {
  pedidoId: string;
  readOnly?: boolean;
}

export default function PhotoGallery({ pedidoId, readOnly = false }: PhotoGalleryProps) {
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setPhotos(await listPhotos(pedidoId));
    } catch (e) {
      reportError(e, { kind: 'listPhotos', pedidoId });
    }
    setLoading(false);
  }, [pedidoId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = Array.from(e.target.files || []);
    if (fileList.length === 0) return;
    setUploading(true);
    try {
      for (const file of fileList) {
        if (!file.type.startsWith('image/')) continue;
        const compressed = await compressImage(file);
        const photoId = `${uuid()}.jpg`;
        await uploadPhoto(pedidoId, photoId, compressed);
      }
      await reload();
    } catch (err) {
      reportError(err, { kind: 'uploadPhoto', pedidoId });
      alert('Error al subir imagen');
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDelete = async (photoId: string) => {
    try {
      await deletePhoto(pedidoId, photoId);
      setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    } catch (err) {
      reportError(err, { kind: 'deletePhoto', pedidoId, photoId });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <div className="w-4 h-4 border-2 border-[#c72a09] border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-neutral-400">Cargando fotos...</span>
      </div>
    );
  }

  return (
    <div>
      {/* Upload button */}
      {!readOnly && (
        <div className="mb-3">
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="px-3 py-2 rounded-xl text-[10px] font-bold tracking-[0.05em] uppercase border border-neutral-200 text-neutral-500 hover:border-[#c72a09] hover:text-[#c72a09] transition-colors disabled:opacity-50"
          >
            {uploading ? 'Subiendo...' : '+ Agregar foto'}
          </button>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
        </div>
      )}

      {/* Gallery */}
      {photos.length === 0 ? (
        <p className="text-xs text-neutral-300 py-2">Sin fotos</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
          {photos.map((photo) => (
            <div key={photo.photoId} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt="Foto del pedido"
                className="w-full aspect-square object-cover rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
                onClick={() => setViewPhoto(photo.url)}
              />
              {!readOnly && (
                <button
                  onClick={() => handleDelete(photo.photoId)}
                  aria-label="Eliminar foto"
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-red-500 text-white text-sm font-bold flex items-center justify-center opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shadow"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {viewPhoto && (
        <div
          className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setViewPhoto(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewPhoto} alt="Foto ampliada" className="max-w-full max-h-full object-contain rounded-xl" />
          <button
            onClick={() => setViewPhoto(null)}
            aria-label="Cerrar foto"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/20 text-white text-xl font-bold flex items-center justify-center hover:bg-white/40 transition-colors"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

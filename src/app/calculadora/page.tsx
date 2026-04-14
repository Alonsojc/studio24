'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/helpers';
import PageHeader from '@/components/PageHeader';
import { inputClass, labelClass } from '@/lib/styles';

// Costos base por tipo de hilo (por 1000 puntadas)
const THREAD_COSTS: Record<string, number> = {
  polyester: 0.8,
  rayon: 1.2,
  metallic: 2.5,
};

// Costos base por tipo de estabilizador
const STABILIZER_COSTS: Record<string, number> = {
  tearaway: 3,
  cutaway: 4,
  washaway: 6,
};

// Precios sugeridos de prendas comunes
const GARMENT_PRESETS: { label: string; cost: number }[] = [
  { label: 'Playera básica', cost: 65 },
  { label: 'Playera polo', cost: 120 },
  { label: 'Camisa manga larga', cost: 180 },
  { label: 'Gorra', cost: 55 },
  { label: 'Mandil', cost: 80 },
  { label: 'Chamarra', cost: 350 },
  { label: 'Overol', cost: 280 },
  { label: 'Chaleco', cost: 150 },
  { label: 'Sin prenda (solo bordado)', cost: 0 },
];

type SizeKey = 'small' | 'medium' | 'large' | 'xlarge';
const SIZE_STITCHES: Record<SizeKey, { label: string; minStitches: number; maxStitches: number }> = {
  small: { label: 'Chico (logo 5-7cm)', minStitches: 3000, maxStitches: 8000 },
  medium: { label: 'Mediano (logo 8-12cm)', minStitches: 8000, maxStitches: 20000 },
  large: { label: 'Grande (13-20cm)', minStitches: 20000, maxStitches: 45000 },
  xlarge: { label: 'Espalda completa (20cm+)', minStitches: 45000, maxStitches: 80000 },
};

export default function CalculadoraPage() {
  const [size, setSize] = useState<SizeKey>('medium');
  const [stitches, setStitches] = useState(10000);
  const [threadType, setThreadType] = useState('polyester');
  const [stabilizerType, setStabilizerType] = useState('tearaway');
  const [colors, setColors] = useState(3);
  const [quantity, setQuantity] = useState(10);
  const [garmentCost, setGarmentCost] = useState(0);
  const [garmentPreset, setGarmentPreset] = useState('Sin prenda (solo bordado)');
  const [marginPercent, setMarginPercent] = useState(60);
  const [includeGarment, setIncludeGarment] = useState(false);

  // Costs calculation
  const threadCost = (stitches / 1000) * (THREAD_COSTS[threadType] || 0.8);
  const stabilizerCost = STABILIZER_COSTS[stabilizerType] || 3;
  const colorChangeCost = Math.max(0, colors - 1) * 2; // $2 per color change
  const machineTime = stitches / 800; // minutes (800 stitches/min average)
  const machineHourlyCost = 50; // MXN per hour for machine depreciation + electricity
  const machineCost = (machineTime / 60) * machineHourlyCost;
  const laborMinutes = machineTime + 5 + colors * 1; // setup + run + color changes
  const laborHourlyCost = 80; // MXN per hour
  const laborCost = (laborMinutes / 60) * laborHourlyCost;

  const costPerPiece = threadCost + stabilizerCost + colorChangeCost + machineCost + laborCost;
  const costWithGarment = costPerPiece + (includeGarment ? garmentCost : 0);
  const margin = costWithGarment * (marginPercent / 100);
  const pricePerPiece = costWithGarment + margin;
  const totalOrder = pricePerPiece * quantity;
  const profitTotal = margin * quantity;

  const handleSizeChange = (s: SizeKey) => {
    setSize(s);
    const mid = Math.round((SIZE_STITCHES[s].minStitches + SIZE_STITCHES[s].maxStitches) / 2);
    setStitches(mid);
  };

  const handleGarmentPreset = (label: string) => {
    setGarmentPreset(label);
    const preset = GARMENT_PRESETS.find((g) => g.label === label);
    if (preset) {
      setGarmentCost(preset.cost);
      setIncludeGarment(preset.cost > 0);
    }
  };

  return (
    <div>
      <PageHeader title="Calculadora de Costos" description="Calcula el costo y precio sugerido de un bordado" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <div className="lg:col-span-2 space-y-6">
          {/* Size */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">
              Tamaño del Bordado
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
              {(Object.entries(SIZE_STITCHES) as [SizeKey, (typeof SIZE_STITCHES)[SizeKey]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => handleSizeChange(key)}
                  className={`p-3 rounded-xl text-xs font-bold border transition-all ${
                    size === key
                      ? 'border-[#c72a09] bg-[#c72a09]/5 text-[#c72a09]'
                      : 'border-neutral-200 text-neutral-500 hover:border-neutral-400'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
            <div>
              <label className={labelClass}>Puntadas estimadas</label>
              <input
                type="range"
                min={SIZE_STITCHES[size].minStitches}
                max={SIZE_STITCHES[size].maxStitches}
                step={500}
                value={stitches}
                onChange={(e) => setStitches(Number(e.target.value))}
                className="w-full accent-[#c72a09]"
              />
              <div className="flex justify-between text-xs text-neutral-400 mt-1">
                <span>{SIZE_STITCHES[size].minStitches.toLocaleString()}</span>
                <span className="font-bold text-[#0a0a0a]">{stitches.toLocaleString()} puntadas</span>
                <span>{SIZE_STITCHES[size].maxStitches.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Materials */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Materiales</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Tipo de hilo</label>
                <select value={threadType} onChange={(e) => setThreadType(e.target.value)} className={inputClass}>
                  <option value="polyester">Poliéster</option>
                  <option value="rayon">Rayón</option>
                  <option value="metallic">Metálico</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Estabilizador</label>
                <select
                  value={stabilizerType}
                  onChange={(e) => setStabilizerType(e.target.value)}
                  className={inputClass}
                >
                  <option value="tearaway">Tear-away</option>
                  <option value="cutaway">Cut-away</option>
                  <option value="washaway">Wash-away</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Colores de hilo</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={colors}
                  onChange={(e) => setColors(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Garment */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">Prenda</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Tipo de prenda</label>
                <select
                  value={garmentPreset}
                  onChange={(e) => handleGarmentPreset(e.target.value)}
                  className={inputClass}
                >
                  {GARMENT_PRESETS.map((g) => (
                    <option key={g.label} value={g.label}>
                      {g.label} {g.cost > 0 ? `(${formatCurrency(g.cost)})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Costo prenda</label>
                <input
                  type="number"
                  min={0}
                  step={5}
                  value={garmentCost}
                  onChange={(e) => {
                    setGarmentCost(Number(e.target.value));
                    setIncludeGarment(Number(e.target.value) > 0);
                  }}
                  className={inputClass}
                />
              </div>
            </div>
          </div>

          {/* Quantity + Margin */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-4">
              Cantidad y Margen
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Cantidad de piezas</label>
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Margen de ganancia (%)</label>
                <input
                  type="range"
                  min={20}
                  max={200}
                  step={5}
                  value={marginPercent}
                  onChange={(e) => setMarginPercent(Number(e.target.value))}
                  className="w-full accent-[#c72a09]"
                />
                <p className="text-xs text-neutral-400 text-center mt-1 font-bold">{marginPercent}%</p>
              </div>
            </div>
          </div>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {/* Cost breakdown */}
          <div className="bg-white rounded-2xl border border-neutral-100 p-6 sticky top-4">
            <h3 className="text-[10px] font-bold tracking-[0.12em] text-neutral-400 uppercase mb-5">
              Desglose por Pieza
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Hilo ({threadType})</span>
                <span className="font-bold">{formatCurrency(threadCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Estabilizador</span>
                <span className="font-bold">{formatCurrency(stabilizerCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Cambios de color ({colors})</span>
                <span className="font-bold">{formatCurrency(colorChangeCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Máquina ({machineTime.toFixed(0)} min)</span>
                <span className="font-bold">{formatCurrency(machineCost)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Mano de obra ({laborMinutes.toFixed(0)} min)</span>
                <span className="font-bold">{formatCurrency(laborCost)}</span>
              </div>
              <div className="border-t border-neutral-100 pt-3 flex justify-between text-sm">
                <span className="font-bold text-[#0a0a0a]">Costo bordado</span>
                <span className="font-bold">{formatCurrency(costPerPiece)}</span>
              </div>
              {includeGarment && (
                <div className="flex justify-between text-sm">
                  <span className="text-neutral-500">Prenda</span>
                  <span className="font-bold">{formatCurrency(garmentCost)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Margen ({marginPercent}%)</span>
                <span className="font-bold text-green-600">{formatCurrency(margin)}</span>
              </div>
            </div>

            <div className="bg-[#0a0a0a] rounded-xl p-4 mt-5">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.1em] text-white/50 uppercase">Precio por pieza</p>
                  <p className="text-2xl font-black text-white mt-1">{formatCurrency(pricePerPiece)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Total del pedido ({quantity} pzas)</span>
                <span className="font-black text-lg text-[#c72a09]">{formatCurrency(totalOrder)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Ganancia total</span>
                <span className="font-bold text-green-600">{formatCurrency(profitTotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Costo total</span>
                <span className="font-bold text-neutral-400">{formatCurrency(totalOrder - profitTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

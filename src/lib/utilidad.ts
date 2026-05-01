export const REINVERSION_RATE = 0.1;
export const DONACION_RATE = 0.02;

export interface ApartadoUtilidad {
  utilidad: number;
  reinversion: number;
  donacion: number;
  disponible: number;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

export function calcApartadoUtilidad(utilidad: number): ApartadoUtilidad {
  const base = Math.max(utilidad, 0);
  const reinversion = roundCurrency(base * REINVERSION_RATE);
  const donacion = roundCurrency(base * DONACION_RATE);

  return {
    utilidad: roundCurrency(utilidad),
    reinversion,
    donacion,
    disponible: roundCurrency(utilidad - reinversion - donacion),
  };
}

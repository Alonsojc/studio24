import { describe, expect, it } from 'vitest';
import { calcApartadoUtilidad } from '@/lib/utilidad';

describe('calcApartadoUtilidad', () => {
  it('separa 10% para reinversion, 2% para donacion y deja 88% disponible', () => {
    expect(calcApartadoUtilidad(1000)).toEqual({
      utilidad: 1000,
      reinversion: 100,
      donacion: 20,
      disponible: 880,
    });
  });

  it('redondea los apartados a centavos', () => {
    expect(calcApartadoUtilidad(333.33)).toEqual({
      utilidad: 333.33,
      reinversion: 33.33,
      donacion: 6.67,
      disponible: 293.33,
    });
  });

  it('no separa reinversion ni donacion cuando no hay utilidad positiva', () => {
    expect(calcApartadoUtilidad(-250)).toEqual({
      utilidad: -250,
      reinversion: 0,
      donacion: 0,
      disponible: -250,
    });
  });
});

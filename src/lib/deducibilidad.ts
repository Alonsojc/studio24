'use client';

/**
 * Motor de reglas de deducibilidad fiscal para México.
 * Persona Física con Actividad Empresarial.
 *
 * Clasifica facturas recibidas (egresos) en:
 * - Deducible mensual (pago provisional)
 * - Deducible solo en anual
 * - No deducible
 * - Parcialmente deducible (con %)
 * - Revisar (casos ambiguos)
 */

export type TipoDeduccion = 'mensual' | 'anual' | 'no_deducible' | 'revisar';

export interface ResultadoDeducibilidad {
  tipo: TipoDeduccion;
  porcentaje: number; // 0-100
  razon: string;
  regla: string;
}

// --- Reglas por Uso CFDI ---

const REGLAS_USO_CFDI: Record<string, ResultadoDeducibilidad> = {
  G01: { tipo: 'mensual', porcentaje: 100, razon: 'Adquisición de mercancías', regla: 'Art. 27 LISR' },
  G02: { tipo: 'mensual', porcentaje: 100, razon: 'Devoluciones, descuentos o bonificaciones', regla: 'Art. 27 LISR' },
  G03: { tipo: 'mensual', porcentaje: 100, razon: 'Gastos en general', regla: 'Art. 27 LISR' },
  I01: { tipo: 'mensual', porcentaje: 100, razon: 'Construcciones', regla: 'Art. 36 LISR' },
  I02: { tipo: 'mensual', porcentaje: 100, razon: 'Mobiliario y equipo de oficina', regla: 'Art. 34 LISR' },
  I03: { tipo: 'mensual', porcentaje: 100, razon: 'Equipo de transporte', regla: 'Art. 36 LISR' },
  I04: { tipo: 'mensual', porcentaje: 100, razon: 'Equipo de cómputo', regla: 'Art. 34 LISR' },
  I05: { tipo: 'mensual', porcentaje: 100, razon: 'Dados, troqueles, moldes', regla: 'Art. 34 LISR' },
  I06: { tipo: 'mensual', porcentaje: 100, razon: 'Comunicaciones telefónicas', regla: 'Art. 27 LISR' },
  I07: { tipo: 'mensual', porcentaje: 100, razon: 'Comunicaciones satelitales', regla: 'Art. 27 LISR' },
  I08: { tipo: 'mensual', porcentaje: 100, razon: 'Otra maquinaria y equipo', regla: 'Art. 34 LISR' },
  D01: { tipo: 'anual', porcentaje: 100, razon: 'Honorarios médicos y dentales', regla: 'Art. 151 Fr. I LISR' },
  D02: { tipo: 'anual', porcentaje: 100, razon: 'Gastos médicos por discapacidad', regla: 'Art. 151 Fr. I LISR' },
  D03: { tipo: 'anual', porcentaje: 100, razon: 'Gastos funerarios', regla: 'Art. 151 Fr. II LISR' },
  D04: { tipo: 'anual', porcentaje: 100, razon: 'Donativos', regla: 'Art. 151 Fr. III LISR - tope 7%' },
  D05: { tipo: 'anual', porcentaje: 100, razon: 'Intereses de créditos hipotecarios', regla: 'Art. 151 Fr. IV LISR' },
  D06: { tipo: 'anual', porcentaje: 100, razon: 'Aportaciones voluntarias al SAR', regla: 'Art. 151 Fr. V LISR' },
  D07: { tipo: 'anual', porcentaje: 100, razon: 'Primas de seguros', regla: 'Art. 151 Fr. VI LISR' },
  D08: { tipo: 'anual', porcentaje: 100, razon: 'Gastos de transportación escolar', regla: 'Art. 151 Fr. VII LISR' },
  D09: { tipo: 'anual', porcentaje: 100, razon: 'Depósitos en cuentas de ahorro', regla: 'Art. 185 LISR' },
  D10: { tipo: 'anual', porcentaje: 100, razon: 'Colegiaturas', regla: 'Decreto 26/12/2013' },
  S01: { tipo: 'no_deducible', porcentaje: 0, razon: 'Sin efectos fiscales', regla: 'No aplica' },
  CP01: { tipo: 'mensual', porcentaje: 100, razon: 'Pagos', regla: 'Art. 27 LISR' },
  CN01: { tipo: 'mensual', porcentaje: 100, razon: 'Nómina', regla: 'Art. 27 Fr. V LISR' },
};

// --- Reglas por palabras clave en descripción ---

interface ReglaKeyword {
  keywords: string[];
  resultado: ResultadoDeducibilidad;
}

const REGLAS_KEYWORD: ReglaKeyword[] = [
  // 100% deducible mensual — insumos de trabajo
  {
    keywords: ['hilo', 'tela', 'aguja', 'estabilizador', 'entretela', 'bordado', 'prenda', 'playera', 'polo', 'gorra', 'mandil', 'overol', 'chamarra'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Insumos de trabajo', regla: 'Art. 27 LISR - estrictamente indispensable' },
  },
  // 100% — software
  {
    keywords: ['canva', 'photoshop', 'adobe', 'wilcom', 'software', 'licencia', 'suscripción', 'suscripcion', 'hosting', 'dominio'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Software/herramienta digital', regla: 'Art. 27 LISR' },
  },
  // 100% — renta
  {
    keywords: ['renta', 'arrendamiento', 'alquiler', 'local'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Renta de local', regla: 'Art. 27 LISR' },
  },
  // 100% — servicios
  {
    keywords: ['luz', 'electricidad', 'cfe', 'agua', 'internet', 'teléfono', 'telefono', 'telmex', 'gas'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Servicios del local', regla: 'Art. 27 LISR' },
  },
  // 100% — maquinaria
  {
    keywords: ['tajima', 'bordadora', 'máquina', 'maquina', 'compresor', 'plancha'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Maquinaria y equipo', regla: 'Art. 34 LISR - depreciación' },
  },
  // 100% — papelería y oficina
  {
    keywords: ['papelería', 'papeleria', 'toner', 'tinta', 'impresora', 'oficina'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Gastos de oficina', regla: 'Art. 27 LISR' },
  },
  // 100% — publicidad
  {
    keywords: ['publicidad', 'facebook', 'google ads', 'instagram', 'marketing', 'tarjetas de presentación', 'volantes', 'letrero'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Publicidad y marketing', regla: 'Art. 27 LISR' },
  },
  // 100% — mensajería/envíos
  {
    keywords: ['envío', 'envio', 'paquetería', 'paqueteria', 'fedex', 'dhl', 'estafeta', 'mensajería'],
    resultado: { tipo: 'mensual', porcentaje: 100, razon: 'Envíos y paquetería', regla: 'Art. 27 LISR' },
  },
  // Parcial — comidas
  {
    keywords: ['restaurante', 'comida', 'alimentos', 'cafetería', 'cafeteria'],
    resultado: { tipo: 'revisar', porcentaje: 91.5, razon: 'Consumo en restaurante — deducible 91.5% si es con tarjeta y de negocios', regla: 'Art. 28 Fr. XX LISR - tope $8,850/mes' },
  },
  // Parcial — teléfono celular
  {
    keywords: ['celular', 'telcel', 'at&t', 'movistar', 'plan de datos'],
    resultado: { tipo: 'revisar', porcentaje: 50, razon: 'Teléfono celular — uso mixto, deducible 50%', regla: 'Criterio normativo' },
  },
  // Parcial — auto
  {
    keywords: ['gasolina', 'combustible', 'verificación', 'verificacion', 'tenencia', 'seguro auto', 'autopista', 'peaje', 'estacionamiento'],
    resultado: { tipo: 'revisar', porcentaje: 100, razon: 'Gasto de auto — verificar si es uso exclusivo del negocio', regla: 'Art. 28 Fr. XIII LISR - tope $175,000' },
  },
  // Anual — médicos
  {
    keywords: ['médico', 'medico', 'doctor', 'hospital', 'dentista', 'laboratorio', 'farmacia', 'lentes', 'óptica', 'optica'],
    resultado: { tipo: 'anual', porcentaje: 100, razon: 'Gastos médicos — solo deducción personal anual', regla: 'Art. 151 Fr. I LISR' },
  },
  // Anual — colegiaturas
  {
    keywords: ['colegiatura', 'escuela', 'universidad', 'inscripción', 'inscripcion'],
    resultado: { tipo: 'anual', porcentaje: 100, razon: 'Colegiaturas — solo deducción personal anual con topes', regla: 'Decreto 26/12/2013' },
  },
];

/**
 * Clasifica la deducibilidad de una factura recibida (egreso).
 */
export function clasificarDeducibilidad(
  usoCFDI: string,
  descripcionConceptos: string,
): ResultadoDeducibilidad {
  // 1. Primero checar por Uso CFDI (más confiable)
  const porUsoCFDI = REGLAS_USO_CFDI[usoCFDI];
  if (porUsoCFDI && porUsoCFDI.tipo !== 'mensual') {
    // Si el uso CFDI dice anual o no deducible, eso gana
    return porUsoCFDI;
  }

  // 2. Buscar por keywords en la descripción
  const descLower = descripcionConceptos.toLowerCase();
  for (const regla of REGLAS_KEYWORD) {
    if (regla.keywords.some((kw) => descLower.includes(kw))) {
      return regla.resultado;
    }
  }

  // 3. Si el uso CFDI dice mensual genérico (G03), confiar en eso
  if (porUsoCFDI) return porUsoCFDI;

  // 4. Default: marcar para revisar
  return {
    tipo: 'revisar',
    porcentaje: 100,
    razon: 'No se pudo clasificar automáticamente',
    regla: 'Requiere revisión del contador',
  };
}

// Labels y colores
export function tipoDeduccionLabel(tipo: TipoDeduccion): string {
  const map: Record<TipoDeduccion, string> = {
    mensual: 'Deducible mensual',
    anual: 'Solo anual',
    no_deducible: 'No deducible',
    revisar: 'Revisar',
  };
  return map[tipo];
}

export function tipoDeduccionColor(tipo: TipoDeduccion): string {
  const map: Record<TipoDeduccion, string> = {
    mensual: 'bg-green-100 text-green-700',
    anual: 'bg-blue-100 text-blue-700',
    no_deducible: 'bg-red-100 text-red-600',
    revisar: 'bg-amber-100 text-amber-700',
  };
  return map[tipo];
}

/**
 * Valida datos fiscales del XML contra los datos del negocio.
 */
export function validarDatosFiscales(
  rfcReceptor: string,
  cpReceptor: string,
  rfcNegocio: string,
  cpNegocio: string,
): { valido: boolean; errores: string[] } {
  const errores: string[] = [];

  if (rfcNegocio && rfcReceptor && rfcReceptor !== rfcNegocio) {
    errores.push(`RFC no coincide: factura dice ${rfcReceptor}, negocio tiene ${rfcNegocio}`);
  }

  if (cpNegocio && cpReceptor && cpReceptor !== cpNegocio) {
    errores.push(`Código postal no coincide: factura dice ${cpReceptor}, negocio tiene ${cpNegocio}`);
  }

  return { valido: errores.length === 0, errores };
}

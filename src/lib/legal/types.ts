import type { Language } from '@/lib/i18n';

/** Un apartado con su encabezado y sus párrafos. */
export type LegalSection = {
  heading: string;
  body: string[];
};

/**
 * Un documento legal completo, en un idioma.
 *
 * Es texto estructurado y no una cadena de Markdown a propósito: la pantalla lo
 * pinta con la tipografía y los colores del sistema de diseño, y el mismo
 * objeto sirve para generar la página pública sin volver a escribir el texto.
 */
export type LegalDocument = {
  title: string;
  /** ISO `AAAA-MM-DD`. Ambas tiendas piden que la política diga desde cuándo rige. */
  lastUpdated: string;
  intro: string[];
  sections: LegalSection[];
};

/** El mismo documento en los idiomas que habla la app. */
export type LocalizedLegalDocument = Record<Language, LegalDocument>;

/**
 * Los datos del responsable del tratamiento.
 *
 * ⚠️ TODOS SON PLACEHOLDERS Y HAY QUE SUSTITUIRLOS ANTES DE PUBLICAR. Una
 * política de privacidad sin un responsable identificable y una dirección de
 * contacto real no cumple el RGPD (art. 13) y las dos tiendas la rechazan.
 *
 * Se dejan aquí, juntos y en un solo sitio, para que rellenarlos sea una
 * edición de cuatro líneas y no una caza por dentro de los textos.
 */
export const LEGAL_CONTACT = {
  /** Nombre o razón social de quien responde por los datos. */
  entity: '[PENDIENTE: nombre o razón social del responsable]',
  /** Dirección de contacto para ejercer derechos. Tiene que estar viva. */
  email: '[PENDIENTE: correo de contacto]',
  /** Dominio donde viven las versiones públicas de estos textos (KAN-56). */
  site: '[PENDIENTE: dominio de la landing]',
  /**
   * Dónde está alojada la base de datos de Supabase. Determina si hay
   * transferencia internacional de datos que declarar: un proyecto en una
   * región de EE. UU. obliga a mencionarla, uno en la UE no.
   */
  hostingRegion: '[PENDIENTE: región del proyecto de Supabase]',
} as const;

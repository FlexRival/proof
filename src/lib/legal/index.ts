/**
 * Los textos legales de Prooffit, en un solo sitio.
 *
 * Viven dentro de la app (y no solo en la web) por tres motivos, y ninguno es
 * opcional:
 *
 *   1. Google Play exige que la política de privacidad que se enseña al pulsar
 *      el enlace del diálogo de permisos de Health Connect sea la misma que la
 *      de la ficha de la tienda. Android abre la app con un intent
 *      (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`) esperando
 *      encontrarla aquí dentro.
 *   2. Apple exige que el paywall enlace a unos términos que se puedan leer.
 *   3. Se leen sin conexión. Un revisor con mala red que pulsa «Privacidad» y
 *      ve una pantalla en blanco tiene un motivo de rechazo.
 *
 * La misma estructura sirve para generar las páginas públicas de la landing
 * (KAN-56) sin reescribir el texto: son datos, no JSX.
 */

import type { Language } from '@/lib/i18n';
import { privacyPolicy } from '@/lib/legal/privacy-policy';
import { termsOfService } from '@/lib/legal/terms';
import type { LegalDocument, LocalizedLegalDocument } from '@/lib/legal/types';

export type { LegalDocument, LegalSection, LocalizedLegalDocument } from '@/lib/legal/types';
export { LEGAL_CONTACT } from '@/lib/legal/types';

export const LEGAL_DOCUMENTS = {
  privacy: privacyPolicy,
  terms: termsOfService,
} as const satisfies Record<string, LocalizedLegalDocument>;

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENTS;

/**
 * El documento en el idioma pedido.
 *
 * No hay respaldo a otro idioma como en `i18n`: ambos documentos existen
 * completos en los dos idiomas, y servir media política traducida sería peor
 * que servirla entera en el idioma que no toca. Si algún día se añade un
 * idioma, el tipo `LocalizedLegalDocument` obliga a traducirlos antes de
 * compilar.
 */
export function legalDocument(key: LegalDocumentKey, language: Language): LegalDocument {
  return LEGAL_DOCUMENTS[key][language];
}

import { LegalDocumentView } from '@/components/organisms/legal-document-view';

/**
 * Política de privacidad.
 *
 * Se llega desde Ajustes → Cuenta → Privacidad, desde el pie del paywall, y
 * —en Android— desde el enlace de privacidad del propio diálogo de permisos de
 * Health Connect, que abre la app con un intent para enseñar esto.
 *
 * Vive fuera de las pestañas y **fuera de los dos** `Stack.Protected`: tiene
 * que poder leerse sin haber iniciado sesión. Alguien que está decidiendo si
 * se registra es exactamente quien más necesita leerla.
 */
export default function PrivacyScreen() {
  return <LegalDocumentView documentKey="privacy" />;
}

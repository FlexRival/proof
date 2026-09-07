import { LegalDocumentView } from '@/components/organisms/legal-document-view';

/**
 * Términos de uso.
 *
 * El enlace del pie del paywall es el que importa para publicar: Apple exige
 * que una pantalla de compra de suscripción enlace a unos términos legibles
 * donde consten la renovación automática y cómo cancelarla.
 *
 * Fuera de los dos `Stack.Protected`, igual que la política de privacidad: se
 * aceptan al registrarse, así que hay que poder leerlos antes de tener cuenta.
 */
export default function TermsScreen() {
  return <LegalDocumentView documentKey="terms" />;
}

import { useCallback, useSyncExternalStore } from 'react';

import {
  getLanguage,
  setLanguage,
  subscribeToLanguage,
  translate,
  type Language,
} from '@/lib/i18n';

/**
 * Textos de la app en el idioma activo, y con qué cambiarlo.
 *
 * `useSyncExternalStore` es lo que hace que cambiar el idioma repinte **todas**
 * las pantallas montadas y no solo Ajustes: cada una queda suscrita al mismo
 * store por el simple hecho de llamar a este hook.
 *
 * Por eso las pantallas no llaman nunca a `translate()` directamente. Esa
 * función traduce igual de bien, pero no suscribe a nada: quien la use a pelo
 * se queda con el idioma viejo hasta que algo más la haga renderizar, y el
 * resultado es media pantalla en cada idioma.
 */
export function useTranslation() {
  const language = useSyncExternalStore(subscribeToLanguage, getLanguage, getLanguage);

  // `language` no se usa dentro de la función, pero es dependencia de verdad:
  // es lo que hace que `t` sea una función nueva al cambiar de idioma y, por
  // tanto, que los componentes memoizados que la reciban se repinten.
  const t = useCallback(
    (key: string, options?: Record<string, unknown>) => translate(key, options),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [language],
  );

  return { t, language, setLanguage };
}

export type { Language };

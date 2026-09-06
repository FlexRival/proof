import { getLocales } from 'expo-localization';
import { I18n } from 'i18n-js';

import { FALLBACK_LANGUAGE, isLanguage, type Language } from '@/lib/i18n/languages';
// El nombre viene de su primer uso (la sesión de Supabase), pero es el
// almacén local del dispositivo a secas: `localStorage` en web, el polyfill de
// `expo-sqlite` en nativo. Sirve igual para recordar el idioma.
import { authStorage as deviceStorage } from '@/lib/storage';
import { en } from '@/lib/i18n/translations/en';
import { es } from '@/lib/i18n/translations/es';

export type { Language } from '@/lib/i18n/languages';
export { LANGUAGES, LANGUAGE_NAMES } from '@/lib/i18n/languages';

/** Dónde se recuerda la elección del usuario entre arranques. */
const STORAGE_KEY = 'proofit.language';

const i18n = new I18n({ en, es });

// Si a una clave le falta la traducción, se cae al inglés en vez de pintar el
// nombre técnico de la clave: un texto en el idioma que no toca se entiende,
// un `friends.emptyTitle` en mitad de la pantalla no.
i18n.enableFallback = true;
i18n.defaultLocale = FALLBACK_LANGUAGE;

/**
 * Qué idioma habla el teléfono, si la app lo tiene. `getLocales()` viene
 * ordenado por preferencia del usuario, así que se coge el primero que
 * podamos hablar y no simplemente el primero de la lista.
 */
function deviceLanguage(): Language {
  for (const locale of getLocales()) {
    if (isLanguage(locale.languageCode)) {
      return locale.languageCode;
    }
  }

  return FALLBACK_LANGUAGE;
}

/**
 * Lo que el usuario eligió a mano, si eligió algo. Leer de disco puede fallar
 * (modo incógnito, almacenamiento bloqueado) y quedarse sin idioma no es
 * motivo para no arrancar: se cae a lo que diga el dispositivo.
 */
function storedLanguage(): Language | null {
  try {
    const stored = deviceStorage.getItem(STORAGE_KEY);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * La elección explícita manda sobre el idioma del sistema: si alguien puso la
 * app en inglés teniendo el móvil en español, es porque lo quiere así.
 */
let current: Language = storedLanguage() ?? deviceLanguage();
i18n.locale = current;

/**
 * Quién quiere enterarse de un cambio de idioma. Son las pantallas montadas:
 * cambiar el idioma tiene que repintarlas todas, no solo Ajustes.
 */
const listeners = new Set<() => void>();

export function getLanguage(): Language {
  return current;
}

export function setLanguage(next: Language): void {
  if (next === current) {
    return;
  }

  current = next;
  i18n.locale = next;

  try {
    deviceStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Que no se pueda recordar la elección no impide aplicarla ahora: se
    // pierde al reiniciar, que es mucho menos malo que no cambiar el idioma.
  }

  listeners.forEach((listener) => listener());
}

export function subscribeToLanguage(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Traduce una clave. Las variables van en el segundo argumento y se escriben
 * `%{nombre}` en el catálogo.
 *
 * **No la llames directamente desde una pantalla**: usa `useTranslation()`.
 * Esta función lee el idioma de ahora, pero no le dice a React que hay que
 * repintar cuando cambie, así que una pantalla que la use a pelo se queda en
 * el idioma anterior hasta que algo más la haga renderizar.
 */
export function translate(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options);
}

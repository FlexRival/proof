/**
 * Qué idiomas habla la app.
 *
 * Vive aparte de los catálogos y del motor de traducción porque lo necesitan
 * los tres: el catálogo para exigir que estén todos traducidos, el motor para
 * validar lo que venga del dispositivo o de disco, y el selector de Ajustes
 * para pintar la lista. Tenerlo en un solo sitio es lo que hace que añadir un
 * idioma sea tocar aquí y que TypeScript señale todo lo que falta.
 */

export const LANGUAGES = ['en', 'es'] as const;

export type Language = (typeof LANGUAGES)[number];

/**
 * El que se usa si el dispositivo habla algo que la app no tiene. Inglés
 * porque es el idioma en el que están escritas las pantallas de origen.
 */
export const FALLBACK_LANGUAGE: Language = 'en';

/**
 * Cómo se llama cada idioma **en ese idioma**: quien busca su lengua en una
 * lista la reconoce por su propio nombre, no por el nombre traducido a un
 * idioma que no entiende. Por eso esto no pasa por el catálogo.
 */
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  es: 'Español',
};

export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value);
}

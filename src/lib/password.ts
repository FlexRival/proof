/**
 * Reglas de contraseña de la app.
 *
 * Viven aquí y no dentro de la pantalla de login porque desde que existe la
 * recuperación de cuenta hay **dos** formularios que crean una contraseña
 * (`login` al registrarse y `reset-password` al recuperarla), y dos mínimos que
 * pudieran separarse serían un formulario que acepta lo que el otro rechaza.
 */

/**
 * Mínimo que exige Supabase Auth por defecto. Se comprueba también en el
 * cliente para poder decirlo *antes* de enviar: si solo lo valida el servidor,
 * el usuario rellena el formulario entero para que le rebote.
 *
 * Si el proyecto sube el mínimo en su configuración, este número se queda corto
 * y el servidor seguirá rechazando — su error se enseña tal cual, así que el
 * formulario no miente, solo deja de adelantarse.
 */
export const MIN_PASSWORD_LENGTH = 6;

export function isLongEnough(password: string): boolean {
  return password.length >= MIN_PASSWORD_LENGTH;
}

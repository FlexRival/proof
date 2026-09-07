import * as Linking from 'expo-linking';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { ROUTES } from '@/constants/routes';
import { profileRepository } from '@/repositories';

/** Ruta del enlace de recuperación. Se usa para construirlo y para atenderlo. */
export const RESET_PASSWORD_PATH = 'reset-password';

/**
 * La URL a la que el correo de recuperación devuelve al usuario.
 *
 * En móvil es un enlace profundo al esquema de la app (`proof://`); en web, la
 * URL de la propia página. `Linking.createURL` resuelve las dos, y por eso no la
 * construye el repositorio: depende de la plataforma y del esquema, que son cosa
 * de la app y no del backend.
 *
 * **Hay que darla de alta en Supabase** (Authentication → URL Configuration →
 * Redirect URLs) o el enlace del correo la ignorará y mandará al Site URL.
 */
export function passwordResetRedirectUrl(): string {
  return Linking.createURL(RESET_PASSWORD_PATH);
}

/**
 * Atiende los enlaces que abren la app desde un correo de autenticación (hoy
 * solo el de recuperar la cuenta).
 *
 * Vive en el layout raíz porque el enlace puede llegar de dos formas muy
 * distintas: con la app cerrada —y entonces es la URL que la arranca— o con la
 * app ya abierta de fondo. `Linking.useURL()` cubre las dos: devuelve la inicial
 * y luego cada una nueva.
 *
 * El error se devuelve en vez de tragárselo: un enlace caducado es el caso más
 * corriente de todos (duran una hora) y el usuario tiene que saber qué le pasa,
 * o se queda mirando un login que no reacciona.
 */
export function useAuthLink() {
  const [error, setError] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  /**
   * Las URLs ya atendidas. `useURL()` devuelve la misma cadena en cada render
   * mientras no llegue otra, así que sin esto se reintentaría el mismo enlace en
   * bucle — y el segundo intento fallaría, porque el token de recuperación es de
   * un solo uso.
   */
  const handled = useRef(new Set<string>());
  const url = Linking.useURL();

  /**
   * El `Stack` del layout raíz no se monta hasta que se sabe si hay sesión
   * (mientras tanto devuelve `null`), así que con la app cerrada el enlace puede
   * resolverse **antes** de que exista navegador al que pedirle nada. Sin esta
   * espera, ese `replace` se perdería y el usuario acabaría en la pantalla
   * principal en vez de en la de contraseña nueva — justo el caso más común,
   * porque el enlace se abre desde el correo con la app cerrada.
   */
  const navigatorReady = Boolean(useRootNavigationState()?.key);
  const navigated = useRef(false);

  useEffect(() => {
    if (!recovered || !navigatorReady || navigated.current) {
      return;
    }

    navigated.current = true;
    // Se sustituye la pantalla en vez de apilarla: volver atrás desde «cambia tu
    // contraseña» no debería devolver al login del que se salió hace media hora.
    router.replace(ROUTES.resetPassword.href);
  }, [recovered, navigatorReady]);

  useEffect(() => {
    if (!url || handled.current.has(url)) {
      return;
    }

    handled.current.add(url);
    let active = true;

    async function open(link: string) {
      try {
        const purpose = await profileRepository.resumeSessionFromLink(link);

        // No navega aquí: solo deja constancia de que hay que hacerlo. Quien
        // navega es el efecto de arriba, en cuanto el navegador exista.
        if (active && purpose === 'recovery') {
          setError(null);
          setRecovered(true);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Ese enlace no funciona.');
        }
      }
    }

    void open(url);

    return () => {
      active = false;
    };
  }, [url]);

  return { error };
}

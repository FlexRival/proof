import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';

import { AnimatedSplashOverlay } from '@/components/atoms/animated-icon';
import { FONT_ASSETS } from '@/constants/theme';
import { useAuthLink } from '@/hooks/use-auth-link';
import { useProfile } from '@/hooks/use-profile';
import { useSubscriptionSync } from '@/hooks/use-subscription-sync';

SplashScreen.preventAutoHideAsync();

/**
 * Layout raíz: un `Stack` con el grupo de pestañas dentro, detrás de una
 * puerta de sesión (`Stack.Protected`).
 *
 * El `Stack` no es decorativo. Antes la app era solo un navegador de
 * pestañas, y un navegador de pestañas únicamente registra las rutas que
 * tienen trigger: `/settings` existía como archivo pero abrirla pintaba la
 * pantalla principal. Todo lo que no es pestaña —ajustes, la subida de
 * nivel— necesita esta capa para poder abrirse encima de las pestañas y
 * poder cerrarse volviendo atrás.
 *
 * `Stack.Protected` decide en cada render qué mitad del árbol existe según
 * `isSignedIn`: no es un `if` que se salta una vez, así que un logout hace
 * que las pantallas de dentro se desmonten solas y aparezca `login`, sin
 * `router.replace` manual — y al revés tras un login/signup exitoso.
 */
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(FONT_ASSETS);
  const { state: profileState, reload: reloadProfile } = useProfile();

  // Atiende el enlace del correo de recuperación. Va aquí y no en el login
  // porque el enlace puede llegar con la app cerrada, y entonces es la URL que
  // la arranca: para cuando el login se monte, ya habría pasado.
  useAuthLink();

  // Mantiene el SDK de RevenueCat al día con la sesión y con `profiles.is_pro`.
  useSubscriptionSync(profileState, reloadProfile);

  // Mismo truco que con las fuentes: mientras no sepamos si hay sesión, no
  // pintamos nada y el splash nativo se queda cubriendo — así no hay un
  // parpadeo de "login" seguido de un salto a "tabs" en cuanto llega la
  // sesión guardada.
  if ((!fontsLoaded && !fontError) || profileState.status === 'loading') return null;

  if (fontError) {
    console.warn('[fonts] no se pudieron cargar las fuentes de marca:', fontError.message);
  }

  const isSignedIn = profileState.status === 'ready';

  return (
    <ThemeProvider value={DarkTheme}>
      <AnimatedSplashOverlay />

      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={isSignedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" />
          {/*
            La subida de nivel se presenta como modal: tapa las pestañas
            mientras dura la celebración y su «Continue» es un `back` que
            devuelve exactamente a donde estabas.
          */}
          <Stack.Screen name="level-up" options={{ presentation: 'modal' }} />
          <Stack.Screen name="duel-result" options={{ presentation: 'modal' }} />
          {/*
            Crear un duelo también es modal: es una tarea con principio y fin
            que se abre encima de donde estabas y te devuelve ahí al cerrarse.
            Sus tres pasos viven dentro de esta única pantalla.
          */}
          <Stack.Screen name="new-duel" options={{ presentation: 'modal' }} />
          {/*
            Buscar a quién añadir es otra tarea con principio y fin: se abre
            desde la lista de amigos y devuelve ahí al cerrarse.
          */}
          <Stack.Screen name="find-friends" options={{ presentation: 'modal' }} />
          {/*
            El perfil de un amigo sí es un destino, no una tarea: se apila
            sobre la lista de amigos y se vuelve con el botón de atrás, como
            ajustes.
          */}
          <Stack.Screen name="friend-profile" />
          {/*
            El paywall es tarea, no destino: se abre encima de lo que estabas
            haciendo cuando algo pide Pro, y su `✕` te devuelve justo ahí.
          */}
          <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        </Stack.Protected>

        <Stack.Protected guard={!isSignedIn}>
          <Stack.Screen name="login" />
          <Stack.Screen name="forgot-password" />
        </Stack.Protected>

        {/*
          Fuera de los dos guards a propósito. Se llega desde el enlace del
          correo, que abre sesión justo antes de navegar aquí: si la pantalla
          viviera dentro del guard de "con sesión", habría un render en el que
          la ruta todavía no existe y la navegación se perdería. Fuera, existe
          siempre y da igual el orden.
        */}
        <Stack.Screen name="reset-password" />

        {/*
          Los textos legales también viven fuera de los dos guards, por otro
          motivo: hay que poder leerlos SIN cuenta. Se aceptan al registrarse,
          así que meterlos detrás del guard de "con sesión" obligaría a aceptar
          algo que aún no se puede leer.

          Y en Android hay un tercer camino que no pasa por la app: el diálogo
          de permisos de Health Connect abre `privacy` en frío con un intent
          (`androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE`). Si esa ruta
          solo existiera con sesión iniciada, ese enlace —que Google comprueba—
          llevaría al login.
        */}
        <Stack.Screen name="privacy" />
        <Stack.Screen name="terms" />
      </Stack>
    </ThemeProvider>
  );
}

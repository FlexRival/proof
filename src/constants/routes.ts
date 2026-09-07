import type { Href } from 'expo-router';

/**
 * Contrato de rutas de la app: un sitio único que dice qué rutas existen, su
 * texto y si aparecen en la barra de navegación. `Href` viene de los tipos
 * generados por Expo Router (rutas tipadas) — si el archivo de la ruta no
 * existe, esto no compila.
 *
 * `NativeTabs` (la barra nativa, en `app-tabs.tsx`) no admite generar tabs
 * dinámicamente — cada `NativeTabs.Trigger` se escribe a mano — así que este
 * contrato no sustituye esos triggers, pero sí es de donde salen su texto y
 * su href. La barra web (`app-tabs.web.tsx`) sí puede recorrer `TAB_ROUTES`
 * con un `.map()`.
 */
export type RouteKey =
  | 'home'
  | 'duels'
  | 'friends'
  | 'profile'
  | 'settings'
  | 'levelUp'
  | 'duelResult'
  | 'newDuel'
  | 'findFriends'
  | 'friendProfile'
  | 'paywall'
  | 'login';

export type RouteDefinition = {
  key: RouteKey;
  href: Href;
  label: string;
  /** Si aparece en la barra de navegación. */
  tab: boolean;
};

export const ROUTES: Record<RouteKey, RouteDefinition> = {
  home: { key: 'home', href: '/', label: 'Home', tab: true },
  duels: { key: 'duels', href: '/duels', label: 'Duels', tab: true },
  friends: { key: 'friends', href: '/friends', label: 'Friends', tab: true },
  profile: { key: 'profile', href: '/profile', label: 'Profile', tab: true },
  /**
   * Existe como ruta (para que enlazar a ella desde cualquier pantalla esté
   * tipado) pero no tiene entrada en la barra de navegación todavía. La
   * pantalla en `src/app/settings.tsx` es un placeholder sin contenido real.
   */
  settings: { key: 'settings', href: '/settings', label: 'Settings', tab: false },
  /**
   * Celebración, no destino: se abre con los niveles en la URL
   * (`/level-up?from=11&to=12`) cuando un duelo hace subir de nivel, y se
   * cierra volviendo atrás. Nunca va en la barra de navegación — el `href`
   * de aquí es la ruta pelada, sin parámetros, y quien la abre los añade.
   */
  levelUp: { key: 'levelUp', href: '/level-up', label: 'Level up', tab: false },
  /**
   * Cómo acabó un duelo: victoria, derrota o empate. Mismo trato que `levelUp`
   * — se abre con el id del duelo en la URL (`/duel-result?duel=<uuid>`) y se
   * cierra volviendo atrás. El `href` de aquí es la ruta pelada; quien la abre
   * pone el parámetro.
   *
   * Antes era `/victory` y llevaba el resultado entero en la URL, porque no
   * había ningún duelo real que consultar. Desde KAN-32 lo hay, así que la
   * pantalla lo carga por id y el nombre dejó de mentir: la derrota también
   * tiene pantalla.
   */
  duelResult: { key: 'duelResult', href: '/duel-result', label: 'Duel result', tab: false },
  /**
   * Asistente de crear duelo. Tampoco es destino de la barra: se abre desde el
   * atajo de la pantalla principal (`/new-duel`) o desde el botón de retar de
   * una fila de amigos, que trae el rival ya elegido
   * (`/new-duel?opponent=@alexruiz`). El `href` de aquí es la ruta pelada.
   */
  newDuel: { key: 'newDuel', href: '/new-duel', label: 'New duel', tab: false },
  /**
   * Buscar gente a la que mandar solicitud de amistad. Tarea, no destino: se
   * abre desde la lista de amigos —tanto desde «Add friend» como desde el
   * vacío de «Find friends»— y se cierra volviendo.
   */
  findFriends: { key: 'findFriends', href: '/find-friends', label: 'Find friends', tab: false },
  /**
   * Perfil de otro jugador. Se abre desde una fila de la lista de amigos con
   * el usuario en la URL (`/friend-profile?username=@alexruiz`); el `href` de
   * aquí es la ruta pelada, y quien la abre pone el parámetro.
   */
  friendProfile: {
    key: 'friendProfile',
    href: '/friend-profile',
    label: 'Friend profile',
    tab: false,
  },
  /**
   * Paywall de Pro. Tarea con principio y fin, como `newDuel`: se abre encima
   * de donde estabas y se cierra con la `✕`.
   *
   * **Todavía no la abre nadie.** Falta decidir qué se bloquea detrás de Pro
   * (KAN-25) para saber desde dónde se ofrece; mientras tanto se llega por
   * URL (`/paywall`). Tenerla aquí es lo que hace que enlazarla desde
   * cualquier pantalla sea un cambio de una línea y siga estando tipado.
   */
  paywall: { key: 'paywall', href: '/paywall', label: 'Go Pro', tab: false },
  /**
   * Puerta de entrada sin sesión. No se navega a mano: `src/app/_layout.tsx`
   * la muestra u oculta con `Stack.Protected` según haya sesión o no.
   */
  login: { key: 'login', href: '/login', label: 'Sign in', tab: false },
};

/** Solo las rutas de la barra de navegación, en el orden en que se pintan. */
export const TAB_ROUTES: RouteDefinition[] = Object.values(ROUTES).filter((route) => route.tab);

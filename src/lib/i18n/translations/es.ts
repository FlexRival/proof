import type { Translations } from '@/lib/i18n/translations/en';

/**
 * Catálogo en español.
 *
 * El tipo `Translations` lo ata al inglés: si falta una clave, esto no
 * compila.
 *
 * Dos criterios de traducción que se siguen en todo el archivo:
 * - **Se tutea**, no se trata de usted. La app se dirige al jugador como lo
 *   haría el amigo que le acaba de retar, que es de lo que va el producto.
 * - **Las mayúsculas se conservan** donde el diseño las usa como etiqueta
 *   (`FRIENDS` → `AMIGOS`): son parte de la retícula visual, no énfasis.
 */
export const es: Translations = {
  common: {
    back: 'Atrás',
    settings: 'Ajustes',
    level: 'NIVEL %{level}',
    levelShort: 'NV %{level}',
    somethingWentWrong: 'Algo ha fallado. Inténtalo otra vez.',
  },

  xp: {
    progress: '%{into} / %{total} XP',
    toNextLevel: '%{remaining} XP PARA NV %{level}',
  },

  nav: {
    home: 'Inicio',
    duels: 'Duelos',
    friends: 'Amigos',
    profile: 'Perfil',
  },

  login: {
    tagline: 'Tus pasos. Los suyos. Un ganador.',
    signIn: 'Entrar',
    signUp: 'Crear cuenta',
    username: 'Nombre de usuario',
    usernamePlaceholder: 'Heroe_1234',
    email: 'Correo',
    emailPlaceholder: 'tu@ejemplo.com',
    password: 'Contraseña',
    passwordHint: 'Mínimo %{count} caracteres.',
    createAccount: 'Crear cuenta',
    signingIn: 'Entrando…',
    creatingAccount: 'Creando cuenta…',
    confirmEmail: 'Confirma tu cuenta desde el correo que te hemos enviado antes de entrar.',
    showPassword: 'Mostrar contraseña',
    hidePassword: 'Ocultar contraseña',
    show: 'VER',
    hide: 'OCULTAR',
  },

  home: {
    todaysSteps: 'PASOS DE HOY',
    toGoal: '+%{remaining} para la meta · %{goal}',
    currentDuel: 'DUELO EN CURSO',
    viewDuel: 'Ver duelo',
    challengeAFriend: 'Retar a un amigo',
    emptyTitle: 'NINGÚN DUELO ACTIVO',
    emptyMessage: 'Reta a alguien y demuestra quién puede más.',
    stepsIntoXp: 'Gana un duelo para convertir pasos en XP',
  },

  duels: {
    title: 'DUELOS',
    subtitle: 'Demuestra quién puede más.',
    filterActive: 'ACTIVOS',
    filterPending: 'PENDIENTES',
    filterHistory: 'HISTORIAL',
    noFinished: 'Todavía no has terminado ningún duelo.',
    noActive: 'Todavía no tienes duelos activos.',
    noPending: 'No hay duelos pendientes.',
    leading: 'VAS GANANDO',
    behind: 'VAS PERDIENDO',
    versus: 'VS',
    steps: 'PASOS',
    viewDuelVs: 'Ver duelo contra %{opponent}',
    vsOpponent: 'contra %{opponent}',
    ahead: '%{gap} POR DELANTE',
    behindBy: '%{gap} POR DETRÁS',
    incoming: 'RECIBIDOS',
  },

  friends: {
    title: 'AMIGOS',
    addFriend: 'Añadir amigo',
    requests: 'SOLICITUDES',
    allFriends: 'TODOS · %{count}',
    noMatches: 'Ningún amigo coincide con esa búsqueda.',
    loading: 'Cargando amigos…',
    signedOut: 'Inicia sesión para ver a tus amigos.',
    emptyTitle: 'BUSCA TU RIVAL',
    emptyMessage: 'Añade amigos para empezar a competir.',
    emptyAction: 'Buscar amigos',
    emptyNote: 'Invita por nombre de usuario o comparte tu enlace',
    versus: 'VS',
    accept: 'Aceptar',
    decline: 'Rechazar',
    challenge: 'Retar',
    levelAndStreak: 'NV %{level} · 🔥 %{days} DÍAS',
    openProfile: 'Abrir el perfil de %{username}',
    respondFailed: 'No se pudo responder la solicitud.',
  },

  findFriends: {
    title: 'BUSCAR AMIGOS',
    searchPlaceholder: 'Busca por nombre de usuario',
    hint: 'Busca a alguien por su nombre de usuario para retarle.',
    searching: 'Buscando…',
    noResults: 'No hay nadie con “%{query}”.',
    add: 'Añadir',
    sending: 'Enviando…',
    alreadyFriends: 'AMIGOS',
    requested: 'ENVIADA',
    askedYou: 'TE HA PEDIDO',
    searchFailed: 'No se pudo buscar. Inténtalo otra vez.',
    sendFailed: 'No se pudo enviar la solicitud.',
  },

  profile: {
    title: 'PERSONAJE',
    wins: 'VICTORIAS',
    losses: 'DERROTAS',
    winRate: '% VICTORIAS',
    duels: 'DUELOS',
    streak: 'RACHA',
    totalSteps: 'PASOS TOTALES',
  },

  settings: {
    title: 'AJUSTES',
    changePhoto: 'Cambiar foto',
    uploading: 'Subiendo…',
    joined: 'NV %{level} · DESDE %{date}',
    photoPermission: 'Permite el acceso a tus fotos en los ajustes del dispositivo para poner una.',
    photoUnreadable: 'No se pudo leer esa foto. Prueba con otra.',
    photoUploadFailed: 'No se pudo subir la foto.',
    logOutFailed: 'No se pudo cerrar sesión.',
    activitySource: 'ORIGEN DE LA ACTIVIDAD',
    stepTracking: 'Conteo de pasos',
    dailyStepGoal: 'Meta diaria de pasos',
    language: 'IDIOMA',
    notifications: 'NOTIFICACIONES',
    leadChanges: 'Cambios de líder',
    duelInvites: 'Invitaciones a duelo',
    dailyStepSummary: 'Resumen diario de pasos',
    account: 'CUENTA',
    privacy: 'Privacidad y visibilidad',
    logOut: 'Cerrar sesión',
  },
};

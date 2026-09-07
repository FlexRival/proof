/**
 * Catálogo en inglés — **el original**. Las pantallas se escribieron en
 * inglés, así que este archivo es la referencia: si una cadena está aquí y no
 * en otro idioma, el motor cae a esta (ver `enableFallback` en
 * `src/lib/i18n/index.ts`).
 *
 * `es.ts` está tipado contra este objeto, así que añadir una clave aquí
 * rompe la compilación hasta que se traduzca. Ese es el punto: una traducción
 * que falta se descubre al compilar, no al verla en pantalla.
 *
 * Las variables se escriben `%{nombre}` (formato de i18n-js).
 *
 * **PROOFIT no está aquí**: es la marca, y una marca no se traduce.
 */
export const en = {
  common: {
    back: 'Back',
    settings: 'Settings',
    level: 'LEVEL %{level}',
    levelShort: 'LV %{level}',
    somethingWentWrong: 'Something went wrong. Try again.',
  },

  xp: {
    progress: '%{into} / %{total} XP',
    toNextLevel: '%{remaining} XP TO LV %{level}',
  },

  nav: {
    home: 'Home',
    duels: 'Duels',
    friends: 'Friends',
    profile: 'Profile',
  },

  login: {
    tagline: 'Your steps. Their steps. One winner.',
    signIn: 'Sign in',
    signUp: 'Sign up',
    username: 'Username',
    usernamePlaceholder: 'Heroe_1234',
    email: 'Email',
    emailPlaceholder: 'you@example.com',
    password: 'Password',
    passwordHint: 'At least %{count} characters.',
    createAccount: 'Create account',
    signingIn: 'Signing in…',
    creatingAccount: 'Creating account…',
    confirmEmail: 'Check your email to confirm your account before signing in.',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    show: 'SHOW',
    hide: 'HIDE',
    forgotPassword: 'I forgot my password',
  },

  forgotPassword: {
    title: 'RECOVER\nYOUR ACCOUNT',
    subtitle: "Enter your email and we'll send you a link to set a new password.",
    send: 'Send the link',
    sending: 'Sending…',
    // Deliberadamente ambiguo: no confirma ni desmiente que ese email tenga
    // cuenta. Ver el comentario de `forgot-password.tsx`.
    sent: 'If %{email} has an account, the link is on its way. It expires in one hour.',
    checkSpam: 'No email? Check your spam folder.',
    backToSignIn: 'Back to sign in',
  },

  resetPassword: {
    title: 'NEW\nPASSWORD',
    subtitle: 'Choose the one you will use from now on.',
    doneSubtitle: 'Done. Your password has been changed.',
    newPassword: 'New password',
    save: 'Save password',
    saving: 'Saving…',
    continue: 'Go to the app',
    linkExpired: 'That link has expired or was already used. Ask for a new one.',
    askAgain: 'Send me another link',
  },

  home: {
    todaysSteps: "TODAY'S STEPS",
    toGoal: '+%{remaining} to goal · %{goal}',
    currentDuel: 'CURRENT DUEL',
    viewDuel: 'View duel',
    challengeAFriend: 'Challenge a friend',
    emptyTitle: 'NO ACTIVE DUELS',
    emptyMessage: "Challenge someone and prove who's got it.",
    stepsIntoXp: 'Win a duel to turn steps into XP',
    stepsOff: 'STEP TRACKING IS OFF',
    connectSteps: 'Connect steps',
    stepsUnavailable: "This device can't track steps.",
    stepsBlocked: 'Allow step access in your device settings.',
  },

  duels: {
    title: 'DUELS',
    subtitle: "Prove who's stronger.",
    filterActive: 'ACTIVE',
    filterPending: 'PENDING',
    filterHistory: 'HISTORY',
    noFinished: 'No finished duels yet.',
    noActive: 'No active duels yet.',
    noPending: 'No pending duels.',
    leading: 'YOU ARE LEADING',
    behind: 'YOU ARE BEHIND',
    versus: 'VS',
    steps: 'STEPS',
    viewDuelVs: 'View duel vs %{opponent}',
    vsOpponent: 'vs %{opponent}',
    ahead: 'AHEAD %{gap}',
    behindBy: 'BEHIND %{gap}',
    tied: 'TIED',
    incoming: 'INCOMING',
    outgoing: 'WAITING FOR THEM',
    pending: 'PENDING',
    accept: 'Accept',
    decline: 'Decline',
    challengedYou: 'Challenged you · %{days} days',
    youChallenged: 'You challenged them · %{days} days',
    endsInDays: 'ENDS IN %{days}D',
    endsToday: 'ENDS TODAY',
    closing: 'CLOSING…',
    loading: 'Loading duels…',
    signedOut: 'Sign in to see your duels.',
    respondFailed: 'Could not respond to that duel.',
    viewResult: 'View result',
    won: 'WON',
    lost: 'LOST',
    drew: 'DRAW',
  },

  duelResult: {
    eyebrow: {
      win: 'VICTORY',
      loss: 'DEFEAT',
      draw: 'DEAD HEAT',
    },
    headline: {
      win: 'YOU WIN',
      loss: 'YOU LOSE',
      draw: 'NO WINNER',
    },
    versus: 'vs %{opponent}',
    dayDuel: '%{days} DAY DUEL',
    finalSteps: 'FINAL STEPS',
    xpEarned: 'XP EARNED',
    noXp: 'NO XP',
    tagline: 'YOUR STEPS. THEIR STEPS.',
    levelUp: 'LEVEL UP!',
    share: 'Share result',
    sharing: 'Preparing…',
    continue: 'Continue',
    unavailable: 'Sharing is not available here.',
    failed: 'Could not share the image. Try again.',
  },

  friends: {
    title: 'FRIENDS',
    addFriend: 'Add friend',
    requests: 'REQUESTS',
    allFriends: 'ALL FRIENDS · %{count}',
    noMatches: 'No friends match that search.',
    loading: 'Loading friends…',
    signedOut: 'Sign in to see your friends.',
    emptyTitle: 'BUILD YOUR RIVALRY',
    emptyMessage: 'Add friends to start competing.',
    emptyAction: 'Find friends',
    emptyNote: 'Invite by username or share your link',
    versus: 'VS',
    accept: 'Accept',
    decline: 'Decline',
    challenge: 'Challenge',
    levelAndStreak: 'LV %{level} · 🔥 %{days} DAYS',
    openProfile: "Open %{username}'s profile",
    respondFailed: 'Could not respond to the request.',
  },

  findFriends: {
    title: 'FIND FRIENDS',
    searchPlaceholder: 'Search by username',
    hint: 'Search for someone by their username to challenge them.',
    searching: 'Searching…',
    noResults: 'No one found for “%{query}”.',
    add: 'Add',
    sending: 'Sending…',
    alreadyFriends: 'FRIENDS',
    requested: 'REQUESTED',
    askedYou: 'ASKED YOU',
    searchFailed: 'Could not search. Try again.',
    sendFailed: 'Could not send the request.',
  },

  profile: {
    title: 'CHARACTER',
    wins: 'WINS',
    losses: 'LOSSES',
    winRate: 'WIN RATE',
    duels: 'DUELS',
    streak: 'STREAK',
    totalSteps: 'TOTAL STEPS',
  },

  settings: {
    title: 'SETTINGS',
    changePhoto: 'Change photo',
    uploading: 'Uploading…',
    joined: 'LV %{level} · JOINED %{date}',
    photoPermission: 'Enable photo library access in your device settings to set a photo.',
    photoUnreadable: 'Could not read that photo. Try a different one.',
    photoUploadFailed: 'Could not upload the photo.',
    logOutFailed: 'Could not log out.',
    activitySource: 'ACTIVITY SOURCE',
    stepTracking: 'Step tracking',
    dailyStepGoal: 'Daily step goal',
    connected: 'CONNECTED',
    notConnected: 'NOT CONNECTED',
    unavailable: 'UNAVAILABLE',
    language: 'LANGUAGE',
    notifications: 'NOTIFICATIONS',
    leadChanges: 'Lead changes',
    duelInvites: 'Duel invites',
    dailyStepSummary: 'Daily step summary',
    account: 'ACCOUNT',
    privacy: 'Privacy and visibility',
    logOut: 'Log out',
  },
} as const;

/**
 * La forma del catálogo: las mismas claves que el inglés, pero con cualquier
 * texto dentro.
 *
 * El paso por `string` no es un detalle: `en` está declarado `as const`, así
 * que sin esto el tipo exigiría que la traducción española fuese *literalmente*
 * la cadena inglesa. Lo que se quiere obligar es que **no falte ninguna
 * clave**, no que el texto coincida.
 */
type SameShape<T> = {
  [K in keyof T]: T[K] extends string ? string : SameShape<T[K]>;
};

export type Translations = SameShape<typeof en>;

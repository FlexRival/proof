import { LEGAL_CONTACT, type LocalizedLegalDocument } from '@/lib/legal/types';

/**
 * Política de privacidad de ProofIt.
 *
 * NO ES UN TEXTO GENÉRICO, y no puede serlo: ProofIt lee datos de salud
 * (pasos), y eso activa tres regímenes a la vez que exigen cosas concretas y
 * comprobables:
 *
 *   * **Apple** — las reglas de HealthKit prohíben usar datos de salud para
 *     publicidad segmentada o cederlos a redes publicitarias, y obligan a
 *     declarar el uso en el cuestionario de App Privacy. Incumplirlo puede
 *     retirar la app YA PUBLICADA.
 *   * **Google Play** — usar Health Connect obliga a que la política de
 *     privacidad diga qué tipos de dato se leen y para qué, y a que sea la
 *     MISMA que se enseña al pulsar el enlace de privacidad dentro del diálogo
 *     de permisos de Health Connect. De ahí que esta pantalla exista dentro de
 *     la app y no solo en la web: Android la abre directamente.
 *   * **RGPD** — los pasos son dato de salud (art. 9): hacen falta base legal
 *     explícita, plazos de conservación y derechos ejercitables de verdad.
 *
 * Los apartados 4 («datos de salud») y 8 («borrar la cuenta») son los que
 * miran los revisores. No los recortes sin leer `docs/legal.md`.
 */
export const privacyPolicy: LocalizedLegalDocument = {
  es: {
    title: 'Política de privacidad',
    lastUpdated: '2026-09-07',
    intro: [
      'ProofIt convierte tus pasos diarios en progreso: subes de nivel, retas a tus amigos y compites por clanes. Para eso necesitamos algunos datos tuyos. Esta página explica exactamente cuáles, para qué, y cómo deshacerte de ellos.',
      'Está escrita para que se entienda. Si algo no se entiende, escríbenos y lo arreglamos.',
    ],
    sections: [
      {
        heading: '1. Quién trata tus datos',
        body: [
          `El responsable del tratamiento es ${LEGAL_CONTACT.entity}. Puedes contactar en ${LEGAL_CONTACT.email} para cualquier cosa relacionada con tus datos, incluido ejercer los derechos del apartado 9.`,
        ],
      },
      {
        heading: '2. Qué datos recogemos',
        body: [
          'Datos de cuenta: tu correo electrónico, tu nombre de usuario y tu contraseña. La contraseña no la vemos ni la guardamos: la gestiona nuestro proveedor de autenticación en forma cifrada.',
          'Datos de actividad: el número de pasos que das cada día. Nada más. No leemos ritmo cardíaco, ni peso, ni sueño, ni tu ubicación, ni tus rutas.',
          'Foto de perfil: solo si decides subir una. Es opcional y puedes cambiarla o dejarla vacía.',
          'Estado de tu suscripción: si eres usuario Pro, con qué producto y hasta cuándo. El pago lo procesa la tienda (App Store o Google Play); nosotros nunca vemos tu tarjeta.',
          'Datos de uso mínimos: el idioma del dispositivo, para enseñarte la app en tu idioma.',
        ],
      },
      {
        heading: '3. Para qué los usamos y con qué base legal',
        body: [
          'Para que la app funcione: crear tu cuenta, contar tus pasos, calcular tu XP y tu nivel, resolver tus duelos y llevar la cuenta de tu clan. Base legal: la ejecución del contrato que aceptas al registrarte.',
          'Para tratar tus pasos, que son datos de salud: tu consentimiento explícito, que das al conceder el permiso de actividad en tu teléfono. Puedes retirarlo cuando quieras desde los ajustes del sistema; la app seguirá funcionando, pero sin pasos no hay duelos.',
          'Para gestionar tu suscripción Pro y cumplir con nuestras obligaciones fiscales y contables. Base legal: ejecución del contrato y obligación legal.',
          'Para mantener el juego honesto: detectar y descartar pasos introducidos a mano o cifras imposibles. Base legal: nuestro interés legítimo en que el marcador que reparte premios no se pueda falsear.',
        ],
      },
      {
        heading: '4. Tus datos de salud: los compromisos que sí importan',
        body: [
          'Leemos únicamente el recuento de pasos, desde Apple Salud (iOS) o Health Connect (Android). Ningún otro tipo de dato de salud, aunque tu teléfono lo tenga.',
          'No usamos tus datos de salud para publicidad, ni segmentada ni de ningún tipo, y no los cedemos a ninguna red publicitaria, agregador de datos ni broker. ProofIt no tiene anuncios.',
          'No vendemos tus datos de salud. A nadie. Nunca.',
          'No los usamos para tomar decisiones sobre seguros, empleo, crédito ni nada parecido, ni los compartimos con quien lo haga.',
          'ProofIt no es un producto sanitario y no da consejo médico. Es un juego.',
          'Cuando borras tu cuenta, tus datos de salud se borran con ella. No guardamos copia.',
        ],
      },
      {
        heading: '5. Con quién los compartimos',
        body: [
          `Supabase, que aloja nuestra base de datos y gestiona la autenticación. Los datos residen en ${LEGAL_CONTACT.hostingRegion}.`,
          'RevenueCat, que gestiona el estado de las suscripciones. Recibe un identificador de usuario y lo relacionado con tu compra; no recibe tus pasos.',
          'Apple y Google, cuando compras una suscripción, como procesadores del pago.',
          'No hay nadie más. No compartimos tus datos con anunciantes, ni con brokers de datos, ni con analíticas de terceros.',
        ],
      },
      {
        heading: '6. Qué ven de ti las demás personas',
        body: [
          'Tu nombre de usuario, tu nivel y tu foto de perfil son visibles para otras personas que usen la app: así te encuentran para retarte o invitarte a su clan.',
          'Tus pasos son visibles para tu rival mientras dure un duelo, y suman al total de tu clan durante una guerra de clanes. Ese es el juego.',
          'Tu correo electrónico NO es visible para nadie más. Nunca aparece en búsquedas, perfiles ni clasificaciones.',
        ],
      },
      {
        heading: '7. Cuánto tiempo los conservamos',
        body: [
          'Mientras tengas la cuenta abierta. Si la borras, se borran con ella, de inmediato y sin papelera.',
          'Única excepción: los registros de facturación de las suscripciones, que estamos obligados a conservar por la normativa fiscal. Al borrar tu cuenta, esos registros dejan de estar asociados a ti — se quedan sin identificar a nadie.',
        ],
      },
      {
        heading: '8. Cómo borrar tu cuenta',
        body: [
          'Desde la app: Ajustes → Cuenta → Borrar cuenta. Te pediremos una confirmación y, al aceptarla, se borra todo: tu perfil, tus pasos, tus duelos, tus amistades y tu foto.',
          `Sin la app instalada: escríbenos a ${LEGAL_CONTACT.email} desde el correo de tu cuenta, o usa el formulario de ${LEGAL_CONTACT.site}. Resolveremos la solicitud en un plazo máximo de 30 días.`,
          'Si eras líder de un clan, el mando pasa automáticamente a otro miembro antes de borrarte, para que el clan de los demás no desaparezca contigo.',
          'El borrado es inmediato e irreversible. No hay periodo de gracia ni forma de recuperar la cuenta después.',
        ],
      },
      {
        heading: '9. Tus derechos',
        body: [
          'Puedes pedirnos acceder a tus datos, corregirlos, borrarlos, limitar u oponerte a su tratamiento, y recibir una copia en un formato portable. También puedes retirar tu consentimiento para los datos de actividad en cualquier momento.',
          `Para ejercerlos, escribe a ${LEGAL_CONTACT.email}. Responderemos en un plazo máximo de un mes.`,
          'Si crees que no hemos hecho las cosas bien, puedes reclamar ante la Agencia Española de Protección de Datos (www.aepd.es) o ante la autoridad de control de tu país.',
        ],
      },
      {
        heading: '10. Menores de edad',
        body: [
          'ProofIt no está dirigida a menores de 16 años y no recogemos datos de forma consciente de personas de esa edad. Si detectamos una cuenta de un menor de 16, la borraremos.',
        ],
      },
      {
        heading: '11. Cambios en esta política',
        body: [
          'Si cambiamos algo relevante, actualizaremos la fecha de arriba y te avisaremos dentro de la app antes de que el cambio te afecte. Seguir usando ProofIt después de un cambio significa que lo aceptas.',
        ],
      },
    ],
  },

  en: {
    title: 'Privacy Policy',
    lastUpdated: '2026-09-07',
    intro: [
      'ProofIt turns your daily steps into progress: you level up, challenge your friends and compete for clans. That needs some data from you. This page explains exactly what we collect, what for, and how to get rid of it.',
      "It is written to be understood. If something isn't clear, write to us and we will fix it.",
    ],
    sections: [
      {
        heading: '1. Who processes your data',
        body: [
          `The data controller is ${LEGAL_CONTACT.entity}. You can reach us at ${LEGAL_CONTACT.email} about anything related to your data, including exercising the rights in section 9.`,
        ],
      },
      {
        heading: '2. What we collect',
        body: [
          'Account data: your email address, your username and your password. We never see or store the password itself — our authentication provider handles it in encrypted form.',
          'Activity data: how many steps you take each day. Nothing else. We do not read heart rate, weight, sleep, your location or your routes.',
          'Profile photo: only if you choose to upload one. It is optional and you can change it or leave it empty.',
          'Subscription status: whether you are a Pro user, which product and until when. Payment is processed by the store (App Store or Google Play); we never see your card.',
          'Minimal usage data: your device language, so we can show you the app in your language.',
        ],
      },
      {
        heading: '3. What we use it for, and our legal basis',
        body: [
          'To make the app work: create your account, count your steps, calculate your XP and level, settle your duels and keep your clan running. Legal basis: performance of the contract you accept when you sign up.',
          'To process your steps, which are health data: your explicit consent, given when you grant the activity permission on your phone. You can withdraw it at any time from your system settings; the app will keep working, but without steps there are no duels.',
          'To manage your Pro subscription and meet our tax and accounting obligations. Legal basis: performance of the contract and legal obligation.',
          'To keep the game honest: detecting and discarding manually entered steps and impossible figures. Legal basis: our legitimate interest in a scoreboard that hands out prizes and cannot be faked.',
        ],
      },
      {
        heading: '4. Your health data: the commitments that actually matter',
        body: [
          'We read step counts only, from Apple Health (iOS) or Health Connect (Android). No other kind of health data, even if your phone has it.',
          'We do not use your health data for advertising of any kind, targeted or otherwise, and we do not pass it to any ad network, data aggregator or broker. ProofIt has no ads.',
          'We do not sell your health data. To anyone. Ever.',
          'We do not use it for decisions about insurance, employment or credit, and we do not share it with anyone who does.',
          'ProofIt is not a medical device and gives no medical advice. It is a game.',
          'When you delete your account, your health data is deleted with it. We keep no copy.',
        ],
      },
      {
        heading: '5. Who we share it with',
        body: [
          `Supabase, which hosts our database and handles authentication. Data is stored in ${LEGAL_CONTACT.hostingRegion}.`,
          'RevenueCat, which manages subscription state. It receives a user identifier and your purchase details; it does not receive your steps.',
          'Apple and Google, when you buy a subscription, as payment processors.',
          'Nobody else. We do not share your data with advertisers, data brokers or third-party analytics.',
        ],
      },
      {
        heading: '6. What other people can see',
        body: [
          'Your username, level and profile photo are visible to other people using the app — that is how they find you to challenge you or invite you to their clan.',
          'Your steps are visible to your opponent for the duration of a duel, and count towards your clan total during a clan war. That is the game.',
          'Your email address is NOT visible to anyone else. It never appears in searches, profiles or leaderboards.',
        ],
      },
      {
        heading: '7. How long we keep it',
        body: [
          'For as long as your account exists. If you delete it, the data goes with it, immediately and with no recycle bin.',
          'One exception: subscription billing records, which tax law requires us to retain. When you delete your account those records stop being linked to you — they are left identifying nobody.',
        ],
      },
      {
        heading: '8. How to delete your account',
        body: [
          'In the app: Settings → Account → Delete account. We ask you to confirm, and once you do everything goes: your profile, your steps, your duels, your friendships and your photo.',
          `Without the app installed: write to ${LEGAL_CONTACT.email} from your account email, or use the form at ${LEGAL_CONTACT.site}. We will resolve the request within 30 days at most.`,
          'If you led a clan, leadership passes automatically to another member before you are deleted, so that other people’s clan does not disappear with you.',
          'Deletion is immediate and irreversible. There is no grace period and no way to recover the account afterwards.',
        ],
      },
      {
        heading: '9. Your rights',
        body: [
          'You can ask us to access your data, correct it, delete it, restrict or object to its processing, and receive a copy in a portable format. You can also withdraw your consent for activity data at any time.',
          `To exercise them, write to ${LEGAL_CONTACT.email}. We will reply within one month at most.`,
          'If you think we have got something wrong, you can complain to the Spanish Data Protection Agency (www.aepd.es) or to the supervisory authority in your country.',
        ],
      },
      {
        heading: '10. Minors',
        body: [
          'ProofIt is not aimed at people under 16 and we do not knowingly collect their data. If we find an account belonging to someone under 16, we will delete it.',
        ],
      },
      {
        heading: '11. Changes to this policy',
        body: [
          'If we change anything material we will update the date above and tell you inside the app before the change affects you. Continuing to use ProofIt after a change means you accept it.',
        ],
      },
    ],
  },
};

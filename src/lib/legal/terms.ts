import { LEGAL_CONTACT, type LocalizedLegalDocument } from '@/lib/legal/types';

/**
 * Términos de uso de ProofIt.
 *
 * OBLIGATORIOS PORQUE HAY SUSCRIPCIÓN. Apple exige que el paywall enlace a
 * unos términos (propios o el EULA estándar de Apple) y que digan, sin
 * rodeos: qué se cobra, cada cuánto se renueva, y cómo se cancela — y que la
 * cancelación se hace en la cuenta de la tienda, no escribiéndonos a nosotros.
 * Eso es el apartado 4, y es el que provoca rechazos cuando falta.
 *
 * El apartado 3 (juego limpio) no es decorativo: es lo que da derecho a cerrar
 * una cuenta que falsea pasos. Sin una regla escrita, expulsar a alguien por
 * hacer trampas es una decisión arbitraria.
 *
 * Qué desbloquea Pro está deliberadamente descrito de forma abierta: hoy la
 * única ventaja real es quitar el cupo diario de duelos (KAN-25 sigue sin
 * decidir el resto). Prometer aquí funciones que no existen sería peor que no
 * prometer ninguna.
 */
export const termsOfService: LocalizedLegalDocument = {
  es: {
    title: 'Términos de uso',
    lastUpdated: '2026-09-07',
    intro: [
      'Estas son las reglas de usar ProofIt. Al crear una cuenta las aceptas. Son cortas a propósito.',
    ],
    sections: [
      {
        heading: '1. Qué es ProofIt',
        body: [
          'ProofIt es un juego. Cuenta los pasos que da tu teléfono y los convierte en progreso: niveles, duelos contra tus amigos y guerras entre clanes.',
          'No es una aplicación médica ni un producto sanitario. No mide tu salud, no diagnostica nada y no sustituye el consejo de un profesional. Si tienes dudas sobre si deberías hacer más ejercicio, pregunta a tu médico, no a nosotros.',
          'El recuento de pasos lo hace tu teléfono, no nosotros. Puede tener errores: los sensores no son perfectos y pueden contar de más o de menos.',
        ],
      },
      {
        heading: '2. Tu cuenta',
        body: [
          'Necesitas una cuenta para jugar. Tienes que dar un correo válido y elegir una contraseña, y eres responsable de mantenerla en secreto.',
          'Tienes que tener 16 años o más.',
          'Una persona, una cuenta. Nada de crear cuentas de más para retarte a ti mismo y farmear XP.',
          'Puedes borrar tu cuenta cuando quieras desde Ajustes → Cuenta → Borrar cuenta. Es inmediato y no tiene vuelta atrás.',
        ],
      },
      {
        heading: '3. Juego limpio',
        body: [
          'Los pasos que cuentan son los que has dado tú, andando. Nada más.',
          'No vale introducir pasos a mano en la app de salud de tu teléfono, usar aplicaciones que los generan, agitar el móvil con un aparato, atarlo a un animal, ni manipular las peticiones que la app hace a nuestro servidor.',
          'Descartamos automáticamente los pasos marcados como introducidos manualmente y recortamos las cifras imposibles. Si detectamos trampas de forma reiterada, podemos suspender o cerrar la cuenta sin devolver el importe de la suscripción en curso.',
          'Tampoco vale acosar, suplantar a otra persona ni elegir un nombre de usuario ofensivo. Podemos cambiar un nombre de usuario o cerrar una cuenta por esto.',
        ],
      },
      {
        heading: '4. Suscripción Pro',
        body: [
          'ProofIt se puede usar gratis. La suscripción Pro es opcional y desbloquea funciones adicionales, que se describen en la propia pantalla de compra en el momento de contratarla.',
          'El precio y la duración del periodo son los que aparecen en la pantalla de compra, ya en tu moneda, tal y como los facilita la tienda (App Store o Google Play).',
          'La suscripción se renueva automáticamente al final de cada periodo, y se te cobra el mismo importe, salvo que la canceles antes.',
          'Para cancelar, ve a los ajustes de suscripciones de tu cuenta de App Store o Google Play. La cancelación tiene efecto al final del periodo ya pagado: sigues siendo Pro hasta esa fecha. No podemos cancelarla nosotros por ti — la gestiona la tienda.',
          'Las devoluciones las decide la tienda según su propia política, no nosotros.',
          'Borrar tu cuenta de ProofIt NO cancela la suscripción. Cancélala primero en la tienda, o seguirá cobrándose.',
        ],
      },
      {
        heading: '5. Lo que es nuestro y lo que es tuyo',
        body: [
          'La app, su nombre, su diseño y su código son nuestros. Puedes usarlos para jugar, no para copiarlos, revenderlos ni hacer obras derivadas.',
          'Lo que subes —tu nombre de usuario, tu foto— sigue siendo tuyo. Nos das permiso para enseñarlo dentro de la app a otras personas usuarias, que es lo que hace falta para que el juego funcione.',
          'Las imágenes que genera la app para compartir tus duelos son tuyas: publícalas donde quieras.',
        ],
      },
      {
        heading: '6. Disponibilidad y cambios',
        body: [
          'Hacemos lo posible por que ProofIt funcione, pero no garantizamos que esté disponible sin interrupciones ni libre de errores.',
          'Podemos cambiar, añadir o retirar funciones. Si retiramos algo que estaba incluido en Pro, te avisaremos con antelación dentro de la app.',
          'Podemos dejar de prestar el servicio. Si eso ocurre, te avisaremos con antelación razonable y no te cobraremos periodos que no vayas a poder usar.',
        ],
      },
      {
        heading: '7. Responsabilidad',
        body: [
          'Usar ProofIt implica moverse. Hazlo con cabeza: mira por dónde andas, no uses el móvil cruzando la calle y no te fuerces más de lo que tu cuerpo aguanta. No respondemos de lesiones ni accidentes derivados de la actividad física que hagas.',
          'Salvo en lo que la ley no permita limitar, nuestra responsabilidad se limita al importe que hayas pagado por la suscripción en los doce meses anteriores.',
          'Nada de esto recorta los derechos que te reconoce la normativa de consumo si eres consumidor.',
        ],
      },
      {
        heading: '8. Ley aplicable',
        body: [
          'Estos términos se rigen por la ley española. Si eres consumidor, conservas el derecho a acudir a los tribunales de tu domicilio.',
          `Para cualquier duda: ${LEGAL_CONTACT.email}.`,
        ],
      },
    ],
  },

  en: {
    title: 'Terms of Use',
    lastUpdated: '2026-09-07',
    intro: [
      'These are the rules for using ProofIt. You accept them when you create an account. They are deliberately short.',
    ],
    sections: [
      {
        heading: '1. What ProofIt is',
        body: [
          'ProofIt is a game. It counts the steps your phone records and turns them into progress: levels, duels against your friends and wars between clans.',
          'It is not a medical app or a medical device. It does not measure your health, diagnose anything or replace professional advice. If you are unsure whether you should be exercising more, ask your doctor, not us.',
          'Your phone counts the steps, not us. It can get them wrong: sensors are not perfect and may count too many or too few.',
        ],
      },
      {
        heading: '2. Your account',
        body: [
          'You need an account to play. You must give a valid email address and choose a password, and you are responsible for keeping it secret.',
          'You must be 16 or older.',
          'One person, one account. No creating extra accounts to duel yourself and farm XP.',
          'You can delete your account whenever you like from Settings → Account → Delete account. It is immediate and cannot be undone.',
        ],
      },
      {
        heading: '3. Fair play',
        body: [
          'The steps that count are the ones you took, walking. Nothing else.',
          'No entering steps by hand in your phone’s health app, using apps that generate them, shaking your phone with a device, strapping it to an animal, or tampering with the requests the app makes to our server.',
          'We automatically discard steps flagged as manually entered and trim impossible figures. If we find repeated cheating, we may suspend or close the account without refunding the subscription period in progress.',
          'Harassment, impersonating someone else and offensive usernames are not allowed either. We may change a username or close an account over this.',
        ],
      },
      {
        heading: '4. Pro subscription',
        body: [
          'ProofIt is free to use. The Pro subscription is optional and unlocks additional features, described on the purchase screen itself at the time you subscribe.',
          'The price and the length of the period are the ones shown on the purchase screen, already in your currency, exactly as the store (App Store or Google Play) provides them.',
          'The subscription renews automatically at the end of each period and you are charged the same amount, unless you cancel first.',
          'To cancel, go to the subscription settings of your App Store or Google Play account. Cancelling takes effect at the end of the period you already paid for: you stay Pro until that date. We cannot cancel it for you — the store manages it.',
          'Refunds are decided by the store under its own policy, not by us.',
          'Deleting your ProofIt account does NOT cancel the subscription. Cancel it in the store first, or it will keep charging you.',
        ],
      },
      {
        heading: '5. What is ours and what is yours',
        body: [
          'The app, its name, its design and its code are ours. You may use them to play, not to copy them, resell them or make derivative works.',
          'What you upload — your username, your photo — stays yours. You give us permission to show it inside the app to other users, which is what the game needs to work.',
          'The images the app generates to share your duels are yours: post them wherever you like.',
        ],
      },
      {
        heading: '6. Availability and changes',
        body: [
          'We do our best to keep ProofIt running, but we do not guarantee it will be available without interruption or free of bugs.',
          'We may change, add or remove features. If we remove something that was included in Pro, we will tell you in advance inside the app.',
          'We may stop providing the service. If that happens we will give reasonable notice and will not charge you for periods you cannot use.',
        ],
      },
      {
        heading: '7. Liability',
        body: [
          'Using ProofIt means moving. Use your head: watch where you are going, do not use your phone while crossing the street, and do not push your body further than it can go. We are not liable for injuries or accidents arising from the physical activity you do.',
          'Except where the law does not allow it to be limited, our liability is capped at the amount you paid for the subscription in the previous twelve months.',
          'None of this cuts into the rights consumer law gives you if you are a consumer.',
        ],
      },
      {
        heading: '8. Governing law',
        body: [
          'These terms are governed by Spanish law. If you are a consumer, you keep the right to bring proceedings in the courts where you live.',
          `Any questions: ${LEGAL_CONTACT.email}.`,
        ],
      },
    ],
  },
};

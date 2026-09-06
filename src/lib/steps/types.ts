/**
 * Contrato de la capa de pasos (KAN-50).
 *
 * Las pantallas no saben de qué plataforma vienen los pasos. Piden un rango de
 * días y reciben lo mismo en iOS y en Android; quién lo resuelve por debajo
 * —HealthKit, Health Connect o el podómetro— vive en `index.ts` y no se filtra
 * hacia arriba salvo por el campo `source`, que existe solo para auditoría.
 */

/**
 * De dónde salió el dato. Los mismos tres valores que acepta `sync_daily_steps`.
 *
 * `'healthkit'` está **reservado, no implementado**: hoy iOS va con el podómetro
 * (CoreMotion), que ya cubre los 7 días de histórico que acepta el servidor. El
 * valor existe aquí y en el `CHECK` de la migración para que añadir el lector de
 * HealthKit —los pasos del Apple Watch y de otras apps— no exija otra migración.
 * Ver `docs/conteo-de-pasos.md` §9.
 */
export type StepsSource = 'healthkit' | 'health-connect' | 'pedometer';

export type DailySteps = {
  /**
   * `YYYY-MM-DD` en la **zona horaria del usuario**, no en UTC. El esquema
   * (`step_logs.date`) espera la fecha local: si se manda la de UTC, el "día"
   * cambia a medianoche de Londres y atribuye mal pasos y rachas a cualquiera
   * que no viva ahí.
   */
  date: string;
  steps: number;
  source: StepsSource;
};

/**
 * Por qué no hay pasos, cuando no los hay.
 *
 * Existe por la trampa que documenta `docs/healthkit-y-health-connect.md`: en
 * iOS un permiso de lectura **denegado devuelve exactamente lo mismo que "has
 * andado 0 pasos"**. Preguntando a la plataforma no se distinguen. Si la app
 * no guarda por su cuenta en qué estado está el permiso, el usuario que dijo
 * que no ve un cero, cree que ProofIt está roto, y se va.
 *
 * Por eso el lector devuelve el estado explícito en vez de un array vacío que
 * signifique dos cosas distintas.
 */
export type StepsAccess =
  | { status: 'granted' }
  /** Dijo que no. `canAskAgain: false` en iOS tras la primera negativa: el
   *  diálogo del sistema no vuelve a salir y toca mandarlo a Ajustes. */
  | { status: 'denied'; canAskAgain: boolean }
  /** Todavía no se le ha preguntado. */
  | { status: 'undetermined' }
  /** No se puede ni preguntar en este dispositivo. */
  | { status: 'unavailable'; reason: StepsUnavailableReason };

export type StepsUnavailableReason =
  /** Android 13 o anterior sin Health Connect instalado. Se puede ofrecer instalarlo. */
  | 'provider-missing'
  /** Health Connect está pero desactualizado; hay que actualizarlo desde Play. */
  | 'provider-update-required'
  /** El dispositivo no tiene sensor de pasos (emulador, tablet vieja). */
  | 'no-sensor';

/**
 * Lo que implementa cada plataforma. Deliberadamente mínimo: leer un rango y
 * responder por el permiso. Todo lo demás (agregar por día, decidir qué se
 * sube, hablar con el servidor) es común y no se duplica por plataforma.
 */
export interface StepsReader {
  readonly source: StepsSource;
  /** Estado actual del permiso, sin abrir ningún diálogo. */
  getAccess(): Promise<StepsAccess>;
  /** Abre el diálogo del sistema si procede y devuelve el estado resultante. */
  requestAccess(): Promise<StepsAccess>;
  /**
   * Pasos por día en `[from, to]`, ambos inclusive, en claves `YYYY-MM-DD`
   * locales. Puede devolver menos días de los pedidos: un día sin datos
   * simplemente no aparece, y eso NO es lo mismo que un día con cero pasos.
   *
   * **Asume el permiso concedido** y lanza la excepción de la plataforma si no
   * lo está. Quien llame por la puerta de `index.ts` no tiene que preocuparse:
   * allí se comprueba antes y se convierte en un `StepsAccessError` legible.
   */
  readDailySteps(from: string, to: string): Promise<DailySteps[]>;
}

/**
 * Tipos de la base de datos, escritos a mano desde `supabase/migrations/`.
 *
 * Lo normal sería generarlos con `supabase gen types typescript`, pero eso
 * necesita un proyecto vinculado o un Postgres local levantado. En cuanto haya
 * uno accesible, este archivo se reemplaza por el generado y se borra esta nota.
 *
 * `Insert` y `Update` codifican los **grants a nivel de columna** del esquema,
 * no solo la forma de la tabla: si el cliente no puede escribir una columna, no
 * aparece aquí, y si no puede escribir en una tabla, su `Insert`/`Update` es
 * `never`. Así el modelo anti-cheat lo vigila el compilador y no la memoria de
 * quien escriba la pantalla. Ver `supabase/SCHEMA.md`.
 *
 * Todas las tablas de clanes son **solo lectura** para el cliente: no hay ni un
 * `GRANT INSERT` ni `GRANT UPDATE` sobre ellas. Cada mutación pasa por su RPC.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export type DuelStatus = 'PENDING' | 'ACTIVE' | 'FINISHED' | 'DECLINED';

export type ClanRole = 'LEADER' | 'OFFICER' | 'MEMBER';

export type ClanJoinRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

export type ClanWarStatus = 'PENDING' | 'ACTIVE' | 'FINISHED' | 'DECLINED';

export type FriendshipStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED';

export type SubscriptionStatus =
  | 'ACTIVE'
  | 'IN_GRACE_PERIOD'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'PAUSED';

export type SubscriptionStore = 'APP_STORE' | 'PLAY_STORE' | 'STRIPE' | 'PROMOTIONAL';

export type SubscriptionEnvironment = 'SANDBOX' | 'PRODUCTION';

// ---------------------------------------------------------------------------
// Filas
// ---------------------------------------------------------------------------

export type ProfileRow = {
  id: string;
  username: string;
  level: number;
  xp: number;
  streak_days: number;
  is_pro: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

export type StepLogRow = {
  id: string;
  user_id: string;
  /** `DATE` de Postgres, en `YYYY-MM-DD`. Es la fecha **local** del usuario. */
  date: string;
  /** Lo que el servidor guardó, ya recortado por `daily_step_cap()`. */
  steps_count: number;
  created_at: string;
  /**
   * De dónde dijo el cliente que venía el dato. `null` en las filas anteriores
   * a `20260906130000_step_sync_anticheat.sql`. **No es una defensa**: el
   * cliente lo declara y puede mentir; sirve para auditoría y calidad de dato.
   */
  source: 'healthkit' | 'health-connect' | 'pedometer' | null;
  /**
   * Lo que el cliente dijo **antes** del recorte. Mayor que `steps_count`
   * significa que chocó contra el tope diario. `null` en filas antiguas.
   */
  reported_steps: number | null;
  synced_at: string | null;
};

export type DuelRow = {
  id: string;
  challenger_id: string;
  opponent_id: string;
  status: DuelStatus;
  start_date: string;
  end_date: string;
  challenger_steps: number;
  opponent_steps: number;
  winner_id: string | null;
  created_at: string;
};

export type ClanRow = {
  id: string;
  name: string;
  tag: string;
  description: string | null;
  leader_id: string;
  /** Solo servidor: lo mueve `resolve_clan_war`. */
  rank_points: number;
  /** Solo servidor: lo mantiene el trigger `clan_members_maintain_count`. */
  member_count: number;
  max_members: number;
  created_at: string;
  updated_at: string;
};

export type ClanMemberRow = {
  clan_id: string;
  user_id: string;
  role: ClanRole;
  joined_at: string;
  role_changed_at: string;
};

export type ClanJoinRequestRow = {
  id: string;
  clan_id: string;
  user_id: string;
  status: ClanJoinRequestStatus;
  created_at: string;
  responded_at: string | null;
  responded_by: string | null;
};

export type ClanInviteRow = {
  id: string;
  clan_id: string;
  code: string;
  created_by: string;
  expires_at: string;
  /** 0 significa ilimitado. */
  max_uses: number;
  uses: number;
  revoked: boolean;
  created_at: string;
};

export type ClanWarRow = {
  id: string;
  challenger_clan_id: string;
  opponent_clan_id: string;
  status: ClanWarStatus;
  start_date: string;
  end_date: string;
  /**
   * `BIGINT` en Postgres: es la suma de los pasos de un clan entero, así que no
   * cabía en `INT` como en los duelos 1v1.
   */
  challenger_steps: number;
  opponent_steps: number;
  winner_clan_id: string | null;
  challenger_points_delta: number;
  opponent_points_delta: number;
  created_at: string;
};

/** Roster congelado al aceptar la guerra. Solo cuentan estos usuarios. */
export type ClanWarParticipantRow = {
  war_id: string;
  clan_id: string;
  user_id: string;
};

export type ClanLeaderboardRow = {
  id: string;
  name: string;
  tag: string;
  rank_points: number;
  tier: string;
  position: number;
  member_count: number;
};

export type FriendshipRow = {
  id: string;
  requester_id: string;
  addressee_id: string;
  /**
   * Columnas generadas (`LEAST`/`GREATEST` del par) que normalizan la pareja
   * sin orden. Existen para el índice único que impide una segunda solicitud
   * entre los mismos dos usuarios; la app no las lee.
   */
  user_low_id: string;
  user_high_id: string;
  status: FriendshipStatus;
  created_at: string;
  /** `null` mientras la solicitud siga `PENDING`. */
  responded_at: string | null;
};

/**
 * Estado de suscripción del usuario (RevenueCat). El cliente solo lee su
 * propia fila y solo las columnas no sensibles: `rc_app_user_id`,
 * `last_event_id` y `last_event_at` tienen `GRANT` solo a `service_role`, así
 * que no aparecen aquí. `profiles.is_pro` es el cache rápido derivado de esto.
 * Ver `supabase/SCHEMA.md` §15.
 */
export type SubscriptionRow = {
  user_id: string;
  entitlement: string;
  status: SubscriptionStatus;
  store: SubscriptionStore | null;
  product_id: string | null;
  /** ISO-8601, o `null` para una concesión sin caducidad. */
  current_period_end: string | null;
  will_renew: boolean;
  environment: SubscriptionEnvironment;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Esquema
// ---------------------------------------------------------------------------

/** Tabla que el cliente solo puede leer; toda mutación va por RPC. */
type ReadOnlyTable<Row> = {
  Row: Row;
  Insert: never;
  Update: never;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        /**
         * `never`: no hay policy de INSERT en `profiles`. Las filas solo nacen
         * del trigger `handle_new_user()` al registrarse el usuario.
         */
        Insert: never;
        /** El cliente tiene `GRANT UPDATE (username)` y `GRANT UPDATE (avatar_url)`. */
        Update: { username?: string; avatar_url?: string | null };
        Relationships: [];
      };
      step_logs: {
        Row: StepLogRow;
        /**
         * El cliente ya NO escribe esta tabla.
         * `20260906130000_step_sync_anticheat.sql` revocó los grants de
         * `INSERT`/`UPDATE` a `authenticated`, porque `steps_count` es el
         * marcador que decide los duelos y era lo único que la app escribía a
         * pelo. Se escribe con `sync_daily_steps` / `sync_daily_steps_batch`,
         * que aplican el tope diario y la ventana de fechas.
         */
        Insert: never;
        Update: never;
        Relationships: [];
      };
      duels: {
        Row: DuelRow;
        /**
         * `GRANT INSERT (challenger_id, opponent_id, start_date, end_date)`,
         * pero en la práctica se crea con `request_duel`, que además valida
         * duplicados y duración. Usa la RPC.
         */
        Insert: {
          challenger_id: string;
          opponent_id: string;
          start_date: string;
          end_date: string;
        };
        /** `never`: estado, marcador y ganador solo los escriben las RPCs. */
        Update: never;
        Relationships: [];
      };
      clans: ReadOnlyTable<ClanRow>;
      clan_members: ReadOnlyTable<ClanMemberRow>;
      clan_join_requests: ReadOnlyTable<ClanJoinRequestRow>;
      clan_invites: ReadOnlyTable<ClanInviteRow>;
      clan_wars: ReadOnlyTable<ClanWarRow>;
      clan_war_participants: ReadOnlyTable<ClanWarParticipantRow>;
      friendships: ReadOnlyTable<FriendshipRow>;
      /** Solo lectura de la propia fila; la mueven los webhooks de RevenueCat. */
      subscriptions: ReadOnlyTable<SubscriptionRow>;
    };
    Views: {
      clan_leaderboard: {
        Row: ClanLeaderboardRow;
        Relationships: [];
      };
    };
    Functions: {
      // ---- Duelos 1v1 ----
      request_duel: {
        Args: { p_opponent_id: string; p_duration_days?: number };
        Returns: DuelRow;
      };
      respond_to_duel: {
        Args: { p_duel_id: string; p_accept: boolean };
        Returns: DuelRow;
      };
      sync_duel_steps: { Args: { p_duel_id: string }; Returns: DuelRow };
      resolve_duel: { Args: { p_duel_id: string }; Returns: DuelRow };

      // ---- XP y rachas ----
      level_for_xp: { Args: { p_xp: number }; Returns: number };
      daily_step_goal: { Args: Record<never, never>; Returns: number };

      // ---- Pasos (`20260906130000_step_sync_anticheat.sql`) ----
      /** Tope diario que aplica el servidor antes de guardar. */
      daily_step_cap: { Args: Record<never, never>; Returns: number };
      /** Cuántos días hacia atrás se puede sincronizar. */
      step_sync_backfill_days: { Args: Record<never, never>; Returns: number };
      sync_daily_steps: {
        Args: {
          p_date: string;
          p_steps: number;
          /** Sin `null`: la RPC lo rechaza con `STP02`. */
          p_source: NonNullable<StepLogRow['source']>;
        };
        Returns: StepLogRow;
      };
      /**
       * Un array de `{ date, steps, source }`. Devuelve una fila por día
       * **guardado**, no una por día enviado: los días que caen fuera de la
       * ventana sincronizable se saltan en silencio en vez de tumbar el lote
       * entero, y comparar lo enviado con lo devuelto dice cuáles fueron.
       * Cualquier otro error (origen inválido, JSON mal formado) sí aborta.
       */
      sync_daily_steps_batch: {
        Args: {
          p_days: { date: string; steps: number; source: NonNullable<StepLogRow['source']> }[];
        };
        Returns: StepLogRow[];
      };

      /** Duelos que un usuario gratis puede crear al día (Pro sin límite). */
      free_tier_daily_duel_limit: { Args: Record<never, never>; Returns: number };

      // ---- Consultas de clan ----
      clan_role_of: {
        Args: { p_clan_id: string; p_user_id: string };
        Returns: ClanRole;
      };
      is_clan_member: {
        Args: { p_clan_id: string; p_user_id: string };
        Returns: boolean;
      };
      can_manage_clan: {
        Args: { p_clan_id: string; p_user_id: string };
        Returns: boolean;
      };
      clan_tier_for_points: { Args: { p_points: number }; Returns: string };

      // ---- Ciclo de vida del clan ----
      create_clan: {
        Args: { p_name: string; p_tag: string; p_description?: string | null };
        Returns: ClanRow;
      };
      update_clan_profile: {
        Args: { p_description?: string | null; p_tag?: string | null };
        Returns: ClanRow;
      };
      /** Actúan sobre el clan del llamante; no reciben id de clan. */
      leave_clan: { Args: Record<never, never>; Returns: undefined };
      disband_clan: { Args: Record<never, never>; Returns: undefined };
      remove_clan_member: { Args: { p_user_id: string }; Returns: undefined };
      transfer_clan_leadership: {
        Args: { p_new_leader_id: string };
        Returns: undefined;
      };
      set_clan_member_role: {
        Args: { p_user_id: string; p_role: ClanRole };
        Returns: ClanMemberRow;
      };

      // ---- Entrada al clan ----
      request_to_join_clan: {
        Args: { p_clan_id: string };
        Returns: ClanJoinRequestRow;
      };
      cancel_join_request: {
        Args: { p_request_id: string };
        Returns: ClanJoinRequestRow;
      };
      respond_to_join_request: {
        Args: { p_request_id: string; p_accept: boolean };
        Returns: ClanJoinRequestRow;
      };
      create_clan_invite: {
        Args: { p_clan_id: string; p_expires_in_hours?: number; p_max_uses?: number };
        Returns: ClanInviteRow;
      };
      revoke_clan_invite: {
        Args: { p_invite_id: string };
        Returns: ClanInviteRow;
      };
      join_clan_with_invite: { Args: { p_code: string }; Returns: ClanRow };

      // ---- Guerras de clanes ----
      request_clan_war: {
        Args: { p_opponent_clan_id: string; p_duration_days?: number };
        Returns: ClanWarRow;
      };
      respond_to_clan_war: {
        Args: { p_war_id: string; p_accept: boolean };
        Returns: ClanWarRow;
      };
      sync_clan_war_steps: { Args: { p_war_id: string }; Returns: ClanWarRow };
      resolve_clan_war: { Args: { p_war_id: string }; Returns: ClanWarRow };

      // ---- Amistades ----
      send_friend_request: {
        Args: { p_addressee_id: string };
        Returns: FriendshipRow;
      };
      respond_to_friend_request: {
        Args: { p_friendship_id: string; p_accept: boolean };
        Returns: FriendshipRow;
      };
      cancel_friend_request: {
        Args: { p_friendship_id: string };
        Returns: FriendshipRow;
      };
      /** Borra la fila, así que no devuelve nada. */
      remove_friend: { Args: { p_friendship_id: string }; Returns: undefined };
    };
    Enums: {
      duel_status: DuelStatus;
      clan_role: ClanRole;
      clan_join_request_status: ClanJoinRequestStatus;
      clan_war_status: ClanWarStatus;
      friendship_status: FriendshipStatus;
      subscription_status: SubscriptionStatus;
      subscription_store: SubscriptionStore;
      subscription_environment: SubscriptionEnvironment;
    };
    CompositeTypes: Record<never, never>;
  };
};

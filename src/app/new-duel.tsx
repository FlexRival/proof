import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Notice } from '@/components/molecules/notice';
import { SearchField } from '@/components/molecules/search-field';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useDuels } from '@/hooks/use-duels';
import { useFriendships, type FriendshipsState } from '@/hooks/use-friendships';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { levelProgress } from '@/lib/xp';
import { DuelLimitReachedError, type Friend, type Profile } from '@/repositories';

/**
 * Crear un duelo.
 *
 * Es **una sola ruta con tres pasos en estado local**, no tres rutas: el
 * diseño trae su propia barra de progreso y su botón de volver retrocede de
 * paso, no de pantalla. Con tres rutas, volver desde el paso 2 saldría del
 * asistente en vez de devolverte a elegir amigo.
 *
 * La lista de amigos es **real** (`useFriendships`). Se puede abrir con el
 * rival ya puesto (`/new-duel?opponent=@alexruiz`, que es lo que hace el botón
 * «Challenge» de la lista de amigos); como esa lista viaja por red, la
 * preselección se resuelve en cuanto llega, no en el primer render.
 *
 * **Crea el duelo de verdad** desde KAN-32: «START DUEL» llama a `request_duel`
 * (`supabase/SCHEMA.md` §6). Si el usuario es gratuito y ya gastó su cupo del
 * día, esa llamada no falla con un error cualquiera sino con
 * `DuelLimitReachedError`, y entonces el asistente abre el paywall en vez de
 * enseñar un mensaje rojo: es la primera puerta de pago del producto, y un
 * error de red y un límite de plan piden cosas distintas del usuario.
 */
export default function NewDuelScreen() {
  const { opponent: presetUsername } = useLocalSearchParams<{ opponent?: string }>();

  const [duration, setDuration] = useState<DuelDuration>(DEFAULT_DURATION);
  /**
   * Lo que el usuario eligió **de forma explícita**, o `null` si todavía no ha
   * tocado nada. Guardar la elección y el rival de la URL por separado deja
   * derivar el estado real en el render: en cuanto la lista de amigos llega,
   * la preselección resuelve sola, sin un efecto que reasigne estado (que es
   * lo que prohíbe `react-hooks/set-state-in-effect`, y con razón: dispara un
   * render extra). Y como la elección propia gana, volver al paso 1 no te
   * devuelve al 2 la próxima vez que el hook recargue la lista.
   */
  const [chosenOpponent, setChosenOpponent] = useState<Friend | null>(null);
  const [chosenStep, setChosenStep] = useState<WizardStep | null>(null);

  const { state: profileState } = useProfile();
  const { state: friendsState } = useFriendships();
  const { request } = useDuels();
  const { t } = useTranslation();

  /** `null` mientras no haya fallado nada; si falla, el texto que se enseña. */
  const [failure, setFailure] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const preset =
    presetUsername && friendsState.status === 'ready'
      ? (friendsState.data.friends.find((friend) => friend.username === presetUsername) ?? null)
      : null;

  const opponent = chosenOpponent ?? preset;
  const step: WizardStep = chosenStep ?? (preset ? 2 : 1);

  function goBack() {
    if (step === 1) {
      dismiss();
      return;
    }

    setChosenStep(step === 3 ? 2 : 1);
  }

  /**
   * Crea el duelo y cierra el asistente.
   *
   * El cupo agotado **no es un error**: se sustituye el asistente por el
   * paywall con `replace`, no con `push`, para que volver atrás desde el
   * paywall no devuelva a un asistente cuyo botón vuelve a estar bloqueado.
   */
  const startDuel = useCallback(async () => {
    if (!opponent) return;

    setCreating(true);
    setFailure(null);

    try {
      await request(opponent.userId, duration);
      dismiss();
    } catch (error) {
      if (error instanceof DuelLimitReachedError) {
        router.replace(ROUTES.paywall.href);
        return;
      }

      setFailure(error instanceof Error ? error.message : t('common.somethingWentWrong'));
    } finally {
      setCreating(false);
    }
  }, [duration, opponent, request, t]);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.frame}>
          <View style={styles.header}>
            <Button label="Back" variant="secondary" onPress={goBack} />
            <ThemedText type="label" themeColor="textDim">
              {`STEP ${step} OF ${TOTAL_STEPS}`}
            </ThemedText>
            {/* Hueco simétrico para que el rótulo quede centrado de verdad. */}
            <View style={styles.headerSpacer} />
          </View>

          {/*
            En el diseño la maqueta del paso 3 no trae barra (medido: los pasos
            1 y 2 sí la tienen). Se pinta igualmente y completa, porque una
            barra que desaparece justo cuando estaría llena se lee como un
            fallo, no como el final del asistente.
          */}
          <StepProgress step={step} />

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {step === 1 ? (
              <ChooseFriendStep
                state={friendsState}
                selected={opponent}
                onSelect={setChosenOpponent}
              />
            ) : null}

            {step === 2 && opponent ? (
              <SetDuelStep
                opponent={opponent}
                duration={duration}
                onChangeDuration={setDuration}
                onChangeOpponent={() => setChosenStep(1)}
              />
            ) : null}

            {step === 3 && opponent && profileState.status === 'ready' ? (
              <ConfirmStep you={profileState.data} opponent={opponent} duration={duration} />
            ) : null}
          </ScrollView>

          <View style={styles.footer}>
            {step === 1 ? (
              <Button
                label="Continue"
                disabled={opponent === null}
                onPress={() => setChosenStep(2)}
              />
            ) : null}

            {step === 2 && opponent ? (
              <>
                <Button label="Review duel" onPress={() => setChosenStep(3)} />
                <ThemedText type="label" themeColor="textDim" style={styles.footerNote}>
                  {`${handleOf(opponent).toUpperCase()} MUST CONFIRM BEFORE IT STARTS`}
                </ThemedText>
              </>
            ) : null}

            {step === 3 ? (
              <>
                {failure ? <Notice message={failure} tone="rival" /> : null}
                <Button
                  label={creating ? 'Starting…' : 'Start duel'}
                  disabled={creating}
                  onPress={() => void startDuel()}
                />
              </>
            ) : null}
          </View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const TOTAL_STEPS = 3;
type WizardStep = 1 | 2 | 3;

/** Duraciones que ofrece el diseño, en días. */
const DURATIONS = [1, 3, 7] as const;
type DuelDuration = (typeof DURATIONS)[number];
const DEFAULT_DURATION: DuelDuration = 3;

/** `@alexruiz` → `alexruiz`. El diseño rotula el aviso del paso 2 sin arroba. */
function handleOf(friend: Friend): string {
  return friend.username.replace(/^@/, '');
}

/** Vuelve por donde se vino; si no hay historial, a la pantalla principal. */
function dismiss() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.home.href);
}

/** Barra de progreso: un segmento por paso, los ya recorridos en Power. */
function StepProgress({ step }: { step: WizardStep }) {
  const theme = useTheme();

  return (
    <View style={styles.progress}>
      {Array.from({ length: TOTAL_STEPS }, (_, index) => (
        <View
          key={index}
          style={[
            styles.progressSegment,
            { backgroundColor: index < step ? theme.primary : theme.meterTrack },
          ]}
        />
      ))}
    </View>
  );
}

type ChooseFriendStepProps = {
  state: FriendshipsState;
  selected: Friend | null;
  onSelect: (friend: Friend) => void;
};

function ChooseFriendStep({ state, selected, onSelect }: ChooseFriendStepProps) {
  const [query, setQuery] = useState('');

  if (state.status !== 'ready') {
    return (
      <>
        <ThemedText type="title">{'CHOOSE\nA FRIEND'}</ThemedText>

        {state.status === 'error' ? (
          <Notice message={state.message} tone="rival" />
        ) : (
          <ThemedText type="small" themeColor="textDim" style={styles.empty}>
            {state.status === 'loading' ? 'Loading friends…' : 'Sign in to challenge a friend.'}
          </ThemedText>
        )}
      </>
    );
  }

  const { friends } = state.data;

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? friends.filter((friend) => friend.username.toLowerCase().includes(needle))
    : friends;

  return (
    <>
      <ThemedText type="title">{'CHOOSE\nA FRIEND'}</ThemedText>

      {friends.length === 0 ? (
        <ThemedText type="small" themeColor="textDim" style={styles.empty}>
          Add a friend first to challenge them to a duel.
        </ThemedText>
      ) : (
        <>
          <SearchField value={query} onChange={setQuery} />

          {visible.length > 0 ? (
            visible.map((friend) => (
              <FriendOption
                key={friend.friendshipId}
                friend={friend}
                selected={friend.userId === selected?.userId}
                onSelect={() => onSelect(friend)}
              />
            ))
          ) : (
            <ThemedText type="small" themeColor="textDim" style={styles.empty}>
              No friends match that search.
            </ThemedText>
          )}
        </>
      )}
    </>
  );
}

type FriendOptionProps = {
  friend: Friend;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Fila seleccionable de la lista.
 *
 * El diseño marca `IN DUEL` y deja inertes a los amigos con un duelo en curso.
 * Eso no se puede pintar sin el `duel-repository.ts` (KAN-32): se ofrecen
 * todos, y quien rechaza el duelo duplicado es `request_duel` en el servidor.
 */
function FriendOption({ friend, selected, onSelect }: FriendOptionProps) {
  const theme = useTheme();

  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onSelect}>
      <Card variant={selected ? 'highlight' : 'default'} style={styles.option}>
        {/* Avatar (KAN-19). */}
        <Card variant="sunken" style={styles.avatar} />

        <View style={styles.optionBody}>
          <ThemedText type="bodyBold">{friend.username}</ThemedText>
          <ThemedText type="caption" themeColor="textMuted">
            {`LV ${friend.level} · 🔥 ${friend.streakDays} DAYS`}
          </ThemedText>
        </View>

        {selected ? (
          <View style={[styles.check, { backgroundColor: theme.primary }]}>
            <ThemedText type="caption" themeColor="onPrimary">
              ✓
            </ThemedText>
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}

type SetDuelStepProps = {
  opponent: Friend;
  duration: DuelDuration;
  onChangeDuration: (next: DuelDuration) => void;
  onChangeOpponent: () => void;
};

function SetDuelStep({ opponent, duration, onChangeDuration, onChangeOpponent }: SetDuelStepProps) {
  return (
    <>
      <ThemedText type="title">SET THE DUEL</ThemedText>

      <Card style={styles.option}>
        {/* Avatar (KAN-19). */}
        <Card variant="rival" style={styles.avatar} />

        <View style={styles.optionBody}>
          <ThemedText type="bodyBold">{opponent.username}</ThemedText>
          <ThemedText type="caption" themeColor="textMuted">
            {`LV ${opponent.level} · 🔥 ${opponent.streakDays} DAYS`}
          </ThemedText>
        </View>

        <Pressable accessibilityRole="link" onPress={onChangeOpponent}>
          <ThemedText type="linkPrimary">Change</ThemedText>
        </Pressable>
      </Card>

      <ThemedText type="label" themeColor="textDim">
        DURATION
      </ThemedText>

      <View style={styles.durations}>
        {DURATIONS.map((days) => (
          <DurationOption
            key={days}
            days={days}
            selected={days === duration}
            onSelect={() => onChangeDuration(days)}
          />
        ))}
      </View>

      <Card variant="sunken" style={styles.rules}>
        <ThemedText type="label" themeColor="textDim">
          RULES
        </ThemedText>

        <ThemedText type="subheading">The player with the most steps wins.</ThemedText>

        {RULES.map((rule) => (
          <ThemedText key={rule} type="small" themeColor="textMuted">
            {rule}
          </ThemedText>
        ))}
      </Card>
    </>
  );
}

/**
 * Copy de la card de reglas, transcrita del diseño. Coincide con lo que hace
 * el servidor: `resolve_duel` gana por pasos y da `floor(pasos / 10)` de XP
 * solo al ganador, sin tocar la racha (`supabase/SCHEMA.md`).
 */
const RULES = [
  'Steps count from the moment your rival accepts.',
  'The winner earns XP equal to their steps divided by 10.',
  'The loser earns nothing. Streaks stay intact.',
];

type DurationOptionProps = {
  days: DuelDuration;
  selected: boolean;
  onSelect: () => void;
};

function DurationOption({ days, selected, onSelect }: DurationOptionProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={styles.durationSlot}>
      <Card variant={selected ? 'highlight' : 'default'} style={styles.duration}>
        <ThemedText type="subtitle" themeColor={selected ? 'primary' : 'text'}>
          {String(days)}
        </ThemedText>
        <ThemedText type="label" themeColor={selected ? 'primary' : 'textDim'}>
          {days === 1 ? 'DAY' : 'DAYS'}
        </ThemedText>
      </Card>
    </Pressable>
  );
}

type ConfirmStepProps = {
  you: Profile;
  opponent: Friend;
  duration: DuelDuration;
};

function ConfirmStep({ you, opponent, duration }: ConfirmStepProps) {
  const { level } = levelProgress(you.xp);

  return (
    <>
      <View style={styles.headline}>
        <ThemedText type="label" themeColor="primary">
          {`${duration} DAY DUEL`}
        </ThemedText>
        <ThemedText type="title" style={styles.headlineTitle}>
          {'READY TO\nPROVE IT?'}
        </ThemedText>
      </View>

      <View style={styles.versus}>
        <Fighter variant="highlight" username={you.username} level={level} />

        <ThemedText type="heading">VS</ThemedText>

        <Fighter variant="rival" username={opponent.username} level={opponent.level} />
      </View>

      <ThemedText type="small" themeColor="textMuted" style={styles.versusNote}>
        {`Most steps in ${duration} ${duration === 1 ? 'day' : 'days'} wins. Winner takes the XP.`}
      </ThemedText>
    </>
  );
}

type FighterProps = {
  variant: 'highlight' | 'rival';
  username: string;
  level: number;
};

function Fighter({ variant, username, level }: FighterProps) {
  return (
    <View style={styles.fighter}>
      {/* Personaje (KAN-19): reserva el espacio del diseño. */}
      <Card variant={variant} style={styles.fighterArt} />

      <ThemedText type="smallBold">{username.toUpperCase()}</ThemedText>
      <ThemedText type="caption" themeColor="textMuted">
        {`LV ${level}`}
      </ThemedText>
    </View>
  );
}

const AVATAR_SIZE = 44;
const CHECK_SIZE = 22;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  frame: {
    flex: 1,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerSpacer: { width: 88 },
  progress: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  progressSegment: {
    flex: 1,
    height: 3,
    borderRadius: Radius.pill,
  },
  content: {
    paddingBottom: Spacing.four,
    gap: Spacing.three,
  },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  optionBody: { flex: 1, gap: Spacing.one },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, padding: 0 },
  check: {
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durations: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  durationSlot: { flex: 1 },
  duration: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  rules: { gap: Spacing.two },
  headline: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  headlineTitle: { textAlign: 'center' },
  versus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  fighter: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.one,
  },
  fighterArt: {
    width: '100%',
    aspectRatio: 0.78,
  },
  versusNote: { textAlign: 'center' },
  footer: {
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  footerNote: { textAlign: 'center' },
});

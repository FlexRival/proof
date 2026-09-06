import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { Notice } from '@/components/molecules/notice';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { SearchField } from '@/components/molecules/search-field';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useFriendships, type FriendshipsState } from '@/hooks/use-friendships';
import { useTranslation } from '@/hooks/use-translation';
import { friendshipRepository, RepositoryError, type ProfileMatch } from '@/repositories';

/**
 * Buscar gente por nombre de usuario y mandarle solicitud de amistad.
 *
 * Es la pantalla que le faltaba a «Add friend» (KAN-65): el repositorio ya
 * tenía `searchByUsername` y `sendRequest` desde que se montaron las RPC de
 * amistades, pero no había ningún sitio desde donde llamarlos, así que los
 * dos botones de la lista de amigos estaban muertos.
 *
 * Es una **tarea**, no un destino: se abre como modal encima de donde estabas
 * y se cierra volviendo, igual que crear un duelo.
 *
 * La búsqueda va al servidor, no filtra en local: aquí se busca entre todos
 * los usuarios de la app, no entre los amigos que ya tienes — eso es el
 * buscador de la propia lista de amigos, que es otra cosa.
 */
export default function FindFriendsScreen() {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<SearchOutcome | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  /** A quién se le está mandando la solicitud ahora mismo, si a alguien. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state: friendshipsState, sendRequest } = useFriendships();
  const { t } = useTranslation();

  const needle = query.trim();

  // Se busca al dejar de teclear, no en cada pulsación: sin esto, escribir
  // ocho letras son ocho viajes al servidor y las respuestas pueden llegar
  // desordenadas. El `cancelled` descarta la respuesta de una búsqueda que ya
  // no es la que el usuario está esperando.
  useEffect(() => {
    if (needle.length === 0) {
      return;
    }

    let cancelled = false;

    const timer = setTimeout(async () => {
      try {
        const items = await friendshipRepository.searchByUsername(needle);

        if (!cancelled) {
          setOutcome({ query: needle, status: 'ready', items });
        }
      } catch (error) {
        if (!cancelled) {
          setOutcome({
            query: needle,
            status: 'error',
            // Se guarda el mensaje del servidor, o `null` para «falló y no
            // dijo por qué». Traducir aquí ataría el efecto al idioma y
            // relanzaría la búsqueda cada vez que se cambiase: el texto se
            // resuelve al pintar, que es cuando se sabe en qué idioma va.
            message: error instanceof RepositoryError ? error.message : null,
          });
        }
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needle]);

  // «Estar buscando» no es un estado que haya que guardar y mantener en
  // sincronía: es, literalmente, que lo último que se recibió no responde a lo
  // que hay escrito ahora. Derivarlo evita que el spinner se quede colgado si
  // alguna rama se olvida de apagarlo, y que el resultado de una búsqueda vieja
  // se pinte bajo un texto nuevo.
  const settled = outcome?.query === needle ? outcome : null;

  async function handleSend(userId: string) {
    setActionError(null);
    setBusyId(userId);

    try {
      await sendRequest(userId);
    } catch (error) {
      setActionError(
        error instanceof RepositoryError ? error.message : t('findFriends.sendFailed'),
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Button label={t('common.back')} variant="secondary" onPress={goBack} />
            <ThemedText type="subheading">{t('findFriends.title')}</ThemedText>
            {/* Hueco simétrico para que el título quede centrado de verdad. */}
            <View style={styles.headerSpacer} />
          </View>

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder={t('findFriends.searchPlaceholder')}
          />

          {actionError ? <Notice tone="rival" message={actionError} /> : null}
          {settled?.status === 'error' ? (
            <Notice tone="rival" message={settled.message ?? t('findFriends.searchFailed')} />
          ) : null}

          <Results
            needle={needle}
            settled={settled}
            busyId={busyId}
            friendshipsState={friendshipsState}
            onSend={handleSend}
          />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Cuánto se espera desde la última tecla antes de preguntarle al servidor. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Lo último que contestó el servidor, junto con la búsqueda que lo pidió.
 * Llevar la `query` dentro es lo que permite saber si sigue valiendo para lo
 * que hay escrito ahora, sin un segundo estado que mantener a mano.
 */
type SearchOutcome =
  | { query: string; status: 'ready'; items: ProfileMatch[] }
  | { query: string; status: 'error'; message: string | null };

/**
 * Qué relación tiene ya el usuario de la sesión con alguien que ha salido en
 * la búsqueda. El servidor rechaza una segunda solicitud entre el mismo par,
 * así que enseñar «Add» a quien ya es amigo sería ofrecer un botón que solo
 * puede fallar.
 */
type Relation = 'none' | 'friend' | 'requested' | 'incoming';

function relationFor(state: FriendshipsState, userId: string): Relation {
  if (state.status !== 'ready') {
    return 'none';
  }

  const { friends, incoming, outgoing } = state.data;

  if (friends.some((friend) => friend.userId === userId)) return 'friend';
  if (outgoing.some((request) => request.userId === userId)) return 'requested';
  if (incoming.some((request) => request.userId === userId)) return 'incoming';

  return 'none';
}

type ResultsProps = {
  needle: string;
  /** `null` mientras la respuesta a lo que hay escrito todavía no ha llegado. */
  settled: SearchOutcome | null;
  busyId: string | null;
  friendshipsState: FriendshipsState;
  onSend: (userId: string) => void;
};

function Results({ needle, settled, busyId, friendshipsState, onSend }: ResultsProps) {
  const { t } = useTranslation();

  if (needle.length === 0) {
    return (
      <ThemedText type="small" themeColor="textDim" style={styles.hint}>
        {t('findFriends.hint')}
      </ThemedText>
    );
  }

  if (settled === null) {
    return (
      <ThemedText type="small" themeColor="textDim" style={styles.hint}>
        {t('findFriends.searching')}
      </ThemedText>
    );
  }

  // El error ya se enseña arriba, en su propio aviso: repetirlo aquí sería
  // decir dos veces lo mismo.
  if (settled.status === 'error') {
    return null;
  }

  if (settled.items.length === 0) {
    return (
      <ThemedText type="small" themeColor="textDim" style={styles.hint}>
        {t('findFriends.noResults', { query: needle })}
      </ThemedText>
    );
  }

  return (
    <>
      {settled.items.map((match) => (
        <ResultRow
          key={match.userId}
          match={match}
          relation={relationFor(friendshipsState, match.userId)}
          busy={busyId === match.userId}
          onSend={() => onSend(match.userId)}
        />
      ))}
    </>
  );
}

type ResultRowProps = {
  match: ProfileMatch;
  relation: Relation;
  busy: boolean;
  onSend: () => void;
};

function ResultRow({ match, relation, busy, onSend }: ResultRowProps) {
  const { t } = useTranslation();

  return (
    <Card style={styles.row}>
      <ProfilePhoto avatarUrl={match.avatarUrl} style={styles.avatar} fallbackVariant="sunken" />

      <View style={styles.rowBody}>
        <ThemedText type="bodyBold">{match.username}</ThemedText>
        <ThemedText type="caption" themeColor="textMuted">
          {t('common.levelShort', { level: match.level })}
        </ThemedText>
      </View>

      <RowAction relation={relation} busy={busy} onSend={onSend} />
    </Card>
  );
}

type RowActionProps = {
  relation: Relation;
  busy: boolean;
  onSend: () => void;
};

/**
 * Lo que se puede hacer con cada resultado. Solo hay botón cuando mandar la
 * solicitud es posible; en el resto de casos se dice en qué punto está la
 * relación y se deja que la lista de amigos sea quien la resuelva.
 */
function RowAction({ relation, busy, onSend }: RowActionProps) {
  const { t } = useTranslation();

  if (relation === 'friend') {
    return <Chip label={t('findFriends.alreadyFriends')} />;
  }

  if (relation === 'requested') {
    return <Chip label={t('findFriends.requested')} />;
  }

  if (relation === 'incoming') {
    return <Chip label={t('findFriends.askedYou')} tone="rival" />;
  }

  return (
    <Button
      label={t(busy ? 'findFriends.sending' : 'findFriends.add')}
      disabled={busy}
      onPress={onSend}
    />
  );
}

/** Vuelve por donde se vino; si no hay historial, a la lista de amigos. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.friends.href);
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerSpacer: { width: Spacing.six },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, padding: 0, borderRadius: Radius.pill },
  rowBody: { flex: 1, gap: Spacing.one },
  hint: { textAlign: 'center', paddingVertical: Spacing.four },
});

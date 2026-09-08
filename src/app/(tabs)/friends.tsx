import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Chip } from '@/components/atoms/chip';
import { EmptyState } from '@/components/organisms/empty-state';
import { Notice } from '@/components/molecules/notice';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { SearchField } from '@/components/molecules/search-field';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { BottomTabInset, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useFriendships, type FriendshipsState } from '@/hooks/use-friendships';
import { useTranslation } from '@/hooks/use-translation';
import { RepositoryError, type Friend, type FriendRequest } from '@/repositories';

/**
 * Amigos: solicitudes pendientes y la lista, con el atajo para retar.
 *
 * **Datos reales.** Salen de `friendshipRepository`, que envuelve las RPC de
 * `supabase/SCHEMA.md` §13; aceptar y rechazar mutan de verdad y la lista se
 * recarga sola al terminar.
 *
 * **«Add friend»** abre `/find-friends`, que es donde se busca gente nueva y
 * se le manda solicitud.
 *
 * Lo que sigue sin backend detrás, y por eso se ve inerte:
 * - **`IN DUEL`** no se puede pintar: saber si un amigo tiene un duelo en curso
 *   necesita el `duel-repository.ts` (KAN-32). Hasta entonces se ofrece retar a
 *   todo el mundo y es el servidor quien rechaza el duelo duplicado, en vez de
 *   que la pantalla se invente un estado que no conoce.
 *
 * El buscador filtra en local sobre la lista cargada, que es lo correcto
 * mientras quepa entera en memoria; cuando venga paginada del servidor habrá
 * que mover el filtro allí.
 */
export default function FriendsScreen() {
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  /** Amistad que está esperando respuesta del servidor, si hay alguna. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const { state, respondToRequest } = useFriendships();
  const { t } = useTranslation();

  async function handleRespond(friendshipId: string, accept: boolean) {
    setActionError(null);
    setBusyId(friendshipId);

    try {
      await respondToRequest(friendshipId, accept);
    } catch (error) {
      setActionError(
        error instanceof RepositoryError ? error.message : t('friends.respondFailed'),
      );
    } finally {
      setBusyId(null);
    }
  }

  if (state.status !== 'ready') {
    return <FriendsPlaceholder state={state} />;
  }

  const { friends, incoming } = state.data;

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? friends.filter((friend) => friend.username.toLowerCase().includes(needle))
    : friends;

  // Sin un solo amigo la pantalla cambia entera: el diseño quita el buscador y
  // el botón de la cabecera y deja únicamente la invitación a empezar. Filtrar
  // una lista vacía no tiene sentido, y un buscador que nunca encuentra nada
  // se lee como que la app está rota.
  if (friends.length === 0 && incoming.length === 0) {
    return <FriendsEmptyScreen />;
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <ThemedText type="title">{t('friends.title')}</ThemedText>
            <Button label={t('friends.addFriend')} variant="secondary" onPress={openFindFriends} />
          </View>

          {actionError ? <Notice message={actionError} tone="rival" /> : null}

          <SearchField value={query} onChange={setQuery} />

          {incoming.length > 0 ? (
            <>
              <View style={styles.sectionHead}>
                <ThemedText type="label" themeColor="textDim">
                  {t('friends.requests')}
                </ThemedText>
                <Chip label={String(incoming.length)} tone="rival" />
              </View>

              {incoming.map((request) => (
                <RequestRow
                  key={request.friendshipId}
                  request={request}
                  busy={busyId === request.friendshipId}
                  onRespond={(accept) => handleRespond(request.friendshipId, accept)}
                />
              ))}
            </>
          ) : null}

          <ThemedText type="label" themeColor="textDim">
            {t('friends.allFriends', { count: friends.length })}
          </ThemedText>

          {visible.length > 0 ? (
            visible.map((friend) => <FriendRow key={friend.friendshipId} friend={friend} />)
          ) : (
            <ThemedText type="small" themeColor="textDim" style={styles.empty}>
              {t('friends.noMatches')}
            </ThemedText>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Abre la búsqueda de gente nueva. La usan los dos sitios desde los que se
 * añaden amigos —la cabecera de la lista y el vacío— para que no puedan
 * acabar llevando a pantallas distintas.
 */
function openFindFriends() {
  router.push(ROUTES.findFriends.href);
}

/**
 * Lo que se ve mientras la lista viaja, o si no llega. El diseño no maqueta
 * ninguno de los dos casos, así que esto se queda en el título y una línea:
 * nada inventado, pero tampoco una pantalla en blanco que parezca colgada.
 *
 * `signedOut` no debería verse nunca — el guard de sesión de `_layout.tsx` no
 * deja entrar a las pestañas sin sesión — pero el tipo obliga a cubrirlo, y
 * cubrirlo cuesta una línea.
 */
function FriendsPlaceholder({ state }: { state: FriendshipsState }) {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.content}>
          <ThemedText type="title">{t('friends.title')}</ThemedText>

          {state.status === 'error' ? (
            <Notice message={state.message} tone="rival" />
          ) : (
            <ThemedText type="small" themeColor="textDim" style={styles.empty}>
              {t(state.status === 'loading' ? 'friends.loading' : 'friends.signedOut')}
            </ThemedText>
          )}
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Sin amigos: el duelo contra nadie — tu personaje, `VS`, y un hueco con
 * interrogación donde iría el rival.
 */
function FriendsEmptyScreen() {
  const { t } = useTranslation();

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <ThemedText type="title">{t('friends.title')}</ThemedText>

          <EmptyState
            title={t('friends.emptyTitle')}
            message={t('friends.emptyMessage')}
            actionLabel={t('friends.emptyAction')}
            onAction={openFindFriends}
            note={t('friends.emptyNote')}>
            <View style={styles.versus}>
              {/* Personajes (KAN-19): reservan el espacio del diseño. */}
              <Card variant="sunken" style={styles.versusSlot} />

              <ThemedText type="label" themeColor="textDim">
                {t('friends.versus')}
              </ThemedText>

              <Card variant="sunken" style={styles.versusSlot}>
                <ThemedText type="heading" themeColor="textDim" style={styles.versusUnknown}>
                  ?
                </ThemedText>
              </Card>
            </View>
          </EmptyState>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

type RequestRowProps = {
  request: FriendRequest;
  busy: boolean;
  onRespond: (accept: boolean) => void;
};

function RequestRow({ request, busy, onRespond }: RequestRowProps) {
  const { t } = useTranslation();

  return (
    <Card style={styles.row}>
      {/* Foto de quien te mandó la solicitud. */}
      <ProfilePhoto avatarUrl={request.avatarUrl} style={styles.avatar} fallbackVariant="sunken" />

      <View style={styles.rowBody}>
        <ThemedText type="bodyBold">{request.username}</ThemedText>
        <ThemedText type="caption" themeColor="textMuted">
          {t('common.levelShort', { level: request.level })}
        </ThemedText>
      </View>

      <Button label={t('friends.accept')} disabled={busy} onPress={() => onRespond(true)} />
      <Button
        label={t('friends.decline')}
        variant="secondary"
        disabled={busy}
        onPress={() => onRespond(false)}
      />
    </Card>
  );
}

function FriendRow({ friend }: { friend: Friend }) {
  const { t } = useTranslation();

  return (
    <Card style={styles.row}>
      {/* Foto del amigo. */}
      <ProfilePhoto avatarUrl={friend.avatarUrl} style={styles.avatar} fallbackVariant="sunken" />

      {/*
        Solo el cuerpo abre el perfil, no la card entera: si la fila completa
        fuese pulsable, el botón de retar quedaría dentro de otra zona
        pulsable y sería fácil abrir el perfil queriendo retar.
      */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={t('friends.openProfile', { username: friend.username })}
        onPress={() =>
          router.push({ pathname: '/friend-profile', params: { username: friend.username } })
        }
        style={styles.rowBody}>
        <ThemedText type="bodyBold">{friend.username}</ThemedText>
        <ThemedText type="caption" themeColor="textMuted">
          {t('friends.levelAndStreak', { level: friend.level, days: friend.streakDays })}
        </ThemedText>
      </Pressable>

      <Button
        label={t('friends.challenge')}
        onPress={() =>
          router.push({ pathname: '/new-duel', params: { opponent: friend.username } })
        }
      />
    </Card>
  );
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
    paddingBottom: Spacing.three + BottomTabInset,
    gap: Spacing.three,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  // El `borderRadius` lo traía `Card`; la foto lo necesita explícito para
  // recortarse con la misma forma que el hueco al que sustituye.
  avatar: { width: AVATAR_SIZE, height: AVATAR_SIZE, padding: 0, borderRadius: Radius.lg },
  rowBody: { flex: 1, gap: Spacing.one },
  empty: { textAlign: 'center', paddingVertical: Spacing.four },
  versus: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  versusSlot: {
    flex: 1,
    aspectRatio: 0.78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versusUnknown: { textAlign: 'center' },
});

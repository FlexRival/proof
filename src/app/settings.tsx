import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Card } from '@/components/atoms/card';
import { Notice } from '@/components/molecules/notice';
import { ProfilePhoto } from '@/components/molecules/profile-photo';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Palette, Radius, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';
import { LANGUAGE_NAMES, LANGUAGES, type Language } from '@/lib/i18n';
import { SETTINGS_DEMO } from '@/lib/demo-data';
import { formatCount, formatJoinDate } from '@/lib/format';
import { levelProgress } from '@/lib/xp';
import { profileRepository, RepositoryError } from '@/repositories';

/**
 * Ajustes.
 *
 * Identidad (username, nivel, fecha de alta, foto de perfil) son **datos
 * reales de la sesión**. No hay ningún personaje RPG que dibuje encima — se
 * descartó a propósito — así que sin foto subida el hueco se queda vacío
 * (`ProfilePhoto`). El resto — conmutadores de notificaciones, origen de
 * pasos — sigue de mentira: los conmutadores porque no hay tabla de
 * preferencias (guardarlos sería inventarse la capa de datos), y el origen de
 * pasos porque la captura de pasos no está implementada
 * (`docs/conteo-de-pasos.md`).
 *
 * Esta pantalla fue la que destapó que las rutas fuera de las pestañas eran
 * inalcanzables: existía como archivo y abrirla pintaba la pantalla principal.
 * Ahora cuelga del `Stack` raíz.
 */
export default function SettingsScreen() {
  const [leadChanges, setLeadChanges] = useState(true);
  const [duelInvites, setDuelInvites] = useState(true);
  const [stepSummary, setStepSummary] = useState(false);
  const [logOutError, setLogOutError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const { state: profileState, reload: reloadProfile } = useProfile();
  const { t, language, setLanguage } = useTranslation();

  async function handleLogOut() {
    setLogOutError(null);
    try {
      // No hace falta navegar tras esto: el logout dispara `onAuthStateChange`,
      // `Stack.Protected` en `_layout.tsx` lo nota y cambia solo a `login`.
      await profileRepository.signOut();
    } catch (error) {
      setLogOutError(
        error instanceof RepositoryError ? error.message : t('settings.logOutFailed'),
      );
    }
  }

  async function handleChangePhoto() {
    setAvatarError(null);

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setAvatarError(t('settings.photoPermission'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    if (!asset.base64) {
      setAvatarError(t('settings.photoUnreadable'));
      return;
    }

    setAvatarUploading(true);
    try {
      await profileRepository.updateAvatar({
        base64: asset.base64,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      await reloadProfile();
    } catch (error) {
      setAvatarError(
        error instanceof RepositoryError ? error.message : t('settings.photoUploadFailed'),
      );
    } finally {
      setAvatarUploading(false);
    }
  }

  if (profileState.status !== 'ready') {
    // El guard de sesión de `_layout.tsx` ya garantiza que llegar aquí implica
    // sesión iniciada; esto solo cubre el instante de carga o un fallo real.
    return <ThemedView style={styles.screen} />;
  }

  const { username, xp, createdAt, avatarUrl } = profileState.data;
  const { level } = levelProgress(xp);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Button label={t('common.back')} variant="secondary" onPress={goBack} />
            <ThemedText type="subheading">{t('settings.title')}</ThemedText>
            {/* Hueco simétrico para que el título quede centrado de verdad. */}
            <View style={styles.headerSpacer} />
          </View>

          <Card style={styles.identity}>
            <Pressable onPress={handleChangePhoto} disabled={avatarUploading}>
              <ProfilePhoto
                avatarUrl={avatarUrl}
                style={styles.avatarImage}
                fallbackVariant="sunken"
              />
            </Pressable>

            <View style={styles.identityBody}>
              <ThemedText type="bodyBold">{username}</ThemedText>
              <ThemedText type="caption" themeColor="textMuted">
                {t('settings.joined', { level, date: formatJoinDate(createdAt) })}
              </ThemedText>
              <ThemedText
                type="linkPrimary"
                onPress={avatarUploading ? undefined : handleChangePhoto}>
                {avatarUploading ? t('settings.uploading') : t('settings.changePhoto')}
              </ThemedText>
            </View>
          </Card>

          {avatarError ? <Notice tone="rival" message={avatarError} /> : null}

          <Section title={t('settings.activitySource')}>
            <SettingRow label={t('settings.stepTracking')}>
              <ThemedText type="smallBold" themeColor="textMuted">
                {SETTINGS_DEMO.stepTracking}
              </ThemedText>
            </SettingRow>

            <SettingRow label={t('settings.dailyStepGoal')}>
              <ThemedText type="smallBold" themeColor="textMuted">
                {formatCount(SETTINGS_DEMO.dailyStepGoal)}
              </ThemedText>
            </SettingRow>
          </Section>

          <Section title={t('settings.language')}>
            {LANGUAGES.map((option) => (
              <LanguageRow
                key={option}
                language={option}
                selected={option === language}
                onSelect={() => setLanguage(option)}
              />
            ))}
          </Section>

          <Section title={t('settings.notifications')}>
            <SettingRow label={t('settings.leadChanges')}>
              <Toggle value={leadChanges} onChange={setLeadChanges} label={t('settings.leadChanges')} />
            </SettingRow>

            <SettingRow label={t('settings.duelInvites')}>
              <Toggle value={duelInvites} onChange={setDuelInvites} label={t('settings.duelInvites')} />
            </SettingRow>

            <SettingRow label={t('settings.dailyStepSummary')}>
              <Toggle value={stepSummary} onChange={setStepSummary} label={t('settings.dailyStepSummary')} />
            </SettingRow>
          </Section>

          <Section title={t('settings.account')}>
            <SettingRow label={t('settings.privacy')} />

            <SettingRow label={t('settings.logOut')} labelColor="defeat" onPress={handleLogOut} />

            {logOutError ? <Notice tone="rival" message={logOutError} /> : null}
          </Section>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Vuelve por donde se vino; si no hay historial, a la pantalla principal. */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.home.href);
}

type LanguageRowProps = {
  language: Language;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Una opción del selector de idioma.
 *
 * El nombre va **en su propio idioma** (`LANGUAGE_NAMES`), no traducido: quien
 * tiene la app en un idioma que no entiende busca «Español», no «Spanish».
 *
 * Es un `radio` y no un conmutador porque los idiomas son excluyentes entre
 * sí, y así los lectores de pantalla anuncian «1 de 2» en vez de leer cada
 * fila como un interruptor suelto.
 */
function LanguageRow({ language, selected, onSelect }: LanguageRowProps) {
  return (
    <Pressable accessibilityRole="radio" accessibilityState={{ selected }} onPress={onSelect}>
      <Card variant={selected ? 'highlight' : 'sunken'} style={styles.row}>
        <ThemedText type="small">{LANGUAGE_NAMES[language]}</ThemedText>
        {selected ? (
          <ThemedText type="smallBold" themeColor="primary">
            ✓
          </ThemedText>
        ) : null}
      </Card>
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <ThemedText type="label" themeColor="textDim">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

type SettingRowProps = {
  label: string;
  labelColor?: 'text' | 'defeat';
  onPress?: () => void;
  children?: ReactNode;
};

function SettingRow({ label, labelColor = 'text', onPress, children }: SettingRowProps) {
  const row = (
    <Card variant="sunken" style={styles.row}>
      <ThemedText type="small" themeColor={labelColor}>
        {label}
      </ThemedText>
      {children}
    </Card>
  );

  if (!onPress) {
    return row;
  }

  return <Pressable onPress={onPress}>{row}</Pressable>;
}

/**
 * Conmutador del sistema teñido con la paleta. `Switch` solo acepta colores
 * sueltos, no tokens semánticos, así que es de los pocos sitios donde se baja
 * a `Palette` — mismo caso que las paradas de degradado.
 */
type ToggleProps = {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
};

function Toggle({ value, onChange, label }: ToggleProps) {
  const theme = useTheme();

  return (
    <Switch
      value={value}
      onValueChange={onChange}
      accessibilityLabel={label}
      trackColor={{ false: theme.surfaceRaised, true: theme.primary }}
      thumbColor={value ? Palette.onPower : theme.textMuted}
      ios_backgroundColor={theme.surfaceRaised}
    />
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
    gap: Spacing.four,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  headerSpacer: { width: Spacing.six },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  identityBody: { flex: 1, gap: Spacing.one },
  avatarImage: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: Radius.pill,
  },
  section: { gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    minHeight: 48,
  },
});

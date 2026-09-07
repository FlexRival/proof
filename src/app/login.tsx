import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { Notice } from '@/components/molecules/notice';
import { SegmentedControl, type SegmentedOption } from '@/components/molecules/segmented-control';
import { TextField } from '@/components/molecules/text-field';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTranslation } from '@/hooks/use-translation';
import { MIN_PASSWORD_LENGTH } from '@/lib/password';
import { profileRepository, RepositoryError } from '@/repositories';

type Mode = 'signIn' | 'signUp';

/** La función de traducir, para las ayudantes que viven fuera del componente. */
type Translate = ReturnType<typeof useTranslation>['t'];

/**
 * Las dos pestañas. Es función y no constante de módulo porque su texto
 * cambia con el idioma: una constante se congelaría en el idioma que hubiera
 * al cargar el archivo.
 */
function modeOptions(t: Translate): SegmentedOption<Mode>[] {
  return [
    { value: 'signIn', label: t('login.signIn') },
    { value: 'signUp', label: t('login.signUp') },
  ];
}

/**
 * Puerta de entrada sin sesión. `src/app/_layout.tsx` la muestra en vez de
 * `(tabs)` mientras no haya sesión (`Stack.Protected`) — un login exitoso no
 * navega a mano: en cuanto `signInWithPassword`/`signUp` crea sesión,
 * `useProfile()` lo nota vía `onAuthStateChange` y el layout raíz cambia
 * solo a `(tabs)`.
 */
export default function LoginScreen() {
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const { t } = useTranslation();

  const canSubmit =
    !submitting &&
    email.trim().length > 0 &&
    // Al entrar vale cualquier longitud: la contraseña ya existe y quien
    // manda es el servidor. El mínimo solo aplica a la que se está creando.
    (mode === 'signIn' ? password.length > 0 : password.length >= MIN_PASSWORD_LENGTH) &&
    (mode === 'signIn' || username.trim().length >= 3);

  async function handleSubmit() {
    setError(null);
    setInfo(null);
    setSubmitting(true);

    try {
      if (mode === 'signIn') {
        await profileRepository.signInWithPassword(email.trim(), password);
      } else {
        const { needsEmailConfirmation } = await profileRepository.signUp(
          email.trim(),
          password,
          username.trim(),
        );

        if (needsEmailConfirmation) {
          setInfo(t('login.confirmEmail'));
        }
      }
    } catch (caught) {
      setError(
        caught instanceof RepositoryError ? caught.message : t('common.somethingWentWrong'),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.brand}>
            <ThemedText type="title" style={styles.centered}>
              PROOFIT
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
              {t('login.tagline')}
            </ThemedText>
          </View>

          <SegmentedControl options={modeOptions(t)} value={mode} onChange={setMode} />

          <View style={styles.fields}>
            {mode === 'signUp' && (
              <TextField
                label={t('login.username')}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('login.usernamePlaceholder')}
              />
            )}

            <TextField
              label={t('login.email')}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={t('login.emailPlaceholder')}
            />

            <TextField
              label={t('login.password')}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              revealable
              placeholder="••••••••"
            />

            {/*
              Solo al crear cuenta: en «sign in» la contraseña ya existe y
              recordarle el mínimo a quien solo intenta entrar es ruido.
            */}
            {mode === 'signUp' ? (
              <ThemedText type="caption" themeColor="textDim">
                {t('login.passwordHint', { count: MIN_PASSWORD_LENGTH })}
              </ThemedText>
            ) : null}
          </View>

          {error ? <Notice tone="rival" message={error} /> : null}
          {info ? <Notice tone="info" message={info} /> : null}

          <Button label={submitLabel(t, mode, submitting)} onPress={handleSubmit} disabled={!canSubmit} />

          {/*
            Solo al entrar: a quien está creando una cuenta no se le ofrece
            recuperar una que todavía no tiene.
          */}
          {mode === 'signIn' ? (
            <Button
              label={t('login.forgotPassword')}
              variant="ghost"
              onPress={() => router.push(ROUTES.forgotPassword.href)}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * El botón es el único sitio donde se ve que la petición está en marcha:
 * deshabilitarlo sin más deja la pantalla igual que si no hubiera pasado
 * nada, y el usuario vuelve a pulsar.
 */
function submitLabel(t: Translate, mode: Mode, submitting: boolean): string {
  if (mode === 'signIn') {
    return t(submitting ? 'login.signingIn' : 'login.signIn');
  }

  return t(submitting ? 'login.creatingAccount' : 'login.createAccount');
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    gap: Spacing.four,
  },
  brand: { gap: Spacing.one },
  centered: { textAlign: 'center' },
  fields: { gap: Spacing.three },
});

import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { Notice } from '@/components/molecules/notice';
import { TextField } from '@/components/molecules/text-field';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useProfile } from '@/hooks/use-profile';
import { useTranslation } from '@/hooks/use-translation';
import { isLongEnough, MIN_PASSWORD_LENGTH } from '@/lib/password';
import { profileRepository, RepositoryError } from '@/repositories';

/**
 * Contraseña nueva, al final de la recuperación.
 *
 * Se llega aquí desde el enlace del correo, que **ya abrió sesión** al pasar por
 * `resumeSessionFromLink`. Por eso la pantalla no pide la contraseña vieja: el
 * usuario no la sabe —para eso está recuperando la cuenta— y quien demuestra que
 * es él es el token del enlace, no lo que teclee.
 *
 * Está registrada fuera de los dos `Stack.Protected` de `_layout.tsx` a
 * propósito: en el instante en que se navega aquí la sesión acaba de abrirse y
 * el guard todavía puede ir un render por detrás. Dejarla fuera evita esa
 * carrera; si alguien llega sin sesión, la propia pantalla lo dice.
 */
export default function ResetPasswordScreen() {
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const { state: profileState } = useProfile();
  const { t } = useTranslation();

  const canSubmit = !submitting && isLongEnough(password);
  const hasRecoverySession = profileState.status === 'ready';

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      await profileRepository.updatePassword(password);
      setDone(true);
    } catch (caught) {
      setError(caught instanceof RepositoryError ? caught.message : t('common.somethingWentWrong'));
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
          <View style={styles.intro}>
            <ThemedText type="title" style={styles.centered}>
              {t('resetPassword.title')}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
              {t(done ? 'resetPassword.doneSubtitle' : 'resetPassword.subtitle')}
            </ThemedText>
          </View>

          {done ? (
            // Ya hay sesión abierta con la contraseña nueva, así que no se le
            // vuelve a pedir que entre: se le deja pasar directamente.
            <Button
              label={t('resetPassword.continue')}
              onPress={() => router.replace(ROUTES.home.href)}
            />
          ) : !hasRecoverySession ? (
            <>
              <Notice tone="rival" message={t('resetPassword.linkExpired')} />
              <Button
                label={t('resetPassword.askAgain')}
                onPress={() => router.replace(ROUTES.forgotPassword.href)}
              />
            </>
          ) : (
            <>
              <TextField
                label={t('resetPassword.newPassword')}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                revealable
                placeholder="••••••••"
              />

              <ThemedText type="caption" themeColor="textDim">
                {t('login.passwordHint', { count: MIN_PASSWORD_LENGTH })}
              </ThemedText>

              {error ? <Notice tone="rival" message={error} /> : null}

              <Button
                label={t(submitting ? 'resetPassword.saving' : 'resetPassword.save')}
                onPress={handleSubmit}
                disabled={!canSubmit}
              />
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
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
  intro: { gap: Spacing.one },
  centered: { textAlign: 'center' },
});

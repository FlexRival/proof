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
import { passwordResetRedirectUrl } from '@/hooks/use-auth-link';
import { useTranslation } from '@/hooks/use-translation';
import { profileRepository, RepositoryError } from '@/repositories';

/**
 * «He perdido la cuenta»: pide el correo y manda el enlace de recuperación.
 *
 * **Nunca dice si ese email tiene cuenta.** Pase lo que pase se enseña el mismo
 * mensaje de «si existe, te hemos escrito», porque responder distinto convierte
 * este formulario en una forma de averiguar quién está registrado — se prueban
 * correos hasta que uno conteste diferente. Es la razón por la que todas las
 * apps dicen esa frase tan sosa.
 *
 * El enlace del correo vuelve a `reset-password` (ver `use-auth-link.ts`).
 */
export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { t } = useTranslation();
  const canSubmit = !submitting && email.trim().length > 0;

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);

    try {
      await profileRepository.sendPasswordReset(email.trim(), passwordResetRedirectUrl());
      setSent(true);
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
              {t('forgotPassword.title')}
            </ThemedText>
            <ThemedText type="small" themeColor="textMuted" style={styles.centered}>
              {t('forgotPassword.subtitle')}
            </ThemedText>
          </View>

          {sent ? (
            <>
              <Notice tone="info" message={t('forgotPassword.sent', { email: email.trim() })} />
              <ThemedText type="caption" themeColor="textDim" style={styles.centered}>
                {t('forgotPassword.checkSpam')}
              </ThemedText>
            </>
          ) : (
            <>
              <TextField
                label={t('login.email')}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                placeholder={t('login.emailPlaceholder')}
              />

              {error ? <Notice tone="rival" message={error} /> : null}

              <Button
                label={t(submitting ? 'forgotPassword.sending' : 'forgotPassword.send')}
                onPress={handleSubmit}
                disabled={!canSubmit}
              />
            </>
          )}

          <Button label={t('forgotPassword.backToSignIn')} variant="ghost" onPress={dismiss} />
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/** Vuelve al login; si no hay historial, lo sustituye. */
function dismiss() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.login.href);
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

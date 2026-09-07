import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/atoms/button';
import { ThemedText } from '@/components/atoms/themed-text';
import { ThemedView } from '@/components/atoms/themed-view';
import { ROUTES } from '@/constants/routes';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTranslation } from '@/hooks/use-translation';
import { legalDocument, type LegalDocumentKey } from '@/lib/legal';

/**
 * Pinta un documento legal completo (privacidad o términos).
 *
 * Es un organismo y no dos pantallas copiadas porque el documento es un dato:
 * la única diferencia entre `/privacy` y `/terms` es qué clave se le pasa.
 *
 * El idioma sale de `useTranslation()`, no del sistema: si alguien puso la app
 * en español teniendo el móvil en inglés, la política también va en español.
 *
 * No lleva `Card` ni ningún adorno. Es un texto largo que se lee de corrido, y
 * meterlo en tarjetas lo trocearía sin ganar nada — además de que un revisor
 * de tienda tiene que poder leerlo sin pelearse con la maquetación.
 */
export function LegalDocumentView({ documentKey }: { documentKey: LegalDocumentKey }) {
  const { t, language } = useTranslation();
  const document = legalDocument(documentKey, language);

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Button label={t('common.back')} variant="secondary" onPress={goBack} />
          </View>

          <View style={styles.titleBlock}>
            <ThemedText type="heading">{document.title}</ThemedText>
            <ThemedText type="caption" themeColor="textMuted">
              {t('legal.lastUpdated', { date: document.lastUpdated })}
            </ThemedText>
          </View>

          {document.intro.map((paragraph) => (
            <ThemedText key={paragraph} type="small" themeColor="textSecondary">
              {paragraph}
            </ThemedText>
          ))}

          {document.sections.map((section) => (
            <View key={section.heading} style={styles.section}>
              <ThemedText type="subheading">{section.heading}</ThemedText>
              {section.body.map((paragraph) => (
                <ThemedText key={paragraph} type="small" themeColor="textSecondary">
                  {paragraph}
                </ThemedText>
              ))}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

/**
 * Vuelve por donde se vino; si no hay historial, a la pantalla principal.
 *
 * El caso sin historial no es teórico aquí: Android abre esta pantalla en frío
 * desde el diálogo de permisos de Health Connect, y entonces no hay ninguna
 * pantalla debajo a la que volver.
 */
function goBack() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace(ROUTES.home.href);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    padding: Spacing.four,
    paddingBottom: Spacing.six,
    width: '100%',
    alignSelf: 'center',
  },
  header: { alignItems: 'flex-start' },
  titleBlock: { gap: Spacing.one },
  section: { gap: Spacing.two },
});

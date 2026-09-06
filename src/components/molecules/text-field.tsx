import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Card } from '@/components/atoms/card';
import { ThemedText } from '@/components/atoms/themed-text';
import { Radius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useTranslation } from '@/hooks/use-translation';

/**
 * Campo de texto genérico con label, para formularios reales (login, altas).
 * A diferencia de `SearchField` (atado a filtrar listas: placeholder fijo,
 * sin label), este pasa casi todas las props nativas de `TextInput` tal
 * cual — `secureTextEntry`, `keyboardType`, etc. funcionan sin envolverlas.
 *
 * Dos cosas las gestiona él y no quien lo usa, porque son estado de la propia
 * caja y repetirlas en cada formulario sería copiar y pegar:
 * - **El foco**, que tiñe el contorno para que se vea qué campo está activo.
 * - **Mostrar/ocultar la contraseña** (`revealable`), que es lo que evita que
 *   una errata al teclear acabe leyéndose como «credenciales inválidas».
 */
export type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  /**
   * Añade el botón de mostrar/ocultar. Solo tiene sentido junto a
   * `secureTextEntry`: sin él no hay nada que revelar y el botón no se pinta.
   */
  revealable?: boolean;
};

export function TextField({
  label,
  revealable = false,
  secureTextEntry,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const canReveal = revealable && secureTextEntry === true;
  // Revelar es cosa de la vista: `secureTextEntry` deja de aplicarse mientras
  // el usuario mira, pero el valor y quien lo consume no se enteran.
  const masked = secureTextEntry === true && !revealed;

  // El tipo del evento sale de las props del propio `TextInput`: React Native
  // le ha cambiado el nombre entre versiones y nombrarlo a mano rompe el build
  // en cada actualización.
  const handleFocus: NonNullable<TextInputProps['onFocus']> = (event) => {
    setFocused(true);
    onFocus?.(event);
  };

  const handleBlur: NonNullable<TextInputProps['onBlur']> = (event) => {
    setFocused(false);
    onBlur?.(event);
  };

  return (
    <View style={styles.wrapper}>
      {label ? (
        <ThemedText type="label" themeColor="textDim">
          {label}
        </ThemedText>
      ) : null}
      <Card
        variant="sunken"
        style={[styles.field, focused ? { borderColor: theme.primaryEdgeStrong } : null]}>
        <TextInput
          placeholderTextColor={theme.textMuted}
          style={[Typography.small, styles.input, { color: theme.text }]}
          secureTextEntry={masked}
          onFocus={handleFocus}
          onBlur={handleBlur}
          {...rest}
        />

        {canReveal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t(revealed ? 'login.hidePassword' : 'login.showPassword')}
            hitSlop={Spacing.two}
            onPress={() => setRevealed((current) => !current)}>
            <ThemedText type="linkPrimary">{t(revealed ? 'login.hide' : 'login.show')}</ThemedText>
          </Pressable>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: Spacing.one },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.md,
  },
  /** El texto se queda con todo el ancho que no use el botón de revelar. */
  input: { flex: 1 },
});

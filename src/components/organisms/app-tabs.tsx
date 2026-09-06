import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';
import { useTranslation } from '@/hooks/use-translation';

/**
 * `NativeTabs` no admite generar triggers dinámicamente (no acepta un
 * `.map()`) — cada uno se escribe a mano. `name` es el nombre de archivo de
 * la ruta dentro de `src/app/` (`index` para `/`), no el `href` del
 * contrato; el texto sale del catálogo de traducciones, porque es lo único
 * de la barra que cambia con el idioma.
 *
 * Íconos del sistema (SF Symbols en iOS, Material Symbols en Android) en vez
 * de imágenes propias: no hay assets de marca todavía para duelos/amigos/
 * perfil. Cámbialos cuando haya íconos propios — un `sf`/`md` por trigger.
 */
export default function AppTabs() {
  const colors = Colors.dark;
  const { t } = useTranslation();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t('nav.home')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house.fill" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="duels">
        <NativeTabs.Trigger.Label>{t('nav.duels')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="bolt.fill" md="bolt" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="friends">
        <NativeTabs.Trigger.Label>{t('nav.friends')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.2.fill" md="group" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>{t('nav.profile')}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle.fill" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

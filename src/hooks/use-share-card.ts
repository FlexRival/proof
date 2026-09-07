import * as Sharing from 'expo-sharing';
import { useCallback, useRef, useState } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { SHARE_CARD_SIZE } from '@/components/organisms/duel-share-card';

/**
 * En qué punto está el compartir. `unavailable` no es un fallo: es el
 * navegador, o un dispositivo sin ninguna app con la que compartir.
 */
export type ShareStatus = 'idle' | 'sharing' | 'unavailable' | 'failed';

/**
 * Convierte una vista en un PNG y abre la hoja de compartir del sistema
 * (KAN-34 / KAN-35).
 *
 * Es el gancho viral del producto: cada duelo terminado puede acabar en una
 * historia sin que nadie tenga que diseñar nada. Por eso captura la vista que
 * el jugador ya está viendo en vez de renderizar una plantilla escondida — una
 * plantilla aparte se desincroniza del diseño en la primera semana.
 *
 * `react-native-view-shot` y `expo-sharing` son módulos nativos: esto **no
 * funciona en Expo Go**, hace falta el development build (KAN-49). En web
 * `isAvailableAsync()` devuelve `false` y el estado queda en `unavailable`, que
 * es lo que usa la pantalla para desactivar el botón en vez de dejarlo fallar.
 */
export function useShareCard() {
  const cardRef = useRef<View>(null);
  const [status, setStatus] = useState<ShareStatus>('idle');

  const share = useCallback(async () => {
    if (!cardRef.current) {
      setStatus('failed');
      return;
    }

    setStatus('sharing');

    try {
      if (!(await Sharing.isAvailableAsync())) {
        setStatus('unavailable');
        return;
      }

      // Se pide el tamaño final en píxeles y no el de pantalla: la lámina tiene
      // la misma proporción (4:5), así que sube a 1080×1350 sin deformarse y
      // sin depender de la densidad del móvil que la generó.
      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
        width: SHARE_CARD_SIZE.width,
        height: SHARE_CARD_SIZE.height,
      });

      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        // iOS lo pide aparte del mime type para saber qué apps ofrecer.
        UTI: 'public.png',
      });

      setStatus('idle');
    } catch {
      // No se distingue «el usuario cerró la hoja de compartir» de un fallo de
      // verdad: las dos cosas llegan aquí igual. Se marca como fallo y la
      // pantalla ofrece reintentar, que es inofensivo en los dos casos.
      setStatus('failed');
    }
  }, []);

  return { cardRef, status, share };
}

import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import type { GeoCoords } from '@/types/geo';

export type PermissionRequestState = 'undetermined' | 'granted' | 'denied' | 'blocked';

export type UseGeoLocationResult = {
  permission: Location.LocationPermissionResponse | null;
  coords: GeoCoords | null;
  error: string | null;
  loading: boolean;
  status: PermissionRequestState;
  requestPermission: () => Promise<Location.LocationPermissionResponse | null>;
  openSettings: () => Promise<void>;
};

export function useGeoLocation(active = true): UseGeoLocationResult {
  const [permission, setPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [coords, setCoords] = useState<GeoCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const status: PermissionRequestState = permission
    ? permission.granted
      ? 'granted'
      : permission.canAskAgain
        ? 'denied'
        : 'blocked'
    : 'undetermined';

  const refreshPermission = useCallback(async (): Promise<void> => {
    try {
      const response = await Location.getForegroundPermissionsAsync();
      setPermission(response);

      if (!response.granted && !response.canAskAgain) {
        setError('La ubicación está bloqueada. Abre Ajustes para activarla.');
      }
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'No se pudo consultar el permiso de ubicación.';
      setError(message);
    }
  }, []);

  const requestPermission = useCallback(async (): Promise<Location.LocationPermissionResponse | null> => {
    setLoading(true);
    setError(null);

    try {
      const response = await Location.requestForegroundPermissionsAsync();
      setPermission(response);

      if (!response.granted && !response.canAskAgain) {
        setError('La ubicación está bloqueada. Abre Ajustes para permitirla.');
      } else if (!response.granted) {
        setError('No se concedió la ubicación. La cámara sigue funcionando y la app lo comunica.');
      }

      return response;
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : 'No se pudo solicitar la ubicación.';
      setError(message);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const openSettings = useCallback(async (): Promise<void> => {
    await Linking.openSettings();
  }, []);

  useEffect(() => {
    void refreshPermission();
  }, [refreshPermission]);

  useEffect(() => {
    if (!active || !permission?.granted) {
      return;
    }

    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    void Location.watchPositionAsync(
      { accuracy: Location.Accuracy.Balanced, timeInterval: 3000, distanceInterval: 5 },
      (location) => {
        if (!cancelled) {
          setCoords({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
          });
          setError(null);
        }
      },
    )
      .then((nextSubscription) => {
        if (cancelled) {
          nextSubscription.remove();
        } else {
          subscription = nextSubscription;
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          const message = reason instanceof Error ? reason.message : 'No se pudo iniciar el GPS.';
          setError(message);
        }
      });

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [active, permission?.granted]);

  return {
    permission,
    coords,
    error,
    loading,
    status,
    requestPermission,
    openSettings,
  };
}
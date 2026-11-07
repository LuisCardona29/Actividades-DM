import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Platform } from 'react-native';
import * as Network from 'expo-network';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});

onlineManager.setEventListener((setOnline) => {
  let receivedNetworkEvent = false;
  const subscription = Network.addNetworkStateListener((state) => {
    receivedNetworkEvent = true;
    setOnline(state.isConnected === true && state.isInternetReachable !== false);
  });

  void Network.getNetworkStateAsync()
    .then((state) => {
      if (!receivedNetworkEvent) setOnline(state.isConnected === true && state.isInternetReachable !== false);
    })
    .catch((error: unknown) => {
      console.error('[GeoCam network state]', error);
      setOnline(false);
    });

  return () => subscription.remove();
});

export function useAppFocusManager(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (Platform.OS !== 'web') focusManager.setFocused(state === 'active');
    });
    return () => subscription.remove();
  }, []);
}

export function useIsOnline(): boolean {
  return useSyncExternalStore(
    (onChange) => onlineManager.subscribe(onChange),
    () => onlineManager.isOnline() ?? true,
  );
}

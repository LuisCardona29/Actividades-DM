import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import MapView, { Marker, Polyline, type Region } from 'react-native-maps';

import { useGeoLocation } from '@/hooks/useGeoLocation';
import { usePhotos } from '@/hooks/usePhotos';

type RouteInfo = {
  id: string;
  name: string;
  corridor: string;
  interval: string;
  status: string;
  active: boolean;
};

type ActiveOrder = {
  id: string;
  routeId: string;
  title: string;
  stop: string;
  eta: string;
  status: 'En camino' | 'Listo' | 'Demorado';
  latitude: number;
  longitude: number;
};

const routes: RouteInfo[] = [
  { id: 'r1', name: 'Línea Central', corridor: 'Norte ↔ Centro', interval: 'Cada 8 min', status: 'Operativa', active: true },
  { id: 'r2', name: 'Campus Sur', corridor: 'Parque ↔ Universidad', interval: 'Cada 12 min', status: 'Operativa', active: true },
  { id: 'r3', name: 'Línea Este', corridor: 'Mercado ↔ Biblioteca', interval: 'Cada 10 min', status: 'Mantenimiento', active: false },
  { id: 'r4', name: 'Ronda del Valle', corridor: 'Centro ↔ Salud', interval: 'Cada 15 min', status: 'Operativa', active: true },
];

const defaultRegion: Region = {
  latitude: 11.5444,
  longitude: -72.9072,
  latitudeDelta: 0.035,
  longitudeDelta: 0.035,
};

const routeStops = [
  { id: 'terminal', title: 'Terminal de Riohacha', latitude: 11.5580, longitude: -72.9060 },
  { id: 'plaza', title: 'Plaza Jose Prudencio Padilla', latitude: 11.5444, longitude: -72.9072 },
  { id: 'campus', title: 'Universidad de La Guajira', latitude: 11.5315, longitude: -72.9150 },
  { id: 'salud', title: 'Centro de salud Riohacha', latitude: 11.5260, longitude: -72.9000 },
];

const routeLine = routeStops.map(({ latitude, longitude }) => ({ latitude, longitude }));

const activeOrders: ActiveOrder[] = [
  { id: '2048', routeId: 'r1', title: 'Pedido #2048', stop: 'Plaza Jose Prudencio Padilla', eta: '7 min', status: 'En camino', latitude: 11.5508, longitude: -72.9065 },
  { id: '2051', routeId: 'r2', title: 'Pedido #2051', stop: 'Universidad de La Guajira', eta: '12 min', status: 'Listo', latitude: 11.5378, longitude: -72.9110 },
  { id: '2056', routeId: 'r4', title: 'Pedido #2056', stop: 'Centro de salud Riohacha', eta: '18 min', status: 'Demorado', latitude: 11.5300, longitude: -72.9028 },
];

const orderMarkerColors: Record<ActiveOrder['status'], string> = {
  'En camino': '#ff6b3d',
  Listo: '#16a34a',
  Demorado: '#dc2626',
};

export default function RoutesScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const geoLocation = useGeoLocation();
  const savedPhotos = usePhotos();
  const mapRegion: Region = geoLocation.coords
    ? {
        latitude: geoLocation.coords.latitude,
        longitude: geoLocation.coords.longitude,
        latitudeDelta: 0.045,
        longitudeDelta: 0.045,
      }
    : defaultRegion;

  const filteredRoutes = useMemo(() => {
    return routes.filter((route) => `${route.name} ${route.corridor}`.toLowerCase().includes(query.toLowerCase()));
  }, [query]);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.eyebrow}>Consulta</Text>
        <Text style={styles.title}>Rutas disponibles</Text>

        <View style={styles.gpsCard}>
          <Text style={styles.gpsLabel}>Ubicacion en tiempo real</Text>
          <Text style={styles.gpsStatus}>
            {geoLocation.status === 'granted' ? 'GPS activo' : geoLocation.status === 'blocked' ? 'GPS bloqueado' : 'GPS pendiente'}
          </Text>
          <Text style={styles.gpsMessage}>
            {geoLocation.coords
              ? `Lat ${geoLocation.coords.latitude.toFixed(4)} / Lon ${geoLocation.coords.longitude.toFixed(4)}`
              : geoLocation.error ?? 'Activa el GPS para consultar tu posicion.'}
          </Text>
          {geoLocation.status === 'blocked' ? (
            <Pressable style={styles.gpsButton} onPress={() => { void geoLocation.openSettings(); }}>
              <Text style={styles.gpsButtonText}>Abrir Ajustes</Text>
            </Pressable>
          ) : geoLocation.status !== 'granted' ? (
            <Pressable style={styles.gpsButton} onPress={() => { void geoLocation.requestPermission(); }}>
              <Text style={styles.gpsButtonText}>Activar GPS</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.mapCard}>
          <View style={styles.mapHeader}>
            <View>
              <Text style={styles.mapEyebrow}>Mapa en vivo</Text>
              <Text style={styles.mapTitle}>Rutas cercanas</Text>
            </View>
            <Text style={styles.mapBadge}>STANDARD</Text>
          </View>
          <MapView
            style={styles.map}
            region={mapRegion}
            mapType="standard"
            showsCompass
            showsScale
            showsUserLocation={geoLocation.status === 'granted'}
            showsMyLocationButton={geoLocation.status === 'granted'}
          >
            <Polyline coordinates={routeLine} strokeColor="#ff6b3d" strokeWidth={5} />
            {routeStops.map((stop) => (
              <Marker key={stop.id} coordinate={stop} title={stop.title} pinColor="#ff6b3d" />
            ))}
            {activeOrders.map((order) => (
              <Marker
                key={order.id}
                coordinate={{ latitude: order.latitude, longitude: order.longitude }}
                title={order.title}
                description={`${order.status} - ${order.eta} - ${order.stop}`}
                pinColor={orderMarkerColors[order.status]}
              />
            ))}
            {savedPhotos.photosWithLocation.map((photo) => {
              if (photo.latitude === null || photo.longitude === null) return null;
              return (
                <Marker
                  key={`photo-${photo.id}`}
                  coordinate={{ latitude: photo.latitude, longitude: photo.longitude }}
                  title={photo.note || 'Foto GeoCam'}
                  description={photo.albumName ?? 'Foto guardada en el dispositivo'}
                  pinColor="#2563eb"
                />
              );
            })}
          </MapView>
          <Text style={styles.mapCaption}>Recorrido, pedidos y {savedPhotos.photosWithLocation.length} fotos ubicadas</Text>
        </View>

        <View style={styles.activityCard}>
          <View style={styles.activityHeader}>
            <View>
              <Text style={styles.activityEyebrow}>Operacion en vivo</Text>
              <Text style={styles.activityTitle}>Pedidos en curso</Text>
            </View>
            <Text style={styles.activityCount}>{activeOrders.length} activos</Text>
          </View>
          {activeOrders.map((order) => (
            <Pressable
              key={order.id}
              style={styles.orderRow}
              onPress={() => { router.push(`/student/${order.routeId.replace('r', '')}`); }}
              accessibilityRole="button"
              accessibilityLabel={`Ver ${order.title}`}
            >
              <View style={[styles.orderDot, { backgroundColor: orderMarkerColors[order.status] }]} />
              <View style={styles.orderInfo}>
                <Text style={styles.orderTitle}>{order.title}</Text>
                <Text style={styles.orderStop}>{order.stop} - {order.eta}</Text>
              </View>
              <Text style={[styles.orderStatus, { color: orderMarkerColors[order.status] }]}>{order.status}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.searchBox}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar corredor o línea"
            placeholderTextColor="#8b95a9"
            style={styles.input}
          />
        </View>

        {filteredRoutes.map((route) => (
          <View key={route.id} style={styles.card}>
            <View style={styles.topRow}>
              <Text style={styles.name}>{route.name}</Text>
              <Text style={[styles.status, route.active ? styles.statusActive : styles.statusIdle]}>{route.status}</Text>
            </View>

            <Text style={styles.corridor}>{route.corridor}</Text>
            <Text style={styles.interval}>{route.interval}</Text>

            <Pressable style={styles.button} onPress={() => { router.push(`/student/${route.id.replace('r', '')}`); }}>
              <Text style={styles.buttonText}>Ver detalles</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#f5f7fb',
  },
  content: {
    padding: 20,
    paddingBottom: 100,
    gap: 18,
  },
  eyebrow: {
    color: '#ff6b3d',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#121a2b',
    fontSize: 30,
    fontWeight: '800',
    marginTop: 4,
  },
  gpsCard: {
    backgroundColor: '#121a2b',
    borderRadius: 20,
    padding: 18,
  },
  gpsLabel: {
    color: '#aebbd5',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  gpsStatus: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 5,
  },
  gpsMessage: {
    color: '#d7dff2',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
  },
  gpsButton: {
    alignSelf: 'flex-start',
    borderColor: '#ff8a66',
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  gpsButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  mapCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
  },
  mapHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
  },
  mapEyebrow: {
    color: '#ff6b3d',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  mapTitle: {
    color: '#121a2b',
    fontSize: 19,
    fontWeight: '800',
    marginTop: 3,
  },
  mapBadge: {
    color: '#7b8190',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  map: {
    height: 250,
    width: '100%',
  },
  mapCaption: {
    color: '#667085',
    fontSize: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  activityHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  activityEyebrow: {
    color: '#ff6b3d',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  activityTitle: {
    color: '#121a2b',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 3,
  },
  activityCount: {
    color: '#667085',
    fontSize: 12,
    fontWeight: '700',
  },
  orderRow: {
    alignItems: 'center',
    borderTopColor: '#eef1f5',
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingVertical: 13,
  },
  orderDot: {
    borderRadius: 6,
    height: 12,
    marginRight: 12,
    width: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderTitle: {
    color: '#121a2b',
    fontSize: 15,
    fontWeight: '800',
  },
  orderStop: {
    color: '#667085',
    fontSize: 12,
    marginTop: 3,
  },
  orderStatus: {
    fontSize: 12,
    fontWeight: '800',
  },
  searchBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 2,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  input: {
    color: '#111827',
    fontSize: 15,
    paddingVertical: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  name: {
    color: '#121a2b',
    fontSize: 20,
    fontWeight: '800',
  },
  status: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  statusActive: {
    backgroundColor: '#dcfce7',
    color: '#15803d',
  },
  statusIdle: {
    backgroundColor: '#fff7ed',
    color: '#c2410c',
  },
  corridor: {
    marginTop: 8,
    color: '#4b5565',
    fontSize: 14,
    fontWeight: '700',
  },
  interval: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 13,
  },
  button: {
    marginTop: 16,
    backgroundColor: '#ff6b3d',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '800',
  },
});
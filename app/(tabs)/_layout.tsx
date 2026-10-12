import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#ff6b3d',
        tabBarInactiveTintColor: '#7b8190',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopWidth: 0,
          height: 74,
          paddingBottom: 10,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOpacity: 0.08,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: -4 },
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>{'🏠'}</Text>,
        }}
      />
      <Tabs.Screen
        name="routes"
        options={{
          title: 'Rutas',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>{'🧭'}</Text>,
        }}
      />
      <Tabs.Screen
        name="pass"
        options={{
          title: 'Mi pase',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>{'🎫'}</Text>,
        }}
      />
      <Tabs.Screen
        name="geocam"
        options={{
          title: 'GeoCam',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 22, color }}>{'📷'}</Text>,
        }}
      />
    </Tabs>
  );
}
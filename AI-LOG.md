# 🤖 AI-LOG — Semana 6 y Semana 7

Bitácora del trabajo realizado en **RouteGo** con apoyo de herramientas de IA: qué se hizo, qué se verificó y qué quedó pendiente.

---

## 🎯 Objetivo

Implementar **permisos nativos funcionales** en Expo SDK 54 (ubicación y cámara) y el uso del **acelerómetro**, encapsulados en *custom hooks* tipados, con manejo claro de los tres estados de permiso: **concedido**, **rechazado** y **bloqueado**.

---

## 🧰 Uso de IA

| Aspecto | Detalle |
|---|---|
| Rol de la IA | Asistente para revisar la documentación de Expo SDK 54, proponer la estructura de los hooks, corregir la pestaña Rutas y redactar la documentación. |
| Rol propio | Decidir el flujo de permisos, probar en dispositivo físico, capturar la evidencia y validar el resultado. |
| Verificación | Todo lo propuesto se compiló, se pasó por lint y se probó en un dispositivo Android real antes de darlo por válido. |

---

## 🛠️ Trabajo realizado

### Hooks personalizados (`hooks/`)

- `useGeoLocation.ts`: permiso de ubicación, coordenadas, errores y *watcher* GPS.
- `useCamera.ts`: permiso de cámara, estados y acceso a Ajustes.
- `useShake.ts`: detección de sacudidas con el acelerómetro.
- Los tres están **tipados (sin `any`)** y exponen los errores como **estado** para la UI.

### Permisos

- La solicitud ocurre **por acción del usuario** (botones *Activar GPS* y *Solicitar permisos*), nunca al abrir la app.
- Los flujos de **ubicación y cámara están separados**: rechazar uno no afecta al otro.
- Se agregó el botón **Abrir Ajustes** cuando el permiso queda bloqueado.
- Se documentaron los estados concedido, rechazado y bloqueado con capturas y diagramas SVG.

### Pantalla Rutas

- Ahora permite **buscar** corredores y abrir **Ver detalles** (navega a `student/[id]`).
- Incluye mapa nativo con calles, paradas y recorrido destacado.
- Muestra pedidos en curso con estados `En camino`, `Listo` y `Demorado`.
- Los datos de demostración están ubicados en **Riohacha, La Guajira**.

### Limpieza de recursos

- GPS y acelerómetro **eliminan sus suscripciones al desmontar** el componente.

---

## ✅ Validación

### Verificaciones automáticas

| Comando | Resultado |
|---|---|
| `npm run lint` | ✅ Finaliza correctamente |
| `npx tsc --noEmit` | ✅ Finaliza correctamente |
| `npx expo start` | ✅ Metro inicia y genera el bundle |

### Pruebas en dispositivo físico (Android + Expo Go, SDK 54)

| Escenario | Resultado esperado | Resultado obtenido |
|---|---|---|
| Abrir la app | No se pide ningún permiso | ✅ Se cumple |
| Tocar **Activar GPS** | Aparece el diálogo nativo | ✅ Se cumple |
| Conceder ubicación | Se muestran coordenadas (`Lat 11.5373 / Lon -72.8991`) | ✅ Se cumple |
| Rechazar ubicación | La cámara sigue concedida y la app lo comunica | ✅ Se cumple |
| Bloquear ubicación | Aparece **Abrir Ajustes** | ✅ Se cumple |
| Sacudir el dispositivo | El contador de sacudidas aumenta | ✅ Se cumple |

La evidencia está en `assets/screenshots/` y se muestra en el `README.md`.

---

## ⚠️ Observaciones y pendientes

- En algunas capturas (`8.png`, `10.png`) la vista previa de la cámara aparece en negro aunque el permiso está concedido. Conviene reemplazarlas por capturas donde la imagen se vea correctamente.
- GPS, cámara y acelerómetro solo se pueden probar de forma fiable en **dispositivo físico**.
- Los datos de pedidos y rutas son **de demostración** (no provienen de un servidor real).

---

## 📌 Resultado

La app queda lista para demostrar navegación, GPS contextual, permisos nativos con sus tres estados y manejo de errores desde la interfaz, con hooks reutilizables y sin fugas de suscripciones.

---

## Semana 7 - GeoCam persistente

### Prompts y trabajo

- Se solicito adaptar GeoCam al flujo offline-first de la guia: SQLite con Drizzle, migraciones, repositorios, CRUD de fotos/albumes, filtros y archivos permanentes.
- Se conservaron los permisos y el mapa de la Semana 6; la galeria persistente se integro en una pestaña GeoCam y sus fotos geolocalizadas se muestran en Rutas.

### Implementacion

- Se instalaron `expo-sqlite`, `expo-file-system`, `drizzle-orm`, `drizzle-kit` y `babel-plugin-inline-import` compatibles con el proyecto Expo SDK 54.
- Se generaron `drizzle/0000_*.sql` (tabla `photos`) y `drizzle/0001_*.sql` (albums, relacion opcional, nota y favorito) con `drizzle-kit generate`; no se editaron los SQL generados.
- Se separo el acceso a datos en repositorios y `hooks/usePhotos.ts`, con `useLiveQuery`, busqueda, filtro por album y favoritas.
- Las fotos se copian desde cache a `Paths.document/geocam-photos/`. El borrado de una foto elimina tanto el registro como su archivo.
- Se agregaron edicion de nota, favorito y album; creacion/renombre/borrado de albumes; y marcadores de fotos con coordenadas en el mapa.
- `useShake` puede vaciar fotos y archivos solo cuando la persona activa expresamente la opcion; viene desactivada por defecto.

### Error detectado y correccion

- El snapshot de Drizzle conserva `onDelete: 'set null'`, pero Drizzle Kit 0.31.11 genero el `ALTER TABLE` de SQLite sin esa clausula. No se altero manualmente la migracion. Se agrego un trigger `IF NOT EXISTS` durante el arranque que pone `album_id` en `NULL` antes de borrar el album.
- Se usa el API actual de `expo-file-system` (`File`, `Directory`, `Paths`), no `FileSystem.copyAsync` de la API legacy.

### Verificacion

- `npx drizzle-kit generate`: genero ambas migraciones.
- `npx tsc --noEmit`: verificado despues de integrar base de datos, hooks, pantallas y rutas.
- `npm run lint`: finaliza sin errores ni advertencias despues de corregir dependencias de hooks.
- `npx expo export --platform android --output-dir .expo/validation-export`: Metro compilo 1,172 modulos y genero el bundle Android.
- `npm run db:generate`: comprobo que el esquema coincide con las migraciones versionadas.
- Las migraciones y el trigger de borrado de album se probaron con SQLite local; el borrado conserva fotos y deja `album_id` en `NULL`.
- Prueba fisica de capturar tres fotos, cerrar/reabrir Expo Go, modo avion y validar marcadores: pendiente. El GIF de evidencia no se simulo; debe grabarse en el telefono como `assets/screenshots/geocam-offline-flow.gif`.

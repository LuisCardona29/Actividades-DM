# GeoCam — Respaldo seguro de fotos (Semana 8)

App móvil construida con **Expo SDK 57** y **Expo Router**. GeoCam combina una galería local disponible sin conexión con autenticación y respaldo privado de imágenes en Supabase Storage.

> Los datos de demostración del mapa están ubicados en **Riohacha, La Guajira (Colombia)**.

**Repositorio:** https://github.com/LuisCardona29/Actividades-DM

---

## 📑 Tabla de contenidos

1. [Características](#-características)
2. [GeoCam offline-first](#geocam-offline-first)
3. [Custom hooks](#-custom-hooks)
4. [Manejo de permisos](#-manejo-de-permisos)
5. [Evidencia visual](#-evidencia-visual)
6. [Checklist de verificación](#-checklist-de-verificación)
7. [Estructura del proyecto](#-estructura-del-proyecto)
8. [Cómo ejecutar](#-cómo-ejecutar)
9. [Tecnologías](#-tecnologías)
10. [Documentación de IA](#-documentación-de-ia)

---

## ✨ Características

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Muestra el estado del servicio y los shuttles en ruta con su ETA y estado (*En tránsito*, *Listo*, *A tiempo*). |
| **Rutas** | Buscador de corredores, listado de líneas (*Operativa* / *Mantenimiento*), mapa nativo con calles, paradas y recorrido destacado, y botón **Ver detalles** hacia `student/[id]`. |
| **Mi pase** | Pase digital, panel de **permisos del dispositivo**, vista previa de cámara y **sensor de movimiento** (contador de sacudidas). |
| **GeoCam** | Captura o importa fotos, conserva los archivos en Documentos y guarda metadatos, coordenadas, notas, favoritos y álbumes en SQLite. |

La galería está disponible sin conexión: captura/importación, edición de notas, favoritos, asignación y gestión de álbumes, búsqueda y filtros reactivos.

### Mapa y pedidos en curso

- Mapa nativo con paradas, recorrido principal y botón de centrar ubicación.
- Pedidos activos con marcador, ETA y estado: `En camino`, `Listo` y `Demorado`.
- Coordenadas reales del usuario (`Lat / Lon`) cuando el GPS está activo.

### Correcciones realizadas

- La pestaña **Rutas** ahora funciona: permite buscar recorridos y abrir **Ver detalles**.
- El detalle de cada ruta navega a `student/[id]`.
- El GPS se solicita desde **Activar GPS**, **nunca al abrir la app**.
- Al conceder ubicación se muestran las coordenadas actuales.
- Si el permiso está bloqueado aparece **Abrir Ajustes**.
- La cámara sigue funcionando aunque la ubicación sea rechazada.
- GPS y acelerómetro limpian sus suscripciones al salir de la pantalla.

## GeoCam offline-first

La app requiere una cuenta para entrar a las pantallas privadas. Desde **Tu nube** se sincronizan cambios en ambos sentidos, se consulta un feed paginado con TanStack Query y se pueden borrar respaldos. Las credenciales de sesión persisten con Expo SecureStore. Las fotos se guardan en el bucket privado `geocam`, organizadas en una carpeta con el ID del usuario; RLS restringe filas y objetos a su propietario.

Para configurar el proyecto, copia `.env.example` a `.env` y agrega la URL de Supabase y una publishable key. Nunca uses una `service_role` o secret key en la app. Aplica `supabase/schema.sql` desde SQL Editor antes de sincronizar; el script también actualiza proyectos existentes con cursor monotónico, marcas de borrado y control de conflictos.

Las pruebas unitarias cubren cambios pendientes, resolución de conflictos y paginación del feed. En Android se documentaron 33 fotos en **Tu nube**, el fin de la lista y un resultado de sincronización de 33 subidas y 2 borrados; las capturas están en [`EVIDENCIAS.md`](EVIDENCIAS.md). La descarga y propagación de borrados entre dos dispositivos, RLS entre cuentas y Realtime siguen pendientes de verificación.

### Sincronización bidireccional y feed de nube

```mermaid
flowchart LR
  A[Camara / galeria] --> B[Archivo persistente en Documents]
  B --> C[SQLite local: photos + albums, owner_id]
  C -->|Subidas y tombstones pendientes| D[Supabase Storage: bucket privado geocam / user_id / client_id]
  C <-->|Metadatos, cambios y tombstones| E[Postgres public.photos, RLS por auth.uid]
  E -->|Realtime + TanStack Query paginado| F[Pestana Tu nube]
  D -->|URL firmada| F
```

SQLite sigue disponible sin conexion y conserva una cola local de tombstones para fotos que ya llegaron a la nube y para subidas cuyo resultado pudo quedar incierto. Al reconectar, el ciclo baja cambios remotos, resuelve conflictos por `updated_at` (gana la version mas reciente), sube cambios locales y aplica borrados remotos. `server_version` usa una secuencia asignada bajo un bloqueo transaccional del servidor: no depende de la hora del dispositivo ni deja que un cursor salte una transaccion concurrente sin confirmar. Los borrados se conservan como tombstones en Postgres para que otros dispositivos tambien los apliquen; el feed los excluye y las filas y objetos solo son visibles para su usuario autenticado.

### SQL de Supabase

El SQL idempotente de la tabla, cursor monotono, trigger de versionado, politicas RLS y bucket privado esta en [`supabase/schema.sql`](supabase/schema.sql). Ejecutalo en el SQL Editor del proyecto antes de conectar la app. Al borrarse una foto primero se conserva el tombstone y despues se elimina el archivo de Storage. Las claves `service_role`/secret nunca se configuran en el cliente movil.

### Auditoría de credenciales

- `git log --all --full-history -- .env`: sin resultados (el archivo nunca se versionó).
- `.env` y `.env.*` están ignorados; `.env.example` contiene nombres de variables y valores de ejemplo no válidos.
- El cliente usa únicamente `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`; no hay secret key en código.

`Tu nube` consulta paginas de 20 fotos ordenadas por ID con `useInfiniteQuery`, conserva cache por cuenta, renueva al refrescar y pagina al llegar al final. Las URL firmadas se generan por pagina; Realtime invalida la cache del usuario actual. Los estados de carga, error con reintento, lista vacia, cache sin conexion, carga de pagina y fin del feed tienen respuesta visual.

Las altas, ediciones y borrados locales se guardan primero en SQLite. El borrado local elimina de inmediato la fila y el archivo del dispositivo y registra un tombstone en la misma transaccion; esto tambien cubre una subida que alcanzo Storage pero no llego a confirmar sus metadatos. Borrar desde la nube crea el tombstone remoto y el siguiente ciclo lo propaga a SQLite. Un fallo conserva la cola para reintentar sin perder el cambio local.

### Pruebas y verificacion

```bash
npm test
npx tsc --noEmit
npm run lint
```

Validacion local: `npm test` pasa con 10 pruebas; `npx tsc --noEmit` y `npm run lint` tambien terminan sin errores. La suite de `tests/syncLogic.test.ts` verifica que una foto nueva/editada quede pendiente hasta confirmar su version, que gane el cambio mas reciente, que un tombstone se aplique o se reconozca, y que los cambios offline mas nuevos sobrevivan a una sincronizacion. `tests/feedPaging.test.ts` comprueba que el cursor use la ultima fila visible y que la ultima pagina termine sin duplicar filas. Para verificar el recorrido completo en un proyecto Supabase configurado:

1. Sincroniza una foto del dispositivo A y confirma que aparece en el feed paginado.
2. Desconecta A y borra una foto respaldada; confirma que desaparece de SQLite y que el tombstone queda pendiente sin alertar error de red. Repite con una foto nueva antes de su primera sincronizacion.
3. Reconecta A y sincroniza; confirma que Postgres marca `deleted_at`, Storage elimina el objeto y el feed no la muestra.
4. Crea una foto en A y sincroniza desde B; verifica que B descarga el objeto y crea la fila SQLite con `client_id` compartido.
5. Edita la misma foto en ambos dispositivos desconectados y sincroniza; la version mas reciente debe quedar en ambos. Repite con un borrado concurrente.
6. Elimina desde **Tu nube**, sincroniza B y confirma que la fila y archivo local desaparecen.
7. Con mas de 20 respaldos, carga la pagina siguiente, refresca, prueba sin conexion, provoca un error de red y usa una segunda cuenta para confirmar el feed cacheado, el reintento y el aislamiento RLS.

En un teléfono se documentaron 33 fotos en el feed con el mensaje de fin de lista y un resultado de sincronización de 33 subidas y 2 borrados. La evidencia y sus límites están descritos en [`EVIDENCIAS.md`](EVIDENCIAS.md). La descarga en otro dispositivo y la propagación de borrados entre dispositivos siguen pendientes; no se declaran como ejecutadas.

### Modelo de datos

```mermaid
erDiagram
    ALBUMS ||--o{ PHOTOS : contains
    ALBUMS {
        integer id PK
        text name UK
        integer created_at
    }
    PHOTOS {
        integer id PK
        text uri
        real latitude
        real longitude
        real accuracy
        text source
        integer album_id FK
        text note
        boolean favorite
        integer created_at
    }
```

Las fotos se copian a `Paths.document/geocam-photos/`; SQLite almacena su URI, coordenadas opcionales, origen, nota, favorito y album. Al borrar una foto se borra su archivo. Al borrar un album las fotos se conservan con `album_id = NULL`.

### Flujo

```text
Camara / selector de imagen
                -> copia del archivo a Documentos
                -> repositorio de fotos
                -> SQLite + useLiveQuery
                -> galeria GeoCam / marcadores del mapa
```

GeoCam permite crear, renombrar y eliminar albumes; buscar por nota; filtrar por album y favoritas; editar metadatos; y borrar fotos. La opcion **Vaciar biblioteca al agitar** es opt-in y viene apagada.

### Capturas de GeoCam

![GeoCam con GPS activo, captura y gestión de álbumes](assets/screenshots/11.png)

![Biblioteca GeoCam con fotos guardadas, filtros y sensor de movimiento](assets/screenshots/12.png)

La evidencia de sincronización capturada en dispositivo Android y la lista de verificaciones pendientes están documentadas en [`EVIDENCIAS.md`](EVIDENCIAS.md).

### Autenticación y respaldo (Semana 8)

La pantalla de acceso permite iniciar sesión o crear una cuenta. Las pantallas privadas requieren sesión y las credenciales de sesión se guardan con SecureStore en Android e iOS.

![Pantalla de inicio de sesión y registro de GeoCam](assets/screenshots/13.png)

Para habilitar autenticación y respaldo, configura `.env` a partir de `.env.example` y ejecuta [`supabase/schema.sql`](supabase/schema.sql) en el SQL Editor de tu proyecto. El esquema aplica RLS a la tabla y al bucket privado `geocam`, con acceso limitado a la carpeta del usuario. La conexión remota, el registro/login y la sincronización deben validarse con el proyecto Supabase configurado.

### Migraciones

- `drizzle/0000_*.sql`: tabla inicial `photos`.
- `drizzle/0001_*.sql`: tabla `albums`, album opcional en fotos, nota y favorito.
- Los archivos y snapshots de `drizzle/` se generan con Drizzle Kit y deben versionarse. No edites una migracion ya generada.
- La segunda migracion generada registra `ON DELETE SET NULL` en el snapshot, pero Drizzle Kit no lo incluyo en el `ALTER TABLE` SQL de SQLite. El arranque instala un trigger idempotente que preserva ese comportamiento.

- `drizzle/0002_*.sql`: campos de sincronizacion local (`client_id`, `updated_at`, `remote_path`, `synced_at`).
- `drizzle/0003_*.sql` y `0004_*.sql`: propietario por usuario en fotos y albumes.
- `drizzle/0005_*.sql`: migracion de compatibilidad sin cambios; el arranque repara columnas faltantes de forma idempotente para bases actualizadas parcialmente.
- `supabase/schema.sql`: esquema remoto, RLS y politicas Storage; requiere aplicarse en el SQL Editor del proyecto Supabase.

Para generar una migracion despues de cambiar el esquema:

```bash
npm run db:generate
```

### GIF del flujo

El GIF debe grabarse en un dispositivo real para mostrar captura/importacion, cierre y reapertura de Expo Go, y persistencia de la foto. Guarda la grabacion como `assets/screenshots/geocam-offline-flow.gif` y anade aqui la imagen; no se incluye una animacion simulada como evidencia de persistencia.

---

## 🪝 Custom hooks

Toda la lógica nativa vive en `hooks/`, separada de la UI. Los hooks están **tipados (sin `any`)** y exponen los errores como **estado** para que la interfaz los muestre.

| Hook | Responsabilidad |
|---|---|
| [`hooks/useGeoLocation.ts`](hooks/useGeoLocation.ts) | Permiso de ubicación, coordenadas actuales, errores y *watcher* GPS con limpieza al desmontar. |
| [`hooks/useCamera.ts`](hooks/useCamera.ts) | Permiso de cámara, estados (concedido / rechazado / bloqueado) y acceso a Ajustes. |
| [`hooks/useShake.ts`](hooks/useShake.ts) | Detección de sacudidas con el acelerómetro y cancelación de la suscripción del sensor. |

### Buenas prácticas aplicadas

- **Permisos en contexto:** se piden solo cuando el usuario toca un botón (*Activar GPS*, *Solicitar permisos*).
- **Limpieza de suscripciones:** `remove()` / `unsubscribe` dentro del `return` de `useEffect`.
- **Errores como estado:** la UI nunca depende de `try/catch` aislados; lee el estado del hook.
- **Independencia entre permisos:** rechazar la ubicación no afecta a la cámara.

---

## 🔐 Manejo de permisos

La app distingue tres estados y muestra una respuesta distinta para cada uno:

| Estado | Comportamiento en la UI |
|---|---|
| ✅ **Concedido** | Se activa la función (coordenadas GPS, vista previa de cámara) y se muestra *"Los permisos están listos para usar la app"*. |
| ⚠️ **Rechazado** | Se informa al usuario, se permite volver a pedir con **Solicitar permisos** y el resto de la app (cámara) sigue funcionando. |
| 🚫 **Bloqueado** | Se explica que el permiso está bloqueado y aparece el botón **Abrir Ajustes** para habilitarlo manualmente. |

### Flujo de solicitud

```
Usuario toca "Activar GPS"  ──►  Diálogo nativo de Android
                                   ├─ Mientras la app está en uso / Solo esta vez ──► Concedido
                                   ├─ No permitir ───────────────────────────────► Rechazado
                                   └─ No permitir (repetido) ────────────────────► Bloqueado ──► "Abrir Ajustes"
```

---

## 📸 Evidencia visual

### Los tres estados de permiso

| ✅ Concedido | ⚠️ Rechazado | 🚫 Bloqueado |
|:---:|:---:|:---:|
| ![Permisos concedidos](assets/screenshots/4.png) | ![Ubicación rechazada, cámara concedida](assets/screenshots/5.png) | ![Ubicación bloqueada con botón Abrir Ajustes](assets/screenshots/10.png) |
| Ubicación y cámara concedidas | Ubicación rechazada, cámara sigue funcionando | Ubicación bloqueada con **Abrir Ajustes** |

### Estados en la pantalla Rutas

| Pendiente | Bloqueado | Concedido |
|:---:|:---:|:---:|
| ![GPS pendiente](assets/screenshots/6.png) | ![GPS bloqueado](assets/screenshots/9.png) | ![Mapa con GPS activo](assets/screenshots/2.png) |
| Botón **Activar GPS** | Botón **Abrir Ajustes** | GPS activo con coordenadas |

### Solicitud de permiso en contexto

![Diálogo nativo de Android solicitando ubicación](assets/screenshots/7.png)

*Diálogo nativo mostrado únicamente tras tocar el botón, nunca al abrir la app.*

### Mapa y pedidos de Riohacha

![Mapa de Riohacha con paradas y pedidos activos](assets/screenshots/2.png)

### Navegación de la app

| Inicio | Listado de rutas | Cámara en Mi pase |
|:---:|:---:|:---:|
| ![Pantalla de inicio con shuttles en ruta](assets/screenshots/1.png) | ![Listado de rutas disponibles](assets/screenshots/3.png) | ![Cámara concedida en Mi pase](assets/screenshots/8.png) |

### Diagramas de estado de permiso

| Concedido | Rechazado | Bloqueado |
|:---:|:---:|:---:|
| ![Concedido](assets/permission-state/granted.svg) | ![Rechazado](assets/permission-state/denied.svg) | ![Bloqueado](assets/permission-state/blocked.svg) |

---

## ✅ Checklist de verificación

- [x] La app pide permisos **en contexto**, nunca al abrirse.
- [x] Si se niega la ubicación, **la cámara sigue funcionando** y la app lo comunica.
- [x] Existe un botón **"Abrir Ajustes"** cuando el permiso está bloqueado.
- [x] Todas las suscripciones (GPS, acelerómetro) se **limpian al salir** de la pantalla.
- [x] Los hooks están **tipados, sin `any`**, y los errores llegan a la UI como estado.
- [x] `hooks/useGeoLocation.ts`, `hooks/useCamera.ts` y `hooks/useShake.ts` presentes.
- [x] README con capturas de los tres estados de permiso.
- [x] `AI-LOG.md` con la bitacora de las Semanas 6, 7 y 8 en la raiz.
- [x] GeoCam usa SQLite/Drizzle, dos migraciones generadas, repositorios y fotos en almacenamiento permanente.
- [x] Albumes relacionados, nota, favorito, filtros reactivos y borrado de registros/archivos implementados.
- [x] Pantalla de autenticacion implementada; la captura esta en `assets/screenshots/13.png`.
- [ ] Aplicar el SQL remoto y verificar registro/login, SecureStore tras cierre, RLS con segunda cuenta y carga de imagenes en Supabase.
- [ ] Probar en el telefono que las fotos sobreviven al cierre de Expo Go y grabar `assets/screenshots/geocam-offline-flow.gif`.

---

## 🗂️ Estructura del proyecto

```
Semana-6-DM/
├── app/                    # Pantallas (Expo Router)
│   ├── (tabs)/             # GeoCam · Rutas · Tu nube
│   ├── login.tsx           # Inicio de sesion y registro
│   └── student/[id]        # Detalle de ruta
├── hooks/
│   ├── useGeoLocation.ts   # GPS + permiso de ubicación
│   ├── useCamera.ts        # Cámara + permiso
│   └── useShake.ts         # Acelerómetro / sacudidas
├── db/
│   ├── schema.ts           # photos y albums
│   ├── client.ts           # SQLite + Drizzle
│   └── repositories/       # Acceso a datos
├── drizzle/                # SQL y snapshots generados
├── services/photoFiles.ts  # Archivos permanentes
├── hooks/usePhotos.ts      # Consultas y acciones de GeoCam
├── assets/
│   ├── screenshots/        # Capturas de la entrega (1.png – 13.png)
│   └── permission-state/   # granted.svg · denied.svg · blocked.svg
├── AI-LOG.md               # Bitácora de uso de IA (Semana 6)
└── README.md
```

## 🚀 Cómo ejecutar

```bash
npm install
npx expo start -c
```

1. Instala **Expo Go** compatible con **SDK 57** en un dispositivo físico.
2. Escanea el código QR que aparece en la terminal.
3. Abre **GeoCam** para capturar/importar fotos, asignar álbum y nota, o marcar favoritas.
4. Cierra Expo Go por completo y vuelve a abrirlo; las fotos deben seguir en la biblioteca y sus marcadores en **Rutas**.
5. Prueba modo avión, búsqueda, filtros y borrado de fotos/álbumes.

> ⚠️ GPS, cámara y acelerómetro requieren **dispositivo físico**; los emuladores no los reproducen de forma fiable.

---

## 🛠️ Tecnologías

- Expo SDK 57
- Expo Router
- React Native
- Expo Camera
- Expo Location
- Expo Sensors
- Expo SQLite
- Drizzle ORM y Drizzle Kit
- Expo FileSystem
- Expo ImagePicker
- TypeScript (modo estricto)

---

## 🤖 Documentación de IA

El uso de herramientas de IA durante esta semana está documentado en [`AI-LOG.md`](AI-LOG.md), en la raíz del repositorio.

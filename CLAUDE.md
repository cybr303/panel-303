# panel-303

## Qué es
Un "dashboard de vida" personal: una web app instalable en el iPhone (Safari → Añadir a pantalla de inicio), pensada sobre todo para el PC. Arriba recuerda la vida a la que 303 aspira (collage de fotos del Vision Board) y debajo muestra el día, las áreas de vida, los hábitos y sus rachas, el roadmap de aprendizaje y los objetivos del año. Permite escribir de vuelta (marcar hábitos, tachar prioridades, marcar hitos).

## Para quién
Un único usuario: **303**. Uso personal y privado, sobre todo desde el móvil y a lo largo de todo el día. No se diseña para nadie más.

## Roles
- 303 es el cliente; Claude es el programador.
- **Proponer antes de tocar.** Cualquier cambio de diseño, de estructura o de datos se propone y se espera el OK.
- Preguntar ante cualquier duda en lugar de suponer.
- Conversación con el cliente en español. **Interfaz de la app en inglés.**

## Secciones (aprobadas)
**PC (≥1024px), una sola pantalla con barra lateral** (Dashboard, Vision, Life areas, Habits, Learning, Goals saltan a cada bloque):
1. **Cabecera:** saludo, fecha, tiempo en Madrid, % del año.
2. **Vision:** collage de 8 fotos del Vision Board que **cambia cada día** (fijo durante el día). Encima, dos cifras: **% ahorrado para la casa** (objetivo «Save 18.000€ for the house», `Current`/`Target`) y **objetivos del año cumplidos**. Sin texto.
3. **Today** (tarjeta azul marino): reloj, hábitos de hoy, mejor racha actual, % del mes y exámenes en 7 días. **Top 3** (tachar y añadir). **Agenda** (desde Notion).
4. **Life areas:** Health & Gym · Career & Code · Money & Home · Apolo · Travel · Personal Growth. Cada una con una portada del Vision Board que **también rota cada día** entre las fotos de su área, y el progreso medio de sus objetivos (propiedad `Area` de Goals).
5. **Habits:** icono y color propio (gama azul), casillas L–D (hoy y días anteriores de la semana), racha y récord; mapa de 20 semanas (día perfecto = azul cielo `#87ceff`); % del mes, días perfectos y mejor día.
6. **Learning roadmap** (tarjeta azul marino): línea de tiempo desde la base Learning.
7. **Goals:** objetivos del año con progreso e hitos.

**Móvil:** 3 pestañas: Today (collage reducido, Today, Top 3, Agenda, hábitos de hoy), Habits, Life (áreas, objetivos, roadmap).

Descartado: Salud y Money (el dinero se queda en el Excel, fuera del panel). Cualquier sección nueva se propone antes.

## Arquitectura
```
iPhone (PWA en GitHub Pages)  ──PIN──▶  Cloudflare Worker  ──▶  Notion API
   repo público cybr303/panel-303         (guarda secretos)  ──▶  Open-Meteo (tiempo, sin clave)
```
- **Frontend:** estático, servido por GitHub Pages desde `cybr303/panel-303`. Es una PWA con manifest, icono "303", pantalla completa y modo oscuro. Vite + TypeScript sin framework (`web/`). GitHub Actions publica en cada push a `main` (`.github/workflows/pages.yml`); la URL del Worker está en `web/src/config.ts` (se puede cambiar con `VITE_API_URL`).
- **Backend:** Cloudflare Worker (gratis) en `worker/`. Rutas: `POST /api/auth`, `GET /api/summary`, `GET /api/photo?id=` (fotos del Vision Board, solo con sesión), `POST /api/habit`, `POST /api/top3`, `POST /api/top3/done`, `POST /api/goal`. Guarda el token de Notion y el PIN como *secrets*. Expone una API mínima y propia para el panel.
- **Acceso:** PIN corto. El Worker devuelve un token de sesión que el iPhone guarda. Sin PIN no se devuelve ningún dato.
- **Actualización:** al abrir la app, al volver a ella y cada pocos minutos mientras está abierta.

## Fuentes de datos
### Notion · Habit Tracker
- Data source: `collection://570088a8-9485-8301-ae74-8774e813cbe3`
- Una fila por día (propiedad `Date`) con una casilla por hábito. Las filas de la semana ya existen. **No se crean filas nuevas: se marca la del día.**
- Hay una relación `Semana` y rollups «semana ok» que **no se usan**. La app calcula las rachas a partir de las casillas.

| Hábito (nombre exacto en Notion) | Objetivo semanal |
|---|---|
| AM skincare · PM Skincare · Creatine · healthy meal | 7 (diario) |
| Gym | 4 |
| Apolo walk · Code · Posture · Night shower + read | 5 |

**Regla de rachas (aprobada):**
1. La racha cuenta **días marcados**. Marcar hoy suma 1.
2. Huecos permitidos: se pueden saltar como máximo `7 − objetivo` días seguidos (diarios: 0, Gym: 3, 5×: 2). Si el hueco es mayor, la racha se pierde.
3. **Mínimo semanal:** si una semana cerrada (lunes–domingo) termina por debajo del objetivo, la racha se pierde.
4. La semana en curso no rompe la racha por la regla 3 hasta que acaba el domingo.
5. Tras perderla, la racha vuelve a empezar en 1 al marcar de nuevo.
6. Sin días libres ni comodines.

### Notion · Goals (creada para este proyecto)
- Data source: `collection://957d41f2-d432-4257-b9ae-70647426a4b4`, dentro de «˗ˏˋ life ´ˎ˗».
- Propiedades: `Name`, `Year`, `Kind` (Goal / Sub-goal / Milestone), `Status`, `Tracking` (Habit / Milestones / Manual), `Area` (las 6 áreas), `Habit`, `Target`, `Current`, `Source`, `Order`, `Due`, `Notes`, `Parent` ↔ `Children`.
- Progreso según `Tracking`:
  - **Habit:** semanas consecutivas que cumplen el objetivo, frente a `Target`.
  - **Milestones:** hijos con estado Done / total.
  - **Manual:** con `Target` y `Current`, `Current / Target` (303 actualiza `Current` a mano); si no, su propio `Status`.
- «Save 18.000€ for the house» (`Money & Home`, Manual, Target 18000) alimenta la cifra de la zona Vision y la barra lateral. «Save up 5.000€» es `Manual`.

### Notion · Vision Board (creada para este proyecto)
- Data source: `collection://c78b26d1-8a4e-43f0-b64f-4f475c474a4f`, dentro de «˗ˏˋ life ´ˎ˗».
- Propiedades: `Name`, `Photo` (archivo; si está vacío se usa la primera imagen dentro de la página), `Area` (Vision + las 6 áreas), `In collage`, `Order`, `Active`, `Focus` (Center/Top/Bottom/Left/Right: qué parte de la foto se ve al recortarla; sirve para ocultar texto en imágenes de inspiración).
- Solo se usan filas con `Active` y foto. Collage: fotos con `In collage`, 8 al día, elegidas con una semilla por fecha (`worker/src/vision.ts`, con tests). Portadas: una por área al día entre sus fotos; se excluyen del collage si hay suficientes.
- Las fotos **nunca** van al repositorio: el Worker las descarga de Notion y las sirve solo con sesión; la web las pide con el token y las muestra como blob.

### Notion · Learning (creada para este proyecto)
- Data source: `collection://d2ed32fb-c9f1-4550-b91d-44e44868ff44`. Propiedades: `Name`, `Status` (Planned/Learning/Done), `Type`, `Start`, `Target date`, `Order`, `Link`, `Notes`.

### Notion · Agenda
La agenda del día se lee de Notion, que es la fuente principal de todo. La automatización de 303 la copia a Google Calendar; la app no lee Calendar.
- **Calendar** (`collection://2ac088a8-9485-8197-b198-000bd41fc6d0`): eventos con `Name`, `Date` y `Notes`.
- **assignments/exams** (`collection://3e4088a8-9485-83a9-a3ef-07ac05919cca`): tareas y exámenes de clase con `Name`, `Date`, `Type` (Assignments / Exams), `Status`, `Courses` y `Nota`. Se muestran los de hoy y los próximos que no están en Done.
- **Horario de clases:** se lee de la tabla «schedule» de la página «school» (`4e2088a8-9485-8281-b8e1-81eb5745624a`). Columnas: Time + Monday–Friday. Las celdas «Libre» se ignoran. Si 303 la cambia en Notion, la app se actualiza sola.
- **Bloques de estudio:** la automatización de 303 los escribe en Notion (solo la semana actual) y en Google Calendar (más días). El panel lee los de Notion.

### Notion · Top 3 (creada para este proyecto)
- Data source: `collection://0d2a2428-3770-47bf-b98d-158d82fd6a3d`
- Propiedades: `Name`, `Date`, `Order` (1–3) y `Done`.
- Son las 3 prioridades **del día**. Se pueden escribir en Notion o en la app, y la app solo marca o desmarca `Done`.

## Diseño
«Ice glass» claro (tono A aprobado), inspirado en las referencias de 303 (Planivo, iDraft, Tech Productivity Hub, Creative Code Studio). Guía y maqueta aprobadas: https://claude.ai/artifact/5XJvYqQewoDdp7Z1kmDauP

| Token | Valor | Uso |
|---|---|---|
| `--ice` | `#eaf1fa` + degradados radiales azul hielo | Fondo |
| `--glass` | blanco 62% + blur 18px, borde blanco | Tarjetas por defecto |
| `--deep` | `#0a1830` → `#12264a` | Solo 1–2 bloques clave (Today, Learning, elemento activo del menú), con brillo cian |
| `--ink` / `--ink-2` / `--ink-3` | `#0b1b33` / `#44546e` / `#6b7b95` | Texto |
| `--accent` | `#2f6fe4` | Acento único |
| `--cyan` | `#3fd4ff` | Brillos y degradado de barras |
| `--sky` | `#87ceff` | Día perfecto en el mapa, clases en la agenda |
| Hábitos | `#1fb5e0` `#1a9be6` `#2f6fe4` `#14a8bd` `#5470e8` `#3d8fe0` `#4b55d6` `#7a63e6` `#5f8fd0` | Un color por hábito (icono, casillas, «Your best streak!») |

- **Tipografía:** DM Sans (títulos y cifras grandes), Inter (texto), JetBrains Mono (horas, fechas, ratios). Cifras con `tabular-nums`.
- **Superficies:** cristal con sombra azul suave; radio 20px en tarjetas, 16px en fotos, 10px en botones. Progreso en anillos (una cifra grande) y barras (listas).
- **Fotos:** las aporta 303 en el Vision Board; tonos fríos/azules y minimalistas encajan mejor.
- **Navegación:** barra lateral en PC; barra inferior con 3 pestañas en el móvil, con *safe areas* del iPhone.

## Comandos
- Web: `cd web && npm run dev` / `npm run build`
- Worker: `cd worker && npm test` (rachas en `src/streaks.test.ts`, estadísticas en `src/stats.test.ts`, rotación del Vision Board en `src/vision.test.ts`) / `npm run typecheck` / `npx wrangler deploy`

## Reglas
1. **Nunca** se suben datos personales, tokens, claves, PIN ni el Excel al repositorio. El repo es público.
2. Los secretos viven solo en Cloudflare (`wrangler secret`). Claude nunca pide que se peguen en el chat.
3. La app solo escribe en Notion desde las acciones aprobadas:
   - marcar o desmarcar un hábito de hoy o de un día anterior de la semana en curso;
   - tachar una prioridad del Top 3;
   - marcar hitos y objetivos;
   - añadir una prioridad al Top 3 del día.

   Nada de borrar ni de crear filas en el Habit Tracker.
4. No se modifica la estructura de las bases de datos de Notion existentes sin permiso.
5. Si una fuente falla, la sección muestra un aviso claro y el resto del panel sigue funcionando.
6. Commits pequeños y descriptivos; nada se publica sin que 303 lo haya visto.

## Pendiente
- [x] Repositorio `cybr303/panel-303` conectado a la sesión
- [x] Cuenta de Cloudflare
- [x] Desplegar el Worker: `https://panel-303.panel-303-worker.workers.dev` (fijada en `web/src/config.ts`; `API_URL` ya no hace falta)
- [x] Guardar los secretos del Worker en Cloudflare (NOTION_TOKEN, PIN, SESSION_SECRET)
- [x] Activar GitHub Pages (Settings → Pages → Source: GitHub Actions)
- [x] Vista de PC y funciones nuevas de Hábitos publicadas
- [x] Bases Vision Board y Learning; `Area` y `Current` en Goals
- [ ] Publicar el dashboard de vida (rama `life-dashboard`): desplegar el Worker y luego pasar la web a `main`
- [ ] Comprobar que la integración de Notion tiene acceso a Vision Board y Learning
- [x] 25 fotos subidas a Vision Board (imagen dentro de cada página) y `Current` de la casa = 900
- [ ] 303 rellena la base Learning

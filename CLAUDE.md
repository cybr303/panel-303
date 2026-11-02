# panel-303

## Qué es
Un "panel de vida" personal: una web app instalable en el iPhone (Safari → Añadir a pantalla de inicio) que muestra cómo va el día, los hábitos y sus rachas, el dinero y los objetivos del año, y permite escribir de vuelta (marcar hábitos, tachar prioridades, añadir movimientos).

## Para quién
Un único usuario: **303**. Uso personal y privado, sobre todo desde el móvil y a lo largo de todo el día. No se diseña para nadie más.

## Roles
- 303 es el cliente; Claude es el programador.
- **Proponer antes de tocar.** Cualquier cambio de diseño, de estructura o de datos se propone y se espera el OK.
- Preguntar ante cualquier duda en lugar de suponer.
- Conversación con el cliente en español. **Interfaz de la app en inglés.**

## Secciones (aprobadas)
| Pestaña | Contenido |
|---|---|
| **Today** | Saludo, fecha, tiempo en Madrid, % del año, Top 3 (se tachan a mano), agenda del día (desde Notion), hábitos de hoy para marcar con un toque |
| **Habits** | Cada hábito con icono y color propio (gama azul), casillas L–D de la semana (se pueden marcar hoy y los días anteriores de la semana), racha y récord; mapa de las últimas 20 semanas (día perfecto = azul cielo `#87ceff`); % cumplido del mes, días perfectos del mes y mejor día de la semana |
| **Year** | Objetivos del año con progreso, sub-objetivos e hitos (base de datos Goals) |

Descartado: Salud y Money (el dinero se queda en el Excel, fuera del panel).

**En PC (≥1024px)** todo cabe en una pantalla sin pestañas: Hábitos en la columna ancha; Top 3, Agenda y Objetivos en la lateral. En el móvil, 3 pestañas: Today, Habits, Year. Cualquier sección nueva se propone antes.

## Arquitectura
```
iPhone (PWA en GitHub Pages)  ──PIN──▶  Cloudflare Worker  ──▶  Notion API
   repo público cybr303/panel-303         (guarda secretos)  ──▶  Open-Meteo (tiempo, sin clave)
```
- **Frontend:** estático, servido por GitHub Pages desde `cybr303/panel-303`. Es una PWA con manifest, icono "303", pantalla completa y modo oscuro. Vite + TypeScript sin framework (`web/`). GitHub Actions publica en cada push a `main` (`.github/workflows/pages.yml`); la URL del Worker está en `web/src/config.ts` (se puede cambiar con `VITE_API_URL`).
- **Backend:** Cloudflare Worker (gratis) en `worker/`. Rutas: `POST /api/auth`, `GET /api/summary`, `POST /api/habit`, `POST /api/top3`, `POST /api/top3/done`, `POST /api/goal`. Guarda el token de Notion y el PIN como *secrets*. Expone una API mínima y propia para el panel.
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
- Propiedades: `Name`, `Year`, `Kind` (Goal / Sub-goal / Milestone), `Status`, `Tracking` (Habit / Milestones / Manual), `Habit`, `Target`, `Source`, `Order`, `Due`, `Notes`, `Parent` ↔ `Children`.
- Progreso según `Tracking`:
  - **Habit:** semanas consecutivas que cumplen el objetivo, frente a `Target`.
  - **Milestones:** hijos con estado Done / total.
  - **Manual:** su propio `Status`.
- «Save up 5.000€» es `Manual` (el panel no lee el Excel).

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
Basado en el estilo «Reflect Notes» (`DESIGN.md` del cliente), solo en oscuro, con la paleta cambiada a azul:

| Token | Valor | Uso |
|---|---|---|
| `--void` | `#000814` | Fondo |
| `--surface` | `#04101f` | Tarjetas |
| `--raised` | `#0a1f45` | Paneles elevados, hover, botones secundarios |
| `--text` | `#eef5ff` | Texto principal |
| `--text-2` | `#a3adbf` | Texto secundario |
| `--text-3` | `#8b93a5` | Metadatos |
| `--steel` | `#4f5867` | Deshabilitado |
| `--accent` | `#5b9dff` | Único acento |
| `--accent-2` | `#2f6fe4` | Acento profundo y brillos |
| `--gradient` | `#9ef0ff → #8cc4ff → #7f9cff` | Solo texto de acento y trazos finos, nunca rellenos grandes |
| Hábitos | `#7fe3ff` `#5bc8ff` `#5b9dff` `#4fd3e6` `#7f9cff` `#8cc4ff` `#6d7dff` `#9a8cff` `#b3d4ff` | Un color por hábito, solo en su icono, casillas y texto de récord |

- **Tipografía:** DM Sans 500 para títulos (sustituye a AeonikPro) e Inter 400/500 para el cuerpo. Cifras con `tabular-nums`.
- **Superficies:** se separan con brillo interior en el borde (*rim light*), no con sombras ni bordes marcados. Radio de 16px en tarjetas y 5px en botones.
- **Fondo:** estrellas sutiles (canvas), con `prefers-reduced-motion` respetado.
- **Navegación:** barra inferior con 3 pestañas en el móvil y respeto de las *safe areas* del iPhone.
- **Muestra aprobada:** https://claude.ai/artifact/S2GLhkzhJK1ZVSB3gGgYsF

## Comandos
- Web: `cd web && npm run dev` / `npm run build`
- Worker: `cd worker && npm test` (regla de rachas en `src/streaks.test.ts`) / `npm run typecheck` / `npx wrangler deploy`

## Reglas
1. **Nunca** se suben datos personales, tokens, claves, PIN ni el Excel al repositorio. El repo es público.
2. Los secretos viven solo en Cloudflare (`wrangler secret`). Claude nunca pide que se peguen en el chat.
3. La app solo escribe en Notion desde las acciones aprobadas:
   - marcar o desmarcar un hábito de hoy o de un día anterior de la semana en curso;
   - tachar una prioridad del Top 3;
   - marcar hitos y objetivos;

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
- [ ] Publicar la vista de PC y las funciones nuevas de Hábitos (rama `desktop-habits`): desplegar el Worker y luego pasar la web a `main`

# Events

The kernel event bus (`src/kernel/bus.js`) carries every OS event. Apps listen with
`ctx.events.on(type, fn)`; listeners are removed automatically when the app window closes.

- **Wildcards:** `ctx.events.on('vfs:*', fn)` receives every event starting with `vfs:`;
  `'*'` receives everything. Listeners get `(payload, type)`.
- **Other tabs:** events marked ↔ are mirrored to other tabs of the same profile. Mirrored
  events arrive with `remote: true` in the payload.
- **Who may emit:** only the OS emits the namespaces below. Apps emit their own namespaces
  (e.g. `notes:saved`); `ctx.events.emit` throws for reserved ones (`src/kernel/context.js`).

Payloads are plain objects. Fields marked `?` are optional.

## Apps and lifecycle

| Event                         | Payload                 | When                                                                   |
| ----------------------------- | ----------------------- | ---------------------------------------------------------------------- |
| `app:registered`              | `{ id }`                | A manifest was registered.                                             |
| `app:unregistered`            | `{ id }`                | An app was removed.                                                    |
| `app:enabled-changed`         | `{ id, enabled }`       | The user enabled/disabled an app.                                      |
| `app:launching`               | `{ id, appId }`         | An instance starts loading (`id` = instance id, e.g. `nexus.notes#2`). |
| `app:launched`                | `{ id, appId }`         | The instance mounted successfully.                                     |
| `app:focused` / `app:blurred` | `{ id, appId }`         | Focus moved between instances.                                         |
| `app:suspended`               | `{ id, appId, reason }` | `reason`: `minimized`, `workspace` or `hidden` (tab hidden).           |
| `app:resumed`                 | `{ id, appId }`         | All suspend reasons are gone.                                          |
| `app:crashed`                 | `{ id, appId, report }` | Uncaught error; `report` is a `CrashReport`.                           |
| `app:closed`                  | `{ id, appId }`         | The instance was unmounted and removed.                                |

## System

| Event                                                     | Payload                                    | When                                 |
| --------------------------------------------------------- | ------------------------------------------ | ------------------------------------ |
| `system:ready`                                            | `{ profile }`                              | Boot finished.                       |
| `theme:changed`                                           | `{ theme, scheme, motion, themeSwitched }` | Tokens were (re)applied.             |
| `i18n:changed`                                            | `{ locale }`                               | Language switched at runtime.        |
| `commands:changed`                                        | `{}`                                       | Commands were registered or removed. |
| `command:executed`                                        | `{ id }`                                   | A command ran successfully.          |
| `shortcuts:changed`                                       | `{}`                                       | A user binding changed.              |
| `permissions:changed`                                     | `{ app, permission, granted }`             | A permission decision changed.       |
| `profile:created` / `profile:updated` / `profile:removed` | `{ id }`                                   | Profile list changes.                |

## Data

| Event                    | Payload                                           | When                                                                                                                        |
| ------------------------ | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `storage:changed` ↔      | `{ scope, collection, type, id?, remote? }`       | A collection record was put/deleted/cleared (`type`: `put`, `delete`, `clear`).                                             |
| `storage:kv-changed` ↔   | `{ scope, key? }`                                 | Key-value state changed.                                                                                                    |
| `storage:quota-exceeded` | `{ store }`                                       | A write failed because storage is full (the user is notified).                                                              |
| `settings:changed` ↔     | `{ scope, key, value, remote? }`                  | A setting changed (`scope`: `system` or an app id).                                                                         |
| `vfs:changed` ↔          | `{ type, path, oldPath?, nodeType, id, remote? }` | `type`: `created`, `modified`, `moved`, `deleted`, `trashed`, `restored`. Use `ctx.fs.watch(path, fn)` to filter by folder. |
| `clipboard:changed` ↔    | `{ id? }`                                         | Clipboard history changed.                                                                                                  |

## Notifications, scheduler, achievements

| Event                             | Payload                                          | When                                                           |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `notification:shown`              | `NotificationRecord`                             | A toast should appear (not sent while muted / Do-not-disturb). |
| `notification:updated`            | `NotificationRecord`                             | Title, body or progress changed.                               |
| `notification:closed`             | `{ id }`                                         | The toast should disappear.                                    |
| `notification:action`             | `{ id, actionId }`                               | The user clicked a toast button.                               |
| `notification:clicked`            | `{ id }`                                         | The user clicked a system (browser) notification.              |
| `notifications:history-changed` ↔ | `{}`                                             | History was added to, marked read or cleared.                  |
| `notifications:dnd-changed`       | `{ active }`                                     | Focus mode toggled Do-not-disturb.                             |
| `notifications:mute-changed`      | `{ app, muted }`                                 | Per-app mute changed.                                          |
| `scheduler:fired`                 | `{ job }`                                        | A job came due while Nexus was open.                           |
| `scheduler:missed`                | `{ jobs }`                                       | Jobs came due while Nexus was closed (reported once at start). |
| `scheduler:changed` ↔             | `{ app }`                                        | Jobs were added or removed.                                    |
| `achievement:unlocked`            | `{ app, id }`                                    | An achievement was unlocked.                                   |
| `achievement:progress`            | `{ app, id, progress, goal }`                    | Progress towards a goal changed.                               |
| `xp:changed`                      | `{ level, xp, current, needed, amount, reason }` | XP was awarded.                                                |
| `xp:level-up`                     | `{ level }`                                      | A new level was reached.                                       |
| `ai:availability-changed`         | `{ available }`                                  | An AI provider became (un)available (phase 12).                |

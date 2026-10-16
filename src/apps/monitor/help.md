# System Monitor

See what Nexus is doing. Switch tabs with the mouse or with <kbd>←</kbd> / <kbd>→</kbd>.

## Processes

Every open window with its app and state. **CPU** is the share of the last second the app spent
in its own code (timers, animations, event handlers). **Elements** is the window's part of the
page: browsers can't measure memory per window, so this is the closest estimate. **Timers**
counts the window's running timers and animation loops; minimized windows, windows on another
workspace and a hidden browser tab pause them.

Click a window's name to switch to it. **End task** closes a window immediately, without asking
about unsaved changes (use it for an app that stopped responding).

## Performance

Frames per second and the slowest frame of each second (the page feels smooth below about
16 ms), JavaScript memory where the browser reports it (Chrome and Edge), the number of elements
on the page, animation loops, timers and the background workers Nexus is running.

## Storage

How much space each app, your files and the system use. **Manage in Settings** opens
Settings → Storage, where you can clear data.

## Log

The system log: what Nexus and the apps reported. Choose a minimum level, filter by source
(for example `app:nexus.files`) or search the messages. **Export…** downloads the filtered log
as a text file, for example to attach to a bug report.

## Network

Whether you're online. Nexus never goes online by itself; requests you start (an AI server, the
HTTP client) are listed with their status and duration.

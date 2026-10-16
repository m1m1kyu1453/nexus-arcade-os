# Backups

Nexus speichert deine Daten nur in diesem Browser. Gelöschte Browserdaten, eine defekte
Festplatte oder ein neuer Computer würden sie verlieren – mach also Backups.

## Ein Backup erstellen

Öffne Einstellungen → Sichern & Wiederherstellen und wähle **Backup herunterladen**. Du bekommst
eine `.nexus-backup`-Datei mit allen Dateien, Einstellungen und App-Daten. Mit Passwort wird sie
verschlüsselt (AES-GCM); **wenn du das Passwort vergisst, kann niemand das Backup öffnen**.

Nexus erinnert dich alle 14 Tage an ein Backup; ändern oder abschalten kannst du das auf
derselben Seite.

## Wiederherstellen

Wähle **Backup-Datei wählen …**. Nexus zeigt den Inhalt (Datum, Profil, Größe, Version), bevor
sich etwas ändert. Dann wähle:

- **Ersetzen:** Die Daten dieses Profils werden gelöscht und das Backup geladen.
- **Zusammenführen:** Die Daten des Backups kommen hinzu; vorhandene Einträge bleiben.

Danach lädt Nexus neu. Backups älterer Versionen werden automatisch aktualisiert.

## Daten im Browser sichern

Unter Einstellungen → Speicher bittet **Daten dauerhaft behalten** den Browser, Nexus-Daten nicht
zu löschen, wenn der Platz knapp wird. Safari kann Daten länger nicht genutzter Seiten trotzdem
entfernen – noch ein Grund für Backups.

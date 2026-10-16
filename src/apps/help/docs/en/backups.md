# Backups

Nexus keeps your data only in this browser. Clearing the browser's data, a broken disk or a new
computer would lose it, so make backups.

## Making a backup

Open Settings → Backup & Restore and choose **Download backup**. You get one `.nexus-backup` file
with all your files, settings and app data. With a password, the file is encrypted (AES-GCM);
**if you forget the password, nobody can open the backup**.

Nexus reminds you to back up every 14 days; change or turn off the reminder on the same page.

## Restoring

Choose **Choose a backup file…**. Nexus shows what's inside (date, profile, size, version) before
anything changes. Then pick:

- **Replace:** this profile's data is deleted and the backup is loaded.
- **Merge:** the backup's data is added; items that already exist are kept.

Nexus reloads afterwards. Backups from older versions are upgraded automatically.

## Keep data safe in the browser

In Settings → Storage, **Keep data permanently** asks the browser not to delete Nexus data when
space runs low. Safari may still remove data of sites you haven't used for a while, another
reason for backups.

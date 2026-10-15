// @ts-check
// Screenshots via screen capture (the browser asks the user which screen/tab to share).
// Saves a PNG to ~/Pictures/Screenshots and copies it to the clipboard where allowed.

/**
 * @param {import('../kernel/system.js').System} sys
 * @returns {Promise<string | null>} saved path, or null if the user cancelled
 */
export async function takeScreenshot(sys) {
  const media = navigator.mediaDevices;
  if (!media?.getDisplayMedia) throw new Error(sys.i18n.t('system', 'center.screenshotUnsupported'));
  /** @type {MediaStream} */
  let stream;
  try {
    stream = await media.getDisplayMedia({ video: true, audio: false });
  } catch (error) {
    if (/** @type {Error} */ (error)?.name === 'NotAllowedError') return null;
    throw error;
  }
  try {
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    await video.play();
    // Give the first frame time to arrive.
    await new Promise((r) => setTimeout(r, 300));
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    /** @type {CanvasRenderingContext2D} */ (canvas.getContext('2d')).drawImage(video, 0, 0);
    const blob = await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'),
    );
    const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ').replaceAll(':', '-');
    const path = await sys.vfs.uniquePath(`${sys.vfs.home}/Pictures/Screenshots/Screenshot ${stamp}.png`);
    await sys.vfs.writeFile(path, /** @type {Blob} */ (blob), { mime: 'image/png', createParents: true });
    await sys.clipboard.writeImage(/** @type {Blob} */ (blob)).catch(() => {});
    return path;
  } finally {
    for (const track of stream.getTracks()) track.stop();
  }
}

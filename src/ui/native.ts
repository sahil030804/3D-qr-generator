import { Capacitor } from '@capacitor/core';

/** True only inside the installed Android (or iOS) wrapper, never in plain mobile Chrome. */
export function isNative(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1] ?? '');
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Save + share a PNG from the native wrapper.
 * WebView has no `a[download]` gallery, so write to Cache then open the system sheet.
 * Returns true when handled natively.
 */
export async function shareFileNative(blob: Blob, filename: string, text: string): Promise<boolean> {
  if (!isNative()) return false;
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const data = await blobToBase64(blob);
  const result = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
  await Share.share({ title: 'Voxel QR', text, url: result.uri });
  return true;
}

/** Open the system share sheet for a link. Returns true when handled natively. */
export async function shareUrlNative(url: string, text: string): Promise<boolean> {
  if (!isNative()) return false;
  const { Share } = await import('@capacitor/share');
  await Share.share({ title: 'Voxel QR', text, url });
  return true;
}

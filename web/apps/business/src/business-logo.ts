// Local rasterization only. Never upload the original, SVG, metadata or a URL.
export async function prepareBusinessLogo(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw Error('Choose a PNG, JPG or WebP image under 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24000000)
      throw Error('Choose an image smaller than 24 megapixels.');
    for (const side of [256, 128, 64]) {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw Error('This browser could not prepare the logo.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const png = canvas.toDataURL('image/png');
      if (png.length <= 32790 && png.startsWith('data:image/png;base64,')) return png;
    }
    throw Error('Choose a simpler logo image.');
  } finally {
    bitmap.close();
  }
}

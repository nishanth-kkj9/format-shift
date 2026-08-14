import { TargetFormat, ImageConversionOptions } from '../types';
import { SOCIAL_PRESETS } from './detect';

export { dataUrlToBlob };

function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

// Convert Image using HTML5 Canvas
export async function convertImage(
  file: File,
  targetFormat: TargetFormat,
  options: ImageConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; dimensions: { width: number; height: number } }> {
  onProgress?.(10);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.onload = () => {
      onProgress?.(30);
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image data'));
      img.onload = () => {
        onProgress?.(50);
        let width = img.width;
        let height = img.height;

        // Apply Social Media Preset dimensions if selected
        let presetDim: { w: number; h: number } | null = null;
        if (options.socialPreset && options.socialPreset !== 'custom' && SOCIAL_PRESETS[options.socialPreset]) {
          presetDim = SOCIAL_PRESETS[options.socialPreset];
        }

        if (presetDim) {
          // Preset target canvas dimensions
          const canvas = document.createElement('canvas');
          canvas.width = presetDim.w;
          canvas.height = presetDim.h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Could not get canvas 2d context'));
            return;
          }

          // Fill background
          ctx.fillStyle = options.bgColor || '#0f172a';
          ctx.fillRect(0, 0, canvas.width, canvas.height);

          // Calculate aspect fit scale to center image on canvas
          const scale = Math.min(canvas.width / width, canvas.height / height);
          const drawW = width * scale;
          const drawH = height * scale;
          const drawX = (canvas.width - drawW) / 2;
          const drawY = (canvas.height - drawH) / 2;

          ctx.drawImage(img, drawX, drawY, drawW, drawH);

          // Grayscale filter
          if (options.grayscale) {
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
              const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
              data[i] = avg;
              data[i + 1] = avg;
              data[i + 2] = avg;
            }
            ctx.putImageData(imgData, 0, 0);
          }

          const qualityVal = (options.quality || 85) / 100;
          let mimeType = 'image/jpeg';
          const tgt = targetFormat.toLowerCase();
          if (tgt === 'png') mimeType = 'image/png';
          else if (tgt === 'webp') mimeType = 'image/webp';

          canvas.toBlob(
            (blob) => {
              onProgress?.(100);
              if (blob) {
                resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
              } else {
                const dataUrl = canvas.toDataURL('image/png');
                const fallbackBlob = dataUrlToBlob(dataUrl);
                resolve({ blob: fallbackBlob, dimensions: { width: canvas.width, height: canvas.height } });
              }
            },
            mimeType,
            qualityVal
          );
          return;
        }

        // Scale max width/height for custom preset
        if (options.maxWidth && width > options.maxWidth) {
          if (options.maintainAspectRatio) {
            height = Math.round((height * options.maxWidth) / width);
          }
          width = options.maxWidth;
        }
        if (options.maxHeight && height > options.maxHeight) {
          if (options.maintainAspectRatio) {
            width = Math.round((width * options.maxHeight) / height);
          }
          height = options.maxHeight;
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas 2d context'));
          return;
        }

        // Handle rotation & flip canvas dimensions
        const rad = (options.rotation * Math.PI) / 180;
        const isSwapped = options.rotation === 90 || options.rotation === 270;
        canvas.width = isSwapped ? height : width;
        canvas.height = isSwapped ? width : height;

        ctx.save();
        // Background fill
        if (options.bgColor) {
          ctx.fillStyle = options.bgColor;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }

        // Transform canvas
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rad);
        ctx.scale(options.flipHorizontal ? -1 : 1, options.flipVertical ? -1 : 1);

        // Draw image
        ctx.drawImage(img, -width / 2, -height / 2, width, height);
        ctx.restore();

        // Apply Grayscale if requested
        if (options.grayscale) {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;
          for (let i = 0; i < data.length; i += 4) {
            const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
            data[i] = avg; // R
            data[i + 1] = avg; // G
            data[i + 2] = avg; // B
          }
          ctx.putImageData(imgData, 0, 0);
        }

        onProgress?.(80);

        // Determine target MIME type
        let mimeType = 'image/jpeg';
        const tgt = targetFormat.toLowerCase();
        if (tgt === 'png') mimeType = 'image/png';
        else if (tgt === 'webp') mimeType = 'image/webp';
        else if (tgt === 'bmp') mimeType = 'image/bmp';
        else if (tgt === 'gif') mimeType = 'image/gif';
        else if (tgt === 'ico') mimeType = 'image/x-icon';
        else if (tgt === 'svg') mimeType = 'image/svg+xml';
        else if (tgt === 'avif') mimeType = 'image/avif';

        // Special handling for SVG wrapper format
        if (tgt === 'svg') {
          const dataUrl = canvas.toDataURL('image/png');
          const svgString = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
            <image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}" />
          </svg>`;
          const blob = new Blob([svgString], { type: 'image/svg+xml' });
          onProgress?.(100);
          resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
          return;
        }

        // ICO format output
        if (tgt === 'ico') {
          // Resize canvas to 32x32 for standard favicon icon
          const icoCanvas = document.createElement('canvas');
          icoCanvas.width = 32;
          icoCanvas.height = 32;
          const icoCtx = icoCanvas.getContext('2d');
          icoCtx?.drawImage(canvas, 0, 0, 32, 32);
          icoCanvas.toBlob(
            (icoBlob) => {
              if (icoBlob) {
                onProgress?.(100);
                resolve({ blob: icoBlob, dimensions: { width: 32, height: 32 } });
              } else {
                reject(new Error('Failed to export ICO file'));
              }
            },
            'image/x-icon'
          );
          return;
        }

        const qualityVal = (options.quality || 85) / 100;
        canvas.toBlob(
          (blob) => {
            onProgress?.(100);
            if (blob) {
              resolve({ blob, dimensions: { width: canvas.width, height: canvas.height } });
            } else {
              // Fallback for browsers that don't support certain MIME types like BMP/AVIF directly
              const dataUrl = canvas.toDataURL('image/png');
              const fallbackBlob = dataUrlToBlob(dataUrl);
              resolve({ blob: fallbackBlob, dimensions: { width: canvas.width, height: canvas.height } });
            }
          },
          mimeType,
          qualityVal
        );
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

import { TargetFormat, VideoConversionOptions } from '../types';
import { planConversion } from '../core/conversionRegistry';

// Convert Video format / Video to WEBM/MP4/GIF (browser path).
// All video targets route to the FFmpeg server via the conversion registry for
// production reliability; this browser path is kept as a fallback but never
// silently substitutes a different container than the one requested.
export async function convertVideo(
  file: File,
  targetFormat: TargetFormat,
  options: VideoConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
  onProgress?.(10);

  // If user selected audio format target from video (e.g. video -> WAV/MP3), it must
  // run on the server (registry marks video->audio as server engine). Refuse here.
  const plan = planConversion('video', targetFormat);
  if (plan.supported === false || plan.target.engine !== 'browser') {
    throw new Error(`Video -> ${targetFormat} must run on the FFmpeg server`);
  }

  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = options.muteAudio;
    video.src = videoUrl;

    video.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      reject(new Error('Unable to load video file'));
    };

    video.onloadedmetadata = () => {
      onProgress?.(30);
      // Check for abort before starting
      if (abortSignal?.aborted) {
        URL.revokeObjectURL(videoUrl);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      const srcWidth = video.videoWidth;
      const srcHeight = video.videoHeight;

      // Preserve aspect ratio when scaling down to a preset resolution.
      let targetWidth = srcWidth;
      let targetHeight = srcHeight;
      const preset = options.resolution;
      if (preset && preset !== 'original') {
        const presets: Record<string, { w: number; h: number }> = {
          '1080p': { w: 1920, h: 1080 },
          '720p': { w: 1280, h: 720 },
          '480p': { w: 854, h: 480 },
          '360p': { w: 640, h: 360 },
        };
        const p = presets[preset];
        if (p && srcWidth > 0 && srcHeight > 0) {
          const scale = Math.min(p.w / srcWidth, p.h / srcHeight);
          targetWidth = Math.round(srcWidth * scale);
          targetHeight = Math.round(srcHeight * scale);
          // ensure even dimensions for encoder compatibility
          if (targetWidth % 2 !== 0) targetWidth += 1;
          if (targetHeight % 2 !== 0) targetHeight += 1;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const fps = options.fps || 30;
      const canvasStream = canvas.captureStream(fps);

      // Never fall back to webm when the requested container is unsupported —
      // fail loudly so the caller routes to FFmpeg instead of mislabeling output.
      const requestedType = targetFormat === 'mp4' ? 'video/mp4' : 'video/webm';
      if (!MediaRecorder.isTypeSupported(requestedType)) {
        URL.revokeObjectURL(videoUrl);
        reject(new Error(`This browser cannot record ${requestedType} (server conversion required)`));
        return;
      }

      const mediaRecorder = new MediaRecorder(canvasStream, { mimeType: requestedType });
      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      // Listen for abort to stop recording
      const handleAbort = () => {
        if (mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
        }
        URL.revokeObjectURL(videoUrl);
      };
      abortSignal?.addEventListener('abort', handleAbort, { once: true });

      mediaRecorder.onstop = () => {
        onProgress?.(100);
        abortSignal?.removeEventListener('abort', handleAbort);
        URL.revokeObjectURL(videoUrl);
        const finalBlob = new Blob(chunks, { type: requestedType });
        resolve({
          blob: finalBlob,
          dimensions: { width: targetWidth, height: targetHeight },
          duration: video.duration,
        });
      };

      mediaRecorder.start();
      video.play();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          mediaRecorder.stop();
          return;
        }
        if (ctx) {
          ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        }
        const pct = Math.min(95, Math.round((video.currentTime / video.duration) * 100));
        onProgress?.(pct);
        requestAnimationFrame(drawFrame);
      };

      requestAnimationFrame(drawFrame);
    };
  });
}

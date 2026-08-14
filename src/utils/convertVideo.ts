import { TargetFormat, VideoConversionOptions, AudioConversionOptions } from '../types';
import { convertAudio } from './convertAudio';

// Convert Video format / Video to WEBM/MP4/GIF
export async function convertVideo(
  file: File,
  targetFormat: TargetFormat,
  options: VideoConversionOptions,
  onProgress?: (pct: number) => void,
  abortSignal?: AbortSignal
): Promise<{ blob: Blob; dimensions?: { width: number; height: number }; duration?: number }> {
  onProgress?.(10);

  // If user selected audio format target from video (e.g. video -> WAV/MP3), route to audio converter!
  if (targetFormat === 'wav' || targetFormat === 'mp3' || targetFormat === 'ogg' || targetFormat === 'aac') {
    const audioOpts: AudioConversionOptions = { bitrate: '192k', sampleRate: 44100, channels: 2, volume: 100 };
    return convertAudio(file, targetFormat, audioOpts, onProgress);
  }

  return new Promise((resolve, reject) => {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = options.muteAudio;
    video.src = videoUrl;

    video.onerror = () => reject(new Error('Unable to load video file'));

    video.onloadedmetadata = () => {
      onProgress?.(30);
      // Check for abort before starting
      if (abortSignal?.aborted) {
        URL.revokeObjectURL(videoUrl);
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
      let targetWidth = video.videoWidth;
      let targetHeight = video.videoHeight;

      if (options.resolution === '1080p') {
        targetWidth = 1920;
        targetHeight = 1080;
      } else if (options.resolution === '720p') {
        targetWidth = 1280;
        targetHeight = 720;
      } else if (options.resolution === '480p') {
        targetWidth = 854;
        targetHeight = 480;
      } else if (options.resolution === '360p') {
        targetWidth = 640;
        targetHeight = 360;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      const fps = options.fps || 30;
      const canvasStream = canvas.captureStream(fps);

      let mediaRecorder: MediaRecorder;
      const mimeType = targetFormat === 'mp4' && MediaRecorder.isTypeSupported('video/mp4')
        ? 'video/mp4'
        : 'video/webm';

      try {
        mediaRecorder = new MediaRecorder(canvasStream, { mimeType });
      } catch {
        mediaRecorder = new MediaRecorder(canvasStream);
      }

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
        const finalBlob = new Blob(chunks, { type: mimeType });
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

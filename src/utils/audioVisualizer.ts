import { AudioConversionOptions, TargetFormat } from '../types';

export async function convertAudioToSpectrumVideo(
  file: File,
  targetFormat: TargetFormat,
  options: AudioConversionOptions,
  onProgress?: (pct: number) => void
): Promise<{ blob: Blob; mimeType: string; dimensions: { width: number; height: number }; duration: number }> {
  onProgress?.(10);

  const arrayBuffer = await file.arrayBuffer();
  onProgress?.(25);

  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtxClass();

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  let decodedBuffer: AudioBuffer;
  try {
    decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch {
    throw new Error('Failed to decode audio data for spectrum visualizer');
  }

  const duration = decodedBuffer.duration;
  onProgress?.(40);

  // Canvas setup
  const canvas = document.createElement('canvas');
  canvas.width = 1280;
  canvas.height = 720;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D canvas context');
  }

  // Web Audio Nodes
  const source = audioCtx.createBufferSource();
  source.buffer = decodedBuffer;

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = (options.volume || 100) / 100;

  const streamDest = audioCtx.createMediaStreamDestination();

  // Connect graph
  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(streamDest);

  // Setup video stream recorder
  const canvasStream = canvas.captureStream(30);
  const audioTrack = streamDest.stream.getAudioTracks()[0];
  if (audioTrack) {
    canvasStream.addTrack(audioTrack);
  }

  const isMp4Supported = MediaRecorder.isTypeSupported('video/mp4;codecs=avc1');
  const mimeType = targetFormat === 'mp4' && isMp4Supported ? 'video/mp4' : 'video/webm';

  let mediaRecorder: MediaRecorder;
  try {
    mediaRecorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: 3000000 });
  } catch {
    mediaRecorder = new MediaRecorder(canvasStream);
  }

  const recordedChunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  return new Promise((resolve, reject) => {
    let renderTimer: ReturnType<typeof setInterval> | undefined;
    const style = options.spectrumStyle || 'bars';
    const theme = options.spectrumTheme || 'indigo-violet';
    const trackName = file.name.replace(/\.[^/.]+$/, '');

    mediaRecorder.onstop = () => {
      if (renderTimer) clearInterval(renderTimer);
      clearTimeout(safetyTimer);
      audioCtx.close();
      const finalBlob = new Blob(recordedChunks, { type: mimeType });
      onProgress?.(100);
      resolve({
        blob: finalBlob,
        mimeType,
        dimensions: { width: 1280, height: 720 },
        duration,
      });
    };

    mediaRecorder.onerror = (e) => {
      if (renderTimer) clearInterval(renderTimer);
      clearTimeout(safetyTimer);
      audioCtx.close();
      reject(new Error(`Media recording failed: ${(e as ErrorEvent).message || 'Unknown error'}`));
    };

    // Color Theme definitions
    let primaryGlow = 'rgba(99, 102, 241, 0.8)';
    let secondaryGlow = 'rgba(168, 85, 247, 0.8)';
    let gradientColors = ['#6366f1', '#a855f7', '#ec4899'];

    if (theme === 'cyan-emerald') {
      primaryGlow = 'rgba(6, 182, 212, 0.8)';
      secondaryGlow = 'rgba(16, 185, 129, 0.8)';
      gradientColors = ['#06b6d4', '#10b981', '#34d399'];
    } else if (theme === 'sunset-fire') {
      primaryGlow = 'rgba(249, 115, 22, 0.8)';
      secondaryGlow = 'rgba(239, 68, 68, 0.8)';
      gradientColors = ['#f97316', '#ef4444', '#f43f5e'];
    } else if (theme === 'matrix-green') {
      primaryGlow = 'rgba(34, 197, 94, 0.8)';
      secondaryGlow = 'rgba(16, 185, 129, 0.8)';
      gradientColors = ['#22c55e', '#10b981', '#84cc16'];
    }

    mediaRecorder.start();
    source.start(0);
    // Wall-clock timeline: AudioContext.currentTime can drift from wall clock
    // (and stalls entirely when suspended), so drive timing off performance.now().
    const startWall = performance.now();

    let stopped = false;
    const stopRecording = () => {
      if (stopped) return;
      stopped = true;
      if (renderTimer) clearInterval(renderTimer);
      mediaRecorder.stop();
    };

    source.onended = stopRecording;

    // Safety net: if onended never fires (e.g. suspended context edge cases),
    // force stop shortly after the audio would have finished.
    const safetyTimer = window.setTimeout(stopRecording, duration * 1000 + 2000);

    // Render Frame Loop — fixed 30fps timer (matches canvas.captureStream(30)).
    // requestAnimationFrame throttles to ~1fps when the tab is unfocused, which
    // produced near-static videos; a timer keeps frames flowing while recording.
    const FRAME_MS = 1000 / 30;
    const draw = () => {
      const elapsedMs = performance.now() - startWall;
      const progressPct = Math.min(99, Math.round((elapsedMs / 1000 / duration) * 100));
      onProgress?.(Math.max(45, progressPct));

      if (elapsedMs / 1000 >= duration) {
        stopRecording();
        return;
      }

      analyser.getByteFrequencyData(dataArray);

      // 1. Draw Deep Glass Background
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Radial background glow pulse
      const avgVolume = dataArray.reduce((a, b) => a + b, 0) / bufferLength;
      const pulseRadius = 250 + (avgVolume / 255) * 120;

      const bgGlow = ctx.createRadialGradient(
        canvas.width / 2,
        canvas.height / 2,
        10,
        canvas.width / 2,
        canvas.height / 2,
        pulseRadius
      );
      bgGlow.addColorStop(0, primaryGlow.replace('0.8', '0.25'));
      bgGlow.addColorStop(0.7, secondaryGlow.replace('0.8', '0.1'));
      bgGlow.addColorStop(1, 'transparent');

      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 2. Draw Center Header / Track Metadata
      ctx.save();
      ctx.textAlign = 'center';

      // Track Title
      ctx.font = 'bold 36px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = primaryGlow;
      ctx.shadowBlur = 15;
      ctx.fillText(trackName, canvas.width / 2, 120);

      // Subtitle
      ctx.font = '500 18px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.shadowBlur = 0;
      ctx.fillText('AUDIO SPECTRUM VISUALIZER', canvas.width / 2, 160);
      ctx.restore();

      // 3. Render Visualizer Style
      if (style === 'radial') {
        // Radial Soundwave Ring
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2 + 40;
        const baseRadius = 140;

        ctx.save();
        ctx.lineWidth = 4;
        ctx.strokeStyle = gradientColors[0];
        ctx.shadowColor = primaryGlow;
        ctx.shadowBlur = 20;

        ctx.beginPath();
        for (let i = 0; i < bufferLength; i++) {
          const angle = (i / bufferLength) * Math.PI * 2;
          const amp = (dataArray[i] / 255) * 80;
          const r = baseRadius + amp;
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      } else if (style === 'wave') {
        // Smooth Oscilloscope Waveform
        const startY = canvas.height / 2 + 60;
        ctx.save();
        ctx.lineWidth = 5;
        const waveGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        waveGrad.addColorStop(0, gradientColors[0]);
        waveGrad.addColorStop(0.5, gradientColors[1]);
        waveGrad.addColorStop(1, gradientColors[2]);

        ctx.strokeStyle = waveGrad;
        ctx.shadowColor = primaryGlow;
        ctx.shadowBlur = 25;

        ctx.beginPath();
        const sliceWidth = canvas.width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          const v = dataArray[i] / 128.0;
          const y = startY + (v - 1) * 120;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);

          x += sliceWidth;
        }
        ctx.stroke();
        ctx.restore();
      } else {
        // Equalizer Bars (Default)
        const barWidth = (canvas.width - 200) / bufferLength;
        const startX = 100;
        const startY = canvas.height - 180;

        for (let i = 0; i < bufferLength; i++) {
          const barHeight = (dataArray[i] / 255) * 260;

          const barGrad = ctx.createLinearGradient(0, startY, 0, startY - barHeight);
          barGrad.addColorStop(0, gradientColors[0]);
          barGrad.addColorStop(0.5, gradientColors[1]);
          barGrad.addColorStop(1, gradientColors[2]);

          ctx.save();
          ctx.fillStyle = barGrad;
          ctx.shadowColor = primaryGlow;
          ctx.shadowBlur = barHeight > 100 ? 15 : 0;

          // Draw rounded top bar
          const bx = startX + i * barWidth;
          const by = startY - barHeight;
          const bw = barWidth - 3;

          ctx.beginPath();
          ctx.roundRect(bx, by, Math.max(1, bw), Math.max(2, barHeight), [6, 6, 0, 0]);
          ctx.fill();
          ctx.restore();
        }
      }

      // 4. Render Time Indicator & Progress Bar
      const formatTime = (sec: number) => {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
      };
      const elapsedSec = elapsedMs / 1000;

      ctx.save();
      ctx.font = '600 16px monospace';
      ctx.fillStyle = '#cbd5e1';
      ctx.textAlign = 'center';
      ctx.fillText(`${formatTime(elapsedSec)} / ${formatTime(duration)}`, canvas.width / 2, canvas.height - 85);

      // Progress Track
      const trackW = 600;
      const trackX = (canvas.width - trackW) / 2;
      const trackY = canvas.height - 60;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.roundRect(trackX, trackY, trackW, 8, 4);
      ctx.fill();

      // Progress Fill
      const fillW = (elapsedSec / duration) * trackW;
      ctx.fillStyle = gradientColors[0];
      ctx.shadowColor = primaryGlow;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.roundRect(trackX, trackY, fillW, 8, 4);
      ctx.fill();
      ctx.restore();
    };

    renderTimer = setInterval(draw, FRAME_MS);
  });
}

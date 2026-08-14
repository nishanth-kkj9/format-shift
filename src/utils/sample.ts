import { FileCategory } from '../types';
import { audioBufferToWavBlob } from './convertAudio';
import { dataUrlToBlob } from './convertImage';

// Ready-to-use Sample File Generator for 1-click quick testing!
export function generateSampleFile(category: FileCategory): File {
  if (category === 'image') {
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 300;
    const ctx = canvas.getContext('2d')!;

    // Draw vibrant gradient card
    const grad = ctx.createLinearGradient(0, 0, 400, 300);
    grad.addColorStop(0, '#3b82f6');
    grad.addColorStop(0.5, '#8b5cf6');
    grad.addColorStop(1, '#ec4899');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 400, 300);

    // Draw glass card
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.roundRect(40, 40, 320, 220, 16);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px sans-serif';
    ctx.fillText('FormatShift Sample Image', 60, 120);
    ctx.font = '14px sans-serif';
    ctx.fillText('PNG with Alpha Gradient & Sharp Details', 60, 160);

    const dataUrl = canvas.toDataURL('image/png');
    const blob = dataUrlToBlob(dataUrl);
    return new File([blob], 'sample_vibrant_card.png', { type: 'image/png' });
  }

  if (category === 'audio') {
    // Generate a 2-second synthesized audio chime WAV
    const sampleRate = 44100;
    const duration = 2;
    const numSamples = sampleRate * duration;
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const buffer = audioCtx.createBuffer(1, numSamples, sampleRate);
    const channelData = buffer.getChannelData(0);

    // Synthesize C Major chord sound
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const decay = Math.exp(-2 * t);
      const tone1 = Math.sin(2 * Math.PI * 440 * t);
      const tone2 = Math.sin(2 * Math.PI * 554.37 * t);
      const tone3 = Math.sin(2 * Math.PI * 659.25 * t);
      channelData[i] = 0.3 * (tone1 + tone2 + tone3) * decay;
    }

    const wavBlob = audioBufferToWavBlob(buffer);
    audioCtx.close();
    return new File([wavBlob], 'sample_audio_chime.wav', { type: 'audio/wav' });
  }

  if (category === 'data') {
    const sampleData = [
      { id: 1, name: 'FormatShift Pro', category: 'Software', userCount: 12500, rating: 4.9, active: true },
      { id: 2, name: 'Cloud Converter', category: 'API', userCount: 8400, rating: 4.7, active: true },
      { id: 3, name: 'Media Toolkit', category: 'Utility', userCount: 3200, rating: 4.8, active: false },
      { id: 4, name: 'Fast Encoder', category: 'Engine', userCount: 19800, rating: 5.0, active: true },
    ];
    const jsonStr = JSON.stringify(sampleData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    return new File([blob], 'sample_dataset.json', { type: 'application/json' });
  }

  // Document default
  const docMd = `# FormatShift Universal Converter

Welcome to **FormatShift**! Convert any file format instantly inside your browser or server.

## Features Supported:
- **Images**: PNG, JPG, WEBP, GIF, BMP, ICO, SVG, AVIF
- **Audio**: MP3, WAV, OGG, AAC, M4A, FLAC
- **Video**: MP4, WEBM, GIF, MOV
- **Data & Documents**: JSON, CSV, XML, YAML, MD, HTML, TXT

> Designed with modern UI/UX and full responsiveness!
`;
  const docBlob = new Blob([docMd], { type: 'text/markdown' });
  return new File([docBlob], 'sample_document.md', { type: 'text/markdown' });
}

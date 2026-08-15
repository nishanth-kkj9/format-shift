// Dev-only trim end-to-end check: drives the REAL engine with a real wav and a
// trimStart/trimEnd window, asserting the recorded video duration matches the
// trimmed range (not the full file). Query: ?audio=&start=&end=
import { renderSpectrumVideo } from '../src/utils/visualizer/engine';

const out = document.getElementById('out')!;
const params = new URLSearchParams(location.search);
const audioName = params.get('audio') || 'test-2s';
const start = Number(params.get('start') || '1');
const end = Number(params.get('end') || '3');

async function main() {
  const resp = await fetch(`/probe/audio/${audioName}.wav`);
  if (!resp.ok) throw new Error(`wav fetch failed: ${resp.status}`);
  const buf = await resp.arrayBuffer();
  const file = new File([buf], `${audioName}.wav`, { type: 'audio/wav' });

  const res = await renderSpectrumVideo(
    file,
    'mp4',
    {
      bitrate: '192k',
      sampleRate: 44100,
      channels: 2,
      spectrumVisualizer: true,
      spectrumStyle: 'radial',
      spectrumTheme: 'neon-lime',
      volume: 100,
      trimStart: start,
      trimEnd: end,
    },
    undefined,
    undefined
  );
  out.textContent = JSON.stringify({
    mimeType: res.mimeType,
    duration: res.duration,
    expected: end - start,
    size: res.blob.size,
    dims: res.dimensions,
  });
}

main().catch((e) => (out.textContent = 'ERROR: ' + e.message));

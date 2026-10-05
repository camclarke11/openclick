import { useEffect, useRef } from 'preact/hooks';
import { engine } from '../state/store';

/** Peak level falls this much per frame so the meter reads like a real one. */
const PEAK_FALL = 0.02;

/** Oscilloscope and peak meter on the engine's output analyser. Flat until audio starts. */
export function Scope() {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let frame = 0;
    let data: Float32Array<ArrayBuffer> | null = null;
    let peak = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const el = canvas.current;
      const g = el?.getContext('2d');
      if (!el || !g) return;
      const dpr = window.devicePixelRatio || 1;
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (el.width !== Math.round(w * dpr) || el.height !== Math.round(h * dpr)) {
        el.width = Math.round(w * dpr);
        el.height = Math.round(h * dpr);
      }
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const analyser = engine.analyser;
      let framePeak = 0;
      const meterW = 6;
      const sw = w - meterW - 4;
      g.lineWidth = 1.5;
      g.strokeStyle = getComputedStyle(el).getPropertyValue('--scope') || '#ff9f1c';
      g.beginPath();
      if (analyser) {
        if (!data || data.length !== analyser.fftSize) data = new Float32Array(analyser.fftSize);
        analyser.getFloatTimeDomainData(data);
        for (let x = 0; x < sw; x++) {
          const v = data[Math.floor((x / sw) * data.length)] ?? 0;
          framePeak = Math.max(framePeak, Math.abs(v));
          const y = h / 2 - v * (h / 2 - 2);
          if (x === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
      } else {
        g.moveTo(0, h / 2);
        g.lineTo(sw, h / 2);
      }
      g.stroke();

      peak = Math.max(framePeak, peak - PEAK_FALL);
      const mh = Math.min(1, peak) * h;
      g.fillStyle = peak >= 0.99 ? '#ff4d4d' : g.strokeStyle;
      g.fillRect(w - meterW, h - mh, meterW, mh);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  return <canvas ref={canvas} class="scope" aria-label="Output scope" role="img" />;
}


import React, { useMemo, useRef, useEffect } from 'react';
import { SeriesData } from '../types';
import { MASK_SIZE } from '../constants';

interface HeatmapProps {
  series: SeriesData;
  title: string;
}

const HeatmapGenerator: React.FC<HeatmapProps> = ({ series, title }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const heatmap = useMemo(() => {
    const { frames, maxArea, minArea } = series;
    const expirationFrame = frames.find(f => f.lungArea === minArea) || frames[0];
    const inspirationFrame = frames.find(f => f.lungArea === maxArea) || frames[frames.length - 1];

    const diff = new Uint8ClampedArray(MASK_SIZE * MASK_SIZE);
    let maxDiff = 0;

    for (let i = 0; i < diff.length; i++) {
      const val = Math.abs(inspirationFrame.maskData[i] - expirationFrame.maskData[i]);
      diff[i] = val;
      if (val > maxDiff) maxDiff = val;
    }

    return diff;
  }, [series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.createImageData(MASK_SIZE, MASK_SIZE);
    for (let i = 0; i < heatmap.length; i++) {
      const val = heatmap[i];
      const idx = i * 4;
      
      if (val > 0) {
        imageData.data[idx] = 255;
        imageData.data[idx + 1] = 180;
        imageData.data[idx + 2] = 0;
        imageData.data[idx + 3] = 255;
      } else {
        const isInside = series.frames[0].maskData[i] > 0;
        if (isInside) {
            imageData.data[idx] = 40;
            imageData.data[idx + 1] = 40;
            imageData.data[idx + 2] = 120;
            imageData.data[idx + 3] = 255;
        } else {
            imageData.data[idx] = 15;
            imageData.data[idx + 1] = 15;
            imageData.data[idx + 2] = 25;
            imageData.data[idx + 3] = 255;
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [heatmap, series]);

  return (
    <div className="flex flex-col items-center p-2 bg-slate-900 rounded border border-slate-700">
      <span className="text-xs font-semibold mb-2 text-slate-400 uppercase tracking-wider">{title}</span>
      <canvas 
        ref={canvasRef} 
        width={MASK_SIZE} 
        height={MASK_SIZE} 
        className="w-full aspect-square rounded bg-black"
      />
      <div className="w-full flex justify-between mt-1 px-1">
        <span className="text-[10px] text-blue-400">静态</span>
        <span className="text-[10px] text-yellow-400">运动</span>
      </div>
    </div>
  );
};

export default HeatmapGenerator;

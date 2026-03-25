
import { FrameData, SeriesData } from '../types';
import { MASK_SIZE } from '../constants';

interface Point {
  x: number;
  y: number;
}

/**
 * 计算两帧之间的光流场 (Optical Flow) 的散度并集成
 * 采用 Lucas-Kanade 简化版逻辑计算掩模扩张/收缩产生的通量 Φ(t)
 */
export const calculateOpticalFlux = (prevMask: Uint8ClampedArray, currMask: Uint8ClampedArray): number => {
  let totalDivergence = 0;
  const step = 4; // 采样步长以提高计算性能
  const winSize = 2; // 窗口半径

  for (let y = winSize; y < MASK_SIZE - winSize; y += step) {
    for (let x = winSize; x < MASK_SIZE - winSize; x += step) {
      const idx = y * MASK_SIZE + x;
      
      // 仅在掩模区域或边缘附近计算
      if (currMask[idx] === 0 && prevMask[idx] === 0) continue;

      // 局部梯度计算 (Ix, Iy, It)
      let sumIx2 = 0, sumIy2 = 0, sumIxIy = 0, sumIxIt = 0, sumIyIt = 0;

      for (let wy = -winSize; wy <= winSize; wy++) {
        for (let wx = -winSize; wx <= winSize; wx++) {
          const pIdx = (y + wy) * MASK_SIZE + (x + wx);
          
          const ix = (currMask[pIdx + 1] - currMask[pIdx - 1]) / 2;
          const iy = (currMask[pIdx + MASK_SIZE] - currMask[pIdx - MASK_SIZE]) / 2;
          const it = currMask[pIdx] - prevMask[pIdx];

          sumIx2 += ix * ix;
          sumIy2 += iy * iy;
          sumIxIy += ix * iy;
          sumIxIt += ix * it;
          sumIyIt += iy * it;
        }
      }

      // 求解 LK 方程: [ΣIx2 ΣIxIy; ΣIxIy ΣIy2] [u; v] = [-ΣIxIt; -ΣIyIt]
      const det = sumIx2 * sumIy2 - sumIxIy * sumIxIy;
      if (Math.abs(det) < 1e-6) continue;

      const u = (-sumIy2 * sumIxIt + sumIxIy * sumIyIt) / det;
      const v = (sumIxIy * sumIxIt - sumIx2 * sumIyIt) / det;

      // 散度近似: 在每个点，通量正比于速度向量在法线方向的投影
      // 此处简化为直接积分梯度产生的局部通量变化
      totalDivergence += (u + v); 
    }
  }

  // 缩放因子：由经验公式校准，使 Φ(t) 与面积变化率量级匹配
  return totalDivergence * 0.05;
};

/**
 * 集成通量以获得模拟潮气量 (Tidal Volume)
 */
export const integrateFlux = (frames: FrameData[]): void => {
  let currentVolume = 0;
  frames.forEach((frame, i) => {
    if (i === 0) {
      frame.opticalFlux = 0;
      frame.integratedFlux = 0;
    } else {
      currentVolume += frame.opticalFlux;
      frame.integratedFlux = currentVolume;
    }
  });

  // 消除漂移 (Drift Removal): 呼吸序列应为闭环
  const totalDrift = frames[frames.length - 1].integratedFlux;
  frames.forEach((frame, i) => {
    frame.integratedFlux -= (totalDrift * (i / (frames.length - 1)));
  });
};

/**
 * 计算掩模的质心 (Center of Mass)
 */
export const calculateCentroid = (frame: FrameData): Point => {
  const { maskData, width, height } = frame;
  let sumX = 0, sumY = 0, count = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (maskData[y * width + x] > 0) {
        sumX += x;
        sumY += y;
        count++;
      }
    }
  }

  if (count === 0) return { x: width / 2, y: height / 2 };
  return { x: sumX / count, y: sumY / count };
};

export const getBoundaryData = (frame: FrameData, centroid: Point, numRays: number = 100) => {
  const { maskData, width, height } = frame;
  const radii: number[] = [];
  const coords: { u: number; v: number }[] = [];

  for (let i = 0; i < numRays; i++) {
    const angle = -Math.PI / 2 - (i / numRays) * 2 * Math.PI;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);

    let lastWhiteStep = 0;
    let lastUV = { u: centroid.x, v: centroid.y };
    const maxR = Math.sqrt(width * width + height * height);
    
    for (let step = 1; step < maxR; step++) {
      const px = Math.round(centroid.x + dx * step);
      const py = Math.round(centroid.y + dy * step);

      if (px < 0 || px >= width || py < 0 || py >= height) break;

      if (maskData[py * width + px] > 0) {
        lastWhiteStep = step;
        lastUV = { u: px, v: py };
      }
    }
    radii.push(lastWhiteStep);
    coords.push(lastUV);
  }

  for (let i = 0; i < numRays; i++) {
    if (radii[i] === 0) {
      let prevValid = (i - 1 + numRays) % numRays;
      let nextValid = (i + 1) % numRays;
      while (radii[prevValid] === 0 && prevValid !== i) prevValid = (prevValid - 1 + numRays) % numRays;
      while (radii[nextValid] === 0 && nextValid !== i) nextValid = (nextValid + 1) % numRays;

      if (radii[prevValid] !== 0 && radii[nextValid] !== 0) {
        radii[i] = (radii[prevValid] + radii[nextValid]) / 2;
        coords[i] = {
            u: (coords[prevValid].u + coords[nextValid].u) / 2,
            v: (coords[prevValid].v + coords[nextValid].v) / 2
        };
      }
    }
  }

  return { radii, coords };
};

const gaussianSmooth = (data: number[], sigma: number = 1.5): number[] => {
  const size = Math.ceil(sigma * 3) * 2 + 1;
  const kernel = new Array(size);
  const half = Math.floor(size / 2);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - half;
    kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) kernel[i] /= sum;

  const result = new Array(data.length);
  for (let i = 0; i < data.length; i++) {
    let val = 0;
    for (let k = 0; k < size; k++) {
      const idx = (i + k - half + data.length) % data.length;
      val += data[idx] * kernel[k];
    }
    result[i] = val;
  }
  return result;
};

export const performRegionalAnalysis = (series: SeriesData): { amplitudes: number[], points: {u: number, v: number}[] } => {
  const { frames, maxArea, minArea } = series;
  const inhaleFrame = frames.find(f => f.lungArea === maxArea) || frames[0];
  const exhaleFrame = frames.find(f => f.lungArea === minArea) || frames[Math.floor(frames.length / 2)];

  const centroidIn = calculateCentroid(inhaleFrame);
  const centroidEx = calculateCentroid(exhaleFrame);

  const dataIn = getBoundaryData(inhaleFrame, centroidIn, 100);
  const dataEx = getBoundaryData(exhaleFrame, centroidEx, 100);

  const rawAmplitudes = dataIn.radii.map((rIn, i) => Math.max(0, rIn - dataEx.radii[i]));
  
  return {
    amplitudes: gaussianSmooth(rawAmplitudes, 1.5),
    points: dataIn.coords
  };
};

export const calculateRegionalAmplitudes = (series: SeriesData): number[] => {
    return performRegionalAnalysis(series).amplitudes;
};

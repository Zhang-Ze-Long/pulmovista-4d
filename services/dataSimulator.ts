
import { FrameData, SeriesData, AnalysisResults } from '../types';
import { MASK_SIZE } from '../constants';
import { performRegionalAnalysis, calculateOpticalFlux, integrateFlux } from './regionalAnalysis';

const generateLungMask = (frameIdx: number, totalFrames: number, type: 'left' | 'right' | 'coronal'): FrameData => {
  const width = MASK_SIZE;
  const height = MASK_SIZE;
  const data = new Uint8ClampedArray(width * height);
  const phase = Math.sin((frameIdx / totalFrames) * Math.PI * 4) * 0.5 + 0.5; 
  const centerX = width / 2;
  const centerY = height / 3;
  const expansion = phase * 25;
  
  let lungArea = 0, diaphragmPos = 0, apexPos = height;
  let sumXLeft = 0, countLeft = 0, sumXRight = 0, countRight = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let isInside = false;
      if (type === 'coronal') {
        const leftL = Math.pow(x - (centerX - 40), 2) / Math.pow(25 + expansion * 0.5, 2) + 
                     Math.pow(y - centerY, 2) / Math.pow(50 + expansion, 2);
        const rightL = Math.pow(x - (centerX + 40), 2) / Math.pow(25 + expansion * 0.5, 2) + 
                      Math.pow(y - centerY, 2) / Math.pow(50 + expansion, 2);
        isInside = leftL < 1 || rightL < 1;
      } else {
        const asymmetry = type === 'left' ? 1.0 : 0.85;
        const s = Math.pow(x - centerX, 2) / Math.pow(35 + expansion * 0.3 * asymmetry, 2) + 
                 Math.pow(y - centerY, 2) / Math.pow(60 + expansion * asymmetry, 2);
        isInside = s < 1;
      }

      if (isInside) {
        data[y * width + x] = 255;
        lungArea++;
        diaphragmPos = Math.max(diaphragmPos, y);
        apexPos = Math.min(apexPos, y);
        if (type === 'coronal') {
          if (x < width / 2) { sumXLeft += x; countLeft++; }
          else { sumXRight += x; countRight++; }
        }
      }
    }
  }

  return {
    id: frameIdx, timestamp: frameIdx * (1/3), maskData: data, width, height, lungArea, diaphragmPos, apexPos,
    opticalFlux: 0,
    integratedFlux: 0,
    leftCentroidX: countLeft > 0 ? sumXLeft / countLeft : undefined,
    rightCentroidX: countRight > 0 ? sumXRight / countRight : undefined
  };
};

export const getSimulatedData = (): AnalysisResults => {
  const numFrames = 30;
  const createSeries = (name: string, type: 'left' | 'right' | 'coronal'): SeriesData => {
    const frames = Array.from({ length: numFrames }, (_, i) => generateLungMask(i, numFrames, type));
    
    // OFx 计算
    for (let i = 1; i < frames.length; i++) {
      frames[i].opticalFlux = calculateOpticalFlux(frames[i-1].maskData, frames[i].maskData);
    }
    integrateFlux(frames);

    const avgApex = frames.reduce((acc, f) => acc + f.apexPos, 0) / frames.length;
    let avgL = 0, avgR = 0, countL = 0, countR = 0;
    if (type === 'coronal') {
      frames.forEach(f => {
        if (f.leftCentroidX !== undefined) { avgL += f.leftCentroidX; countL++; }
        if (f.rightCentroidX !== undefined) { avgR += f.rightCentroidX; countR++; }
      });
    }
    
    const baseSeries: SeriesData = {
      name, frames, 
      maxArea: Math.max(...frames.map(f => f.lungArea)),
      minArea: Math.min(...frames.map(f => f.lungArea)),
      amplitude: Math.max(...frames.map(f => f.lungArea)) - Math.min(...frames.map(f => f.lungArea)),
      avgApexPos: avgApex,
      avgCentroidLeft: countL > 0 ? avgL / countL : undefined,
      avgCentroidRight: countR > 0 ? avgR / countR : undefined,
      regionalAmplitudes: [],
      regionalPoints: [],
      maxTidalVolume: Math.max(...frames.map(f => f.integratedFlux))
    };
    
    const analysis = performRegionalAnalysis(baseSeries);
    baseSeries.regionalAmplitudes = analysis.amplitudes;
    baseSeries.regionalPoints = analysis.points;
    return baseSeries;
  };
  return {
    series1: createSeries('左矢状面', 'left'),
    series2: createSeries('右矢状面', 'right'),
    series3: createSeries('冠状面', 'coronal'),
    asymmetryAlert: false, respiratoryRate: 12 
  };
};


import { SeriesData, FrameData, AnalysisResults } from '../types';
import { MASK_SIZE } from '../constants';
import { performRegionalAnalysis, calculateOpticalFlux, integrateFlux } from './regionalAnalysis';

const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const processFileToFrame = async (file: File, id: number, isCoronal: boolean): Promise<FrameData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`无法读取文件: ${file.name}`));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error(`图片格式错误: ${file.name}`));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = MASK_SIZE;
        canvas.height = MASK_SIZE;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, MASK_SIZE, MASK_SIZE);
        const imageData = ctx.getImageData(0, 0, MASK_SIZE, MASK_SIZE);
        
        let lungArea = 0;
        let diaphragmPos = 0;
        let apexPos = MASK_SIZE;
        let sumXLeft = 0, countLeft = 0;
        let sumXRight = 0, countRight = 0;
        const maskData = new Uint8ClampedArray(MASK_SIZE * MASK_SIZE);

        for (let i = 0; i < imageData.data.length; i += 4) {
          const r = imageData.data[i];
          const isWhite = r > 120; // 简化二值化
          const pixelIdx = i / 4;
          const x = pixelIdx % MASK_SIZE;
          const y = Math.floor(pixelIdx / MASK_SIZE);
          
          if (isWhite) {
            maskData[pixelIdx] = 255;
            lungArea++;
            diaphragmPos = Math.max(diaphragmPos, y);
            apexPos = Math.min(apexPos, y);

            if (isCoronal) {
              if (x < MASK_SIZE / 2) {
                sumXLeft += x; countLeft++;
              } else {
                sumXRight += x; countRight++;
              }
            }
          } else {
            maskData[pixelIdx] = 0;
          }
        }

        resolve({
          id,
          timestamp: id * (1/3),
          maskData,
          width: MASK_SIZE,
          height: MASK_SIZE,
          lungArea,
          diaphragmPos,
          apexPos,
          opticalFlux: 0,
          integratedFlux: 0,
          leftCentroidX: countLeft > 0 ? sumXLeft / countLeft : undefined,
          rightCentroidX: countRight > 0 ? sumXRight / countRight : undefined
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  });
};

const readAllEntries = async (reader: any): Promise<any[]> => {
  let allEntries: any[] = [];
  let readBatch = async () => {
    const entries = await new Promise<any[]>((resolve) => reader.readEntries(resolve));
    if (entries.length > 0) {
      allEntries.push(...entries);
      await readBatch();
    }
  };
  await readBatch();
  return allEntries;
};

export const processDroppedEntries = async (items: DataTransferItemList): Promise<AnalysisResults | null> => {
  const fileMap: Record<string, File[]> = { series1: [], series2: [], series3: [] };

  const traverseEntry = async (entry: any, path: string = '') => {
    if (entry.isFile) {
      if (entry.name.toLowerCase().endsWith('.png')) {
        const file = await new Promise<File>((resolve) => entry.file(resolve));
        const parts = path.split('/').filter(p => p.length > 0);
        const folderName = (parts[parts.length - 1] || '').toLowerCase().trim();
        if (folderName === 'series1') fileMap.series1.push(file);
        else if (folderName === 'series2') fileMap.series2.push(file);
        else if (folderName === 'series3') fileMap.series3.push(file);
      }
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      const entries = await readAllEntries(reader);
      for (const child of entries) await traverseEntry(child, `${path}${entry.name}/`);
    }
  };

  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry();
    if (entry) await traverseEntry(entry);
  }

  const createSeries = async (name: string, files: File[], seriesKey: string): Promise<SeriesData> => {
    files.sort((a, b) => naturalSort(a.name, b.name));
    const frames = await Promise.all(files.map((f, i) => processFileToFrame(f, i, seriesKey === 'series3')));
    
    // OFx 分析
    for (let i = 1; i < frames.length; i++) {
      frames[i].opticalFlux = calculateOpticalFlux(frames[i-1].maskData, frames[i].maskData);
    }
    integrateFlux(frames);

    const avgApex = frames.reduce((acc, f) => acc + f.apexPos, 0) / frames.length;
    let avgL = 0, avgR = 0, countL = 0, countR = 0;
    
    if (seriesKey === 'series3') {
      frames.forEach(f => {
        if (f.leftCentroidX !== undefined) { avgL += f.leftCentroidX; countL++; }
        if (f.rightCentroidX !== undefined) { avgR += f.rightCentroidX; countR++; }
      });
    }

    const series: SeriesData = {
      name,
      frames,
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

    const analysis = performRegionalAnalysis(series);
    series.regionalAmplitudes = analysis.amplitudes;
    series.regionalPoints = analysis.points;
    return series;
  };

  const [s1, s2, s3] = await Promise.all([
    createSeries('左侧矢状面 (Series 1)', fileMap.series1, 'series1'),
    createSeries('右侧矢状面 (Series 2)', fileMap.series2, 'series2'),
    createSeries('冠状面 (Series 3)', fileMap.series3, 'series3')
  ]);

  return {
    series1: s1, series2: s2, series3: s3,
    asymmetryAlert: Math.abs(s1.amplitude - s2.amplitude) / Math.max(s1.amplitude, s2.amplitude, 1) > 0.2,
    respiratoryRate: Math.round(60 / (Math.max(1, s3.frames.length) * (1/3) / 2))
  };
};

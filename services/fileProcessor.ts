
import { SeriesData, FrameData, AnalysisResults } from '../types';
import { MASK_SIZE } from '../constants';
import { performRegionalAnalysis, calculateOpticalFlux, integrateFlux } from './regionalAnalysis';

const naturalSort = (a: string, b: string) => {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
};

const detectSliceType = (maskData: Uint8ClampedArray, width: number, height: number): 'coronal' | 'sagittal' => {
  const threshold = 0.15;
  const centerX = width / 2;
  const centerRegionWidth = width * 0.15;
  
  let leftLungPixels = 0;
  let rightLungPixels = 0;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (maskData[idx] > 0) {
        if (x < centerX - centerRegionWidth / 2) {
          leftLungPixels++;
        } else if (x > centerX + centerRegionWidth / 2) {
          rightLungPixels++;
        }
      }
    }
  }
  
  const totalLungPixels = leftLungPixels + rightLungPixels;
  if (totalLungPixels === 0) return 'sagittal';
  
  const leftRatio = leftLungPixels / totalLungPixels;
  const rightRatio = rightLungPixels / totalLungPixels;
  
  if (leftRatio > threshold && rightRatio > threshold) {
    return 'coronal';
  }
  
  return 'sagittal';
};

const processFileToFrame = async (file: File, id: number): Promise<{ frame: FrameData, sliceType: 'coronal' | 'sagittal' }> => {
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
          const isWhite = r > 120;
          const pixelIdx = i / 4;
          const x = pixelIdx % MASK_SIZE;
          const y = Math.floor(pixelIdx / MASK_SIZE);
          
          if (isWhite) {
            maskData[pixelIdx] = 255;
            lungArea++;
            diaphragmPos = Math.max(diaphragmPos, y);
            apexPos = Math.min(apexPos, y);

            if (x < MASK_SIZE / 2) {
              sumXLeft += x; countLeft++;
            } else {
              sumXRight += x; countRight++;
            }
          } else {
            maskData[pixelIdx] = 0;
          }
        }

        const sliceType = detectSliceType(maskData, MASK_SIZE, MASK_SIZE);

        const frame: FrameData = {
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
        };

        resolve({ frame, sliceType });
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
  const fileMap: Record<string, File[]> = { unknown: [] };

  const traverseEntry = async (entry: any, path: string = '') => {
    if (entry.isFile) {
      if (entry.name.toLowerCase().endsWith('.png')) {
        const file = await new Promise<File>((resolve) => entry.file(resolve));
        const parts = path.split('/').filter(p => p.length > 0);
        const folderName = (parts[parts.length - 1] || '').toLowerCase().trim();
        if (folderName.startsWith('series')) {
          if (!fileMap[folderName]) fileMap[folderName] = [];
          fileMap[folderName].push(file);
        } else {
          fileMap.unknown.push(file);
        }
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

  const createSeries = async (name: string, files: File[], sliceType: 'coronal' | 'sagittal', isLeft: boolean): Promise<SeriesData> => {
    files.sort((a, b) => naturalSort(a.name, b.name));
    
    const results = await Promise.all(files.map((f, i) => processFileToFrame(f, i)));
    const frames = results.map(r => r.frame);
    
    const detectedType = frames.length > 0 ? results[0].sliceType : 'sagittal';
    const finalSliceType = detectedType || sliceType;

    for (let i = 1; i < frames.length; i++) {
      frames[i].opticalFlux = calculateOpticalFlux(frames[i-1].maskData, frames[i].maskData);
    }
    integrateFlux(frames);

    const avgApex = frames.reduce((acc, f) => acc + f.apexPos, 0) / frames.length;
    let avgL = 0, avgR = 0, countL = 0, countR = 0;
    
    if (finalSliceType === 'coronal') {
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

  const processGroup = async (files: File[], label: string): Promise<{ series: SeriesData, sliceType: 'coronal' | 'sagittal', avgCentroid: number } | null> => {
    if (files.length === 0) return null;
    
    const firstFileResult = await processFileToFrame(files[0], 0);
    const sliceType = firstFileResult.sliceType;
    
    const results = await Promise.all(files.map((f, i) => processFileToFrame(f, i)));
    const frames = results.map(r => r.frame);
    
    let avgCentroid = 0;
    if (sliceType === 'sagittal') {
      let totalX = 0, count = 0;
      frames[0].maskData.forEach((val, idx) => {
        if (val > 0) {
          const x = idx % MASK_SIZE;
          totalX += x;
          count++;
        }
      });
      avgCentroid = count > 0 ? totalX / count : MASK_SIZE / 2;
    }
    
    for (let i = 1; i < frames.length; i++) {
      frames[i].opticalFlux = calculateOpticalFlux(frames[i-1].maskData, frames[i].maskData);
    }
    integrateFlux(frames);

    const avgApex = frames.reduce((acc, f) => acc + f.apexPos, 0) / frames.length;
    let avgL = 0, avgR = 0, countL = 0, countR = 0;
    
    if (sliceType === 'coronal') {
      frames.forEach(f => {
        if (f.leftCentroidX !== undefined) { avgL += f.leftCentroidX; countL++; }
        if (f.rightCentroidX !== undefined) { avgR += f.rightCentroidX; countR++; }
      });
    }

    const series: SeriesData = {
      name: label,
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
    
    return { series, sliceType, avgCentroid };
  };

  const folderKeys = Object.keys(fileMap).filter(k => k !== 'unknown');
  
  if (folderKeys.length >= 3) {
    const groups = await Promise.all(folderKeys.map(async (key) => {
      return { key, result: await processGroup(fileMap[key], key) };
    }));
    
    const coronalGroup = groups.find(g => g.result?.sliceType === 'coronal');
    const sagittalGroups = groups.filter(g => g.result?.sliceType === 'sagittal');
    
    const sortedSagittal = sagittalGroups
      .filter(g => g.result)
      .sort((a, b) => (b.result!.avgCentroid) - (a.result!.avgCentroid));
    
    let s1: SeriesData, s2: SeriesData, s3: SeriesData;
    
    if (coronalGroup?.result) {
      s3 = coronalGroup.result.series;
    } else {
      const first = groups[0].result;
      s3 = first ? first.series : null as any;
    }
    
    if (sortedSagittal.length >= 2) {
      s1 = sortedSagittal[1].result!.series;
      s2 = sortedSagittal[0].result!.series;
    } else if (sortedSagittal.length === 1) {
      if (sortedSagittal[0].result!.avgCentroid < MASK_SIZE / 2) {
        s1 = sortedSagittal[0].result!.series;
        s2 = s1;
      } else {
        s2 = sortedSagittal[0].result!.series;
        s1 = s2;
      }
    } else {
      s1 = s3;
      s2 = s3;
    }

    return {
      series1: s1, series2: s2, series3: s3,
      asymmetryAlert: Math.abs(s1.amplitude - s2.amplitude) / Math.max(s1.amplitude, s2.amplitude, 1) > 0.2,
      respiratoryRate: Math.round(60 / (Math.max(1, s3.frames.length) * (1/3) / 2))
    };
  }

  const allFiles = Object.values(fileMap).flat();
  if (allFiles.length === 0) return null;

  const results = await Promise.all(allFiles.map((f, i) => processFileToFrame(f, i)));
  
  const coronalResults = results.filter(r => r.sliceType === 'coronal');
  const sagittalResults = results.filter(r => r.sliceType === 'sagittal');
  
  const sagittalSorted = sagittalResults.sort((a, b) => {
    let avgXa = 0, counta = 0;
    let avgXb = 0, countb = 0;
    a.frame.maskData.forEach((val, idx) => { if (val > 0) { avgXa += idx % MASK_SIZE; counta++; } });
    b.frame.maskData.forEach((val, idx) => { if (val > 0) { avgXb += idx % MASK_SIZE; countb++; } });
    return (countb > 0 ? avgXb / countb : MASK_SIZE / 2) - (counta > 0 ? avgXa / counta : MASK_SIZE / 2);
  });

  const createSimpleSeries = (frames: FrameData[], name: string, isCoronal: boolean): SeriesData => {
    for (let i = 1; i < frames.length; i++) {
      frames[i].opticalFlux = calculateOpticalFlux(frames[i-1].maskData, frames[i].maskData);
    }
    integrateFlux(frames);

    const avgApex = frames.reduce((acc, f) => acc + f.apexPos, 0) / frames.length;
    let avgL = 0, avgR = 0, countL = 0, countR = 0;
    
    if (isCoronal) {
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

  let s1: SeriesData, s2: SeriesData, s3: SeriesData;

  if (coronalResults.length > 0 && sagittalSorted.length >= 2) {
    s3 = createSimpleSeries(coronalResults.map(r => r.frame), '冠状面', true);
    s1 = createSimpleSeries(sagittalSorted[1].frame ? [sagittalSorted[1].frame] : sagittalResults.slice(0, Math.ceil(sagittalResults.length / 2)).map(r => r.frame), '左侧矢状面', false);
    s2 = createSimpleSeries(sagittalSorted[0].frame ? [sagittalSorted[0].frame] : sagittalResults.slice(Math.ceil(sagittalResults.length / 2)).map(r => r.frame), '右侧矢状面', false);
  } else if (sagittalSorted.length >= 3) {
    const third = Math.floor(sagittalSorted.length / 3);
    s1 = createSimpleSeries(sagittalSorted.slice(0, third).map(r => r.frame), '左侧矢状面', false);
    s2 = createSimpleSeries(sagittalSorted.slice(third, third * 2).map(r => r.frame), '右侧矢状面', false);
    s3 = createSimpleSeries(sagittalSorted.slice(third * 2).map(r => r.frame), '冠状面', true);
  } else if (sagittalSorted.length > 0) {
    const half = Math.ceil(sagittalSorted.length / 2);
    s1 = createSimpleSeries(sagittalSorted.slice(0, half).map(r => r.frame), '矢状面1', false);
    s2 = createSimpleSeries(sagittalSorted.slice(half).map(r => r.frame), '矢状面2', false);
    s3 = s1;
  } else {
    s1 = createSimpleSeries(results.map(r => r.frame), '系列1', false);
    s2 = s1;
    s3 = s1;
  }

  return {
    series1: s1, series2: s2, series3: s3,
    asymmetryAlert: Math.abs(s1.amplitude - s2.amplitude) / Math.max(s1.amplitude, s2.amplitude, 1) > 0.2,
    respiratoryRate: Math.round(60 / (Math.max(1, s3.frames.length) * (1/3) / 2))
  };
};

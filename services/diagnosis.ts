import { AnalysisResults, SeriesData } from '../types';

export interface DiagnosisResult {
  overallStatus: 'normal' | 'abnormal';
  overallScore: number;
  findings: Finding[];
  recommendations: string[];
  restrictedRegions: RestrictedRegion[];
}

export interface Finding {
  category: string;
  status: 'normal' | 'abnormal';
  value: number;
  description: string;
}

export interface RestrictedRegion {
  name: string;
  location: string;
  severity: number;
}

const REGION_CONFIG = {
  coronal: [
    { name: '右肺上区', startIdx: 0, endIdx: 16, expectedRatio: 0.5 },
    { name: '右肺中区', startIdx: 16, endIdx: 33, expectedRatio: 0.7 },
    { name: '右肺下区', startIdx: 33, endIdx: 50, expectedRatio: 0.9 },
    { name: '左肺上区', startIdx: 50, endIdx: 66, expectedRatio: 0.45 },
    { name: '左肺中区', startIdx: 66, endIdx: 83, expectedRatio: 0.65 },
    { name: '左肺下区', startIdx: 83, endIdx: 100, expectedRatio: 0.85 },
  ],
  sagittal: [
    { name: '肺尖区', startIdx: 0, endIdx: 20, expectedRatio: 0.4 },
    { name: '上肺区', startIdx: 20, endIdx: 40, expectedRatio: 0.6 },
    { name: '中肺区', startIdx: 40, endIdx: 60, expectedRatio: 0.8 },
    { name: '下肺区', startIdx: 60, endIdx: 80, expectedRatio: 1.0 },
    { name: '横膈区', startIdx: 80, endIdx: 100, expectedRatio: 1.1 },
  ]
};

const getAmplitudeStatus = (amp: number): Finding => {
  if (amp < 400) {
    return { category: '整体运动', status: 'abnormal', value: amp, description: `运动幅度偏低` };
  }
  return { category: '整体运动', status: 'normal', value: amp, description: `运动幅度正常` };
};

const getAsymmetryStatus = (series1: SeriesData, series2: SeriesData): Finding => {
  const amp1 = series1.amplitude;
  const amp2 = series2.amplitude;
  const ratio = Math.abs(amp1 - amp2) / Math.max(amp1, amp2);
  
  if (ratio > 0.45) {
    return { category: '左右对称性', status: 'abnormal', value: ratio, description: `左右不对称` };
  }
  return { category: '左右对称性', status: 'normal', value: ratio, description: `左右对称` };
};

const analyzeRestrictedRegions = (
  amplitudes: number[],
  config: typeof REGION_CONFIG.sagittal
): RestrictedRegion[] => {
  if (amplitudes.length === 0) return [];
  
  const maxAmp = Math.max(...amplitudes);
  if (maxAmp === 0) return [];
  
  const restricted: RestrictedRegion[] = [];
  
  for (const region of config) {
    const regionAmps = amplitudes.slice(region.startIdx, region.endIdx);
    if (regionAmps.length === 0) continue;
    
    const meanAmp = regionAmps.reduce((a, b) => a + b, 0) / regionAmps.length;
    const actualRatio = meanAmp / maxAmp;
    const deviation = (region.expectedRatio - actualRatio) / region.expectedRatio;
    
    if (deviation > 0.35) {
      restricted.push({
        name: region.name,
        location: region.name,
        severity: Math.round(deviation * 100)
      });
    }
  }
  
  return restricted.sort((a, b) => b.severity - a.severity);
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  const restrictedRegions: RestrictedRegion[] = [];
  
  const globalAmp = (data.series1.amplitude + data.series2.amplitude) / 2;
  findings.push(getAmplitudeStatus(globalAmp));
  findings.push(getAsymmetryStatus(data.series1, data.series2));
  
  const coronalRestricted = analyzeRestrictedRegions(data.series3.regionalAmplitudes, REGION_CONFIG.coronal);
  const leftRestricted = analyzeRestrictedRegions(data.series1.regionalAmplitudes, REGION_CONFIG.sagittal);
  const rightRestricted = analyzeRestrictedRegions(data.series2.regionalAmplitudes, REGION_CONFIG.sagittal);
  
  restrictedRegions.push(...coronalRestricted, ...leftRestricted, ...rightRestricted);
  
  const abnormalCount = findings.filter(f => f.status === 'abnormal').length;
  const hasSevereRestriction = restrictedRegions.some(r => r.severity > 50);
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  if (abnormalCount >= 2 || hasSevereRestriction || restrictedRegions.length >= 3) {
    overallStatus = 'abnormal';
  }
  
  const score = Math.max(0, Math.round((1 - (abnormalCount + restrictedRegions.length * 0.3) / 5) * 100));
  
  const recommendations: string[] = [];
  
  if (overallStatus === 'normal') {
    recommendations.push('呼吸功能正常');
  } else {
    if (restrictedRegions.length > 0) {
      const top3 = restrictedRegions.slice(0, 3);
      recommendations.push(`受限区域: ${top3.map(r => r.name).join('、')}`);
    } else {
      recommendations.push('整体运动异常');
    }
  }
  
  return {
    overallStatus,
    overallScore: score,
    findings,
    recommendations,
    restrictedRegions
  };
};
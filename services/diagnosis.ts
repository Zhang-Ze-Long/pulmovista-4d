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

const analyzeRestrictedRegions = (
  amplitudes: number[],
  regionName: string
): RestrictedRegion[] => {
  if (amplitudes.length === 0) return [];
  
  const globalMean = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  if (globalMean === 0) return [];
  
  const n = amplitudes.length;
  const segments = 5;
  const segmentSize = Math.floor(n / segments);
  
  const regions = [
    { name: regionName === 'coronal' ? '右肺上区' : '肺尖区', start: 0, end: segmentSize },
    { name: regionName === 'coronal' ? '右肺中区' : '上肺区', start: segmentSize, end: segmentSize * 2 },
    { name: regionName === 'coronal' ? '右肺下区' : '中肺区', start: segmentSize * 2, end: segmentSize * 3 },
    { name: regionName === 'coronal' ? '左肺上区' : '下肺区', start: segmentSize * 3, end: segmentSize * 4 },
    { name: regionName === 'coronal' ? '左肺下区' : '横膈区', start: segmentSize * 4, end: n },
  ];
  
  const restricted: RestrictedRegion[] = [];
  
  for (const region of regions) {
    const regionAmps = amplitudes.slice(region.start, region.end);
    if (regionAmps.length === 0) continue;
    
    const meanAmp = regionAmps.reduce((a, b) => a + b, 0) / regionAmps.length;
    const ratio = meanAmp / globalMean;
    
    if (ratio < 0.5) {
      restricted.push({
        name: region.name,
        location: region.name,
        severity: Math.round((1 - ratio) * 100)
      });
    }
  }
  
  return restricted.sort((a, b) => b.severity - a.severity);
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  const restrictedRegions: RestrictedRegion[] = [];
  
  const globalAmp = (data.series1.amplitude + data.series2.amplitude) / 2;
  
  const ampThreshold = 300;
  if (globalAmp < ampThreshold) {
    findings.push({ category: '整体运动', status: 'abnormal', value: globalAmp, description: `运动幅度偏低` });
  } else {
    findings.push({ category: '整体运动', status: 'normal', value: globalAmp, description: `运动幅度正常` });
  }
  
  const amp1 = data.series1.amplitude;
  const amp2 = data.series2.amplitude;
  const asymmetry = Math.abs(amp1 - amp2) / Math.max(amp1, amp2, 1);
  
  if (asymmetry > 0.5) {
    findings.push({ category: '左右对称性', status: 'abnormal', value: asymmetry, description: `左右不对称` });
  } else {
    findings.push({ category: '左右对称性', status: 'normal', value: asymmetry, description: `左右对称` });
  }
  
  const coronalRestricted = analyzeRestrictedRegions(data.series3.regionalAmplitudes, 'coronal');
  const leftRestricted = analyzeRestrictedRegions(data.series1.regionalAmplitudes, 'sagittal');
  const rightRestricted = analyzeRestrictedRegions(data.series2.regionalAmplitudes, 'sagittal');
  
  restrictedRegions.push(...coronalRestricted, ...leftRestricted, ...rightRestricted);
  
  const abnormalFindingsCount = findings.filter(f => f.status === 'abnormal').length;
  const severeRestrictedCount = restrictedRegions.filter(r => r.severity > 60).length;
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  
  if (abnormalFindingsCount >= 2) {
    overallStatus = 'abnormal';
  } else if (severeRestrictedCount >= 2) {
    overallStatus = 'abnormal';
  }
  
  const score = Math.max(0, Math.round((1 - (abnormalFindingsCount * 0.4 + severeRestrictedCount * 0.3) / 2) * 100));
  
  const recommendations: string[] = [];
  
  if (overallStatus === 'normal') {
    recommendations.push('呼吸功能正常');
  } else {
    if (restrictedRegions.length > 0) {
      const severeOnes = restrictedRegions.filter(r => r.severity > 40);
      if (severeOnes.length > 0) {
        recommendations.push(`受限区域: ${severeOnes.map(r => r.name).join('、')}`);
      } else {
        recommendations.push('部分区域通气稍弱');
      }
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
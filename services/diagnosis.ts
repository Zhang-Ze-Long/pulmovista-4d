import { AnalysisResults, SeriesData } from '../types';

export interface DiagnosisResult {
  overallStatus: 'normal' | 'abnormal';
  overallScore: number;
  findings: Finding[];
  recommendations: string[];
  restrictedRegions: RestrictedRegion[];
  analysis: AnalysisDetail;
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

export interface AnalysisDetail {
  leftAmp: number;
  rightAmp: number;
  asymmetry: number;
  globalAmp: number;
  variance: number;
  coherence: number;
}

const calculateStats = (amplitudes: number[]) => {
  if (amplitudes.length === 0) return { mean: 0, std: 0, cv: 0, max: 0, min: 0 };
  
  const mean = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  const variance = amplitudes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / amplitudes.length;
  const std = Math.sqrt(variance);
  const cv = mean > 0 ? std / mean : 0;
  const max = Math.max(...amplitudes);
  const min = Math.min(...amplitudes);
  
  return { mean, std, cv, max, min };
};

const checkRegionalAnomaly = (amplitudes: number[], regionName: string): { isAnomaly: boolean, severity: number } => {
  if (amplitudes.length < 10) return { isAnomaly: false, severity: 0 };
  
  const stats = calculateStats(amplitudes);
  if (stats.mean === 0) return { isAnomaly: false, severity: 0 };
  
  const n = amplitudes.length;
  const segmentSize = Math.floor(n / 5);
  
  const segments = [
    { name: regionName === 'coronal' ? '右肺上区' : '肺尖区', start: 0, end: segmentSize },
    { name: regionName === 'coronal' ? '右肺中区' : '上肺区', start: segmentSize, end: segmentSize * 2 },
    { name: regionName === 'coronal' ? '右肺下区' : '中肺区', start: segmentSize * 2, end: segmentSize * 3 },
    { name: regionName === 'coronal' ? '左肺上区' : '下肺区', start: segmentSize * 3, end: segmentSize * 4 },
    { name: regionName === 'coronal' ? '左肺下区' : '横膈区', start: segmentSize * 4, end: n },
  ];
  
  for (const seg of segments) {
    const segAmps = amplitudes.slice(seg.start, seg.end);
    if (segAmps.length === 0) continue;
    
    const segMean = segAmps.reduce((a, b) => a + b, 0) / segAmps.length;
    const zScore = Math.abs((segMean - stats.mean) / (stats.std || 1));
    
    if (zScore > 2.5) {
      return { isAnomaly: true, severity: Math.min(100, Math.round(zScore * 30)) };
    }
  }
  
  return { isAnomaly: false, severity: 0 };
};

const analyzeBreathingPattern = (data: AnalysisResults): {
  regularity: number;
  amplitudeStability: number;
  synchronization: number;
} => {
  const frames = data.series3.frames;
  if (frames.length < 5) {
    return { regularity: 100, amplitudeStability: 100, synchronization: 100 };
  }
  
  const areas = frames.map(f => f.lungArea);
  const mean = areas.reduce((a, b) => a + b, 0) / areas.length;
  const amplitude = Math.max(...areas) - Math.min(...areas);
  
  const regularity = Math.min(100, (amplitude / (mean || 1)) * 50);
  
  let signChanges = 0;
  for (let i = 1; i < areas.length; i++) {
    if ((areas[i] - areas[i-1]) > 0 !== (areas[i-1] - areas[i-2]) > 0) {
      signChanges++;
    }
  }
  const expectedCycles = Math.floor(frames.length / 3);
  const amplitudeStability = expectedCycles > 0 ? Math.min(100, Math.max(0, 100 - Math.abs(signChanges - expectedCycles) * 10)) : 100;
  
  const series1Amp = data.series1.amplitude;
  const series2Amp = data.series2.amplitude;
  const syncRatio = series1Amp > 0 && series2Amp > 0 ? Math.min(series1Amp, series2Amp) / Math.max(series1Amp, series2Amp) : 0;
  const synchronization = Math.round(syncRatio * 100);
  
  return { regularity, amplitudeStability, synchronization };
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  const restrictedRegions: RestrictedRegion[] = [];
  
  const amp1 = data.series1.amplitude;
  const amp2 = data.series2.amplitude;
  const globalAmp = (amp1 + amp2) / 2;
  
  const asymmetry = Math.abs(amp1 - amp2) / Math.max(amp1, amp2, 1);
  
  const leftStats = calculateStats(data.series1.regionalAmplitudes);
  const rightStats = calculateStats(data.series2.regionalAmplitudes);
  const coronalStats = calculateStats(data.series3.regionalAmplitudes);
  
  const avgCV = (leftStats.cv + rightStats.cv + coronalStats.cv) / 3;
  
  const pattern = analyzeBreathingPattern(data);
  
  let abnormalScore = 0;
  let totalScore = 0;
  
  if (globalAmp < 250) {
    findings.push({ category: '整体幅度', status: 'abnormal', value: globalAmp, description: '运动幅度过低' });
    abnormalScore += 3;
  } else if (globalAmp > 3500) {
    findings.push({ category: '整体幅度', status: 'abnormal', value: globalAmp, description: '运动幅度过高' });
    abnormalScore += 2;
  } else {
    findings.push({ category: '整体幅度', status: 'normal', value: globalAmp, description: '运动幅度正常' });
  }
  totalScore += 3;
  
  if (asymmetry > 0.4) {
    findings.push({ category: '左右对称', status: 'abnormal', value: asymmetry, description: '左右不对称明显' });
    abnormalScore += 3;
  } else {
    findings.push({ category: '左右对称', status: 'normal', value: asymmetry, description: '左右对称' });
  }
  totalScore += 3;
  
  if (avgCV > 0.6) {
    findings.push({ category: '运动协调性', status: 'abnormal', value: avgCV, description: '区域运动不协调' });
    abnormalScore += 2;
  } else {
    findings.push({ category: '运动协调性', status: 'normal', value: avgCV, description: '区域运动协调' });
  }
  totalScore += 2;
  
  if (pattern.synchronization < 60) {
    findings.push({ category: '呼吸同步', status: 'abnormal', value: pattern.synchronization, description: '左右呼吸不同步' });
    abnormalScore += 2;
  } else {
    findings.push({ category: '呼吸同步', status: 'normal', value: pattern.synchronization, description: '呼吸同步正常' });
  }
  totalScore += 2;
  
  const leftAnomaly = checkRegionalAnomaly(data.series1.regionalAmplitudes, 'sagittal');
  const rightAnomaly = checkRegionalAnomaly(data.series2.regionalAmplitudes, 'sagittal');
  const coronalAnomaly = checkRegionalAnomaly(data.series3.regionalAmplitudes, 'coronal');
  
  if (leftAnomaly.isAnomaly) {
    restrictedRegions.push({ name: '左侧异常区', location: '左侧', severity: leftAnomaly.severity });
    abnormalScore += 1;
  }
  if (rightAnomaly.isAnomaly) {
    restrictedRegions.push({ name: '右侧异常区', location: '右侧', severity: rightAnomaly.severity });
    abnormalScore += 1;
  }
  if (coronalAnomaly.isAnomaly) {
    restrictedRegions.push({ name: '中部异常区', location: '中部', severity: coronalAnomaly.severity });
    abnormalScore += 1;
  }
  totalScore += 3;
  
  const score = totalScore > 0 ? Math.max(0, Math.round((1 - abnormalScore / totalScore) * 100)) : 100;
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  if (abnormalScore >= 4 || (abnormalScore >= 2 && restrictedRegions.length >= 2)) {
    overallStatus = 'abnormal';
  }
  
  const recommendations: string[] = [];
  if (overallStatus === 'normal') {
    recommendations.push('呼吸功能正常');
  } else {
    const abnormalItems = findings.filter(f => f.status === 'abnormal').map(f => f.category);
    if (abnormalItems.length > 0) {
      recommendations.push(`异常: ${abnormalItems.join('、')}`);
    }
    if (restrictedRegions.length > 0) {
      recommendations.push(`建议复查: ${restrictedRegions.map(r => r.name).join('、')}`);
    }
  }
  
  const analysis: AnalysisDetail = {
    leftAmp: Math.round(amp1),
    rightAmp: Math.round(amp2),
    asymmetry: Math.round(asymmetry * 100),
    globalAmp: Math.round(globalAmp),
    variance: Math.round(avgCV * 100),
    coherence: pattern.synchronization
  };
  
  return {
    overallStatus,
    overallScore: score,
    findings,
    recommendations,
    restrictedRegions,
    analysis
  };
};
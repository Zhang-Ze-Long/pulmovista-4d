import { AnalysisResults, SeriesData } from '../types';

export interface DiagnosisResult {
  overallStatus: 'normal' | 'abnormal';
  overallScore: number;
  findings: Finding[];
  recommendations: string[];
}

export interface Finding {
  category: string;
  status: 'normal' | 'abnormal';
  value: number;
  description: string;
}

const calculateGlobalAmplitude = (series: SeriesData): number => {
  const maxArea = series.maxArea;
  const minArea = series.minArea;
  return maxArea - minArea;
};

const getAmplitudeStatus = (amp: number): Finding => {
  const threshold = 500;
  const healthyMin = 800;
  
  if (amp < threshold) {
    return {
      category: '整体运动幅度',
      status: 'abnormal',
      value: amp,
      description: `运动幅度偏低 (${Math.round(amp)})`
    };
  }
  
  return {
    category: '整体运动幅度',
    status: 'normal',
    value: amp,
    description: `运动幅度正常 (${Math.round(amp)})`
  };
};

const getTidalVolumeStatus = (tidalVol: number): Finding => {
  const threshold = 200;
  
  if (tidalVol < threshold) {
    return {
      category: '潮气量',
      status: 'abnormal',
      value: tidalVol,
      description: `潮气量偏低`
    };
  }
  
  return {
    category: '潮气量',
    status: 'normal',
    value: tidalVol,
    description: `潮气量正常`
  };
};

const getAsymmetryStatus = (series1: SeriesData, series2: SeriesData): Finding => {
  const amp1 = series1.amplitude;
  const amp2 = series2.amplitude;
  const ratio = Math.abs(amp1 - amp2) / Math.max(amp1, amp2);
  
  if (ratio > 0.4) {
    return {
      category: '左右对称性',
      status: 'abnormal',
      value: ratio,
      description: `左右不对称`
    };
  }
  
  return {
    category: '左右对称性',
    status: 'normal',
    value: ratio,
    description: `左右对称`
  };
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  
  const globalAmp = (data.series1.amplitude + data.series2.amplitude) / 2;
  findings.push(getAmplitudeStatus(globalAmp));
  
  findings.push(getTidalVolumeStatus(data.series3.maxTidalVolume));
  
  findings.push(getAsymmetryStatus(data.series1, data.series2));
  
  const abnormalCount = findings.filter(f => f.status === 'abnormal').length;
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  if (abnormalCount >= 2) {
    overallStatus = 'abnormal';
  }
  
  const score = Math.max(0, Math.round((1 - abnormalCount / findings.length) * 100));
  
  const recommendations: string[] = [];
  
  if (overallStatus === 'normal') {
    recommendations.push('呼吸功能正常');
  } else {
    const abnormalItems = findings.filter(f => f.status === 'abnormal').map(f => f.category);
    recommendations.push(`异常指标: ${abnormalItems.join('、')}`);
    recommendations.push('建议结合临床进一步评估');
  }
  
  return {
    overallStatus,
    overallScore: score,
    findings,
    recommendations
  };
};
import { AnalysisResults, SeriesData, SeriesKey } from '../types';

export interface DiagnosisResult {
  overallStatus: 'normal' | 'warning' | 'abnormal';
  overallScore: number;
  findings: Finding[];
  recommendations: string[];
}

export interface Finding {
  category: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe';
  description: string;
  value: number;
  threshold: number;
  indicator: string;
}

const REFERENCE_RANGES = {
  amplitude: { min: 800, max: 2500, optimal: 1500 },
  tidalVolume: { min: 300, max: 800, optimal: 500 },
  asymmetry: { maxRatio: 0.25 },
  regionalVariance: { max: 0.4 },
  respiratoryRate: { min: 10, max: 25, optimal: 14 }
};

const getAmplitudeStatus = (amplitude: number): Finding => {
  const { min, max, optimal } = REFERENCE_RANGES.amplitude;
  const deviation = Math.abs(amplitude - optimal) / optimal;
  
  let severity: Finding['severity'] = 'normal';
  let status = 'normal';
  
  if (amplitude < min * 0.5) {
    severity = 'severe';
    status = 'abnormal';
  } else if (amplitude < min) {
    severity = 'moderate';
    status = 'warning';
  } else if (deviation > 0.5) {
    severity = 'mild';
    status = 'warning';
  }
  
  return {
    category: '运动幅度',
    severity,
    description: severity === 'normal' ? '肺部运动幅度正常' : 
                 severity === 'severe' ? '运动幅度严重不足，可能存在限制性肺病' :
                 severity === 'moderate' ? '运动幅度偏低，建议进一步检查' :
                 '运动幅度略低，注意观察',
    value: amplitude,
    threshold: min,
    indicator: status
  };
};

const getTidalVolumeStatus = (maxTidalVolume: number): Finding => {
  const { min, max, optimal } = REFERENCE_RANGES.tidalVolume;
  
  let severity: Finding['severity'] = 'normal';
  let status: Finding['indicator'] = 'normal';
  
  if (maxTidalVolume < min * 0.5) {
    severity = 'severe';
    status = 'abnormal';
  } else if (maxTidalVolume < min) {
    severity = 'moderate';
    status = 'warning';
  } else if (maxTidalVolume > max * 1.5) {
    severity = 'moderate';
    status = 'warning';
  }
  
  return {
    category: '潮气量',
    severity,
    description: severity === 'normal' ? '潮气量正常' :
                 severity === 'severe' ? '潮气量严重不足' :
                 '潮气量异常',
    value: maxTidalVolume,
    threshold: min,
    indicator: status
  };
};

const getAsymmetryStatus = (series1: SeriesData, series2: SeriesData): Finding => {
  const amp1 = series1.amplitude;
  const amp2 = series2.amplitude;
  const ratio = Math.abs(amp1 - amp2) / Math.max(amp1, amp2);
  const maxRatio = REFERENCE_RANGES.asymmetry.maxRatio;
  
  let severity: Finding['severity'] = 'normal';
  let status: Finding['indicator'] = 'normal';
  
  if (ratio > maxRatio * 2) {
    severity = 'severe';
    status = 'abnormal';
  } else if (ratio > maxRatio * 1.5) {
    severity = 'moderate';
    status = 'warning';
  } else if (ratio > maxRatio) {
    severity = 'mild';
    status = 'warning';
  }
  
  return {
    category: '左右对称性',
    severity,
    description: severity === 'normal' ? '左右肺运动对称' :
                 severity === 'severe' ? '左右肺运动严重不对称，可能存在单侧病变' :
                 severity === 'moderate' ? '左右肺运动明显不对称' :
                 '左右肺运动轻度不对称',
    value: ratio,
    threshold: maxRatio,
    indicator: status
  };
};

const getRegionalStatus = (series: SeriesData): Finding => {
  const amplitudes = series.regionalAmplitudes;
  if (amplitudes.length === 0) {
    return {
      category: '区域运动',
      severity: 'normal',
      description: '无区域分析数据',
      value: 0,
      threshold: 0,
      indicator: 'normal'
    };
  }
  
  const mean = amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length;
  const variance = amplitudes.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / amplitudes.length;
  const normalizedVariance = Math.sqrt(variance) / mean;
  
  const { max } = REFERENCE_RANGES.regionalVariance;
  
  let severity: Finding['severity'] = 'normal';
  let status: Finding['indicator'] = 'normal';
  
  if (normalizedVariance > max * 2) {
    severity = 'severe';
    status = 'abnormal';
  } else if (normalizedVariance > max * 1.5) {
    severity = 'moderate';
    status = 'warning';
  } else if (normalizedVariance > max) {
    severity = 'mild';
    status = 'warning';
  }
  
  return {
    category: '区域均匀性',
    severity,
    description: severity === 'normal' ? '肺部各区域运动均匀' :
                 severity === 'severe' ? '区域运动严重不均，可能存在局灶性病变' :
                 severity === 'moderate' ? '区域运动明显不均匀' :
                 '区域运动轻度不均匀',
    value: normalizedVariance,
    threshold: max,
    indicator: status
  };
};

const getRespiratoryRateStatus = (rate: number): Finding => {
  const { min, max, optimal } = REFERENCE_RANGES.respiratoryRate;
  
  let severity: Finding['severity'] = 'normal';
  let status: Finding['indicator'] = 'normal';
  
  if (rate < min || rate > max) {
    severity = rate < min ? 'moderate' : 'mild';
    status = 'warning';
  }
  
  return {
    category: '呼吸频率',
    severity,
    description: severity === 'normal' ? '呼吸频率正常' : '呼吸频率异常',
    value: rate,
    threshold: min,
    indicator: status
  };
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  
  findings.push(getAmplitudeStatus((data.series1.amplitude + data.series2.amplitude) / 2));
  findings.push(getTidalVolumeStatus(data.series3.maxTidalVolume));
  findings.push(getAsymmetryStatus(data.series1, data.series2));
  findings.push(getRegionalStatus(data.series3));
  findings.push(getRespiratoryRateStatus(data.respiratoryRate));
  
  const severityScores: Record<string, number> = {
    normal: 0,
    mild: 1,
    moderate: 2,
    severe: 3
  };
  
  const totalScore = findings.reduce((acc, f) => acc + severityScores[f.severity], 0);
  const maxScore = findings.length * 3;
  const overallScore = Math.round((1 - totalScore / maxScore) * 100);
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  if (findings.some(f => f.severity === 'severe')) {
    overallStatus = 'abnormal';
  } else if (findings.some(f => f.severity === 'moderate' || f.severity === 'mild')) {
    overallStatus = 'warning';
  }
  
  const recommendations: string[] = [];
  
  if (overallStatus === 'abnormal') {
    recommendations.push('建议尽快就医进行详细检查');
  } else if (overallStatus === 'warning') {
    recommendations.push('建议定期复查，监测病情变化');
  }
  
  const severeFindings = findings.filter(f => f.severity === 'severe' || f.severity === 'moderate');
  if (severeFindings.length > 0) {
    severeFindings.forEach(f => {
      if (f.category === '左右对称性') {
        recommendations.push('建议进行患侧肺部详细检查，排除单侧病变');
      } else if (f.category === '运动幅度') {
        recommendations.push('建议进行肺功能检查，评估限制性肺病');
      } else if (f.category === '潮气量') {
        recommendations.push('注意通气功能评估');
      } else if (f.category === '区域均匀性') {
        recommendations.push('建议进行影像学检查排除局部病变');
      }
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push('肺部运动分析结果正常，保持健康生活方式');
  }
  
  return {
    overallStatus,
    overallScore,
    findings,
    recommendations
  };
};
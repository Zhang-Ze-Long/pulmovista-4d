import { AnalysisResults, SeriesData, SeriesKey } from '../types';

export interface DiagnosisResult {
  overallStatus: 'normal' | 'warning' | 'abnormal';
  overallScore: number;
  findings: Finding[];
  recommendations: string[];
  regionalFindings: RegionalFinding[];
}

export interface Finding {
  category: string;
  severity: 'normal' | 'mild' | 'moderate' | 'severe';
  description: string;
  value: number;
  threshold: number;
  indicator: string;
}

export interface RegionalFinding {
  region: string;
  position: string;
  actualAmplitude: number;
  expectedAmplitude: number;
  ratio: number;
  status: 'normal' | 'reduced' | 'severely_reduced';
  description: string;
}

const LUNG_ZONES = {
  coronal: [
    { name: '右上肺区', startIdx: 0, endIdx: 20, expectedRatio: 0.7, description: '右肺上叶区域，通气较少' },
    { name: '右中肺区', startIdx: 20, endIdx: 40, expectedRatio: 0.85, description: '右肺中叶区域' },
    { name: '右下肺区', startIdx: 40, endIdx: 50, expectedRatio: 1.0, description: '右肺下叶区域，通气最多' },
    { name: '左上肺区', startIdx: 50, endIdx: 70, expectedRatio: 0.65, description: '左肺上叶区域，通气较少' },
    { name: '左中肺区', startIdx: 70, endIdx: 85, expectedRatio: 0.8, description: '左肺舌段区域' },
    { name: '左下肺区', startIdx: 85, endIdx: 100, expectedRatio: 0.95, description: '左肺下叶区域，通气较多' },
  ],
  left: [
    { name: '肺尖', startIdx: 0, endIdx: 15, expectedRatio: 0.6, description: '肺尖区域，运动幅度最小' },
    { name: '上肺区', startIdx: 15, endIdx: 35, expectedRatio: 0.75, description: '上肺叶区域' },
    { name: '中肺区', startIdx: 35, endIdx: 55, expectedRatio: 0.9, description: '中部肺区' },
    { name: '下肺区', startIdx: 55, endIdx: 75, expectedRatio: 1.0, description: '下肺区域，运动幅度最大' },
    { name: '横膈区', startIdx: 75, endIdx: 100, expectedRatio: 1.1, description: '横膈附近，运动幅度最大' },
  ],
  right: [
    { name: '肺尖', startIdx: 0, endIdx: 15, expectedRatio: 0.65, description: '肺尖区域，运动幅度最小' },
    { name: '上肺区', startIdx: 15, endIdx: 35, expectedRatio: 0.8, description: '上肺叶区域' },
    { name: '中肺区', startIdx: 35, endIdx: 55, expectedRatio: 0.95, description: '中部肺区' },
    { name: '下肺区', startIdx: 55, endIdx: 75, expectedRatio: 1.05, description: '下肺区域，运动幅度较大' },
    { name: '横膈区', startIdx: 75, endIdx: 100, expectedRatio: 1.15, description: '横膈附近，运动幅度最大' },
  ]
};

const GLOBAL_REFERENCE = {
  amplitude: { min: 800, max: 2500, optimal: 1500 },
  tidalVolume: { min: 300, max: 800, optimal: 500 },
  asymmetry: { maxRatio: 0.2 },
  respiratoryRate: { min: 10, max: 25, optimal: 14 }
};

const getAmplitudeStatus = (amplitude: number): Finding => {
  const { min, optimal } = GLOBAL_REFERENCE.amplitude;
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
    description: severity === 'normal' ? '肺部整体运动幅度正常' : 
                 severity === 'severe' ? '运动幅度严重不足，可能存在限制性肺病' :
                 severity === 'moderate' ? '运动幅度偏低，建议进一步检查' :
                 '运动幅度略低，注意观察',
    value: amplitude,
    threshold: min,
    indicator: status
  };
};

const getTidalVolumeStatus = (maxTidalVolume: number): Finding => {
  const { min, max, optimal } = GLOBAL_REFERENCE.tidalVolume;
  
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
  const maxRatio = GLOBAL_REFERENCE.asymmetry.maxRatio;
  
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

const getRespiratoryRateStatus = (rate: number): Finding => {
  const { min, max } = GLOBAL_REFERENCE.respiratoryRate;
  
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

const analyzeRegionalAmplitudes = (
  amplitudes: number[],
  zoneConfig: { name: string; startIdx: number; endIdx: number; expectedRatio: number; description: string }[]
): RegionalFinding[] => {
  if (amplitudes.length === 0) return [];
  
  const maxAmplitude = Math.max(...amplitudes);
  if (maxAmplitude === 0) return [];
  
  const findings: RegionalFinding[] = [];
  
  for (const zone of zoneConfig) {
    const zoneAmplitudes = amplitudes.slice(zone.startIdx, zone.endIdx);
    if (zoneAmplitudes.length === 0) continue;
    
    const zoneMean = zoneAmplitudes.reduce((a, b) => a + b, 0) / zoneAmplitudes.length;
    const ratio = zoneMean / maxAmplitude;
    
    let status: RegionalFinding['status'] = 'normal';
    const expectedRatio = zone.expectedRatio;
    const deviation = Math.abs(ratio - expectedRatio) / expectedRatio;
    
    if (deviation > 0.5) {
      status = 'severely_reduced';
    } else if (deviation > 0.25) {
      status = 'reduced';
    }
    
    findings.push({
      region: zone.name,
      position: zone.description,
      actualAmplitude: Math.round(zoneMean),
      expectedAmplitude: Math.round(maxAmplitude * expectedRatio),
      ratio: Math.round(ratio * 100) / 100,
      status,
      description: deviation > 0.25 ? 
        `实际通气占最大幅度的${Math.round(ratio*100)}%，低于预期的${Math.round(expectedRatio*100)}%` :
        '通气正常'
    });
  }
  
  return findings;
};

export const diagnose = (data: AnalysisResults): DiagnosisResult => {
  const findings: Finding[] = [];
  
  findings.push(getAmplitudeStatus((data.series1.amplitude + data.series2.amplitude) / 2));
  findings.push(getTidalVolumeStatus(data.series3.maxTidalVolume));
  findings.push(getAsymmetryStatus(data.series1, data.series2));
  findings.push(getRespiratoryRateStatus(data.respiratoryRate));
  
  const regionalFindings: RegionalFinding[] = [];
  regionalFindings.push(...analyzeRegionalAmplitudes(data.series3.regionalAmplitudes, LUNG_ZONES.coronal));
  regionalFindings.push(...analyzeRegionalAmplitudes(data.series1.regionalAmplitudes, LUNG_ZONES.left));
  regionalFindings.push(...analyzeRegionalAmplitudes(data.series2.regionalAmplitudes, LUNG_ZONES.right));
  
  const severityScores: Record<string, number> = {
    normal: 0,
    mild: 1,
    moderate: 2,
    severe: 3
  };
  
  const totalScore = findings.reduce((acc, f) => acc + severityScores[f.severity], 0);
  
  const abnormalRegions = regionalFindings.filter(f => f.status !== 'normal');
  const regionalScore = abnormalRegions.length * 1.5;
  
  const maxScore = (findings.length * 3) + 6;
  const overallScore = Math.max(0, Math.round((1 - (totalScore + regionalScore) / maxScore) * 100));
  
  let overallStatus: DiagnosisResult['overallStatus'] = 'normal';
  if (findings.some(f => f.severity === 'severe') || abnormalRegions.length >= 3) {
    overallStatus = 'abnormal';
  } else if (findings.some(f => f.severity === 'moderate' || f.severity === 'mild') || abnormalRegions.length > 0) {
    overallStatus = 'warning';
  }
  
  const recommendations: string[] = [];
  
  if (overallStatus === 'abnormal') {
    recommendations.push('建议尽快就医进行详细检查');
  } else if (overallStatus === 'warning') {
    recommendations.push('建议定期复查，监测病情变化');
  }
  
  if (abnormalRegions.length > 0) {
    const reducedRegions = abnormalRegions.filter(r => r.status === 'reduced');
    const severelyReducedRegions = abnormalRegions.filter(r => r.status === 'severely_reduced');
    
    if (severelyReducedRegions.length > 0) {
      severelyReducedRegions.forEach(r => {
        recommendations.push(`严重受限区域: ${r.region}，需重点关注`);
      });
    }
    
    if (reducedRegions.length > 0) {
      recommendations.push(`${reducedRegions.length}个区域通气轻度减弱，建议复查`);
    }
    
    const upperReduced = abnormalRegions.filter(r => r.region.includes('上肺') || r.region.includes('肺尖'));
    const lowerReduced = abnormalRegions.filter(r => r.region.includes('下肺') || r.region.includes('横膈'));
    
    if (upperReduced.length > lowerReduced.length) {
      recommendations.push('上肺区域通气相对减弱，可能与体位或基础疾病相关');
    }
  }
  
  const severeFindings = findings.filter(f => f.severity === 'severe' || f.severity === 'moderate');
  if (severeFindings.length > 0) {
    severeFindings.forEach(f => {
      if (f.category === '左右对称性') {
        recommendations.push('建议进行患侧肺部详细检查，排除单侧病变');
      } else if (f.category === '运动幅度') {
        recommendations.push('建议进行肺功能检查，评估限制性肺病');
      }
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push('肺部各区域运动分析结果正常');
  }
  
  return {
    overallStatus,
    overallScore,
    findings,
    recommendations,
    regionalFindings
  };
};
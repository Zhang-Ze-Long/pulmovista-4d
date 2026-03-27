
export interface FrameData {
  id: number;
  timestamp: number;
  maskData: Uint8ClampedArray; // 二值化掩模
  width: number;
  height: number;
  lungArea: number;
  diaphragmPos: number; // 图像坐标系中的最大 Y (底部)
  apexPos: number;      // 图像坐标系中的最小 Y (顶部)
  
  // OFx 升级字段
  opticalFlux: number;    // 当前帧相对于前一帧的光通量 (Φ)
  integratedFlux: number; // 累积光通量，比例于潮气量 (Tidal Volume)
  
  // Coronal 视图特有：左右肺叶的水平质心
  leftCentroidX?: number;
  rightCentroidX?: number;
  volumeGeometry?: Float32Array; // 3D 重建生成的顶点数据
}

export interface SeriesData {
  name: string;
  frames: FrameData[];
  maxArea: number;
  minArea: number;
  amplitude: number;
  avgApexPos: number;            // 该序列的平均肺尖 Y 坐标
  avgCentroidLeft?: number;      // 仅用于 Coronal
  avgCentroidRight?: number;     // 仅用于 Coronal
  regionalAmplitudes: number[];  // 100个点的区域振幅分析数据
  regionalPoints: { u: number; v: number }[]; // 100个点的精确边界坐标（基于吸气末帧）
  
  // OFx 序列级统计
  maxTidalVolume: number;
}

export interface AnalysisResults {
  series1: SeriesData; // 左侧矢状面
  series2: SeriesData; // 右侧矢状面
  series3: SeriesData; // 冠状面
  asymmetryAlert: boolean;
  respiratoryRate: number;
}

export type SeriesKey = 'series1' | 'series2' | 'series3';

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

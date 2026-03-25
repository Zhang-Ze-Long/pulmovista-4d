
import { MASK_SIZE } from '../constants';
import { AnalysisResults, SeriesKey } from '../types';

/**
 * 将图像像素坐标 (u, v) 映射到 3D 世界坐标 (x, y, z)
 * 映射逻辑：
 * 1. 冠状面 (Series 3) 为基准坐标系。
 * 2. 矢状面相对于冠状面进行肺尖对齐 (Apex Alignment)。
 * 3. 图像 V=0 对应 3D Z=50, V=MASK_SIZE 对应 3D Z=-50 (Z+ 为上)。
 */
export const mapPixelToWorld = (
  u: number, 
  v: number, 
  seriesKey: SeriesKey, 
  data: AnalysisResults
): [number, number, number] => {
  const series = data[seriesKey];
  const masterApex = data.series3.avgApexPos;
  const currentApex = series.avgApexPos;

  // 1. 核心映射：处理垂直翻转与归一化
  // 基础 Z 坐标：(0.5 - v / MASK_SIZE) * 100
  // 应用 Z-Offset (Apex Alignment): 使当前序列的肺尖在 3D 中与冠状面肺尖重合
  const z = (0.5 - (v - currentApex + masterApex) / MASK_SIZE) * 100;

  // 2. 处理 X/Y 平面映射
  const centerX = MASK_SIZE / 2;
  const worldCoord_u = (u - centerX) * (100 / MASK_SIZE);
  
  if (seriesKey === 'series3') {
    // 冠状面位于 X-Z 平面 (Y=0)
    return [worldCoord_u, 0, z];
  } else {
    // 矢状面位于 Y-Z 平面 (X=offset)
    const offsetX1 = ((data.series3.avgCentroidLeft ?? (centerX - 40)) - centerX) * (100 / MASK_SIZE);
    const offsetX2 = ((data.series3.avgCentroidRight ?? (centerX + 40)) - centerX) * (100 / MASK_SIZE);
    const xPos = seriesKey === 'series1' ? offsetX1 : offsetX2;
    
    // 矢状面图像的 U 对应 3D 的 Y
    return [xPos, worldCoord_u, z];
  }
};

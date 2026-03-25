
import { AnalysisResults } from '../types';
import { MASK_SIZE } from '../constants';
import { generateMeshFromVoxels } from './marchingCubes';

export const reconstructVolume = async (data: AnalysisResults): Promise<AnalysisResults> => {
  const numFrames = data.series3.frames.length;
  // Increased GRID_SIZE for high-fidelity clinical visualization
  const GRID_SIZE = 128; 
  
  const masterApex = data.series3.avgApexPos;
  const apex1 = data.series1.avgApexPos;
  const apex2 = data.series2.avgApexPos;

  for (let fIdx = 0; fIdx < numFrames; fIdx++) {
    const f1 = data.series1.frames[fIdx];
    const f2 = data.series2.frames[fIdx];
    const f3 = data.series3.frames[fIdx];
    
    const voxels = new Uint8Array(GRID_SIZE * GRID_SIZE * GRID_SIZE);
    
    for (let iz = 0; iz < GRID_SIZE; iz++) {
      // 从世界坐标反推图像坐标
      const worldZPercent = iz / (GRID_SIZE - 1);
      const z = (worldZPercent - 0.5) * 100;
      
      // 根据 mapPixelToWorld 公式反推 v:
      // z = (0.5 - (v - curApex + masterApex) / MASK_SIZE) * 100
      // => v = MASK_SIZE * (0.5 - z/100) + curApex - masterApex
      
      // 冠状面 v (currentApex == masterApex)
      const v3 = Math.floor(MASK_SIZE * (0.5 - z / 100));
      if (v3 < 0 || v3 >= MASK_SIZE) continue;

      for (let iy = 0; iy < GRID_SIZE; iy++) {
        // iy 对应 3D Y -> 矢状面 U
        const uSag = Math.floor((iy / GRID_SIZE) * MASK_SIZE);
        
        for (let ix = 0; ix < GRID_SIZE; ix++) {
          // ix 对应 3D X -> 冠状面 U
          const uCor = Math.floor((ix / GRID_SIZE) * MASK_SIZE);
          
          // 1. 冠状面掩模检查
          if (f3.maskData[v3 * MASK_SIZE + uCor] === 0) continue;
          
          // 2. 矢状面检查
          let isSagittalWhite = false;
          if (ix < GRID_SIZE / 2) {
            // 左肺，反推 v1
            const v1 = Math.floor(MASK_SIZE * (0.5 - z / 100) + apex1 - masterApex);
            if (v1 >= 0 && v1 < MASK_SIZE) {
              isSagittalWhite = f1.maskData[v1 * MASK_SIZE + uSag] > 0;
            }
          } else {
            // 右肺，反推 v2
            const v2 = Math.floor(MASK_SIZE * (0.5 - z / 100) + apex2 - masterApex);
            if (v2 >= 0 && v2 < MASK_SIZE) {
              isSagittalWhite = f2.maskData[v2 * MASK_SIZE + uSag] > 0;
            }
          }
          
          if (isSagittalWhite) {
            voxels[ix + iy * GRID_SIZE + iz * GRID_SIZE * GRID_SIZE] = 1;
          }
        }
      }
    }
    
    // Use smoothed mesh generation
    f3.volumeGeometry = generateMeshFromVoxels(voxels, [GRID_SIZE, GRID_SIZE, GRID_SIZE], [100, 100, 100], 30);
  }
  
  return data;
};

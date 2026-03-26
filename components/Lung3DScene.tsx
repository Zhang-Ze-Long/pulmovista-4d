
import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera } from '@react-three/drei';
import * as THREE from 'three';
import { AnalysisResults, SeriesKey } from '../types';
import { MASK_SIZE, COLORS } from '../constants';
import { mapPixelToWorld } from '../services/coordinateSystem';

interface PlaneProps {
  seriesKey: SeriesKey;
  data: AnalysisResults;
  frameIdx: number;
  position: [number, number, number];
  rotation: [number, number, number];
  color: string;
}

const SlicePlane: React.FC<PlaneProps> = ({ seriesKey, data, frameIdx, position, rotation, color }) => {
  const series = data[seriesKey];
  const frame = series.frames[frameIdx % series.frames.length];

  const texture = useMemo(() => {
    const texData = new Uint8Array(MASK_SIZE * MASK_SIZE * 4);
    const tex = new THREE.DataTexture(texData, MASK_SIZE, MASK_SIZE, THREE.RGBAFormat);
    tex.flipY = true; 
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    return tex;
  }, []);

  useEffect(() => {
    if (!frame) return;
    const pixelData = frame.maskData;
    const rgba = texture.image.data;
    const rBase = parseInt(color.slice(1, 3), 16);
    const gBase = parseInt(color.slice(3, 5), 16);
    const bBase = parseInt(color.slice(5, 7), 16);

    for (let i = 0; i < pixelData.length; i++) {
      const val = pixelData[i];
      const idx = i * 4;
      if (val > 0) {
        rgba[idx] = rBase;
        rgba[idx + 1] = gBase;
        rgba[idx + 2] = bBase;
        rgba[idx + 3] = 255;
      } else {
        rgba[idx] = 0; rgba[idx+1] = 0; rgba[idx+2] = 0; rgba[idx+3] = 0;
      }
    }
    texture.needsUpdate = true;
  }, [frame, texture, color]);

  // 计算该序列肺尖相对于冠状面肺尖的偏移量
  const currentApexZ = (0.5 - series.avgApexPos / MASK_SIZE) * 100;
  const masterApexZ = (0.5 - data.series3.avgApexPos / MASK_SIZE) * 100;
  const zShift = masterApexZ - currentApexZ;

  return (
    <group position={[position[0], position[1], position[2] + zShift]} rotation={rotation}>
      <mesh>
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial map={texture} transparent={true} side={THREE.DoubleSide} alphaTest={0.01} depthWrite={true} />
      </mesh>
    </group>
  );
};

const VolumetricHull: React.FC<{ data: AnalysisResults, frameIdx: number }> = ({ data, frameIdx }) => {
  const geomRef = useRef<THREE.BufferGeometry>(null);
  const frame = data.series3.frames[frameIdx % data.series3.frames.length];

  useEffect(() => {
    if (geomRef.current && frame.volumeGeometry) {
      geomRef.current.setAttribute('position', new THREE.BufferAttribute(frame.volumeGeometry, 3));
      // Recompute normals for smooth Gouraud/Phong shading
      geomRef.current.computeVertexNormals();
    }
  }, [frame]);

  return (
    <mesh position={[0, 0, 0]}>
      <bufferGeometry ref={geomRef} />
      <meshPhongMaterial 
        color="#22d3ee" 
        transparent={true} 
        opacity={0.3} 
        side={THREE.DoubleSide}
        shininess={60}
        specular={new THREE.Color("#ffffff")}
        depthWrite={false}
        flatShading={false}
      />
    </mesh>
  );
};

/**
 * 3D 交互定位器 (Interactive Locator) - 高精度统一对齐版
 */
const InteractiveMarker: React.FC<{ 
  data: AnalysisResults, 
  frameIdx: number, 
  hovered: { seriesKey: SeriesKey, index: number } | null 
}> = ({ data, frameIdx, hovered }) => {
  if (!hovered) return null;

  const { seriesKey, index } = hovered;
  const series = data[seriesKey];
  
  // 使用预计算的边界坐标 (Pre-calculated Coordinate Lookup)
  const point = series.regionalPoints[index];
  if (!point) return null;

  // 使用统一函数映射到 3D 空间
  const finalPos = mapPixelToWorld(point.u, point.v, seriesKey, data);

  return (
    <group position={finalPos}>
      {/* 增强型视觉反馈：明亮的黄色指示球 (radius 4mm) */}
      <mesh>
        <sphereGeometry args={[4, 24, 24]} />
        <meshBasicMaterial color="#facc15" />
      </mesh>
      <pointLight color="#facc15" intensity={15} distance={50} />
      <mesh>
        <sphereGeometry args={[7, 24, 24]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.3} />
      </mesh>
    </group>
  );
};

const Lung3DScene: React.FC<{ 
  data: AnalysisResults, 
  currentFrame: number,
  hovered: { seriesKey: SeriesKey, index: number } | null 
}> = ({ data, currentFrame, hovered }) => {
  const centerX = MASK_SIZE / 2;
  const offsetX1 = ((data.series3.avgCentroidLeft ?? (centerX - 40)) - centerX) * (100 / MASK_SIZE);
  const offsetX2 = ((data.series3.avgCentroidRight ?? (centerX + 40)) - centerX) * (100 / MASK_SIZE);

  return (
    <div className="w-full h-full bg-slate-950 relative">
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none bg-slate-900/40 p-2 rounded backdrop-blur-sm border border-slate-700/50">
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.coronal}}></div><span className="text-[10px] text-slate-300 font-mono">CORONAL (Y=0)</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.left}}></div><span className="text-[10px] text-slate-300 font-mono">L-SAGITTAL (X={offsetX1.toFixed(1)})</span></div>
        <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.right}}></div><span className="text-[10px] text-slate-300 font-mono">R-SAGITTAL (X={offsetX2.toFixed(1)})</span></div>
      </div>

      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[120, 100, 100]} up={[0, 0, 1]} />
        <OrbitControls makeDefault target={[0, 0, 0]} />
        <ambientLight intensity={1.0} />
        <directionalLight position={[10, 10, 10]} intensity={2.0} />
        <pointLight position={[150, 150, 150]} intensity={1.5} />
        
        <group>
          <SlicePlane seriesKey="series3" data={data} frameIdx={currentFrame} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} color={COLORS.coronal} />
          <SlicePlane seriesKey="series1" data={data} frameIdx={currentFrame} position={[offsetX1, 0, 0]} rotation={[Math.PI / 2, -Math.PI / 2, 0]} color={COLORS.left} />
          <SlicePlane seriesKey="series2" data={data} frameIdx={currentFrame} position={[offsetX2, 0, 0]} rotation={[Math.PI / 2, -Math.PI / 2, 0]} color={COLORS.right} />
        </group>

        <VolumetricHull data={data} frameIdx={currentFrame} />
        <InteractiveMarker data={data} frameIdx={currentFrame} hovered={hovered} />

        <Grid infiniteGrid fadeDistance={400} sectionColor="#334155" cellColor="#1e293b" position={[0, 0, -50]} rotation={[Math.PI/2, 0, 0]} />
      </Canvas>
    </div>
  );
};

export default Lung3DScene;

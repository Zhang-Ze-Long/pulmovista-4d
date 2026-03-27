import React, { useMemo, useRef, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, PerspectiveCamera, Edges } from '@react-three/drei';
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
  label: string;
}

const HIGH_RES = 256;

const SlicePlane: React.FC<PlaneProps> = ({ seriesKey, data, frameIdx, position, rotation, color, label }) => {
  const series = data[seriesKey];
  const frame = series.frames[frameIdx % series.frames.length];

  const { texture, geometry } = useMemo(() => {
    const texData = new Uint8Array(HIGH_RES * HIGH_RES * 4);
    const tex = new THREE.DataTexture(texData, HIGH_RES, HIGH_RES, THREE.RGBAFormat);
    tex.flipY = true;
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    
    const geo = new THREE.PlaneGeometry(90, 90, 32, 32);
    
    return { texture: tex, geometry: geo };
  }, []);

  useEffect(() => {
    if (!frame) return;
    
    const srcData = frame.maskData;
    const destData = texture.image.data;
    const scale = MASK_SIZE / HIGH_RES;
    
    const rBase = parseInt(color.slice(1, 3), 16);
    const gBase = parseInt(color.slice(3, 5), 16);
    const bBase = parseInt(color.slice(5, 7), 16);
    
    for (let y = 0; y < HIGH_RES; y++) {
      for (let x = 0; x < HIGH_RES; x++) {
        const srcX = Math.floor(x * scale);
        const srcY = Math.floor(y * scale);
        const srcIdx = srcY * MASK_SIZE + srcX;
        const destIdx = (y * HIGH_RES + x) * 4;
        
        const val = srcData[srcIdx];
        if (val > 0) {
          const dist = Math.sqrt(Math.pow(x - HIGH_RES/2, 2) + Math.pow(y - HIGH_RES/2, 2));
          const edge = Math.max(0, 1 - dist / (HIGH_RES * 0.45));
          
          destData[destIdx] = Math.min(255, rBase + Math.round(30 * edge));
          destData[destIdx + 1] = Math.min(255, gBase + Math.round(30 * edge));
          destData[destIdx + 2] = Math.min(255, bBase + Math.round(30 * edge));
          destData[destIdx + 3] = 255;
        } else {
          destData[destIdx] = 0;
          destData[destIdx + 1] = 0;
          destData[destIdx + 2] = 0;
          destData[destIdx + 3] = 0;
        }
      }
    }
    texture.needsUpdate = true;
  }, [frame, texture, color]);

  const currentApexZ = (0.5 - series.avgApexPos / MASK_SIZE) * 100;
  const masterApexZ = (0.5 - data.series3.avgApexPos / MASK_SIZE) * 100;
  const zShift = masterApexZ - currentApexZ;

  return (
    <group position={[position[0], position[1], position[2] + zShift]} rotation={rotation}>
      <mesh geometry={geometry}>
        <meshStandardMaterial 
          map={texture} 
          transparent={true} 
          side={THREE.DoubleSide}
          alphaTest={0.1}
          roughness={0.3}
          metalness={0.1}
        />
      </mesh>
      <mesh geometry={geometry}>
        <meshBasicMaterial color={color} wireframe transparent opacity={0.15} />
      </mesh>
    </group>
  );
};

const VolumetricHull: React.FC<{ data: AnalysisResults, frameIdx: number }> = ({ data, frameIdx }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const frame = data.series3.frames[frameIdx % data.series3.frames.length];

  const { geometry, material } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const mat = new THREE.MeshStandardMaterial({
      color: "#22d3ee",
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      roughness: 0.4,
      metalness: 0.2,
      depthWrite: false,
    });
    return { geometry: geo, material: mat };
  }, []);

  useEffect(() => {
    if (geometry && frame.volumeGeometry) {
      geometry.setAttribute('position', new THREE.BufferAttribute(frame.volumeGeometry, 3));
      geometry.computeVertexNormals();
    }
  }, [frame, geometry]);

  return (
    <mesh ref={meshRef} geometry={geometry} material={material}>
      <Edges geometry={geometry} color="#0ea5e9" threshold={15} opacity={0.5} transparent />
    </mesh>
  );
};

const InteractiveMarker: React.FC<{ 
  data: AnalysisResults, 
  frameIdx: number, 
  hovered: { seriesKey: SeriesKey, index: number } | null 
}> = ({ data, frameIdx, hovered }) => {
  if (!hovered) return null;

  const { seriesKey, index } = hovered;
  const series = data[seriesKey];
  const point = series.regionalPoints[index];
  if (!point) return null;

  const finalPos = mapPixelToWorld(point.u, point.v, seriesKey, data);

  return (
    <group position={finalPos}>
      <mesh>
        <sphereGeometry args={[3, 32, 32]} />
        <meshBasicMaterial color="#facc15" />
      </mesh>
      <pointLight color="#facc15" intensity={20} distance={40} />
      <mesh>
        <sphereGeometry args={[5, 32, 32]} />
        <meshBasicMaterial color="#facc15" transparent opacity={0.4} />
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
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-1 pointer-events-none bg-slate-900/60 p-3 rounded-lg backdrop-blur-md border border-slate-700/50 shadow-lg">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.coronal}}></div>
          <span className="text-[10px] text-slate-300 font-mono">CORONAL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.left}}></div>
          <span className="text-[10px] text-slate-300 font-mono">L-SAGITTAL</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{backgroundColor: COLORS.right}}></div>
          <span className="text-[10px] text-slate-300 font-mono">R-SAGITTAL</span>
        </div>
      </div>

      <Canvas shadows gl={{ antialias: true, alpha: true }}>
        <PerspectiveCamera makeDefault position={[150, 120, 120]} fov={45} up={[0, 0, 1]} />
        <OrbitControls 
          makeDefault 
          target={[0, 0, 0]} 
          enableDamping
          dampingFactor={0.05}
          minDistance={50}
          maxDistance={400}
        />
        
        <ambientLight intensity={0.6} color="#e0f2fe" />
        <directionalLight position={[50, 50, 50]} intensity={1.2} color="#ffffff" castShadow />
        <directionalLight position={[-30, -30, 30]} intensity={0.4} color="#7dd3fc" />
        <pointLight position={[100, 100, 100]} intensity={0.8} color="#ffffff" />
        <pointLight position={[-80, -80, 50]} intensity={0.4} color="#38bdf8" />
        
        <fog attach="fog" args={['#0f172a', 200, 500]} />
        
        <group>
          <SlicePlane seriesKey="series3" data={data} frameIdx={currentFrame} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} color={COLORS.coronal} label="Coronal" />
          <SlicePlane seriesKey="series1" data={data} frameIdx={currentFrame} position={[offsetX1, 0, 0]} rotation={[Math.PI / 2, -Math.PI / 2, 0]} color={COLORS.left} label="Left" />
          <SlicePlane seriesKey="series2" data={data} frameIdx={currentFrame} position={[offsetX2, 0, 0]} rotation={[Math.PI / 2, -Math.PI / 2, 0]} color={COLORS.right} label="Right" />
        </group>

        <VolumetricHull data={data} frameIdx={currentFrame} />
        <InteractiveMarker data={data} frameIdx={currentFrame} hovered={hovered} />

        <Grid 
          infiniteGrid 
          fadeDistance={300} 
          sectionColor="#475569" 
          cellColor="#1e293b" 
          position={[0, 0, -60]} 
          rotation={[Math.PI/2, 0, 0]}
          fadeStrength={1}
        />
      </Canvas>
    </div>
  );
};

export default Lung3DScene;

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { AnalysisResults, SeriesKey, DiagnosisResult } from './types';
import { getSimulatedData } from './services/dataSimulator';
import { processDroppedEntries } from './services/fileProcessor';
import { reconstructVolume } from './services/volumeReconstructor';
import { diagnose } from './services/diagnosis';
import Lung3DScene from './components/Lung3DScene';
import { UI_ICONS, COLORS, MASK_SIZE } from './constants';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  AreaChart,
  Area,
  Legend,
  ReferenceLine
} from 'recharts';

const App: React.FC = () => {
  const [data, setData] = useState<AnalysisResults | null>(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  
  // 交互追踪状态
  const [hoveredInfo, setHoveredInfo] = useState<{ seriesKey: SeriesKey, index: number } | null>(null);
  const [diagnosis, setDiagnosis] = useState<DiagnosisResult | null>(null);

  useEffect(() => {
    const init = async () => {
      setLoadingStep("正在模拟掩模数据...");
      const simulated = getSimulatedData();
      setLoadingStep("正在执行 Visual Hull 3D 重建...");
      const volData = await reconstructVolume(simulated);
      setData(volData);
      const diag = diagnose(volData);
      setDiagnosis(diag);
    };
    init();
  }, []);

  useEffect(() => {
    let interval: any;
    if (isPlaying && data && data.series1.frames.length > 0) {
      interval = setInterval(() => {
        setCurrentFrame(prev => (prev + 1) % data.series1.frames.length);
      }, 333 / playbackSpeed); 
    }
    return () => clearInterval(interval);
  }, [isPlaying, data, playbackSpeed]);

  // 新增：光通量与潮气量图表数据
  const ofxData = useMemo(() => {
    if (!data || data.series1.frames.length === 0) return [];
    return data.series3.frames.map((f, i) => ({
      frame: i,
      flux: f.opticalFlux,
      volume: f.integratedFlux,
    }));
  }, [data]);

  const regionalData = useMemo(() => {
    if (!data) return { coronal: [], left: [], right: [] };
    
    const format = (amps: number[]) => amps.map((val, idx) => {
      let label = `Pt ${idx}`;
      if (idx === 0) label = "Apex";
      else if (idx === 25) label = "Left Wall";
      else if (idx === 50) label = "Diaphragm";
      else if (idx === 75) label = "Right Wall";
      
      return {
        index: idx,
        amplitude: val,
        label: label
      };
    });

    return {
      coronal: format(data.series3.regionalAmplitudes),
      left: format(data.series1.regionalAmplitudes),
      right: format(data.series2.regionalAmplitudes)
    };
  }, [data]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (!e.dataTransfer.items || e.dataTransfer.items.length === 0) return;

    setIsLoading(true);
    setLoadingStep("正在解析文件夹结构...");
    try {
      const results = await processDroppedEntries(e.dataTransfer.items);
      if (results) {
        setLoadingStep("正在进行光通量分析与 3D 重建...");
        const volData = await reconstructVolume(results);
        setData(volData);
        const diag = diagnose(volData);
        setDiagnosis(diag);
        setCurrentFrame(0);
      }
    } catch (err: any) {
      alert(err.message || "解析文件夹时出错。");
    } finally {
      setIsLoading(false);
      setLoadingStep("");
    }
  };

  const handleChartHover = (seriesKey: SeriesKey) => (props: any) => {
    if (props && props.activeTooltipIndex !== undefined) {
      setHoveredInfo({ seriesKey, index: props.activeTooltipIndex });
    } else {
      setHoveredInfo(null);
    }
  };

  if (!data) return (
    <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-950 text-white font-sans">
      <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="text-blue-400 font-bold uppercase tracking-widest text-xs animate-pulse">正在初始化 OFx 引擎...</p>
    </div>
  );

  return (
    <div className="h-screen w-screen flex flex-col bg-slate-950 text-slate-100 overflow-hidden select-none font-sans relative" onDragOver={handleDragOver} onDragEnter={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      {isDragging && (
        <div className="absolute inset-0 z-50 bg-blue-600/30 backdrop-blur-md border-4 border-dashed border-blue-400 m-4 rounded-3xl flex flex-col items-center justify-center pointer-events-none transition-all duration-300">
          <div className="bg-blue-600 p-8 rounded-full shadow-2xl mb-6 animate-bounce">{UI_ICONS.Upload}</div>
          <h2 className="text-3xl font-bold text-white drop-shadow-md">释放文件夹开始解析</h2>
          <p className="text-blue-100 mt-3 text-lg">需包含 series1, series2, series3 目录</p>
        </div>
      )}

      {(isLoading || !data) && (
        <div className="absolute inset-0 z-[60] bg-slate-950/90 backdrop-blur-xl flex flex-col items-center justify-center transition-all duration-500">
          <div className="relative w-24 h-24 mb-8">
            <div className="absolute inset-0 border-4 border-blue-500/20 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-white">正在处理医学数据...</h2>
          <p className="text-slate-400 mt-3 animate-pulse">{loadingStep || "执行光通量积分中"}</p>
        </div>
      )}

      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">{UI_ICONS.Activity}</div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">肺动维 <span className="text-blue-500">4D</span></h1>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">基于 OFx 光通量的呼吸分析仪 v9.0</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-800/50 px-3 py-1.5 rounded-md border border-slate-700/50">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            OFx 算法已激活 (MedIA 2021)
          </div>
          <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-blue-600 hover:bg-blue-500 rounded-full transition-all shadow-lg shadow-blue-500/30">
            {isPlaying ? UI_ICONS.Pause : UI_ICONS.Play}
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        <section className="flex-[3] border-r border-slate-800 flex flex-col relative">
          <Lung3DScene data={data} currentFrame={currentFrame} hovered={hoveredInfo} />
          
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 bg-slate-900/80 backdrop-blur-xl border border-slate-700 rounded-2xl flex items-center gap-8 shadow-2xl">
            <div className="flex flex-col gap-1 w-48">
              <div className="flex justify-between text-[10px] uppercase font-bold text-slate-500">
                <span>播放进度</span>
                <span>帧 {currentFrame + 1}/{data.series1.frames.length}</span>
              </div>
              <input type="range" min="0" max={Math.max(0, data.series1.frames.length - 1)} value={currentFrame} onChange={(e) => { setIsPlaying(false); setCurrentFrame(parseInt(e.target.value)); }} className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500" />
            </div>
          </div>
        </section>

        <aside className="flex-[2] flex flex-col overflow-y-auto custom-scrollbar bg-slate-900/20 pb-8">
          <div className="p-4 space-y-4">
            
            {/* OFx Signal Graph */}
            <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl shadow-lg">
              <div className="flex justify-between items-end mb-4 px-1">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase">光通量呼吸信号 (OFx Dynamics)</h4>
                <span className="text-[9px] text-emerald-400 font-mono">Φ(t) &gt; 0: 吸气</span>
              </div>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ofxData}>
                    <defs>
                      <linearGradient id="fluxGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="frame" hide />
                    <YAxis fontSize={10} stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="flux" name="光通量 Φ" stroke="#10b981" fill="url(#fluxGrad)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Tidal Volume Graph */}
            <div className="bg-slate-800/40 border border-slate-700 p-4 rounded-xl shadow-lg">
              <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-4 px-1">模拟潮气量 (Integrated Flux ∫Φdt)</h4>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={ofxData}>
                    <defs>
                      <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="frame" hide />
                    <YAxis fontSize={10} stroke="#64748b" />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                    <Area type="monotone" dataKey="volume" name="潮气量" stroke="#3b82f6" fill="url(#volGrad)" strokeWidth={2} isAnimationActive={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Regional Analysis Charts with Hover Tracking */}
            <div className="space-y-4 pt-4 border-t border-slate-800">
               <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">解剖学区域运动</h3>
              
              <div className="bg-slate-800/30 border border-slate-700 p-3 rounded-xl">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-1">冠状面径向位移</h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={regionalData.coronal} 
                      onMouseMove={handleChartHover('series3')}
                      onMouseLeave={() => setHoveredInfo(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="index" fontSize={9} interval={24} />
                      <YAxis fontSize={9} />
                      <Tooltip labelStyle={{color: '#fff'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="amplitude" name="位移" stroke={COLORS.coronal} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-800/30 border border-slate-700 p-3 rounded-xl">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-1">左侧矢状面径向位移</h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={regionalData.left}
                      onMouseMove={handleChartHover('series1')}
                      onMouseLeave={() => setHoveredInfo(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="index" fontSize={9} interval={24} />
                      <YAxis fontSize={9} />
                      <Tooltip labelStyle={{color: '#fff'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="amplitude" name="位移" stroke={COLORS.left} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-slate-800/30 border border-slate-700 p-3 rounded-xl">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase mb-3 px-1">右侧矢状面径向位移</h4>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart 
                      data={regionalData.right}
                      onMouseMove={handleChartHover('series2')}
                      onMouseLeave={() => setHoveredInfo(null)}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="index" fontSize={9} interval={24} />
                      <YAxis fontSize={9} />
                      <Tooltip labelStyle={{color: '#fff'}} contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px' }} />
                      <Line type="monotone" dataKey="amplitude" name="位移" stroke={COLORS.right} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {diagnosis && (
              <div className="bg-slate-800/60 border border-slate-700 p-4 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase text-slate-300">AI 诊断结果</h3>
                  <div className={`px-3 py-1 rounded-full text-xs font-bold ${
                    diagnosis.overallStatus === 'normal' ? 'bg-emerald-500/20 text-emerald-400' :
                    diagnosis.overallStatus === 'warning' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {diagnosis.overallStatus === 'normal' ? '正常' :
                     diagnosis.overallStatus === 'warning' ? '需注意' : '异常'}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full transition-all ${
                      diagnosis.overallScore >= 80 ? 'bg-emerald-500' :
                      diagnosis.overallScore >= 60 ? 'bg-amber-500' : 'bg-red-500'
                    }`} style={{ width: `${diagnosis.overallScore}%` }} />
                  </div>
                  <span className="text-xs font-mono text-slate-400">{diagnosis.overallScore}分</span>
                </div>

                <div className="space-y-2">
                  {diagnosis.findings.map((finding, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-[10px]">
                      <span className={`w-1.5 h-1.5 mt-1 rounded-full flex-shrink-0 ${
                        finding.severity === 'normal' ? 'bg-emerald-500' :
                        finding.severity === 'mild' ? 'bg-amber-500' :
                        finding.severity === 'moderate' ? 'bg-orange-500' : 'bg-red-500'
                      }`} />
                      <div>
                        <span className="text-slate-300 font-medium">{finding.category}:</span>
                        <span className="text-slate-400 ml-1">{finding.description}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-700">
                  <div className="text-[9px] text-slate-500 uppercase mb-1">建议</div>
                  <ul className="text-[10px] text-slate-300 space-y-1">
                    {diagnosis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-1">
                        <span className="text-blue-400">•</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            <div className="p-4 bg-slate-800/20 rounded-xl border border-slate-700/50">
                <div className="text-[10px] text-slate-500 mb-2 font-mono uppercase">OFx 技术说明 (MedIA 2021)</div>
                <p className="text-[9px] text-slate-400 leading-relaxed italic">
                  系统现已集成光通量 (Optical Flux) 分析。相较于简单的面积计算，OFx 通过计算光流场的散度积分，能更鲁棒地捕捉肺实质在微小时间尺度上的扩张与收缩。
                  ∫Φdt 曲线代表了与肺容量正相关的物理量，是评估潮气量 (Tidal Volume) 的先进生物指标。
                </p>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
};

export default App;

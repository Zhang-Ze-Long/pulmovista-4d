
import React from 'react';
import { Activity, Thermometer, AlertTriangle, FileUp, Play, Pause, RefreshCcw } from 'lucide-react';

export const COLORS = {
  left: '#3b82f6', // blue
  right: '#ef4444', // red
  coronal: '#10b981', // emerald
  heatmap: {
    low: '#1e3a8a',
    high: '#fde047'
  }
};

export const UI_ICONS = {
  Activity: <Activity size={18} />,
  Thermometer: <Thermometer size={18} />,
  Alert: <AlertTriangle size={18} />,
  Upload: <FileUp size={18} />,
  Play: <Play size={18} />,
  Pause: <Pause size={18} />,
  Reset: <RefreshCcw size={18} />
};

export const MASK_SIZE = 256;
export const SAMPLE_RATE = 3; // 3 frames per second

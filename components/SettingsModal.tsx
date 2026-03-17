import React, { useState, useEffect } from 'react';
import { X, Save, Server, Sliders, Users, RefreshCw, RotateCcw } from 'lucide-react';
import { AppSettings } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  title?: string;
  onReset?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, title = "配置参数", onReset }) => {
  const [formData, setFormData] = useState<AppSettings>(settings);

  useEffect(() => {
    if (isOpen) {
      setFormData(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleSave = () => {
    onSave(formData);
    onClose();
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
      onClose();
    }
  };

  const setLocalhost = (type: 'ip' | 'name') => {
      if (type === 'ip') {
          setFormData({ ...formData, backendUrl: 'http://127.0.0.1:5001' });
      } else {
          setFormData({ ...formData, backendUrl: 'http://localhost:5001' });
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Sliders size={18} />
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Backend URL */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
              <Server size={14} />
              Python 后端地址
            </label>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={formData.backendUrl}
                    onChange={(e) => setFormData({ ...formData, backendUrl: e.target.value })}
                    placeholder="http://127.0.0.1:5001"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-sm font-mono"
                />
            </div>
            <div className="flex gap-2 text-xs text-gray-500">
                <span className="text-gray-400">快速设置:</span>
                <button onClick={() => setFormData({ ...formData, backendUrl: '/api' })} className="hover:text-blue-600 underline font-medium text-blue-600">默认 (推荐)</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setLocalhost('ip')} className="hover:text-blue-600 underline">127.0.0.1</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => setLocalhost('name')} className="hover:text-blue-600 underline">localhost</button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Num Speakers */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                <Users size={14} />
                预计人数 (音色数)
              </label>
              <div className="flex gap-2">
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={formData.numSpeakers}
                    onChange={(e) => setFormData({ ...formData, numSpeakers: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                  />
                  {formData.numSpeakers === 0 && (
                      <span className="flex items-center px-3 bg-blue-100 text-blue-700 rounded text-sm font-medium whitespace-nowrap">
                          自动检测
                      </span>
                  )}
              </div>
              <p className="text-xs text-gray-500">设为 0 可自动检测人数 (2-5人)</p>
            </div>

            {/* Min Segment Duration */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                最小片段时长 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={formData.minSegmentDuration}
                onChange={(e) => setFormData({ ...formData, minSegmentDuration: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <p className="text-xs text-gray-500">忽略短于此时长的片段</p>
            </div>

            {/* Silence Threshold */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                静音阈值 (RMS)
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="1.0"
                value={formData.silenceThreshold || 0.005}
                onChange={(e) => setFormData({ ...formData, silenceThreshold: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <p className="text-xs text-gray-500">能量低于此值视为静音 (默认 0.005)</p>
            </div>

            {/* Min Silence Duration */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                最小静音时长 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                value={formData.minSilenceDuration !== undefined ? formData.minSilenceDuration : 0.5}
                onChange={(e) => setFormData({ ...formData, minSilenceDuration: parseFloat(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <p className="text-xs text-gray-500">短于此时长的静音将被忽略 (视为连续语音)</p>
            </div>

            {/* Smoothing Width */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                平滑窗口大小 (Smoothing Width)
              </label>
              <input
                type="number"
                step="2"
                min="1"
                max="15"
                value={formData.smoothingWidth || 5}
                onChange={(e) => {
                    const val = parseInt(e.target.value);
                    // Ensure odd number
                    setFormData({ ...formData, smoothingWidth: val % 2 === 0 ? val + 1 : val });
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <p className="text-xs text-gray-500">中值滤波窗口大小 (奇数)，越大越平滑</p>
            </div>

            {/* Sample Rate */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700">
                采样率 (Sample Rate)
              </label>
              <select
                value={formData.sampleRate || 16000}
                onChange={(e) => setFormData({ ...formData, sampleRate: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
              >
                <option value="8000">8000 Hz (电话音质)</option>
                <option value="16000">16000 Hz (默认, 推荐)</option>
                <option value="22050">22050 Hz (广播音质)</option>
                <option value="44100">44100 Hz (CD 音质)</option>
              </select>
              <p className="text-xs text-gray-500">影响分析的频率范围和速度</p>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-xs text-yellow-800 space-y-1">
            <p className="font-semibold flex items-center gap-1">
                <RefreshCw size={12} />
                连接问题排查:
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
                <li>确保 Python 服务正在运行: <code>python backend/server.py</code></li>
                <li>如果网页是 HTTPS，浏览器可能会拦截 HTTP 请求 (Mixed Content)。请尝试点击浏览器地址栏的"不安全"图标允许。</li>
                <li>尝试切换 127.0.0.1 或 localhost。</li>
            </ul>
          </div>
        </div>

        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-between">
          {onReset ? (
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            >
              <RotateCcw size={16} />
              恢复默认配置
            </button>
          ) : (
            <div></div>
          )}
          <button
            onClick={handleSave}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Save size={16} />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
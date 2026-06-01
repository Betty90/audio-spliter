import React, { useState, useEffect } from 'react';
import { X, Save, Sliders, Users, RotateCcw } from 'lucide-react';
import { AppSettings } from '../types';

const DEFAULT_SPEAKER_LABELS = { '音色1': '客服', '音色2': '客户' };

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: AppSettings;
  onSave: (newSettings: AppSettings) => void;
  title?: string;
  onReset?: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, settings, onSave, title = "配置参数", onReset }) => {
  const [formData, setFormData] = useState<AppSettings>({ ...settings, speakerLabels: settings.speakerLabels || DEFAULT_SPEAKER_LABELS });
  const fieldClass = 'space-y-1.5';
  const labelClass = 'flex items-center gap-1.5 text-[12px] font-semibold leading-none text-slate-700';
  const controlClass = 'h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[12px] font-medium text-slate-800 outline-none transition-colors focus:border-[var(--psbc-green)] focus:ring-2 focus:ring-[var(--psbc-green-soft)]';
  const hintClass = 'text-[10.5px] leading-snug text-slate-500';

  useEffect(() => {
    if (isOpen) {
      setFormData({ ...settings, speakerLabels: settings.speakerLabels || DEFAULT_SPEAKER_LABELS });
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

  const speakerCount = Math.max(1, formData.numSpeakers || Object.keys(formData.speakerLabels || {}).length || 2);
  const speakerKeys = Array.from({ length: speakerCount }, (_, index) => `音色${index + 1}`);
  const updateSpeakerLabel = (speaker: string, label: string) => {
    setFormData({
      ...formData,
      speakerLabels: {
        ...(formData.speakerLabels || {}),
        [speaker]: label,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 backdrop-blur-sm">
      <div className="w-full max-w-[560px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold leading-none text-slate-900">
            <Sliders size={16} />
            {title}
          </h2>
          <button onClick={onClose} className="icon-button h-7 w-7 text-slate-400 hover:text-slate-700" title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-x-4 gap-y-3.5">
            <div className={fieldClass}>
              <label className={labelClass}>
                <Users size={13} />
                预计人数 (音色数)
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  max="10"
                  value={formData.numSpeakers}
                  onChange={(e) => setFormData({ ...formData, numSpeakers: parseInt(e.target.value) })}
                  className={controlClass}
                />
                {formData.numSpeakers === 0 && (
                  <span className="flex h-8 shrink-0 items-center rounded-md bg-[var(--psbc-green-soft)] px-2.5 text-[11px] font-semibold text-[var(--psbc-green)]">
                    自动检测
                  </span>
                )}
              </div>
              <p className={hintClass}>设为 0 可自动检测人数 (2-5人)</p>
            </div>

            <div className={fieldClass}>
              <label className={labelClass}>
                最小片段时长 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={formData.minSegmentDuration}
                onChange={(e) => setFormData({ ...formData, minSegmentDuration: parseFloat(e.target.value) })}
                className={controlClass}
              />
              <p className={hintClass}>忽略短于此时长的片段</p>
            </div>

            <div className={fieldClass}>
              <label className={labelClass}>
                静音阈值 (RMS)
              </label>
              <input
                type="number"
                step="0.001"
                min="0.001"
                max="1.0"
                value={formData.silenceThreshold || 0.005}
                onChange={(e) => setFormData({ ...formData, silenceThreshold: parseFloat(e.target.value) })}
                className={controlClass}
              />
              <p className={hintClass}>能量低于此值视为静音 (默认 0.005)</p>
            </div>

            <div className={fieldClass}>
              <label className={labelClass}>
                最小静音时长 (秒)
              </label>
              <input
                type="number"
                step="0.1"
                min="0.0"
                value={formData.minSilenceDuration !== undefined ? formData.minSilenceDuration : 0.5}
                onChange={(e) => setFormData({ ...formData, minSilenceDuration: parseFloat(e.target.value) })}
                className={controlClass}
              />
              <p className={hintClass}>短于此时长的静音将被忽略 (视为连续语音)</p>
            </div>

            <div className={fieldClass}>
              <label className={labelClass}>
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
                    setFormData({ ...formData, smoothingWidth: val % 2 === 0 ? val + 1 : val });
                }}
                className={controlClass}
              />
              <p className={hintClass}>中值滤波窗口大小 (奇数)，越大越平滑</p>
            </div>

            <div className={fieldClass}>
              <label className={labelClass}>
                采样率 (Sample Rate)
              </label>
              <select
                value={formData.sampleRate || 16000}
                onChange={(e) => setFormData({ ...formData, sampleRate: parseInt(e.target.value) })}
                className={controlClass}
              >
                <option value="8000">8000 Hz (电话音质)</option>
                <option value="16000">16000 Hz (默认, 推荐)</option>
                <option value="22050">22050 Hz (广播音质)</option>
                <option value="44100">44100 Hz (CD 音质)</option>
              </select>
              <p className={hintClass}>影响分析的频率范围和速度</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="mb-2 flex items-center justify-between">
              <label className={labelClass}>音色映射</label>
              <span className="text-[10.5px] font-medium text-slate-500">表格优先显示映射名</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {speakerKeys.map((speaker) => (
                <div key={speaker} className="flex items-center gap-2">
                  <span className="w-12 shrink-0 text-[11px] font-semibold text-slate-500">{speaker}</span>
                  <input
                    value={formData.speakerLabels?.[speaker] || ''}
                    onChange={(e) => updateSpeakerLabel(speaker, e.target.value)}
                    className={controlClass}
                    placeholder="映射名"
                  />
                </div>
              ))}
            </div>
            <p className={`${hintClass} mt-2`}>默认音色1为客服，音色2为客户；文件专属配置可覆盖全局映射。</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3">
          {onReset ? (
            <button
              onClick={handleReset}
              className="flex h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 text-[12px] font-semibold text-slate-600 transition-colors hover:bg-slate-100"
            >
              <RotateCcw size={13} />
              恢复默认配置
            </button>
          ) : (
            <div></div>
          )}
          <button
            onClick={handleSave}
            className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--psbc-green)] px-3.5 text-[12px] font-semibold text-white shadow-sm transition-colors hover:bg-[var(--psbc-green-dark)]"
          >
            <Save size={13} />
            保存设置
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;

import React, { useState } from 'react';
import { Activity, Play, Save, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { AudioSegment, AppSettings } from '../types';
import { analyzeAudio } from '../services/apiService';

interface LabModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSegments: AudioSegment[];
  audioFile: File | null;
  settings: AppSettings;
}

interface BenchmarkResult {
  der: number; // Diarization Error Rate (simplified)
  missed: number; // Missed speech duration
  falseAlarm: number; // False alarm duration
  speakerConfusion: number; // Duration of wrong speaker
  totalDuration: number;
}

const LabModal: React.FC<LabModalProps> = ({ isOpen, onClose, currentSegments, audioFile, settings }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [autoSegments, setAutoSegments] = useState<AudioSegment[]>([]);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const calculateOverlap = (seg1: AudioSegment, seg2: AudioSegment) => {
    const start = Math.max(seg1.start, seg2.start);
    const end = Math.min(seg1.end, seg2.end);
    return Math.max(0, end - start);
  };

  const runBenchmark = async () => {
    if (!audioFile) {
      setError("请先上传音频文件");
      return;
    }
    
    setIsRunning(true);
    setError(null);
    setResult(null);

    try {
      // 1. Re-run analysis (simulate "Auto" run)
      // We use the current settings from the main app
      const newSegments = await analyzeAudio(audioFile, settings);
      setAutoSegments(newSegments);

      // 2. Compare newSegments (Hypothesis) with currentSegments (Ground Truth)
      // Simplified DER calculation
      let totalDuration = 0;
      let correctDuration = 0;
      let missedDuration = 0;
      let falseAlarmDuration = 0;
      let confusionDuration = 0;

      // Calculate total duration of Ground Truth
      currentSegments.forEach(seg => {
        totalDuration += (seg.end - seg.start);
      });

      // This is a very simplified O(N^2) comparison. 
      // For a real DER, we need to align speakers (Hungarian algorithm).
      // Here we assume speaker labels might not match, so we try to map them.
      
      // Step 2a: Map speakers
      const gtSpeakers = Array.from(new Set(currentSegments.map(s => s.speaker))) as string[];
      const hypSpeakers = Array.from(new Set(newSegments.map(s => s.speaker))) as string[];
      
      // Simple mapping: Find best match for each GT speaker
      const speakerMap = new Map<string, string>(); // GT -> Hyp
      
      gtSpeakers.forEach(gtSpk => {
          let bestMatch: string | null = null;
          let maxOverlap = 0;
          
          hypSpeakers.forEach(hypSpk => {
              let overlap = 0;
              currentSegments.filter(s => s.speaker === gtSpk).forEach(gtSeg => {
                  newSegments.filter(s => s.speaker === hypSpk).forEach(hypSeg => {
                      overlap += calculateOverlap(gtSeg, hypSeg);
                  });
              });
              if (overlap > maxOverlap) {
                  maxOverlap = overlap;
                  bestMatch = hypSpk;
              }
          });
          
          if (bestMatch) {
              speakerMap.set(gtSpk, bestMatch);
          }
      });

      // Step 2b: Calculate errors
      // Iterate over time (simplified: just check segment overlaps)
      
      // Check for correct and confusion
      currentSegments.forEach(gtSeg => {
          const mappedHypSpeaker = speakerMap.get(gtSeg.speaker);
          let segCorrect = 0;
          
          // Find overlapping hyp segments
          newSegments.forEach(hypSeg => {
              const overlap = calculateOverlap(gtSeg, hypSeg);
              if (overlap > 0) {
                  if (hypSeg.speaker === mappedHypSpeaker) {
                      segCorrect += overlap;
                  } else {
                      confusionDuration += overlap;
                  }
              }
          });
          
          correctDuration += segCorrect;
          missedDuration += Math.max(0, (gtSeg.end - gtSeg.start) - segCorrect - confusionDuration); // Rough estimate
      });

      // Check for False Alarm (Hyp segments that don't overlap with any GT)
      newSegments.forEach(hypSeg => {
          let hasOverlap = false;
          currentSegments.forEach(gtSeg => {
              if (calculateOverlap(hypSeg, gtSeg) > 0) hasOverlap = true;
          });
          if (!hasOverlap) {
              falseAlarmDuration += (hypSeg.end - hypSeg.start);
          }
      });

      const der = (missedDuration + falseAlarmDuration + confusionDuration) / totalDuration;

      setResult({
          der: Math.min(1.0, der), // Cap at 100%
          missed: missedDuration,
          falseAlarm: falseAlarmDuration,
          speakerConfusion: confusionDuration,
          totalDuration
      });

    } catch (err) {
      setError("运行失败: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
            <Activity size={18} />
            算法验证实验室 (Benchmark Lab)
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Activity size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <div className="bg-blue-50 p-4 rounded-lg text-sm text-blue-800 mb-6">
            <h3 className="font-bold mb-2 flex items-center gap-2">
                <AlertCircle size={16}/>
                如何使用?
            </h3>
            <ol className="list-decimal pl-5 space-y-1">
                <li>首先上传音频，并使用下方的编辑器<b>手动修正</b>所有片段（作为标准答案）。</li>
                <li>点击“运行基准测试”，系统将使用当前设置重新运行算法。</li>
                <li>系统将对比“自动运行结果”与“您的手动修正”，计算准确率。</li>
                <li>您可以调整设置并重复测试，直到获得最佳效果。</li>
            </ol>
          </div>

          {error && (
              <div className="bg-red-50 text-red-600 p-3 rounded mb-4 text-sm">
                  {error}
              </div>
          )}

          <div className="flex gap-4 mb-6">
              <button
                onClick={runBenchmark}
                disabled={isRunning || !audioFile}
                className={`flex-1 py-3 rounded-lg font-medium flex items-center justify-center gap-2 text-white transition-colors ${
                    isRunning || !audioFile ? 'bg-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                  {isRunning ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                        正在分析...
                      </>
                  ) : (
                      <>
                        <Play size={18} />
                        运行基准测试 (Run Benchmark)
                      </>
                  )}
              </button>
          </div>

          {result && (
              <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-50 p-4 rounded-lg text-center">
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Diarization Error Rate</div>
                          <div className={`text-3xl font-bold ${result.der < 0.2 ? 'text-green-600' : result.der < 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {(result.der * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-400 mt-1">越低越好</div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-lg text-center">
                          <div className="text-gray-500 text-xs uppercase tracking-wide mb-1">Accuracy</div>
                          <div className={`text-3xl font-bold ${result.der < 0.2 ? 'text-green-600' : result.der < 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                              {((1 - result.der) * 100).toFixed(1)}%
                          </div>
                          <div className="text-xs text-gray-400 mt-1">越高越好</div>
                      </div>
                  </div>

                  <div className="space-y-2">
                      <h4 className="font-medium text-gray-700">详细指标 (总时长: {result.totalDuration.toFixed(1)}s)</h4>
                      <div className="relative h-8 bg-gray-200 rounded-full overflow-hidden flex">
                          {/* Visual bar chart */}
                          <div style={{ width: `${(1 - result.der) * 100}%` }} className="bg-green-500 h-full" title="Correct" />
                          <div style={{ width: `${(result.missed / result.totalDuration) * 100}%` }} className="bg-red-400 h-full" title="Missed" />
                          <div style={{ width: `${(result.falseAlarm / result.totalDuration) * 100}%` }} className="bg-orange-400 h-full" title="False Alarm" />
                          <div style={{ width: `${(result.speakerConfusion / result.totalDuration) * 100}%` }} className="bg-purple-400 h-full" title="Confusion" />
                      </div>
                      <div className="flex justify-between text-xs text-gray-500 px-1">
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full"></div> 正确</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-400 rounded-full"></div> 漏检 (Missed)</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-orange-400 rounded-full"></div> 误检 (False Alarm)</span>
                          <span className="flex items-center gap-1"><div className="w-2 h-2 bg-purple-400 rounded-full"></div> 混淆 (Confusion)</span>
                      </div>
                  </div>
                  
                  <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-700 mb-2">自动检测结果预览:</h4>
                      <div className="text-xs text-gray-600 max-h-32 overflow-y-auto font-mono">
                          {autoSegments.map((s, i) => (
                              <div key={i}>{s.start.toFixed(2)}s - {s.end.toFixed(2)}s: {s.speaker}</div>
                          ))}
                      </div>
                  </div>
              </div>
          )}
        </div>
        
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end">
            <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50">
                关闭
            </button>
        </div>
      </div>
    </div>
  );
};

export default LabModal;

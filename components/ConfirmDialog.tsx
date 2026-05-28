import React from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmConfig {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  config: ConfirmConfig;
  onClose: () => void;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({ config, onClose }) => {
  if (!config.isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4 text-amber-600">
            <AlertTriangle size={24} />
            <h3 className="text-lg font-semibold text-gray-900">{config.title}</h3>
          </div>
          <p className="text-gray-600 text-sm mb-6">{config.message}</p>
          <div className="flex justify-end gap-3">
            <button 
              onClick={onClose} 
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              {config.cancelText || '取消'}
            </button>
            <button 
              onClick={() => { 
                config.onConfirm(); 
                onClose(); 
              }} 
              className="px-4 py-2 text-sm font-medium text-white bg-[var(--psbc-green)] hover:bg-[var(--psbc-green-dark)] rounded-lg transition-colors"
            >
              {config.confirmText || '确定'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;

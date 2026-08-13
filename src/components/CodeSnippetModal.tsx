import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Code2, Copy, Check } from 'lucide-react';
import { CodeTemplateResponse } from '../types';

interface CodeSnippetModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: string;
  sourceFormat?: string;
  targetFormat?: string;
}

export const CodeSnippetModal: React.FC<CodeSnippetModalProps> = ({
  isOpen,
  onClose,
  category = 'image',
  sourceFormat = 'png',
  targetFormat = 'jpg',
}) => {
  const [activeTab, setActiveTab] = useState<'python' | 'node' | 'html'>('python');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [codeData, setCodeData] = useState<CodeTemplateResponse['code'] | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);

    fetch('/api/code-template', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, sourceFormat, targetFormat }),
    })
      .then((res) => res.json())
      .then((data: CodeTemplateResponse) => {
        setCodeData(data.code);
        setLoading(false);
      })
      .catch(() => {
        // Fallback local code templates
        setCodeData({
          python: `# Python Code (PIL/Pillow)\nfrom PIL import Image\n\nimg = Image.open('input.${sourceFormat}')\nimg.save('output.${targetFormat}')`,
          node: `// Node.js Code\nimport sharp from 'sharp';\n\nawait sharp('input.${sourceFormat}').toFile('output.${targetFormat}');`,
          html: `<!-- HTML5 + Canvas JS -->\n<script>\nconst canvas = document.createElement('canvas');\n</script>`,
        });
        setLoading(false);
      });
  }, [isOpen, category, sourceFormat, targetFormat]);

  const currentCode = codeData ? codeData[activeTab] : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-950/75 backdrop-blur-md"
          />

          {/* Modal Container */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 15 }}
            transition={{ type: 'spring', stiffness: 350, damping: 28 }}
            className="relative z-10 w-full max-w-3xl bg-slate-900 text-white rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden glass-card flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <Code2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">
                    Developer API & Code Snippets
                  </h3>
                  <p className="text-xs text-slate-400">
                    Programmatic <span className="font-bold text-indigo-400 uppercase">{sourceFormat}</span> → <span className="font-bold text-indigo-400 uppercase">{targetFormat}</span> conversion code templates
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Language Tabs & Copy Action */}
            <div className="flex items-center justify-between px-6 py-2.5 border-b border-white/10 bg-slate-950/60">
              <div className="flex gap-2">
                <button
                  onClick={() => setActiveTab('python')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'python'
                      ? 'bg-blue-600 text-white shadow-[0_0_12px_rgba(37,99,235,0.4)]'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  🐍 Python
                </button>
                <button
                  onClick={() => setActiveTab('node')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'node'
                      ? 'bg-emerald-600 text-white shadow-[0_0_12px_rgba(5,150,105,0.4)]'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  🟢 Node.js
                </button>
                <button
                  onClick={() => setActiveTab('html')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'html'
                      ? 'bg-orange-600 text-white shadow-[0_0_12px_rgba(234,88,12,0.4)]'
                      : 'text-slate-400 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  🌐 HTML5 / JS
                </button>
              </div>

              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleCopy}
                className="px-3.5 py-1.5 rounded-xl border border-white/15 bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors shadow-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Snippet
                  </>
                )}
              </motion.button>
            </div>

            {/* Code Output Terminal Block */}
            <div className="p-6 overflow-y-auto flex-1 bg-slate-950 text-emerald-400 font-mono text-xs leading-relaxed border-b border-white/10">
              {loading ? (
                <div className="text-slate-500 py-12 text-center animate-pulse">Generating runnable code snippet...</div>
              ) : (
                <pre className="whitespace-pre-wrap">{currentCode}</pre>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 bg-slate-900/80 text-[11px] text-slate-400 flex justify-between items-center">
              <span>FormatShift Developer Suite</span>
              <button
                onClick={onClose}
                className="font-bold text-indigo-400 hover:underline cursor-pointer"
              >
                Close
              </button>
            </div>

          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

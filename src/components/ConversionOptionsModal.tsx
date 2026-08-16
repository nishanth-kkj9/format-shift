import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Sliders,
  Check,
  ShieldCheck,
  Share2,
  Activity,
} from "lucide-react";
import {
  ConversionItem,
  ImageConversionOptions,
  AudioConversionOptions,
  VideoConversionOptions,
  DataConversionOptions,
  SocialMediaPreset,
  SpectrumStyle,
  SpectrumTheme,
} from "../types";
import { SOCIAL_PRESETS } from "../utils/converter";

interface ConversionOptionsModalProps {
  item: ConversionItem;
  isOpen: boolean;
  onClose: () => void;
  onSaveOptions: (itemId: string, updatedOptions: ConversionItem["options"]) => void;
}

export const ConversionOptionsModal: React.FC<ConversionOptionsModalProps> = ({
  item,
  isOpen,
  onClose,
  onSaveOptions,
}) => {
  const [imageOpts, setImageOpts] = useState<ImageConversionOptions>(
    item.options.image || {
      quality: 85,
      maintainAspectRatio: true,
      bgColor: "#0f172a",
      grayscale: false,
      rotation: 0,
      flipHorizontal: false,
      flipVertical: false,
      socialPreset: "custom",
      stripExif: true,
    }
  );

  const [audioOpts, setAudioOpts] = useState<AudioConversionOptions>(
    item.options.audio || {
      bitrate: "192k",
      sampleRate: 44100,
      channels: 2,
      volume: 100,
      spectrumVisualizer: false,
      spectrumStyle: "bars",
      spectrumTheme: "neon-lime",
    }
  );

  const [videoOpts, setVideoOpts] = useState<VideoConversionOptions>(
    item.options.video || {
      resolution: "original",
      fps: 30,
      muteAudio: false,
    }
  );

  const [dataOpts, setDataOpts] = useState<DataConversionOptions>(
    item.options.data || {
      delimiter: ",",
      prettyPrint: true,
      indentSpaces: 2,
    }
  );

  const handleSave = () => {
    onSaveOptions(item.id, {
      image: item.category === "image" ? imageOpts : item.options.image,
      audio: item.category === "audio" ? audioOpts : item.options.audio,
      video: item.category === "video" ? videoOpts : item.options.video,
      data: item.category === "data" || item.category === "document" ? dataOpts : item.options.data,
    });
    onClose();
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
            transition={{ type: "spring", stiffness: 350, damping: 28 }}
            className="relative z-10 w-full max-w-lg bg-slate-900 text-white rounded-3xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] border border-white/15 overflow-hidden glass-card flex flex-col max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-slate-900/80">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <span>Format Fine-Tuning</span>
                  </h3>
                  <p className="text-xs text-indigo-300 font-medium truncate max-w-[240px]">{item.name}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
              {/* IMAGE OPTIONS */}
              {item.category === "image" && (
                <div className="space-y-5">
                  {/* Social Media Resizer Presets */}
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-400/30 space-y-2">
                    <label className="text-xs font-bold text-indigo-200 flex items-center gap-2">
                      <Share2 className="w-4 h-4 text-indigo-400" />
                      Social Media Resizer Presets
                    </label>
                    <select
                      value={imageOpts.socialPreset || "custom"}
                      onChange={(e) => {
                        const preset = e.target.value as SocialMediaPreset;
                        if (preset !== "custom" && SOCIAL_PRESETS[preset]) {
                          const dim = SOCIAL_PRESETS[preset];
                          setImageOpts({
                            ...imageOpts,
                            socialPreset: preset,
                            maxWidth: dim.w,
                            maxHeight: dim.h,
                          });
                        } else {
                          setImageOpts({ ...imageOpts, socialPreset: "custom" });
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-bold bg-slate-950 border border-indigo-500/40 text-white cursor-pointer focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="custom">⚙️ Custom Aspect / Original Dimensions</option>
                      <option value="instagram-square">📸 Instagram Square (1080 × 1080)</option>
                      <option value="instagram-story">📱 Instagram Story / Reel (1080 × 1920)</option>
                      <option value="youtube-thumb">🎬 YouTube Thumbnail (1280 × 720)</option>
                      <option value="twitter-header">🐦 Twitter / X Header (1500 × 500)</option>
                      <option value="linkedin-banner">💼 LinkedIn Banner (1584 × 396)</option>
                      <option value="facebook-cover">🌐 Facebook Cover (820 × 312)</option>
                      <option value="favicon">⚡ Favicon App Icon (32 × 32)</option>
                    </select>
                  </div>

                  {/* Quality Slider */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-bold text-slate-200">Image Quality / Compression</label>
                      <span className="text-xs font-extrabold text-indigo-400 font-mono px-2 py-0.5 rounded bg-indigo-500/20 border border-indigo-400/30">
                        {imageOpts.quality}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="100"
                      value={imageOpts.quality}
                      onChange={(e) => setImageOpts({ ...imageOpts, quality: parseInt(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                    />
                  </div>

                  {/* EXIF Privacy Cleaner Shield Toggle */}
                  <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-start gap-3">
                    <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={imageOpts.stripExif !== false}
                          onChange={(e) => setImageOpts({ ...imageOpts, stripExif: e.target.checked })}
                          className="rounded accent-emerald-500 w-4 h-4 cursor-pointer"
                        />
                        <span className="text-xs font-bold text-emerald-300">
                          EXIF Privacy Metadata Cleaner Active
                        </span>
                      </label>
                      <p className="text-[11px] text-slate-300/80 leading-relaxed">
                        Strips camera serial numbers, GPS location coordinates, exposure data, and capture
                        timestamp metadata during conversion.
                      </p>
                    </div>
                  </div>

                  {/* Background Color Fill */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">
                      Background Color (for social padding / transparent PNG → JPEG)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="color"
                        value={imageOpts.bgColor || "#0f172a"}
                        onChange={(e) => setImageOpts({ ...imageOpts, bgColor: e.target.value })}
                        className="w-9 h-9 rounded-xl border border-white/20 bg-transparent cursor-pointer p-0.5"
                      />
                      <span className="text-xs font-mono font-bold text-slate-300">{imageOpts.bgColor}</span>
                      <div className="flex gap-1.5 ml-auto">
                        {["#0f172a", "#ffffff", "#000000", "#4f46e5"].map((hex) => (
                          <button
                            key={hex}
                            type="button"
                            onClick={() => setImageOpts({ ...imageOpts, bgColor: hex })}
                            className="w-6 h-6 rounded-lg border border-white/30 cursor-pointer hover:scale-110 transition-transform"
                            style={{ backgroundColor: hex }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Custom Dimensions Max Bounds */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <label className="text-xs font-bold text-slate-200 block">
                      Resize Max Dimensions (Pixels)
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1 font-semibold">
                          Max Width (px)
                        </span>
                        <input
                          type="number"
                          placeholder="e.g. 1920"
                          value={imageOpts.maxWidth || ""}
                          onChange={(e) =>
                            setImageOpts({
                              ...imageOpts,
                              socialPreset: "custom",
                              maxWidth: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-xl text-xs font-mono border border-white/15 bg-slate-950 text-white"
                        />
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-400 block mb-1 font-semibold">
                          Max Height (px)
                        </span>
                        <input
                          type="number"
                          placeholder="e.g. 1080"
                          value={imageOpts.maxHeight || ""}
                          onChange={(e) =>
                            setImageOpts({
                              ...imageOpts,
                              socialPreset: "custom",
                              maxHeight: e.target.value ? parseInt(e.target.value) : undefined,
                            })
                          }
                          className="w-full px-3 py-1.5 rounded-xl text-xs font-mono border border-white/15 bg-slate-950 text-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Transform / Rotate / Flip Tools */}
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-3">
                    <label className="text-xs font-bold text-slate-200 block">Image Transformations</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setImageOpts({
                            ...imageOpts,
                            rotation: ((imageOpts.rotation || 0) + 90) % 360,
                          })
                        }
                        className="px-3 py-1.5 rounded-xl border border-white/15 bg-white/5 text-xs font-bold text-slate-200 hover:bg-white/15 flex items-center gap-1.5 cursor-pointer"
                      >
                        <RotateCw className="w-3.5 h-3.5 text-indigo-400" /> Rotate 90° (
                        {imageOpts.rotation || 0}°)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setImageOpts({
                            ...imageOpts,
                            flipHorizontal: !imageOpts.flipHorizontal,
                          })
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                          imageOpts.flipHorizontal
                            ? "bg-indigo-600 text-white border-indigo-400"
                            : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/15"
                        }`}
                      >
                        <FlipHorizontal className="w-3.5 h-3.5" /> Flip Horizontal
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setImageOpts({
                            ...imageOpts,
                            flipVertical: !imageOpts.flipVertical,
                          })
                        }
                        className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                          imageOpts.flipVertical
                            ? "bg-indigo-600 text-white border-indigo-400"
                            : "border-white/15 bg-white/5 text-slate-200 hover:bg-white/15"
                        }`}
                      >
                        <FlipVertical className="w-3.5 h-3.5" /> Flip Vertical
                      </button>
                    </div>
                  </div>

                  {/* Grayscale Toggle */}
                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-2xl bg-white/5 border border-white/10">
                    <input
                      type="checkbox"
                      checked={imageOpts.grayscale || false}
                      onChange={(e) => setImageOpts({ ...imageOpts, grayscale: e.target.checked })}
                      className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-200">
                      Convert to Grayscale (Black & White filter)
                    </span>
                  </label>
                </div>
              )}

              {/* AUDIO OPTIONS */}
              {item.category === "audio" && (
                <div className="space-y-5">
                  {/* Audio Spectrum Visualizer Section */}
                  <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-400/30 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-indigo-300 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                        Audio Spectrum Video Generator
                      </label>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            audioOpts.spectrumVisualizer ||
                            item.targetFormat === "mp4" ||
                            item.targetFormat === "webm"
                          }
                          onChange={(e) =>
                            setAudioOpts({ ...audioOpts, spectrumVisualizer: e.target.checked })
                          }
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                      </label>
                    </div>

                    <p className="text-[11px] text-slate-300/80 leading-relaxed">
                      Converts audio into an animated HD video soundwave (`MP4` / `WEBM`) ready for social
                      media!
                    </p>

                    {(audioOpts.spectrumVisualizer ||
                      item.targetFormat === "mp4" ||
                      item.targetFormat === "webm") && (
                      <div className="pt-2 grid grid-cols-2 gap-3 border-t border-indigo-500/20">
                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Visualizer Style
                          </label>
                          <select
                            value={audioOpts.spectrumStyle || "bars"}
                            onChange={(e) =>
                              setAudioOpts({
                                ...audioOpts,
                                spectrumStyle: e.target.value as SpectrumStyle,
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-950 border border-indigo-500/40 text-white cursor-pointer"
                          >
                            <option value="bars">📊 Frequency Equalizer Bars</option>
                            <option value="wave">〰️ Oscilloscope Waveform</option>
                            <option value="radial">⭕ Radial Soundwave Ring</option>
                            <option value="particles">✨ Reactive Particle Field</option>
                          </select>
                        </div>

                        <div>
                          <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                            Color Theme
                          </label>
                          <select
                            value={audioOpts.spectrumTheme || "neon-lime"}
                            onChange={(e) =>
                              setAudioOpts({
                                ...audioOpts,
                                spectrumTheme: e.target.value as SpectrumTheme,
                              })
                            }
                            className="w-full px-2.5 py-1.5 rounded-xl text-xs bg-slate-950 border border-indigo-500/40 text-white cursor-pointer"
                          >
                            <option value="neon-lime">🟢 Neon Lime Reactor</option>
                            <option value="indigo-violet">🔮 Indigo & Violet</option>
                            <option value="cyan-emerald">💎 Cyan & Emerald</option>
                            <option value="sunset-fire">🔥 Sunset Fire</option>
                            <option value="matrix-green">⚡ Matrix Cyber Green</option>
                            <option value="aurora">🌌 Aurora Borealis</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">Target Audio Bitrate</label>
                    <div className="grid grid-cols-4 gap-2">
                      {["128k", "192k", "256k", "320k"].map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setAudioOpts({ ...audioOpts, bitrate: b as any })}
                          className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            audioOpts.bitrate === b
                              ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {b}
                        </button>
                      ))}
                    </div>
                    {(audioOpts.spectrumVisualizer ||
                      item.targetFormat === "mp4" ||
                      item.targetFormat === "webm") && (
                      <p className="text-[11px] text-slate-300/80 leading-relaxed">
                        Spectrum video output encodes audio with the browser's native codec (bitrate/sample
                        rate are set by the browser, not this control).
                      </p>
                    )}
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">
                      Volume Boost / Normalization
                    </label>
                    <div className="flex justify-between items-center mb-1 text-xs">
                      <span className="text-slate-400 font-semibold">Output Gain</span>
                      <span className="font-mono font-bold text-indigo-400">{audioOpts.volume}%</span>
                    </div>
                    <input
                      type="range"
                      min="50"
                      max="200"
                      value={audioOpts.volume}
                      onChange={(e) => setAudioOpts({ ...audioOpts, volume: parseInt(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
                    />
                  </div>
                </div>
              )}

              {/* VIDEO OPTIONS */}
              {item.category === "video" && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">Target Resolution</label>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Original", val: "original" },
                        { label: "1080p Full HD", val: "1080p" },
                        { label: "720p HD", val: "720p" },
                        { label: "480p SD", val: "480p" },
                      ].map((r) => (
                        <button
                          key={r.val}
                          type="button"
                          onClick={() => setVideoOpts({ ...videoOpts, resolution: r.val as any })}
                          className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            videoOpts.resolution === r.val
                              ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">Target Frame Rate (FPS)</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[24, 30, 60].map((fps) => (
                        <button
                          key={fps}
                          type="button"
                          onClick={() => setVideoOpts({ ...videoOpts, fps: fps as any })}
                          className={`py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            videoOpts.fps === fps
                              ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {fps} FPS
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer p-3 rounded-2xl bg-white/5 border border-white/10">
                    <input
                      type="checkbox"
                      checked={videoOpts.muteAudio}
                      onChange={(e) => setVideoOpts({ ...videoOpts, muteAudio: e.target.checked })}
                      className="rounded accent-indigo-500 w-4 h-4 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-200">
                      Mute audio track (Mute audio output)
                    </span>
                  </label>
                </div>
              )}

              {/* DATA & DOCUMENT OPTIONS */}
              {(item.category === "data" || item.category === "document") && (
                <div className="space-y-5">
                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">CSV Delimiter Separator</label>
                    <div className="flex gap-2">
                      {[
                        { label: "Comma (,)", val: "," },
                        { label: "Semicolon (;)", val: ";" },
                        { label: "Tab (\\t)", val: "\t" },
                      ].map((d) => (
                        <button
                          key={d.val}
                          type="button"
                          onClick={() => setDataOpts({ ...dataOpts, delimiter: d.val as "," | ";" | "\t" })}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            dataOpts.delimiter === d.val
                              ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                    <label className="text-xs font-bold text-slate-200 block">JSON / Code Indentation</label>
                    <div className="flex gap-2">
                      {[2, 4].map((spaces) => (
                        <button
                          key={spaces}
                          type="button"
                          onClick={() => setDataOpts({ ...dataOpts, indentSpaces: spaces as 2 | 4 })}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            dataOpts.indentSpaces === spaces
                              ? "bg-indigo-600 text-white border-indigo-400 shadow-md"
                              : "border-white/15 bg-white/5 text-slate-300 hover:bg-white/15"
                          }`}
                        >
                          {spaces} Spaces Indent
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-white/10 bg-slate-900/80">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_15px_rgba(99,102,241,0.4)] flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" /> Save Settings
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

import React, { useEffect, useState } from 'react';
import { ERTVC_BUILDING_PATH, sanitizeLogoDataUrl } from '../utils/logo';

export interface ModuleCardSlide {
  id: string;
  page: string;
  indexLabel: string;
  kicker: string;
  title: string;
  subtitle: string;
  metricValue: number;
  metricUnit: string;
  icon: string;
  accentGradient: string;
  ctaLabel: string;
}

interface AnimatedModuleDeckProps {
  institutionName: string;
  logo: string;
  slides: ModuleCardSlide[];
  onOpenModule: (page: string) => void;
}

export const AnimatedModuleDeck: React.FC<AnimatedModuleDeckProps> = ({
  institutionName,
  logo,
  slides,
  onOpenModule,
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (isPaused || slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [isPaused, slides.length]);

  const activeSlide = slides[activeIndex] || slides[0];
  if (!activeSlide) return null;

  const handlePrev = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const progressPercent = ((activeIndex + 1) / slides.length) * 100;

  return (
    <section
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      className="relative rounded-2xl overflow-hidden bg-slate-950 shadow-lg border border-slate-800/70"
      aria-label="Store modules interactive showcase"
    >
      {/* Top Animated Progress Bar (inspired by Video 1) */}
      <div className="absolute top-0 left-0 right-0 h-1 bg-white/10 z-20">
        <div
          className="h-full bg-gradient-to-r from-[#0284c7] via-sky-400 to-[#dc2626] transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Campus Hero Backdrop */}
      <img
        src={ERTVC_BUILDING_PATH}
        alt="Eldama Ravine Technical and Vocational College Campus"
        referrerPolicy="no-referrer"
        className="absolute inset-0 w-full h-full object-cover opacity-55 transition-transform duration-700 ease-out scale-105"
      />
      <div
        className={`absolute inset-0 bg-gradient-to-r ${activeSlide.accentGradient} transition-colors duration-500`}
      />

      {/* Foreground Content Split: Spotlight Left + Expanding Card Deck Right */}
      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 sm:p-8 items-end min-h-[340px]">
        {/* Left Spotlight */}
        <div className="lg:col-span-5 flex flex-col justify-between space-y-5 text-white">
          <div className="flex items-center gap-3.5">
            <img
              src={sanitizeLogoDataUrl(logo)}
              alt={institutionName}
              referrerPolicy="no-referrer"
              className="w-12 h-12 rounded-full bg-white p-1 object-contain shadow-md shrink-0 border border-sky-300"
            />
            <div className="min-w-0">
              <p className="text-xs font-medium text-sky-300 truncate">{institutionName}</p>
              <p className="text-xs text-slate-300">Technology for Sustainable Development</p>
            </div>
          </div>

          <div key={activeSlide.id} className="space-y-2.5 animate-page-reveal">
            <p className="text-xs font-medium text-sky-300 tracking-wide">
              {activeSlide.indexLabel} · {activeSlide.kicker}
            </p>
            <h1 className="font-display text-2xl sm:text-4xl font-bold leading-tight text-balance">
              {activeSlide.title}
            </h1>
            <p className="text-sm text-slate-200 max-w-md leading-relaxed">
              {activeSlide.subtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onOpenModule(activeSlide.page)}
              className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0284c7] to-[#0369a1] hover:from-sky-500 hover:to-[#0284c7] text-white font-semibold text-sm shadow-md transition-all active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
            >
              <span>{activeSlide.ctaLabel}</span>
              <i className="fas fa-arrow-right text-xs"></i>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous module card"
                className="w-10 h-10 rounded-full border border-white/25 bg-slate-900/60 hover:bg-white/15 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <i className="fas fa-chevron-left text-xs"></i>
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next module card"
                className="w-10 h-10 rounded-full border border-white/25 bg-slate-900/60 hover:bg-white/15 text-white flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <i className="fas fa-chevron-right text-xs"></i>
              </button>
              <span className="ml-1 font-mono text-xs tabular-nums text-slate-200">
                0{activeIndex + 1} / 0{slides.length}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Animated Expanding Card Deck (inspired by Video 1) */}
        <div className="lg:col-span-7 flex items-stretch gap-3 h-[210px] sm:h-[240px]">
          {slides.map((slide, idx) => {
            const isActive = idx === activeIndex;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => {
                  if (isActive) {
                    onOpenModule(slide.page);
                  } else {
                    setActiveIndex(idx);
                  }
                }}
                aria-pressed={isActive}
                className={`group relative rounded-2xl overflow-hidden text-left transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
                  isActive
                    ? 'flex-[2.4] shadow-2xl border-2 border-sky-400/90 translate-y-0'
                    : 'flex-1 border border-white/20 opacity-80 hover:opacity-100 hover:-translate-y-1'
                }`}
              >
                <img
                  src={ERTVC_BUILDING_PATH}
                  alt={slide.title}
                  referrerPolicy="no-referrer"
                  className={`absolute inset-0 w-full h-full object-cover transition-transform duration-700 ${
                    isActive ? 'scale-105' : 'scale-125 group-hover:scale-110'
                  }`}
                />
                <div
                  className={`absolute inset-0 transition-opacity duration-500 ${
                    isActive
                      ? 'bg-gradient-to-t from-slate-950/95 via-sky-950/65 to-slate-900/35'
                      : 'bg-gradient-to-t from-slate-950/95 via-slate-900/75 to-slate-900/50'
                  }`}
                />

                <div className="relative z-10 h-full p-4 flex flex-col justify-between text-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs tabular-nums text-sky-300 font-semibold">
                      {slide.indexLabel}
                    </span>
                    <span
                      className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors ${
                        isActive ? 'bg-[#0284c7] text-white' : 'bg-white/15 text-white/90'
                      }`}
                    >
                      <i className={`fas ${slide.icon}`}></i>
                    </span>
                  </div>

                  <div className="min-w-0">
                    <p className="font-mono text-xl sm:text-2xl font-bold tabular-nums text-white leading-none">
                      {slide.metricValue}
                    </p>
                    <p className="text-[11px] text-slate-300 mt-1 truncate">{slide.metricUnit}</p>
                    <p className="font-display text-sm sm:text-base font-bold text-white mt-2 truncate">
                      {slide.title}
                    </p>
                    {isActive && (
                      <p className="text-[11px] text-sky-300 font-medium mt-1 whitespace-nowrap">
                        Click again to open →
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
};

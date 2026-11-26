import React, { useState } from 'react';
import {
  Bold,
  Eye,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Palette,
  PenLine,
  Quote,
  Sparkles,
  Type,
  Underline,
} from 'lucide-react';
import { KIJIWENI_FONT_STYLES, KijiweniFontStyle } from '../types';
import { useLanguage } from '../context/LanguageContext';
import {
  MAKALA_HIGHLIGHT_COLORS,
  MAKALA_TEXT_COLORS,
  MakalaFormatAction,
} from '../utils/makalaSelectionFormatter';

interface KijiweniDescriptionToolsProps {
  fontStyle: KijiweniFontStyle;
  onChangeFontStyle: (next: KijiweniFontStyle) => void;
  previewMode: boolean;
  onTogglePreview: (next: boolean) => void;
  selectedWordCount: number;
  onApplyFormat: (action: MakalaFormatAction, fallbackSample: string) => void;
  onAutoFormat: () => void;
}

export const KijiweniDescriptionTools: React.FC<KijiweniDescriptionToolsProps> = ({
  fontStyle,
  onChangeFontStyle,
  previewMode,
  onTogglePreview,
  selectedWordCount,
  onApplyFormat,
  onAutoFormat,
}) => {
  const { tr } = useLanguage();
  const [openMenu, setOpenMenu] = useState<'color' | 'bg' | 'case' | null>(null);

  const btnCls =
    'inline-flex min-h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition-colors hover:border-[#0E2640] hover:text-[#0E2640]';

  return (
    <div className="rounded-t-lg border border-b-0 border-slate-200 bg-[#F8F9FB]">
      {/* Row 1: Section Label + Hariri / Hakiki Kisomi Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-[#0E2640]">
          <Type className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
          <span>{tr('Mwandiko & Mpangilio wa Kisomi', 'Font Style & Scholarly Formatting')}</span>
        </span>

        <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5 text-[11px] font-bold">
          <button
            type="button"
            onClick={() => onTogglePreview(false)}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 transition-colors ${
              !previewMode ? 'bg-[#0E2640] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <PenLine className="h-3 w-3" aria-hidden="true" />
            <span>{tr('Hariri', 'Edit')}</span>
          </button>
          <button
            type="button"
            onClick={() => onTogglePreview(true)}
            className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2.5 py-1 transition-colors ${
              previewMode ? 'bg-[#1D4E89] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Eye className="h-3 w-3" aria-hidden="true" />
            <span>{tr('Hakiki Kisomi', 'Preview')}</span>
          </button>
        </div>
      </div>

      {/* Row 2: Mwandiko (Font Style) Picker */}
      <div className="border-b border-slate-200/80 px-3 py-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:thin]">
          <span className="shrink-0 text-[10.5px] font-bold uppercase tracking-wider text-slate-500">
            {tr('Mwandiko:', 'Font:')}
          </span>
          {KIJIWENI_FONT_STYLES.map((opt) => {
            const active = fontStyle === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onChangeFontStyle(opt.id)}
                className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1 text-[11.5px] transition-colors ${
                  active
                    ? 'border-[#0E2640] bg-[#0E2640] text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-[#1D4E89] hover:text-[#0E2640]'
                }`}
              >
                <span
                  style={{ fontFamily: opt.fontFamilyCss }}
                  className="text-[13px] font-bold leading-none"
                >
                  Aa
                </span>
                <span className="font-semibold">{tr(opt.labelSw, opt.labelEn)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 3: Contextual Selection Helper + Text Formatting Toolbar */}
      {!previewMode && (
        <>
          {selectedWordCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-3 py-1.5 text-[11px]">
              <span className="font-bold text-amber-900">
                {tr(
                  `Umechagua maneno ${selectedWordCount} — badilisha muonekano:`,
                  `Selected ${selectedWordCount} word(s) — style selection:`
                )}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onApplyFormat('bold', '')}
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#0E2640]"
                >
                  {tr('Nzito', 'Bold')}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onApplyFormat('quote', '')}
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#0E2640]"
                >
                  {tr('Nukuu', 'Quote')}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onApplyFormat('upper', '')}
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#0E2640]"
                >
                  AA
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onApplyFormat({ type: 'bg', hex: '#FEF08A' }, '')}
                  className="rounded border border-amber-300 bg-[#FEF08A] px-2 py-0.5 font-bold text-slate-900"
                >
                  {tr('Angaza', 'Highlight')}
                </button>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => onApplyFormat({ type: 'color', hex: '#0E2640' }, '')}
                  className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-[#0E2640]"
                >
                  A
                </button>
              </div>
            </div>
          )}

          <div className="relative flex flex-wrap items-center gap-1 px-2.5 py-1.5">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('h2', tr('Kichwa cha Sehemu', 'Section Title'))}
              title={tr('Kichwa Kikuu', 'Heading')}
              className={btnCls}
            >
              <Heading2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{tr('Kichwa', 'H2')}</span>
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('h3', tr('Kichwa Kidogo', 'Subheading'))}
              title={tr('Kichwa Kidogo', 'Subheading')}
              className={btnCls}
            >
              <Heading3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('bold', tr('maneno mazito', 'bold text'))}
              title={tr('Maneno mazito (Bold)', 'Bold')}
              className={btnCls}
            >
              <Bold className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('italic', tr('maneno ya mlalo', 'italic text'))}
              title={tr('Italiki (Italic)', 'Italic')}
              className={btnCls}
            >
              <Italic className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('underline', tr('maneno yenye mstari', 'underlined'))}
              title={tr('Mstari chini (Underline)', 'Underline')}
              className={btnCls}
            >
              <Underline className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('bullets', tr('Hoja muhimu', 'Key point'))}
              title={tr('Orodha ya vitone', 'Bullet list')}
              className={btnCls}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('numbered', tr('Jambo la kwanza', 'First point'))}
              title={tr('Orodha ya namba', 'Numbered list')}
              className={btnCls}
            >
              <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('quote', tr('Nukuu ya kisomi...', 'Notable quote...'))}
              title={tr('Nukuu (Quote)', 'Quote')}
              className={btnCls}
            >
              <Quote className="h-3.5 w-3.5" aria-hidden="true" />
            </button>

            {/* Text Case Dropdown */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpenMenu((m) => (m === 'case' ? null : 'case'))}
                title={tr('Herufi Kubwa / Ndogo', 'Letter Case')}
                className={`${btnCls} ${openMenu === 'case' ? 'border-[#0E2640] text-[#0E2640]' : ''}`}
              >
                <Type className="h-3.5 w-3.5" aria-hidden="true" />
                <span>AA</span>
              </button>
              {openMenu === 'case' && (
                <div className="absolute top-full left-0 z-30 mt-1 flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-lg">
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onApplyFormat('upper', tr('HERUFI KUBWA', 'UPPERCASE'));
                      setOpenMenu(null);
                    }}
                    className="whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                  >
                    {tr('HERUFI KUBWA', 'UPPERCASE')}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onApplyFormat('title', tr('Herufi Kuu Kila Neno', 'Title Case'));
                      setOpenMenu(null);
                    }}
                    className="whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                  >
                    {tr('Herufi Kuu Kila Neno', 'Title Case')}
                  </button>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onApplyFormat('lower', tr('herufi ndogo', 'lowercase'));
                      setOpenMenu(null);
                    }}
                    className="whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-100"
                  >
                    {tr('herufi ndogo', 'lowercase')}
                  </button>
                </div>
              )}
            </div>

            {/* Text Color Dropdown */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpenMenu((m) => (m === 'color' ? null : 'color'))}
                title={tr('Rangi ya maandishi', 'Text color')}
                className={`${btnCls} ${openMenu === 'color' ? 'border-[#0E2640] text-[#0E2640]' : ''}`}
              >
                <Palette className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                <span>{tr('Rangi', 'Color')}</span>
              </button>
              {openMenu === 'color' && (
                <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  {MAKALA_TEXT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={tr(c.labelSw, c.labelEn)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onApplyFormat(
                          { type: 'color', hex: c.hex },
                          tr('Maandishi ya rangi', 'Colored text')
                        );
                        setOpenMenu(null);
                      }}
                      style={{ backgroundColor: c.hex }}
                      className="h-6 w-6 rounded-full border border-slate-300 transition-transform hover:scale-110"
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Highlight Color Dropdown */}
            <div className="relative">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setOpenMenu((m) => (m === 'bg' ? null : 'bg'))}
                title={tr('Angaza maandishi (Highlight)', 'Highlight text')}
                className={`${btnCls} ${openMenu === 'bg' ? 'border-[#0E2640] text-[#0E2640]' : ''}`}
              >
                <Highlighter className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
                <span>{tr('Angaza', 'Highlight')}</span>
              </button>
              {openMenu === 'bg' && (
                <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                  {MAKALA_HIGHLIGHT_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      title={tr(c.labelSw, c.labelEn)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onApplyFormat(
                          { type: 'bg', hex: c.hex },
                          tr('Maneno yaliyoangaziwa', 'Highlighted text')
                        );
                        setOpenMenu(null);
                      }}
                      style={{ backgroundColor: c.hex }}
                      className="h-6 w-6 rounded-md border border-slate-300 transition-transform hover:scale-110"
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={onAutoFormat}
              title={tr('Panga maandishi katika muundo wa kisomi moja kwa moja', 'Auto-format into clean scholarly layout')}
              className="ml-auto inline-flex min-h-[30px] shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#163A5F]"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>{tr('Panga Kisomi', 'Auto-Format')}</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
};

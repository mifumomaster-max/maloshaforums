import React, { useState } from 'react';
import {
  AtSign,
  Bold,
  Code2,
  Heading2,
  Heading3,
  Highlighter,
  Italic,
  List,
  ListOrdered,
  Minus,
  Palette,
  Quote,
  Sparkles,
  Type,
  Underline,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  MAKALA_HIGHLIGHT_COLORS,
  MAKALA_TEXT_COLORS,
  MakalaFormatAction,
} from '../utils/makalaSelectionFormatter';

interface MakalaFormatToolbarProps {
  selectedWordCount: number;
  onApplyFormat: (action: MakalaFormatAction, fallbackSample: string) => void;
  onOpenInlineMedia: () => void;
  onAutoFormat: () => void;
  showCodeAction?: boolean;
  showDividerAction?: boolean;
}

export const MakalaFormatToolbar: React.FC<MakalaFormatToolbarProps> = ({
  selectedWordCount,
  onApplyFormat,
  onOpenInlineMedia,
  onAutoFormat,
  showCodeAction = false,
  showDividerAction = false,
}) => {
  const { tr } = useLanguage();
  const [openMenu, setOpenMenu] = useState<'color' | 'bg' | 'case' | null>(null);

  const btnCls =
    'inline-flex min-h-[30px] items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-800 transition-colors hover:border-[#B80000] hover:text-[#B80000]';

  return (
    <div className="mt-1.5 border border-b-0 border-slate-300 bg-[#F6F6F6]">
      {selectedWordCount > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px]">
          <span className="font-bold text-amber-900">
            {tr(
              `Umechagua maneno ${selectedWordCount} — badilisha moja kwa moja:`,
              `Selected ${selectedWordCount} word(s) — apply formatting:`
            )}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('quote', '')}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#B80000]"
            >
              {tr('Nukuu (>)', 'Quote')}
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('bullets', '')}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#B80000]"
            >
              {tr('Orodha (-)', 'Bullets')}
            </button>
            {showCodeAction && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onApplyFormat('code', '')}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-bold text-[#25D366] hover:bg-slate-800"
              >
                {tr('Code / Amri', 'Code / Cmd')}
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onApplyFormat('upper', '')}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-slate-800 hover:border-[#B80000]"
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
              onClick={() => onApplyFormat({ type: 'color', hex: '#B80000' }, '')}
              className="rounded border border-amber-300 bg-white px-2 py-0.5 font-bold text-[#B80000]"
            >
              A
            </button>
          </div>
        </div>
      )}

      <div className="relative flex flex-wrap items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('h2', tr('Kichwa cha Sehemu', 'Section Title'))}
          className={btnCls}
        >
          <Heading2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Kichwa', 'H2')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('h3', tr('Kichwa Kidogo', 'Subtitle'))}
          className={btnCls}
        >
          <Heading3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Kichwa Kidogo', 'H3')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('bullets', tr('Hoja muhimu hapa', 'Bullet point'))}
          className={btnCls}
        >
          <List className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Orodha', 'Bullets')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('numbered', tr('Hatua ya kwanza', 'First point'))}
          className={btnCls}
        >
          <ListOrdered className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Namba', 'Numbered')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('quote', tr('Nukuu ya msemaji...', 'Quote text...'))}
          className={btnCls}
        >
          <Quote className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Nukuu', 'Quote')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onApplyFormat('bold', tr('maneno mazito', 'bold text'))}
          title={tr('Maneno mazito (Bold)', 'Bold')}
          className={btnCls}
        >
          <Bold className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{tr('Nzito', 'Bold')}</span>
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
          onClick={() => onApplyFormat('underline', tr('maneno yenye mstari', 'underlined text'))}
          title={tr('Mstari chini (Underline)', 'Underline')}
          className={btnCls}
        >
          <Underline className="h-3.5 w-3.5" aria-hidden="true" />
        </button>

        {/* Capital Letters / Case Menu */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpenMenu((m) => (m === 'case' ? null : 'case'))}
            title={tr('Herufi Kubwa / Ndogo', 'Text Case')}
            className={`${btnCls} ${openMenu === 'case' ? 'border-[#B80000] text-[#B80000]' : ''}`}
          >
            <Type className="h-3.5 w-3.5" aria-hidden="true" />
            <span>AA</span>
          </button>
          {openMenu === 'case' && (
            <div className="absolute top-full left-0 z-30 mt-1 flex flex-col gap-1 rounded-lg border border-slate-300 bg-white p-1.5 shadow-lg">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onApplyFormat('upper', tr('HERUFI KUBWA', 'UPPERCASE'));
                  setOpenMenu(null);
                }}
                className="whitespace-nowrap rounded px-2.5 py-1.5 text-left text-[11px] font-bold text-slate-800 hover:bg-slate-100"
              >
                {tr('HERUFI KUBWA (UPPERCASE)', 'UPPERCASE')}
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
                {tr('Herufi Kuu Kila Neno (Title)', 'Title Case')}
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
                {tr('herufi ndogo (lowercase)', 'lowercase')}
              </button>
            </div>
          )}
        </div>

        {/* Text Color Menu */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpenMenu((m) => (m === 'color' ? null : 'color'))}
            title={tr('Rangi ya maandishi', 'Text Color')}
            className={`${btnCls} ${openMenu === 'color' ? 'border-[#B80000] text-[#B80000]' : ''}`}
          >
            <Palette className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
            <span>{tr('Rangi', 'Color')}</span>
          </button>
          {openMenu === 'color' && (
            <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
              {MAKALA_TEXT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={tr(c.labelSw, c.labelEn)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onApplyFormat({ type: 'color', hex: c.hex }, tr('Maandishi ya rangi', 'Colored text'));
                    setOpenMenu(null);
                  }}
                  style={{ backgroundColor: c.hex }}
                  className="h-6 w-6 rounded-full border border-slate-300 transition-transform hover:scale-110"
                />
              ))}
            </div>
          )}
        </div>

        {/* Text Highlight Background Menu */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpenMenu((m) => (m === 'bg' ? null : 'bg'))}
            title={tr('Rangi ya kuangazia nyuma (Highlight)', 'Highlight color')}
            className={`${btnCls} ${openMenu === 'bg' ? 'border-[#B80000] text-[#B80000]' : ''}`}
          >
            <Highlighter className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
            <span>{tr('Angaza', 'Highlight')}</span>
          </button>
          {openMenu === 'bg' && (
            <div className="absolute top-full left-0 z-30 mt-1 flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white p-2 shadow-lg">
              {MAKALA_HIGHLIGHT_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  title={tr(c.labelSw, c.labelEn)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onApplyFormat({ type: 'bg', hex: c.hex }, tr('Maneno yaliyoangaziwa', 'Highlighted'));
                    setOpenMenu(null);
                  }}
                  style={{ backgroundColor: c.hex }}
                  className="h-6 w-6 rounded-md border border-slate-300 transition-transform hover:scale-110"
                />
              ))}
            </div>
          )}
        </div>

        {showCodeAction && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onApplyFormat('code', tr('npm install', 'npm install'))}
            title={tr(
              'Funga code au amri ya terminal ndani ya kisanduku cha kunakili',
              'Wrap code or terminal command inside copyable block'
            )}
            className="inline-flex min-h-[30px] items-center gap-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-bold text-[#25D366] transition-colors hover:bg-slate-800"
          >
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tr('Code / Amri', 'Code / Cmd')}</span>
          </button>
        )}

        {showDividerAction && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onApplyFormat('divider', '')}
            title={tr('Weka mstari wa kutenganisha sehemu (---)', 'Insert section divider (---)')}
            className={btnCls}
          >
            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onOpenInlineMedia}
          title={tr(
            'Weka picha au video mahali hapa (au andika @)',
            'Insert photo or video at cursor (or type @)'
          )}
          className="inline-flex min-h-[30px] items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-[#0E2640] hover:border-[#B80000] hover:bg-amber-100"
        >
          <AtSign className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
          <span>{tr('Picha / Video', 'Photo / Video')}</span>
        </button>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAutoFormat}
          className="ml-auto inline-flex min-h-[30px] items-center gap-1 rounded bg-[#0E2640] px-2.5 py-1 text-[11px] font-bold text-white hover:bg-[#163A5F]"
        >
          <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
          <span>{tr('Panga Kisomi', 'Auto-Format')}</span>
        </button>
      </div>
    </div>
  );
};

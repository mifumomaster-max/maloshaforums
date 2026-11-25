import React, { useEffect, useState } from 'react';
import {
  Check,
  ImagePlus,
  Layers,
  Loader2,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import {
  STUDIO_MAKALA_EVENT,
  StudioMakalaItem,
  consumePendingStudioMakalaImportId,
  ensureStudioItemUploadedUrl,
  listStudioMakalaItems,
} from '../utils/studioMakalaBridge';

interface StudioMakalaPickerBarProps {
  hasExistingBody: boolean;
  onApplyFullItem: (params: {
    title: string;
    bodyDraft: string;
    tags: string[];
    coverUrl?: string;
    mode: 'replace' | 'append';
  }) => void;
  onApplyCoverOnly: (coverUrl: string) => void;
  onInsertImageInline: (coverUrl: string, caption?: string) => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  autoConsumePending?: boolean;
}

const StudioThumbPreview: React.FC<{ item: StudioMakalaItem }> = ({ item }) => {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  useEffect(() => {
    if (item.uploadedImageUrl) {
      setBlobUrl(null);
      return;
    }
    if (!item.imageBlob) {
      setBlobUrl(null);
      return;
    }
    const url = URL.createObjectURL(item.imageBlob);
    setBlobUrl(url);
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [item.imageBlob, item.uploadedImageUrl]);

  const src = item.uploadedImageUrl || blobUrl;
  if (!src) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-slate-200 bg-slate-100 text-slate-400">
        <Layers className="h-4 w-4" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={item.title || 'Studio'}
      className="h-12 w-12 shrink-0 rounded border border-slate-300 bg-slate-100 object-cover"
    />
  );
};

export const StudioMakalaPickerBar: React.FC<StudioMakalaPickerBarProps> = ({
  hasExistingBody,
  onApplyFullItem,
  onApplyCoverOnly,
  onInsertImageInline,
  onToast,
  autoConsumePending = false,
}) => {
  const { tr } = useLanguage();
  const [items, setItems] = useState<StudioMakalaItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [expanded, setExpanded] = useState<boolean>(false);
  const [busyAction, setBusyAction] = useState<'full' | 'append' | 'cover' | 'inline' | null>(null);

  const loadItems = async (tryAutoConsume = false) => {
    const loaded = await listStudioMakalaItems();
    setItems(loaded);
    if (loaded.length === 0) return;

    const pendingId = tryAutoConsume ? consumePendingStudioMakalaImportId() : null;
    const chosen =
      (pendingId ? loaded.find((x) => x.id === pendingId) : null) || loaded[0];
    setSelectedId((prev) =>
      pendingId ? chosen.id : prev && loaded.some((x) => x.id === prev) ? prev : loaded[0].id
    );

    if (pendingId && chosen) {
      setExpanded(true);
      setBusyAction('full');
      try {
        let coverUrl = chosen.uploadedImageUrl;
        if (!coverUrl && chosen.imageBlob) {
          coverUrl = await ensureStudioItemUploadedUrl(chosen);
        }
        onApplyFullItem({
          title: chosen.title,
          bodyDraft: chosen.bodyDraft,
          tags: chosen.tags,
          ...(coverUrl ? { coverUrl } : {}),
          mode: 'replace',
        });
        onToast(
          tr(
            'Taarifa na picha kutoka Studio zimejazwa kiotomatiki — endelea kuhariri au kuongeza maelezo yako!',
            'Studio headline, artwork, and notes auto-filled — add your own sections below!'
          )
        );
      } catch (err) {
        onApplyFullItem({
          title: chosen.title,
          bodyDraft: chosen.bodyDraft,
          tags: chosen.tags,
          mode: 'replace',
        });
        onToast(
          err instanceof Error
            ? err.message
            : tr('Taarifa za Studio zimejazwa (picha haijapakiwa).', 'Studio text auto-filled.'),
          'error'
        );
      } finally {
        setBusyAction(null);
      }
    }
  };

  useEffect(() => {
    void loadItems(autoConsumePending);
    const handler = () => {
      void loadItems(false);
    };
    window.addEventListener(STUDIO_MAKALA_EVENT, handler);
    return () => window.removeEventListener(STUDIO_MAKALA_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoConsumePending]);

  if (items.length === 0) return null;

  const activeItem = items.find((i) => i.id === selectedId) || items[0];

  const handleAction = async (kind: 'full' | 'append' | 'cover' | 'inline') => {
    if (!activeItem || busyAction) return;
    setBusyAction(kind);
    try {
      let coverUrl = activeItem.uploadedImageUrl;
      if (!coverUrl && activeItem.imageBlob) {
        coverUrl = await ensureStudioItemUploadedUrl(activeItem);
        setItems((prev) =>
          prev.map((it) => (it.id === activeItem.id ? { ...it, uploadedImageUrl: coverUrl } : it))
        );
      }

      if (kind === 'cover') {
        if (!coverUrl) {
          throw new Error(tr('Hakuna picha kwenye rasimu hii ya Studio.', 'No image found in this Studio item.'));
        }
        onApplyCoverOnly(coverUrl);
        onToast(tr('Picha ya Studio imewekwa kama picha kuu ya Makala!', 'Studio artwork set as Makala cover photo!'));
      } else if (kind === 'inline') {
        if (!coverUrl) {
          throw new Error(tr('Hakuna picha kwenye rasimu hii ya Studio.', 'No image found in this Studio item.'));
        }
        onInsertImageInline(coverUrl, activeItem.title);
        onToast(tr('Picha ya Studio imechomekwa ndani ya makala!', 'Studio image inserted into article body!'));
      } else {
        onApplyFullItem({
          title: activeItem.title,
          bodyDraft: activeItem.bodyDraft,
          tags: activeItem.tags,
          ...(coverUrl ? { coverUrl } : {}),
          mode: kind === 'append' ? 'append' : 'replace',
        });
        onToast(
          kind === 'append'
            ? tr('Taarifa na picha za Studio zimeongezwa kwenye makala yako!', 'Studio notes and cover added to your article!')
            : tr('Taarifa na picha za Studio zimejazwa kiotomatiki!', 'Studio headline, text, and artwork filled automatically!')
        );
      }
    } catch (err) {
      onToast(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuvuta taarifa kutoka Studio.', 'Failed to import from Studio.'),
        'error'
      );
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="border border-amber-300/90 bg-gradient-to-r from-amber-50 via-white to-sky-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#0E2640] text-amber-300">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-xs font-extrabold text-[#0E2640]">
              {tr('Uhusiano wa Studio -> Makala', 'Studio -> Makala Sync')}
            </p>
            <p className="text-[11px] text-slate-600">
              {tr(
                `Una kazi ${items.length} kutoka Poster/Katuni Studio tayari kujaza au kuweka picha.`,
                `${items.length} Studio item(s) ready to auto-fill or insert into this article.`
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {!expanded && (
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() => void handleAction(hasExistingBody ? 'append' : 'full')}
              className="inline-flex min-h-[34px] items-center gap-1.5 bg-[#B80000] px-3 py-1 text-[11px] font-bold text-white transition-colors hover:bg-[#990000] disabled:opacity-60"
            >
              {busyAction === 'full' || busyAction === 'append' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>
                {hasExistingBody
                  ? tr('Vuta Kutoka Studio', 'Pull From Studio')
                  : tr('Jaza Kiotomatiki Kutoka Studio', 'Auto-Fill From Studio')}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((p) => !p)}
            className="inline-flex min-h-[34px] items-center border border-slate-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {expanded ? tr('Ficha', 'Hide') : tr('Chagua Kazi za Studio', 'Browse Studio Items')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 space-y-2.5 border-t border-amber-200/80 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {items.map((item) => {
              const isSelected = item.id === activeItem.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedId(item.id)}
                  className={`flex min-w-[210px] max-w-[250px] shrink-0 items-center gap-2.5 border p-2 text-left transition-colors ${
                    isSelected
                      ? 'border-[#B80000] bg-white ring-1 ring-[#B80000]/30'
                      : 'border-slate-200 bg-white/80 hover:border-slate-400'
                  }`}
                >
                  <StudioThumbPreview item={item} />
                  <div className="min-w-0 flex-1">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                        item.source === 'poster'
                          ? 'bg-red-50 text-[#B80000]'
                          : 'bg-amber-50 text-amber-800'
                      }`}
                    >
                      {item.source === 'poster' ? tr('Poster Studio', 'Poster Studio') : tr('Katuni Studio', 'Cartoon Studio')}
                    </span>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-900">
                      {item.title || tr('Bila kichwa', 'Untitled')}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          {activeItem && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAction('full')}
                className="inline-flex min-h-[36px] items-center gap-1.5 bg-[#B80000] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#990000] disabled:opacity-60"
              >
                {busyAction === 'full' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                <span>{tr('Jaza Kichwa, Picha & Maelezo', 'Auto-Fill Headline, Cover & Text')}</span>
              </button>

              {hasExistingBody && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void handleAction('append')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 border border-[#0E2640] bg-[#0E2640] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#163A5F] disabled:opacity-60"
                >
                  {busyAction === 'append' ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span>{tr('Ongeza Chini ya Matini', 'Append to Body')}</span>
                </button>
              )}

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAction('cover')}
                className="inline-flex min-h-[36px] items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#B80000] hover:text-[#B80000] disabled:opacity-60"
              >
                {busyAction === 'cover' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B80000]" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-3.5 w-3.5 text-[#B80000]" aria-hidden="true" />
                )}
                <span>{tr('Tumia Kama Picha Kuu Tu', 'Use as Cover Photo Only')}</span>
              </button>

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => void handleAction('inline')}
                className="inline-flex min-h-[36px] items-center gap-1.5 border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-[#1D4E89] hover:text-[#1D4E89] disabled:opacity-60"
              >
                {busyAction === 'inline' ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#1D4E89]" aria-hidden="true" />
                ) : (
                  <Plus className="h-3.5 w-3.5 text-[#1D4E89]" aria-hidden="true" />
                )}
                <span>{tr('Chomeka Picha Kwenye Matini', 'Insert Image Inside Article')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

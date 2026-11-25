import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Edit3, Forward, Info, Search, Send, Users } from 'lucide-react';
import { Timestamp } from 'firebase/firestore';
import {
  MchartGroupReadCursor,
  MchartGroupSettings,
  MemberDirectoryCandidate,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';

function formatFullTime(ts: Timestamp | null | undefined): string {
  if (!ts) return '—';
  const d = ts.toDate();
  return d.toLocaleString([], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

interface ForwardMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
  previewText: string;
  groupSettings: MchartGroupSettings;
  memberCandidates: MemberDirectoryCandidate[];
  selfUid: string;
  canSendToGroup: boolean;
  onForwardToGroup: () => Promise<void>;
  onForwardToMember: (member: MemberDirectoryCandidate) => Promise<void>;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  isOpen,
  onClose,
  previewText,
  groupSettings,
  memberCandidates,
  selfUid,
  canSendToGroup,
  onForwardToGroup,
  onForwardToMember,
}) => {
  const { tr } = useLanguage();
  const [search, setSearch] = useState('');
  const [sendingTarget, setSendingTarget] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return memberCandidates
      .filter((m) => m.uid !== selfUid)
      .filter((m) => !q || m.displayName.toLowerCase().includes(q))
      .sort((a, b) => a.displayName.localeCompare(b.displayName));
  }, [memberCandidates, selfUid, search]);

  if (!isOpen) return null;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr('Rudi', 'Back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Forward className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
          <h3 className="text-sm font-bold">{tr('Sambaza Kwa...', 'Forward To...')}</h3>
        </div>
      </div>

      <div className="border-b border-slate-100 bg-slate-50 px-3.5 py-2.5 sm:px-5">
        <p className="line-clamp-2 rounded-lg border-l-4 border-[#00A884] bg-white px-2.5 py-1.5 text-xs text-slate-700">
          {previewText}
        </p>
        <div className="relative mt-2">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr('Tafuta mtu au kundi...', 'Search contact or group...')}
            className="w-full rounded-xl border border-slate-200 bg-white py-2 pr-3 pl-8 text-xs text-slate-900 focus:border-[#075E54] focus:outline-none"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto">
        {canSendToGroup && (
          <button
            type="button"
            disabled={sendingTarget !== null}
            onClick={() => {
              setSendingTarget('__group__');
              void onForwardToGroup().finally(() => {
                setSendingTarget(null);
                onClose();
              });
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-emerald-50/60"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              {groupSettings.groupPhotoUrl ? (
                <img
                  src={groupSettings.groupPhotoUrl}
                  alt={groupSettings.groupName}
                  className="h-10 w-10 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white">
                  <Users className="h-5 w-5 text-[#25D366]" />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">
                  {groupSettings.groupName}
                </p>
                <p className="text-[11px] font-semibold text-[#00A884]">
                  {tr('Kundi Kuu', 'Community Group')}
                </p>
              </div>
            </div>
            <Send className="h-4 w-4 text-[#075E54]" />
          </button>
        )}

        {filtered.map((m) => (
          <button
            key={m.uid}
            type="button"
            disabled={sendingTarget !== null}
            onClick={() => {
              setSendingTarget(m.uid);
              void onForwardToMember(m).finally(() => {
                setSendingTarget(null);
                onClose();
              });
            }}
            className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-emerald-50/60"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={m.displayName} photoURL={m.photoURL} uid={m.uid} size="sm" />
              <span className="truncate text-sm font-semibold text-slate-900">
                {m.displayName}
              </span>
            </div>
            <span className="text-xs font-bold text-[#075E54]">
              {sendingTarget === m.uid ? '...' : <Send className="h-4 w-4" />}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
};

interface MessageInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  messageText: string;
  sentAt: Timestamp | null;
  mode: 'group' | 'direct';
  groupReaders?: MchartGroupReadCursor[];
  partnerName?: string;
  partnerPhoto?: string;
  partnerReadAt?: Timestamp | null;
}

export const MessageInfoModal: React.FC<MessageInfoModalProps> = ({
  isOpen,
  onClose,
  messageText,
  sentAt,
  mode,
  groupReaders = [],
  partnerName = '',
  partnerPhoto = '',
  partnerReadAt = null,
}) => {
  const { tr } = useLanguage();
  if (!isOpen) return null;

  const sentMs = sentAt ? sentAt.toMillis() : 0;
  const dmWasRead = Boolean(partnerReadAt && sentMs > 0 && partnerReadAt.toMillis() >= sentMs);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      <div className="flex shrink-0 items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr('Rudi', 'Back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Info className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
          <h3 className="text-sm font-bold">{tr('Maelezo ya Ujumbe', 'Message Info')}</h3>
        </div>
      </div>

      <div className="shrink-0 bg-[#EFEAE2] p-3.5 sm:px-5">
        <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-xs bg-[#D9FDD3] px-3 py-2 text-xs text-slate-900 shadow-xs">
          <p className="line-clamp-3">{messageText || tr('Kiambatisho', 'Media attachment')}</p>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-slate-500">
            <span>{formatFullTime(sentAt)}</span>
            {mode === 'group' ? (
              groupReaders.length > 0 ? (
                <CheckCheck className="h-3.5 w-3.5 text-[#0284C7]" />
              ) : (
                <CheckCheck className="h-3.5 w-3.5 text-slate-400" />
              )
            ) : dmWasRead ? (
              <CheckCheck className="h-3.5 w-3.5 text-[#53BDEB]" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5 text-slate-400" />
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:px-5">
        {mode === 'direct' ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#0284C7]">
                <CheckCheck className="h-4 w-4 text-[#53BDEB]" />
                <span>{tr('Umesomwa na', 'Read by')} {partnerName}</span>
              </div>
              <span className="text-xs font-semibold text-slate-600 tabular-nums">
                {dmWasRead ? formatFullTime(partnerReadAt) : tr('Bado hajasoma', 'Not yet read')}
              </span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Check className="h-4 w-4 text-slate-400" />
                <span>{tr('Umefika', 'Delivered')}</span>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{formatFullTime(sentAt)}</span>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[#0284C7]">
              <CheckCheck className="h-4 w-4 text-[#0284C7]" />
              <span>
                {tr('Waliosoma', 'Read by')} ({groupReaders.length})
              </span>
            </div>
            {groupReaders.length === 0 ? (
              <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                {tr('Bado hakuna mwanachama mwingine aliyesoma ujumbe huu.', 'No other member has read this message yet.')}
              </p>
            ) : (
              <div className="divide-y divide-slate-100">
                {groupReaders.map((r) => (
                  <div key={r.uid} className="flex items-center justify-between py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={r.displayName} photoURL={r.photoURL} uid={r.uid} size="sm" />
                      <span className="truncate text-xs font-bold text-slate-900">
                        {r.displayName}
                      </span>
                    </div>
                    <span className="shrink-0 text-[11px] text-slate-500 tabular-nums">
                      {formatFullTime(r.lastReadAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {partnerPhoto && <span className="hidden">{partnerPhoto}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

interface EditMessageModalProps {
  isOpen: boolean;
  initialText: string;
  onClose: () => void;
  onSave: (nextText: string) => Promise<void>;
}

export const EditMessageModal: React.FC<EditMessageModalProps> = ({
  isOpen,
  initialText,
  onClose,
  onSave,
}) => {
  const { tr } = useLanguage();
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  React.useEffect(() => {
    setText(initialText);
  }, [initialText, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSaving(true);
    try {
      await onSave(text.trim());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F7FA]">
      <div className="flex shrink-0 items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr('Rudi', 'Back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 hover:bg-white/25"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2">
          <Edit3 className="h-4 w-4 text-[#25D366]" />
          <h3 className="text-sm font-bold">{tr('Hariri Ujumbe', 'Edit Message')}</h3>
        </div>
      </div>

      <form noValidate onSubmit={handleSubmit} className="mx-auto w-full max-w-xl p-4 sm:p-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs">
          <textarea
            rows={5}
            maxLength={2000}
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-[#075E54] focus:outline-none"
          />
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
            >
              {tr('Ghairi', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || !text.trim()}
              className="rounded-xl bg-[#00A884] px-4 py-2 text-xs font-bold text-white hover:bg-[#008F6F] disabled:opacity-50"
            >
              {saving ? '...' : tr('Hifadhi', 'Save')}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

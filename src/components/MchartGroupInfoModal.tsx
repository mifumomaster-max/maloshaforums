import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  Clock,
  Copy,
  Edit3,
  Image as ImageIcon,
  Link2,
  Loader2,
  Lock,
  Search,
  Share2,
  ShieldAlert,
  Trash2,
  Unlock,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import { User } from 'firebase/auth';
import { uploadImageToCloudinary } from '../services/cloudinaryService';
import {
  pruneExpiredGroupMessages,
  updateMchartGroupSettings,
} from '../services/forumService';
import {
  ChatMessage,
  MchartGroupSettings,
  MemberDirectoryCandidate,
} from '../types';
import { useLanguage } from '../context/LanguageContext';
import { Avatar } from './Avatar';
import { ImageResizeModal } from './ImageResizeModal';

export const DISAPPEAR_PRESETS = [
  { seconds: 0, labelSw: 'Zima (Ujumbe Ubaki)', labelEn: 'Off (Keep All)' },
  { seconds: 300, labelSw: 'Dakika 5', labelEn: '5 Minutes' },
  { seconds: 3600, labelSw: 'Saa 1', labelEn: '1 Hour' },
  { seconds: 86400, labelSw: 'Saa 24 (Siku 1)', labelEn: '24 Hours' },
  { seconds: 604800, labelSw: 'Siku 7', labelEn: '7 Days' },
  { seconds: 2592000, labelSw: 'Siku 30', labelEn: '30 Days' },
];

export function formatDisappearLabel(seconds: number, tr: (sw: string, en: string) => string): string {
  if (!seconds || seconds <= 0) return tr('Imezimwa', 'Off');
  if (seconds < 3600) return tr(`Dakika ${Math.round(seconds / 60)}`, `${Math.round(seconds / 60)}m`);
  if (seconds < 86400) return tr(`Saa ${Math.round(seconds / 3600)}`, `${Math.round(seconds / 3600)}h`);
  return tr(`Siku ${Math.round(seconds / 86400)}`, `${Math.round(seconds / 86400)}d`);
}

interface MchartGroupInfoModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  isAdmin: boolean;
  groupSettings: MchartGroupSettings;
  memberCandidates: MemberDirectoryCandidate[];
  messages: ChatMessage[];
  onToast: (msg: string, kind?: 'success' | 'error') => void;
  onClearAllChats: () => Promise<void> | void;
}

export const MchartGroupInfoModal: React.FC<MchartGroupInfoModalProps> = ({
  isOpen,
  onClose,
  user,
  isAdmin,
  groupSettings,
  memberCandidates,
  messages,
  onToast,
  onClearAllChats,
}) => {
  const { tr } = useLanguage();
  const [editingMeta, setEditingMeta] = useState(false);
  const [draftName, setDraftName] = useState(groupSettings.groupName);
  const [draftDesc, setDraftDesc] = useState(groupSettings.description);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [pendingPhotoFile, setPendingPhotoFile] = useState<File | null>(null);
  const [memberSearch, setMemberSearch] = useState('');
  const [pruning, setPruning] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraftName(groupSettings.groupName);
    setDraftDesc(groupSettings.description);
    setConfirmClearAll(false);
  }, [groupSettings.groupName, groupSettings.description, isOpen]);

  const sharedImages = useMemo(
    () =>
      messages
        .filter((m) => !m.isDeleted && m.attachmentType === 'image' && m.attachmentUrl)
        .slice(-12)
        .reverse(),
    [messages]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = memberCandidates.slice().sort((a, b) => a.displayName.localeCompare(b.displayName));
    if (!q) return list;
    return list.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [memberCandidates, memberSearch]);

  if (!isOpen) return null;

  if (pendingPhotoFile) {
    return (
      <ImageResizeModal
        inline
        file={pendingPhotoFile}
        defaultPreset="1:1"
        showCircleGuide
        onCancel={() => setPendingPhotoFile(null)}
        onConfirm={(resizedFile) => {
          setPendingPhotoFile(null);
          if (!user || !isAdmin) return;
          setUploadingPhoto(true);
          void (async () => {
            try {
              const url = await uploadImageToCloudinary(resizedFile);
              await updateMchartGroupSettings(user, groupSettings, { groupPhotoUrl: url });
              onToast(tr('Picha ya profile ya kundi imebadilishwa!', 'Group profile picture updated!'));
            } catch (err) {
              onToast(err instanceof Error ? err.message : tr('Imeshindwa kupakia picha.', 'Upload failed.'), 'error');
            } finally {
              setUploadingPhoto(false);
            }
          })();
        }}
      />
    );
  }

  const inviteUrl = `${window.location.origin}/?g=${encodeURIComponent(groupSettings.inviteCode || 'malosha')}`;
  const inviteHeadline = tr(
    `Jiunge kwenye Kundi la "${groupSettings.groupName}" — Malosha Forums!`,
    `Join "${groupSettings.groupName}" on Malosha Forums!`
  );
  const invitePitch = tr(
    'Karibu kwenye gumzo la pamoja lenye kasi: pata taarifa muhimu, shiriki picha, nyaraka, sauti na mijadala ya moja kwa moja na wanachama wote!',
    'Join our live community group chat for instant updates, photos, documents, voice notes, and real-time discussions!'
  );

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !isAdmin) return;
    if (draftName.trim().length < 2) {
      onToast(tr('Jina la kundi lazima liwe na angalau herufi 2.', 'Group name needs at least 2 characters.'), 'error');
      return;
    }
    setSaving(true);
    try {
      await updateMchartGroupSettings(user, groupSettings, {
        groupName: draftName.trim(),
        description: draftDesc.trim(),
      });
      setEditingMeta(false);
      onToast(tr('Taarifa za kundi zimehifadhiwa!', 'Group info updated!'));
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi.', 'Failed to save.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleLock = async () => {
    if (!user || !isAdmin) return;
    setSaving(true);
    try {
      const next = !groupSettings.isLocked;
      await updateMchartGroupSettings(user, groupSettings, { isLocked: next });
      onToast(
        next
          ? tr('Kundi limefungwa: Msimamizi pekee ndiye anaweza kutuma ujumbe.', 'Group locked: Only admins can send messages.')
          : tr('Kundi limefunguliwa: Wanachama wote wanaweza kutuma ujumbe.', 'Group unlocked: All members can send messages.')
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kubadili hali.', 'Update failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDisappearTimer = async (seconds: number) => {
    if (!user || !isAdmin) return;
    setSaving(true);
    try {
      await updateMchartGroupSettings(user, groupSettings, { disappearAfterSeconds: seconds });
      onToast(
        seconds === 0
          ? tr('Ujumbe hautafutika kiotomatiki.', 'Disappearing messages turned off.')
          : tr(
              `Ujumbe utafichwa kiotomatiki baada ya ${formatDisappearLabel(seconds, tr)}.`,
              `Messages set to disappear after ${formatDisappearLabel(seconds, tr)}.`
            )
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa kubadili muda.', 'Failed to update timer.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleKick = async (targetUid: string, targetName: string) => {
    if (!user || !isAdmin || targetUid === user.uid) return;
    const isCurrentlyKicked = groupSettings.kickedUids.includes(targetUid);
    const nextKicked = isCurrentlyKicked
      ? groupSettings.kickedUids.filter((id) => id !== targetUid)
      : [...groupSettings.kickedUids, targetUid];
    setSaving(true);
    try {
      await updateMchartGroupSettings(user, groupSettings, { kickedUids: nextKicked });
      onToast(
        isCurrentlyKicked
          ? tr(`${targetName} amerudishwa kwenye kundi.`, `${targetName} restored to the group.`)
          : tr(`${targetName} ameondolewa kwenye kundi.`, `${targetName} removed from the group.`)
      );
    } catch (err) {
      onToast(err instanceof Error ? err.message : tr('Imeshindwa.', 'Action failed.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handlePruneExpiredNow = async () => {
    if (!isAdmin || !groupSettings.disappearAfterSeconds) return;
    setPruning(true);
    try {
      const count = await pruneExpiredGroupMessages(groupSettings.disappearAfterSeconds);
      onToast(
        count > 0
          ? tr(`Ujumbe ${count} uliopitwa na muda umefutwa.`, `Cleared ${count} expired messages.`)
          : tr('Hakuna ujumbe uliopitwa na muda bado.', 'No expired messages found.')
      );
    } finally {
      setPruning(false);
    }
  };

  const handleShareInvite = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: inviteHeadline,
          text: `${inviteHeadline}\n\n${invitePitch}`,
          url: inviteUrl,
        });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${inviteHeadline}\n${invitePitch}\n${inviteUrl}`);
      setCopiedLink(true);
      onToast(tr('Kiungo na ujumbe wa mwaliko vimenakiliwa!', 'Invite link & message copied!'));
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast(inviteUrl);
    }
  };

  const handleCopyOnlyUrl = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      onToast(tr('Kiungo cha kundi kimenakiliwa!', 'Group invite link copied!'));
      window.setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      onToast(inviteUrl);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#F4F7FA]">
      {/* Top Green Header */}
      <div className="flex shrink-0 items-center gap-2.5 bg-[#075E54] px-3 py-2.5 text-white sm:px-5">
        <button
          type="button"
          onClick={onClose}
          aria-label={tr('Rudi', 'Back')}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex min-w-0 items-center gap-2">
          <Users className="h-5 w-5 shrink-0 text-[#25D366]" aria-hidden="true" />
          <h2 className="truncate font-display text-sm font-bold sm:text-base">
            {tr('Taarifa na Mipangilio ya Kundi', 'Group Info & Settings')}
          </h2>
        </div>
      </div>

      {/* Scrollable In-Page Content */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3.5 sm:p-5">
        <div className="mx-auto max-w-2xl space-y-3">
          {/* Group Profile Picture + Name + Description */}
          <section className="rounded-2xl border border-slate-200 bg-white p-4 text-center shadow-xs">
            <div className="relative mx-auto h-24 w-24">
              {groupSettings.groupPhotoUrl ? (
                <img
                  src={groupSettings.groupPhotoUrl}
                  alt={groupSettings.groupName}
                  referrerPolicy="no-referrer"
                  className="h-24 w-24 rounded-full border-2 border-[#00A884] object-cover shadow-sm"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full bg-[#075E54] text-white shadow-sm">
                  <Users className="h-11 w-11 text-[#25D366]" aria-hidden="true" />
                </div>
              )}

              {isAdmin && (
                <>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = '';
                      if (f) setPendingPhotoFile(f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => photoInputRef.current?.click()}
                    title={tr('Badilisha picha ya kundi', 'Change group photo')}
                    className="absolute right-0 bottom-0 flex h-8 w-8 items-center justify-center rounded-full bg-[#00A884] text-white ring-2 ring-white hover:bg-[#008F6F] disabled:opacity-60"
                  >
                    {uploadingPhoto ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </button>
                </>
              )}
            </div>

            {editingMeta && isAdmin ? (
              <form noValidate onSubmit={handleSaveMeta} className="mt-3 space-y-2.5 text-left">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">
                    {tr('Jina la Kundi', 'Group Name')}
                  </label>
                  <input
                    type="text"
                    maxLength={80}
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-900 focus:border-[#075E54] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600">
                    {tr('Maelezo ya Kundi', 'Group Description')}
                  </label>
                  <textarea
                    rows={3}
                    maxLength={400}
                    value={draftDesc}
                    onChange={(e) => setDraftDesc(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-800 focus:border-[#075E54] focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingMeta(false)}
                    className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    {tr('Ghairi', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-[#075E54] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#064E46] disabled:opacity-60"
                  >
                    {saving ? '...' : tr('Hifadhi', 'Save')}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {groupSettings.groupName}
                  </h3>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => setEditingMeta(true)}
                      aria-label={tr('Hariri jina la kundi', 'Edit group name')}
                      className="rounded-full p-1 text-slate-500 hover:bg-slate-100 hover:text-[#075E54]"
                    >
                      <Edit3 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {tr(
                    `Kundi · Wanachama ${memberCandidates.length}`,
                    `Group · ${memberCandidates.length} members`
                  )}
                </p>
                {groupSettings.description && (
                  <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-600">
                    {groupSettings.description}
                  </p>
                )}
              </>
            )}
          </section>

          {/* WhatsApp-Style Rich Group Invite Card + Link Share */}
          <section className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-xs">
            <div className="border-b border-emerald-100 bg-emerald-50/70 px-4 py-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-[#075E54]">
                <Link2 className="h-4 w-4 text-[#00A884]" aria-hidden="true" />
                <span>{tr('Link ya Kundi (Alika Marafiki)', 'Group Invite Link')}</span>
              </div>
            </div>

            <div className="p-3.5">
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-[#EFEAE2]/75 p-3">
                {groupSettings.groupPhotoUrl ? (
                  <img
                    src={groupSettings.groupPhotoUrl}
                    alt={groupSettings.groupName}
                    className="h-14 w-14 shrink-0 rounded-full border border-emerald-300 object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#075E54] text-white">
                    <Users className="h-7 w-7 text-[#25D366]" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">
                    {groupSettings.groupName}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-600">
                    {invitePitch}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] font-semibold text-[#075E54]">
                    {inviteUrl}
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleShareInvite()}
                  className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#00A884] px-4 py-2 text-xs font-bold text-white hover:bg-[#008F6F]"
                >
                  <Share2 className="h-4 w-4" aria-hidden="true" />
                  <span>{tr('Shiriki Link ya Kundi', 'Share Group Invite')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyOnlyUrl()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  <span>{copiedLink ? tr('Imenakiliwa', 'Copied') : tr('Nakili Link', 'Copy Link')}</span>
                </button>
              </div>
            </div>
          </section>

          {/* Group Settings: Disappearing Messages & Lock Controls */}
          <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    groupSettings.isLocked
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-[#075E54]'
                  }`}
                >
                  {groupSettings.isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-900">
                    {tr('Funga Kundi (Ruhusu Msimamizi Pekee)', 'Group Lock (Admin Only Messaging)')}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {groupSettings.isLocked
                      ? tr('Limefungwa — Msimamizi pekee ndiye anaweza kutuma ujumbe.', 'Locked — Only admins can send messages.')
                      : tr('Lipo wazi — Wanachama wote wanatuma ujumbe.', 'Open — All active members can send messages.')}
                  </p>
                </div>
              </div>
              {isAdmin && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleToggleLock()}
                  className={`min-h-[36px] shrink-0 rounded-xl px-3.5 text-xs font-bold text-white transition-colors ${
                    groupSettings.isLocked
                      ? 'bg-[#075E54] hover:bg-[#064E46]'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {groupSettings.isLocked ? tr('Fungua', 'Unlock') : tr('Funga', 'Lock')}
                </button>
              )}
            </div>

            <div className="border-t border-slate-100 pt-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {tr('Ujumbe Unaofutika Kiotomatiki (Disappearing)', 'Disappearing Messages')}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {tr('Muda wa sasa:', 'Current timer:')}{' '}
                      <strong className="text-[#075E54]">
                        {formatDisappearLabel(groupSettings.disappearAfterSeconds, tr)}
                      </strong>
                    </p>
                  </div>
                </div>
                {isAdmin && groupSettings.disappearAfterSeconds > 0 && (
                  <button
                    type="button"
                    disabled={pruning}
                    onClick={() => void handlePruneExpiredNow()}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-100"
                  >
                    {pruning ? '...' : tr('Safisha uliopita', 'Prune Expired')}
                  </button>
                )}
              </div>

              {isAdmin && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {DISAPPEAR_PRESETS.map((preset) => {
                    const active = groupSettings.disappearAfterSeconds === preset.seconds;
                    return (
                      <button
                        key={preset.seconds}
                        type="button"
                        disabled={saving}
                        onClick={() => void handleSetDisappearTimer(preset.seconds)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-bold transition-colors ${
                          active
                            ? 'border-[#075E54] bg-[#075E54] text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#075E54]'
                        }`}
                      >
                        {tr(preset.labelSw, preset.labelEn)}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="border-t border-slate-100 pt-3">
                {confirmClearAll ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                    <span className="text-xs font-bold text-red-900">
                      {tr('Una uhakika unataka kufuta ujumbe wote wa kundi?', 'Delete all group messages permanently?')}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={clearingAll}
                        onClick={() => setConfirmClearAll(false)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs font-bold text-slate-700"
                      >
                        {tr('Hapana', 'Cancel')}
                      </button>
                      <button
                        type="button"
                        disabled={clearingAll}
                        onClick={() => {
                          setClearingAll(true);
                          void Promise.resolve(onClearAllChats()).finally(() => {
                            setClearingAll(false);
                            setConfirmClearAll(false);
                            onClose();
                          });
                        }}
                        className="rounded-lg bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {clearingAll ? '...' : tr('Ndiyo, Safisha', 'Yes, Clear')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-red-700">
                      {tr('Safisha uwanja mzima wa kundi', 'Clear entire group chat history')}
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmClearAll(true)}
                      className="inline-flex items-center gap-1 rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>{tr('Safisha Zote', 'Clear All')}</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Shared Media Preview */}
          {sharedImages.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                <ImageIcon className="h-4 w-4 text-[#075E54]" aria-hidden="true" />
                <span>{tr('Picha za Karibuni Kwenye Kundi', 'Recent Group Media')} ({sharedImages.length})</span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {sharedImages.map((m) => (
                  <a
                    key={m.id}
                    href={m.attachmentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square overflow-hidden rounded-lg border border-slate-200 bg-slate-100"
                  >
                    <img
                      src={m.attachmentUrl}
                      alt={m.attachmentName || 'Group media'}
                      className="h-full w-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Members List & Admin Kick / Restore Controls */}
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3.5 py-2.5">
              <span className="text-xs font-bold text-slate-700">
                {tr('Wanachama wa Kundi', 'Group Members')} ({filteredMembers.length})
              </span>
              {groupSettings.kickedUids.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                  <ShieldAlert className="h-3 w-3" />
                  {tr(`${groupSettings.kickedUids.length} wametolewa`, `${groupSettings.kickedUids.length} removed`)}
                </span>
              )}
            </div>

            <div className="border-b border-slate-100 px-3 py-2">
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={memberSearch}
                  onChange={(e) => setMemberSearch(e.target.value)}
                  placeholder={tr('Tafuta mwanachama...', 'Search member...')}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-1.5 pr-3 pl-8 text-xs text-slate-900 focus:border-[#075E54] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
              {filteredMembers.map((m) => {
                const isSelf = Boolean(user && m.uid === user.uid);
                const kicked = groupSettings.kickedUids.includes(m.uid);
                return (
                  <div
                    key={m.uid}
                    className="flex items-center justify-between gap-2.5 px-3.5 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={m.displayName} photoURL={m.photoURL} uid={m.uid} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-slate-900">
                          {m.displayName} {isSelf ? tr('(Wewe)', '(You)') : ''}
                        </p>
                        {kicked && (
                          <p className="text-[10px] font-bold text-red-600">
                            {tr('Ameondolewa kundini', 'Removed from group')}
                          </p>
                        )}
                      </div>
                    </div>
                    {isAdmin && !isSelf && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void handleToggleKick(m.uid, m.displayName)}
                        className={`inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11px] font-bold transition-colors ${
                          kicked
                            ? 'bg-emerald-50 text-[#075E54] ring-1 ring-emerald-200 hover:bg-emerald-100'
                            : 'bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100'
                        }`}
                      >
                        {kicked ? (
                          <>
                            <UserPlus className="h-3.5 w-3.5" />
                            <span>{tr('Rejesha', 'Restore')}</span>
                          </>
                        ) : (
                          <>
                            <UserMinus className="h-3.5 w-3.5" />
                            <span>{tr('Ondoa', 'Remove')}</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

interface MchartGroupInviteModalProps {
  isOpen: boolean;
  groupSettings: MchartGroupSettings;
  membersCount: number;
  onJoin: () => void;
  onClose: () => void;
}

export const MchartGroupInviteModal: React.FC<MchartGroupInviteModalProps> = ({
  isOpen,
  groupSettings,
  membersCount,
  onJoin,
  onClose,
}) => {
  const { tr } = useLanguage();
  if (!isOpen) return null;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center overflow-y-auto bg-[#EFEAE2] p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200 bg-white text-center shadow-md">
        <div className="bg-[#075E54] px-6 pt-7 pb-10 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#25D366]">
            {tr('Mwaliko wa Kundi · Malosha', 'Group Invite · Malosha')}
          </p>
        </div>

        <div className="-mt-10 px-6 pb-6">
          <div className="mx-auto h-20 w-20 overflow-hidden rounded-full border-4 border-white bg-[#075E54] shadow-md">
            {groupSettings.groupPhotoUrl ? (
              <img
                src={groupSettings.groupPhotoUrl}
                alt={groupSettings.groupName}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-white">
                <Users className="h-9 w-9 text-[#25D366]" aria-hidden="true" />
              </div>
            )}
          </div>

          <h2 className="mt-3 font-display text-lg font-bold text-slate-900">
            {groupSettings.groupName}
          </h2>
          <p className="mt-0.5 text-xs font-semibold text-slate-500">
            {tr(`Kundi la Wanachama ${membersCount || 1}+`, `Community Group · ${membersCount || 1}+ members`)}
          </p>
          <p className="mt-2.5 text-xs leading-relaxed text-slate-600">
            {groupSettings.description ||
              tr(
                'Jiunge sasa ushiriki mijadala ya moja kwa moja, picha, sauti na nyaraka na wanachama wote!',
                'Join now to participate in live discussions, photos, voice notes, and shared documents!'
              )}
          </p>

          <div className="mt-5 flex flex-col gap-2">
            <button
              type="button"
              onClick={onJoin}
              className="min-h-[44px] w-full rounded-xl bg-[#00A884] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#008F6F]"
            >
              {tr('Jiunge na Kundi Sasa', 'Join Group Chat')}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[38px] w-full rounded-xl px-4 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
            >
              {tr('Rudi', 'Back')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Clock,
  Loader2,
  Lock,
  LockOpen,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useLanguage } from '../context/LanguageContext';
import {
  configureMchartNoteLock,
  removeNoteMemberAccess,
  setNoteMemberAccess,
} from '../services/forumService';
import {
  MchartNote,
  MchartNoteAccess,
  NoteLockTargetMode,
  normalizeVerificationBadge,
  UserProfile,
} from '../types';

interface NoteLockManageModalProps {
  note: MchartNote | null;
  onClose: () => void;
  onToast: (message: string, kind?: 'success' | 'error') => void;
  inline?: boolean;
}

export const NoteLockManageModal: React.FC<NoteLockManageModalProps> = ({
  note,
  onClose,
  onToast,
  inline = false,
}) => {
  const { tr } = useLanguage();
  const [isLocked, setIsLocked] = useState(true);
  const [targetMode, setTargetMode] = useState<NoteLockTargetMode>('all');
  const [lockModeType, setLockModeType] = useState<'admin_only' | 'paid'>('admin_only');
  const [priceInput, setPriceInput] = useState('0');
  const [currency, setCurrency] = useState('TZS');
  const [instructions, setInstructions] = useState('');
  const [savingConfig, setSavingConfig] = useState(false);

  const [members, setMembers] = useState<UserProfile[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [accessMap, setAccessMap] = useState<Record<string, MchartNoteAccess>>({});
  const [memberSearch, setMemberSearch] = useState('');
  const [updatingUid, setUpdatingUid] = useState<string | null>(null);

  useEffect(() => {
    if (!note) return;
    setIsLocked(note.isLocked !== undefined ? Boolean(note.isLocked) : true);
    setTargetMode(note.lockedTargetMode === 'selected' ? 'selected' : 'all');
    const hasPrice = Boolean(note.lockPrice && note.lockPrice > 0);
    setLockModeType(hasPrice ? 'paid' : 'admin_only');
    setPriceInput(hasPrice ? String(note.lockPrice) : '0');
    setCurrency(note.lockCurrency || 'TZS');
    setInstructions(
      note.paymentInstructions ||
        tr(
          'Lipia kiasi kilichoonyeshwa kisha weka namba yako ya simu au kumbukumbu ya muamala hapo chini ili ufunguliwe note hii.',
          'Pay the listed amount and submit your phone number or payment reference below to unlock this note.'
        )
    );
  }, [note, tr]);

  // Listen to per-user access records for this note
  useEffect(() => {
    if (!note) return;
    const path = `mchart_notes/${note.id}/access`;
    const unsub = onSnapshot(
      collection(db, 'mchart_notes', note.id, 'access'),
      (snap) => {
        const next: Record<string, MchartNoteAccess> = {};
        snap.docs.forEach((d) => {
          const data = d.data();
          const st =
            data.status === 'unlocked' || data.status === 'locked' || data.status === 'pending'
              ? data.status
              : 'pending';
          next[d.id] = {
            noteId: String(data.noteId || note.id),
            userId: String(data.userId || d.id),
            userName: String(data.userName || 'Mwanachama'),
            status: st,
            paymentReference: String(data.paymentReference || ''),
            createdAt: data.createdAt || null,
            updatedAt: data.updatedAt || null,
          };
        });
        setAccessMap(next);
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [note]);

  // Load members list so owner can unlock or lock any member explicitly
  useEffect(() => {
    if (!note) return;
    setLoadingMembers(true);
    const path = 'users';
    const unsub = onSnapshot(
      collection(db, 'users'),
      (snap) => {
        const list: UserProfile[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              uid: String(data.uid || d.id),
              displayName: String(data.displayName || 'Mwanachama'),
              photoURL: String(data.photoURL || ''),
              bio: String(data.bio || ''),
              role: (data.role === 'moderator' ? 'moderator' : 'member') as
                | 'member'
                | 'moderator',
              verificationBadge: normalizeVerificationBadge(data.verificationBadge),
              topicsCount: Number(data.topicsCount || 0),
              repliesCount: Number(data.repliesCount || 0),
              createdAt: data.createdAt || null,
              updatedAt: data.updatedAt || null,
            };
          })
          .filter((u) => u.verificationBadge !== 'owner')
          .sort((a, b) => a.displayName.localeCompare(b.displayName));
        setMembers(list);
        setLoadingMembers(false);
      },
      (error) => {
        setLoadingMembers(false);
        handleFirestoreError(error, OperationType.LIST, path);
      }
    );
    return () => unsub();
  }, [note]);

  const pendingList = useMemo(
    () =>
      Object.values(accessMap)
        .filter((a) => a.status === 'pending')
        .sort((a, b) => a.userName.localeCompare(b.userName)),
    [accessMap]
  );

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const sorted = [...members].sort((a, b) => {
      const sa = accessMap[a.uid]?.status || '';
      const sb = accessMap[b.uid]?.status || '';
      const score = (s: string) => (s === 'pending' ? 0 : s === 'locked' ? 1 : s === 'unlocked' ? 2 : 3);
      const diff = score(sa) - score(sb);
      if (diff !== 0) return diff;
      return a.displayName.localeCompare(b.displayName);
    });
    if (!q) return sorted;
    return sorted.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [members, memberSearch, accessMap]);

  if (!note) return null;

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingConfig) return;
    const numericPrice =
      lockModeType === 'admin_only'
        ? 0
        : Math.max(0, Math.floor(Number(priceInput.replace(/[^0-9]/g, '') || 0)));
    if (isLocked && lockModeType === 'paid' && numericPrice <= 0) {
      onToast(
        tr('Weka kiasi cha kulipia (zaidi ya 0) au chagua "Funga Kabisa na Msimamizi".', 'Enter a payment amount greater than 0 or pick Admin Lock Only.'),
        'error'
      );
      return;
    }

    setSavingConfig(true);
    try {
      await configureMchartNoteLock(note, {
        isLocked,
        lockedTargetMode: targetMode,
        lockPrice: numericPrice,
        lockCurrency: currency,
        paymentInstructions: instructions,
      });
      onToast(
        !isLocked
          ? tr('Note imefunguliwa — sasa ni bure kwa wote.', 'Note unlocked for all members.')
          : numericPrice === 0
            ? tr('Note imefungwa kabisa — wasio na ruhusa hawawezi kusoma.', 'Note strictly locked by admin.')
            : tr('Note imefungwa kwa malipo kikamilifu.', 'Note locked with payment requirement.')
      );
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kuhifadhi mipangilio.', 'Failed to save lock settings.'),
        'error'
      );
    } finally {
      setSavingConfig(false);
    }
  };

  const handleMemberAccessChange = async (
    uid: string,
    name: string,
    action: 'unlocked' | 'locked' | 'clear'
  ) => {
    if (updatingUid) return;
    setUpdatingUid(uid);
    try {
      if (action === 'clear') {
        await removeNoteMemberAccess(note.id, uid);
        onToast(tr(`Ruhusa ya ${name} imewekwa kawaida.`, `Reset access for ${name}.`));
      } else {
        const existingRef = accessMap[uid]?.paymentReference || '';
        await setNoteMemberAccess(note.id, uid, name, action, existingRef);
        onToast(
          action === 'unlocked'
            ? tr(`Note imefunguliwa kwa ${name}!`, `Note unlocked for ${name}!`)
            : tr(`Note imefungwa kwa ${name}.`, `Note locked for ${name}.`)
        );
      }
    } catch (err) {
      onToast(
        err instanceof Error ? err.message : tr('Imeshindwa kusasisha ruhusa.', 'Failed updating access.'),
        'error'
      );
    } finally {
      setUpdatingUid(null);
    }
  };

  const contentNode = (
      <div
        className={
          inline
            ? 'flex h-full min-h-0 w-full flex-col overflow-hidden bg-white'
            : 'flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-2xl'
        }
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            {inline && (
              <button
                type="button"
                onClick={onClose}
                aria-label={tr('Rudi', 'Back')}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="min-w-0">
              <h2
                id="note-lock-modal-title"
                className="flex items-center gap-2 font-display text-base font-bold text-[#0E2640] sm:text-lg"
              >
                <Lock className="h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
                <span className="truncate">{tr('Funga Note & Dhibiti Malipo', 'Lock Note & Payment Access')}</span>
              </h2>
              <p className="mt-0.5 truncate text-xs text-slate-500">{note.title}</p>
            </div>
          </div>
          {!inline && (
            <button
              type="button"
              onClick={onClose}
              aria-label={tr('Funga dirisha', 'Close modal')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-6 overflow-y-auto px-4 py-4 sm:px-6">
          {note.visibility === 'private' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-950">
              <strong className="font-bold">
                {tr('Note ya Siri (Private):', 'Private Member Note:')}
              </strong>{' '}
              {tr(
                `Note hii iliandaliwa na ${note.authorName} kwa hali ya Private. Ukiifunga hapa (Funga Kabisa au Kwa Malipo), hata mwenyewe (${note.authorName}) hataweza kuisoma, kuihariri, wala kuifuta mpaka umfungulie.`,
                `Created privately by ${note.authorName}. Locking it here prevents even ${note.authorName} from reading, editing, or deleting it until you unlock it.`
              )}
            </div>
          )}

          {/* Lock & Price Settings Form */}
          <form onSubmit={(e) => void handleSaveSettings(e)} className="space-y-4 border-b border-slate-200 pb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold tracking-wide text-slate-700 uppercase">
                {tr('Hali ya Note Hii', 'Lock Status')}
              </span>
              <div className="inline-flex rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => setIsLocked(true)}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                    isLocked ? 'bg-[#0E2640] text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Funga kwa Malipo', 'Locked (Paid)')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsLocked(false)}
                  className={`inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition-colors ${
                    !isLocked ? 'bg-[#075E54] text-white shadow-xs' : 'text-slate-600'
                  }`}
                >
                  <LockOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tr('Bure kwa Wote', 'Open / Free')}</span>
                </button>
              </div>
            </div>

            {isLocked && (
              <>
                <div>
                  <span className="block text-xs font-semibold text-slate-700">
                    {tr('Nani Wanaofungiwa Note Hii?', 'Who Should Be Restricted?')}
                  </span>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setTargetMode('all')}
                      className={`flex min-h-[48px] items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                        targetMode === 'all'
                          ? 'border-[#0E2640] bg-slate-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {tr('Funga kwa Wote', 'Lock for Everyone')}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {tr('Mtu yeyote lazima alipie kisha umfungulie.', 'Everyone must pay before you unlock them.')}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetMode('selected')}
                      className={`flex min-h-[48px] items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                        targetMode === 'selected'
                          ? 'border-[#0E2640] bg-slate-50'
                          : 'border-slate-200 bg-white hover:bg-slate-50'
                      }`}
                    >
                      <Users className="mt-0.5 h-4 w-4 shrink-0 text-[#075E54]" aria-hidden="true" />
                      <div>
                        <p className="text-xs font-bold text-slate-900">
                          {tr('Watumiaji Maalumu Tu', 'Specific Users Only')}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {tr('Funga watumiaji utakaowachagua chini pekee.', 'Only selected users below require payment.')}
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-semibold text-slate-700">
                    {tr('Aina ya Kufuli (Lock Mode)', 'Lock Access Mode')}
                  </span>
                  <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLockModeType('admin_only');
                        setPriceInput('0');
                      }}
                      className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                        lockModeType === 'admin_only'
                          ? 'border-[#0E2640] bg-slate-50 text-[#0E2640]'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <Lock className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                      <span>{tr('Funga Kabisa (Ruhusa ya Msimamizi Tu)', 'Strict Admin Lock (No Reading)')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setLockModeType('paid');
                        if (!priceInput || priceInput === '0') setPriceInput('5000');
                      }}
                      className={`flex min-h-[44px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold ${
                        lockModeType === 'paid'
                          ? 'border-[#0E2640] bg-slate-50 text-[#0E2640]'
                          : 'border-slate-200 bg-white text-slate-600'
                      }`}
                    >
                      <ShieldCheck className="h-3.5 w-3.5 text-[#075E54]" aria-hidden="true" />
                      <span>{tr('Funga Kwa Malipo (Paid Unlock)', 'Locked Behind Payment')}</span>
                    </button>
                  </div>
                </div>

                {lockModeType === 'paid' && (
                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="col-span-2">
                      <label htmlFor="lock-price-input" className="block text-xs font-semibold text-slate-700">
                        {tr('Kiasi cha Kulipia', 'Payment Amount')}
                      </label>
                      <input
                        id="lock-price-input"
                        type="number"
                        min={1}
                        max={100000000}
                        value={priceInput}
                        onChange={(e) => setPriceInput(e.target.value)}
                        placeholder="5000"
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 px-3 text-sm font-bold text-slate-900 tabular-nums focus:border-[#075E54] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="lock-currency-select" className="block text-xs font-semibold text-slate-700">
                        {tr('Sarafu', 'Currency')}
                      </label>
                      <select
                        id="lock-currency-select"
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className="mt-1 min-h-[44px] w-full rounded-xl border border-slate-300 bg-white px-2.5 text-sm font-bold text-slate-900 focus:border-[#075E54] focus:outline-none"
                      >
                        <option value="TZS">TZS</option>
                        <option value="KES">KES</option>
                        <option value="USD">USD</option>
                      </select>
                    </div>
                  </div>
                )}

                <div>
                  <label htmlFor="lock-pay-instructions" className="block text-xs font-semibold text-slate-700">
                    {lockModeType === 'paid'
                      ? tr('Ujumbe wa Kulipia (Namba ya Malipo / Maelekezo)', 'Payment Message & Instructions')
                      : tr('Ujumbe wa Kufuli kwa Wasomaji (Hiari)', 'Lock Notice for Members (Optional)')}
                  </label>
                  <textarea
                    id="lock-pay-instructions"
                    rows={3}
                    maxLength={500}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder={
                      lockModeType === 'paid'
                        ? tr(
                            'Mfano: Lipia kwenda M-Pesa 07XX XXX XXX (Jina: ...) kisha tuma jina au kumbukumbu ya muamala.',
                            'e.g. Pay via M-Pesa 07XX XXX XXX and enter your transaction code below.'
                          )
                        : tr(
                            'Mfano: Note hii imefungwa na msimamizi kwa muda. Wasiliana na msimamizi kwa ruhusa.',
                            'e.g. This note is strictly locked by the admin.'
                          )
                    }
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-[#075E54] focus:outline-none"
                  />
                </div>
              </>
            )}

            <button
              type="submit"
              disabled={savingConfig}
              className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[#075E54] px-4 py-2 text-xs font-bold text-white hover:bg-[#064E46] disabled:opacity-60"
            >
              {savingConfig ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldCheck className="h-4 w-4 text-[#25D366]" aria-hidden="true" />
              )}
              <span>
                {savingConfig
                  ? tr('Inahifadhi...', 'Saving...')
                  : isLocked
                    ? tr('Hifadhi Kufuli & Bei ya Note', 'Save Lock & Price Settings')
                    : tr('Fungua Note Iwe Bure', 'Unlock Note for Everyone')}
              </span>
            </button>
          </form>

          {/* Pending Payment Requests */}
          {pendingList.length > 0 && (
            <section aria-label={tr('Maombi ya Kufunguliwa', 'Pending Payment Requests')}>
              <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-800 uppercase">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span>
                  {tr(
                    `Maombi Mapya ya Malipo (${pendingList.length})`,
                    `Pending Payment Confirmations (${pendingList.length})`
                  )}
                </span>
              </h3>
              <div className="mt-2 divide-y divide-amber-200/70 overflow-hidden rounded-xl border border-amber-200 bg-amber-50/50">
                {pendingList.map((req) => (
                  <div
                    key={req.userId}
                    className="flex flex-col justify-between gap-2.5 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-900">{req.userName}</p>
                      <p className="mt-0.5 text-xs text-slate-700">
                        {req.paymentReference || tr('Ameomba kufunguliwa baada ya kulipia', 'Requested unlock after payment')}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={updatingUid === req.userId}
                        onClick={() =>
                          void handleMemberAccessChange(req.userId, req.userName, 'unlocked')
                        }
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-[#075E54] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#064E46] disabled:opacity-50"
                      >
                        <Check className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                        <span>{tr('Thibitisha & Fungua', 'Approve & Unlock')}</span>
                      </button>
                      <button
                        type="button"
                        disabled={updatingUid === req.userId}
                        onClick={() =>
                          void handleMemberAccessChange(req.userId, req.userName, 'locked')
                        }
                        className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{tr('Funga', 'Keep Locked')}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Member Directory Per-User Access Control */}
          <section aria-label={tr('Dhibiti Ruhusa za Wanachama', 'Member Access List')}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-bold text-[#0E2640] uppercase">
                {tr('Chagua Wanachama wa Kufungia au Kufungulia', 'Lock or Unlock Specific Members')}
              </h3>
              <span className="text-xs text-slate-500 tabular-nums">
                {members.length} {tr('wanachama', 'members')}
              </span>
            </div>

            <div className="relative mt-2">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                type="search"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder={tr('Tafuta jina la mwanachama...', 'Search member name...')}
                className="min-h-[42px] w-full rounded-xl border border-slate-200 bg-slate-50 pr-3 pl-9 text-sm text-slate-900 focus:border-[#075E54] focus:bg-white focus:outline-none"
              />
            </div>

            {loadingMembers ? (
              <div className="py-6 text-center text-xs text-slate-500">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#075E54]" />
              </div>
            ) : filteredMembers.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-500">
                {tr('Hakuna wanachama waliopatikana.', 'No members found.')}
              </p>
            ) : (
              <div className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {filteredMembers.map((member) => {
                  const rec = accessMap[member.uid];
                  const st = rec?.status;
                  const isUserLocked =
                    st === 'locked' ||
                    st === 'pending' ||
                    (isLocked && targetMode === 'all' && st !== 'unlocked');
                  const isBusy = updatingUid === member.uid;

                  return (
                    <div
                      key={member.uid}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {member.displayName}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          {st === 'unlocked'
                            ? tr('Amefunguliwa (Anaweza kusoma)', 'Unlocked (Can read)')
                            : st === 'pending'
                              ? tr('Anasubiri uthibitisho wa malipo', 'Waiting payment approval')
                              : st === 'locked'
                                ? tr('Amefungiwa mahususi hadi alipie', 'Locked until payment')
                                : isLocked && targetMode === 'all'
                                  ? tr('Imefungwa (Hajalipia)', 'Locked (Unpaid)')
                                  : tr('Ruhusa ya kawaida (Anaweza kusoma)', 'Standard access (Open)')}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {isUserLocked ? (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleMemberAccessChange(
                                member.uid,
                                member.displayName,
                                'unlocked'
                              )
                            }
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl bg-[#075E54] px-3 py-1 text-xs font-bold text-white hover:bg-[#064E46] disabled:opacity-50"
                          >
                            <LockOpen className="h-3.5 w-3.5 text-[#25D366]" aria-hidden="true" />
                            <span>{tr('Fungua', 'Unlock')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() =>
                              void handleMemberAccessChange(
                                member.uid,
                                member.displayName,
                                'locked'
                              )
                            }
                            className="inline-flex min-h-[38px] items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{tr('Funga', 'Lock')}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
  );

  if (inline) {
    return contentNode;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-xs sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="note-lock-modal-title"
    >
      {contentNode}
    </div>
  );
};

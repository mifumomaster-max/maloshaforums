import React, { useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Calendar,
  CheckCircle2,
  CreditCard,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { verifyMemberIdByInput } from '../services/forumService';
import { MemberIdVerificationResult, VERIFICATION_BADGE_META } from '../types';
import { Avatar } from './Avatar';
import { VerificationBadge } from './VerificationBadge';

interface MemberIdVerifierProps {
  compact?: boolean;
}

function formatDotDate(ts: { toDate: () => Date } | null | undefined): string {
  if (!ts) return '—';
  try {
    const d = ts.toDate();
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}.${mm}.${yyyy}`;
  } catch {
    return '—';
  }
}

export const MemberIdVerifier: React.FC<MemberIdVerifierProps> = ({ compact = false }) => {
  const { tr, getBadgeLabel } = useLanguage();
  const [cardQuery, setCardQuery] = useState('');
  const [serialQuery, setSerialQuery] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<MemberIdVerificationResult | null>(null);
  const [lastSearchedQuery, setLastSearchedQuery] = useState('');

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = cardQuery.trim();
    if (!q) {
      setError(
        tr(
          'Ingiza Namba ya Kitambulisho (mf. MLF-XCQH8Q4P) au Namba ya Usalama (tarakimu 8).',
          'Enter a Member ID Number (e.g. MLF-XCQH8Q4P) or 8-digit Security Serial.'
        )
      );
      return;
    }

    setChecking(true);
    setError('');
    try {
      const res = await verifyMemberIdByInput(q, serialQuery);
      setResult(res);
      setLastSearchedQuery(q.toUpperCase());
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kuhakiki kitambulisho.', 'Failed to verify member ID.')
      );
    } finally {
      setChecking(false);
    }
  };

  const handleClear = () => {
    setCardQuery('');
    setSerialQuery('');
    setResult(null);
    setError('');
    setLastSearchedQuery('');
  };

  const holder = result?.record || null;

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${
        compact ? 'p-4' : 'p-5 sm:p-6'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0E2640] text-amber-400">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-slate-900 sm:text-lg">
            {tr(
              'Uhakiki wa Uhalali wa Kitambulisho (Anti-Fake ID)',
              'Official Member ID Authenticity Checker'
            )}
          </h3>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-600">
            {tr(
              'Ingiza Namba ya Kitambulisho (mf. MLF-XCQH8Q4P) au Namba ya Usalama ya ubavuni (tarakimu 8) ili kuthibitisha kama kitambulisho ni halisi kutoka Malosha Forums au ni cha kughushi (Fake).',
              'Enter a Member ID Number (e.g. MLF-XCQH8Q4P) or 8-digit vertical Security Serial to confirm whether an ID card is genuine or forged.'
            )}
          </p>
        </div>
      </div>

      <form onSubmit={(e) => void handleVerify(e)} className="mt-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
          <div className="sm:col-span-6">
            <label
              htmlFor="verify-card-no"
              className="block text-[11px] font-bold tracking-wide text-slate-700 uppercase"
            >
              {tr('Namba ya Kitambulisho / Serial', 'Member ID No. / Serial')}
            </label>
            <div className="relative mt-1">
              <CreditCard
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="verify-card-no"
                type="text"
                value={cardQuery}
                onChange={(e) => setCardQuery(e.target.value.toUpperCase())}
                placeholder="MLF-XCQH8Q4P"
                className="min-h-[42px] w-full rounded-lg border border-slate-300 bg-slate-50/70 py-2 pr-3 pl-9 font-mono text-sm font-bold text-slate-900 uppercase placeholder:font-normal placeholder:text-slate-400 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-3">
            <label
              htmlFor="verify-control-serial"
              className="block text-[11px] font-bold tracking-wide text-slate-700 uppercase"
            >
              {tr('Serial ya Ubavuni (Hiari)', 'Side Serial (Optional)')}
            </label>
            <input
              id="verify-control-serial"
              type="text"
              inputMode="numeric"
              maxLength={12}
              value={serialQuery}
              onChange={(e) => setSerialQuery(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="00482917"
              className="mt-1 min-h-[42px] w-full rounded-lg border border-slate-300 bg-slate-50/70 px-3 py-2 font-mono text-sm font-bold text-slate-900 placeholder:font-normal placeholder:text-slate-400 focus:border-[#1D4E89] focus:bg-white focus:outline-none"
            />
          </div>

          <div className="flex items-end gap-2 sm:col-span-3">
            <button
              type="submit"
              disabled={checking}
              className="inline-flex min-h-[42px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#0E2640] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#163A5F] disabled:opacity-60"
            >
              {checking ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="h-4 w-4 text-amber-400" aria-hidden="true" />
              )}
              <span>{checking ? tr('Inahakiki...', 'Checking...') : tr('Hakiki ID', 'Verify ID')}</span>
            </button>

            {(result || cardQuery || serialQuery) && (
              <button
                type="button"
                onClick={handleClear}
                className="min-h-[42px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                {tr('Futa', 'Clear')}
              </button>
            )}
          </div>
        </div>
      </form>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}

      {/* Diagnostic Verdict */}
      {result && (
        <div className="mt-4">
          {result.authentic && result.reason === 'valid' && holder ? (
            <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50/80 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 pb-3">
                <div className="flex items-center gap-2 text-emerald-900">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-extrabold tracking-wide uppercase">
                      {tr(
                        'KITAMBULISHO HALALI · MWANACHAMA HALISI WA MALOSHA FORUMS',
                        'AUTHENTIC ID · GENUINE MALOSHA FORUMS MEMBER'
                      )}
                    </p>
                    <p className="text-[11px] font-medium text-emerald-800">
                      {result.source === 'registry'
                        ? tr(
                            'Imethibitishwa moja kwa moja kwenye usajili wa vitambulisho (Registry).',
                            'Verified directly against the official Member ID Registry.'
                          )
                        : tr(
                            'Imethibitishwa kutoka akaunti halisi ya mwanachama kwenye mfumo.',
                            'Verified from active member account record.'
                          )}
                    </p>
                  </div>
                </div>

                <span className="rounded-md bg-emerald-700 px-2.5 py-1 font-mono text-xs font-bold text-white tabular-nums">
                  {holder.cardNumber}
                </span>
              </div>

              <div className="mt-3.5 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Avatar name={holder.displayName} photoURL={holder.photoURL} size="lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-display text-lg font-bold text-slate-900">
                      {holder.displayName}
                    </p>
                    <VerificationBadge badge={holder.verificationBadge} size="md" showLabel />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        {tr('Namba ya ID', 'ID Number')}
                      </p>
                      <p className="font-mono font-bold text-slate-900">{holder.cardNumber}</p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        {tr('Serial Usalama', 'Security Serial')}
                      </p>
                      <p className="font-mono font-bold text-slate-900 tabular-nums">
                        {holder.controlSerial}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        {tr('Imetolewa', 'Issued')}
                      </p>
                      <p className="inline-flex items-center gap-1 font-bold text-slate-900 tabular-nums">
                        <Calendar className="h-3 w-3 text-emerald-700" aria-hidden="true" />
                        {formatDotDate(holder.issuedAt)}
                      </p>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-white/90 px-2.5 py-1.5">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase">
                        {tr('Hadi Tarehe', 'Expires')}
                      </p>
                      <p className="font-bold text-slate-900 tabular-nums">
                        {formatDotDate(holder.expiresAt)}
                      </p>
                    </div>
                  </div>

                  <p className="font-mono text-[11px] text-slate-600">
                    UID: {holder.uid} ·{' '}
                    <span className="font-sans font-semibold text-emerald-800">
                      {getBadgeLabel(holder.verificationBadge)}
                    </span>{' '}
                    ·{' '}
                    <span className="font-sans font-bold text-emerald-700">
                      {tr('HALI: HAI (ACTIVE)', 'STATUS: ACTIVE')}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          ) : result.reason === 'serial_mismatch' && holder ? (
            <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4">
              <div className="flex items-start gap-2.5 text-red-900">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-extrabold tracking-wide uppercase">
                    {tr(
                      'TAHADHARI: NAMBA HAZILINGANI — KITAMBULISHO HIKI KINAWEZA KUWA KIMEGHUSHIWA (TAMPERED / FAKE)',
                      'WARNING: SECURITY SERIAL MISMATCH — THIS CARD MAY BE FORGED OR TAMPERED'
                    )}
                  </p>
                  <p className="mt-1 text-xs text-red-800">
                    {tr(
                      `Namba ${holder.cardNumber} ipo kwa jina la ${holder.displayName}, lakini Serial ya Usalama uliyoingiza (${serialQuery}) HAILINGANI na serial halisi iliyosajiliwa kwenye mfumo (${holder.controlSerial}).`,
                      `Card ${holder.cardNumber} belongs to ${holder.displayName}, but the entered Security Serial (${serialQuery}) does NOT match the authentic registered serial (${holder.controlSerial}).`
                    )}
                  </p>
                </div>
              </div>
            </div>
          ) : result.reason === 'suspended' && holder ? (
            <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4">
              <div className="flex items-start gap-2.5 text-amber-950">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold tracking-wide uppercase">
                    {tr(
                      'KITAMBULISHO KIMEFUNGWA / AKAUNTI IMESIMAMISHWA',
                      'ID INVALIDATED / MEMBER ACCOUNT SUSPENDED'
                    )}
                  </p>
                  <p className="mt-1 text-xs text-amber-900">
                    {tr(
                      `Kitambulisho ${holder.cardNumber} (Serial ${holder.controlSerial}) kilikuwa cha ${holder.displayName}, lakini akaunti yake imefungwa na mmiliki wa jukwaa.`,
                      `ID ${holder.cardNumber} (Serial ${holder.controlSerial}) belonged to ${holder.displayName}, whose account is currently suspended.`
                    )}
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Lock className="h-3.5 w-3.5 text-red-700" aria-hidden="true" />
                    <span className="text-xs font-bold text-red-800">
                      {tr('HAIPASWI KUKUBALIWA KAMA UTAMBULISHO HAI', 'NOT VALID FOR ACTIVE MEMBERSHIP')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border-2 border-red-500 bg-red-50 p-4">
              <div className="flex items-start gap-2.5 text-red-900">
                <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden="true" />
                <div>
                  <p className="text-xs font-extrabold tracking-wide uppercase">
                    {tr(
                      'TAHADHARI: KITAMBULISHO BANDIA (FAKE) / HAKIPO KWENYE MFUMO',
                      'WARNING: FAKE / UNREGISTERED ID NUMBER'
                    )}
                  </p>
                  <p className="mt-1 text-xs text-red-800">
                    {tr(
                      `Hakuna mwanachama yeyote wa Malosha Forums mwenye namba "${lastSearchedQuery}". Kitambulisho hiki hakijatolewa na mfumo rasmi wa Malosha Forums.`,
                      `No registered Malosha Forums member matches "${lastSearchedQuery}". This ID card is not authentic.`
                    )}
                  </p>
                  <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-700">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {VERIFICATION_BADGE_META.owner.label} · {tr('Hakuna Rekodi', 'No Record Found')}
                    </span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

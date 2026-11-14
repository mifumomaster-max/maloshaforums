import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';
import { REPORT_REASON_LABELS, ReportReason } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  targetType: 'topic' | 'reply';
  onClose: () => void;
  onSubmit: (reason: ReportReason, details: string) => Promise<void>;
}

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  targetType,
  onClose,
  onSubmit,
}) => {
  const { tr, getReportReasonLabel } = useLanguage();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setReason('spam');
      setDetails('');
      setError('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await onSubmit(reason, details);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Imeshindwa kutuma ripoti.', 'Failed to submit report.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="w-full max-w-md rounded-t-2xl border border-stone-200 bg-white p-6 shadow-xl sm:rounded-xl">
        <div className="flex items-center justify-between border-b border-stone-200 pb-3.5">
          <h2 id="report-modal-title" className="font-display text-lg font-semibold text-stone-900">
            {targetType === 'topic'
              ? tr('Ripoti Mada Hii', 'Report This Post')
              : tr('Ripoti Jibu Hili', 'Report This Comment')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={tr('Funga', 'Close')}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="report-reason" className="block text-xs font-semibold text-stone-700">
              {tr('Sababu ya Kuripoti', 'Reason for Reporting')}
            </label>
            <select
              id="report-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as ReportReason)}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:border-emerald-800 focus:outline-none"
            >
              {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((key) => (
                <option key={key} value={key}>
                  {getReportReasonLabel(key)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="report-details" className="block text-xs font-semibold text-stone-700">
              {tr('Maelezo ya Ziada (Si lazima)', 'Additional Details (Optional)')}
            </label>
            <textarea
              id="report-details"
              rows={3}
              maxLength={500}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder={tr(
                'Eleza kwa ufupi kwanini maudhui haya yanakiuka kanuni za jukwaa...',
                'Briefly explain why this content violates platform guidelines...'
              )}
              className="mt-1.5 w-full rounded-lg border border-stone-300 bg-white p-3 text-sm text-stone-900 focus:border-emerald-800 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs font-medium text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
            >
              {tr('Ghairi', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:opacity-60"
            >
              {submitting ? tr('Inatuma...', 'Submitting...') : tr('Tuma Ripoti', 'Submit Report')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

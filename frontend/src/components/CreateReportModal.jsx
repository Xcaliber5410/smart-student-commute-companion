import React, { useState } from 'react';
import { Send, AlertTriangle, ShieldCheck } from 'lucide-react';
import { Input, Select, Textarea, Modal } from './ui';
import { validateForm, validateRequired, validateText, focusFirstInvalid, createSubmitGuard } from '../utils/validation';

/** Field → DOM id map so the first invalid control receives focus. */
const FIELD_IDS = {
  pseudonym: 'report-pseudonym',
  area: 'report-area',
  route_name: 'report-route-name',
  message: 'report-message',
};

export default function CreateReportModal({ isOpen, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    pseudonym: '',
    area: '',
    route_name: '',
    mode: 'auto',
    message: '',
    impact: 'medium',
    durationObservedMinutes: 60
  });

  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();

    // Reusable client-side validation
    const { isValid, errors: validationErrors } = validateForm(formData, {
      area: [
        (v) => validateRequired(v, 'Area / Station'),
        (v) => validateText(v, { minLength: 3, maxLength: 80, label: 'Area / Station' })
      ],
      message: [
        (v) => validateRequired(v, 'Report message'),
        (v) => validateText(v, { minLength: 10, maxLength: 250, label: 'Report message' })
      ],
      pseudonym: [
        (v) => validateText(v, { maxLength: 40, label: 'Pseudonym' })
      ],
      route_name: [
        (v) => validateText(v, { maxLength: 50, label: 'Observed route' })
      ]
    });

    if (!isValid) {
      setErrors(validationErrors);
      // Focus the first invalid field for keyboard/switch users
      focusFirstInvalid(validationErrors, FIELD_IDS);
      // Preserves entered values while alerting user to fix errors
      return;
    }

    setErrors({});
    onSubmit({
      ...formData,
      pseudonym: formData.pseudonym.trim() || 'Student_Rider',
      route_name: formData.route_name.trim() || 'Transit Link',
      area: formData.area.trim(),
      message: formData.message.trim()
    });
  };

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Post a Student Commute Report"
      icon={<AlertTriangle className="w-5 h-5 text-amber-400" />}
      size="lg"
    >
        {/* Form */}
        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
          <div className="bg-emerald-950/20 border border-emerald-500/30 rounded-xl p-3 text-xs text-emerald-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Anonymous &amp; privacy-safe. Reports automatically decay over 120 minutes.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Student Pseudonym (Optional)"
              id="report-pseudonym"
              placeholder="e.g. Rahul_IITB, Sneha_VJTI"
              value={formData.pseudonym}
              onChange={(e) => handleFieldChange('pseudonym', e.target.value)}
              error={errors.pseudonym}
              hint="Defaults to Student_Rider"
              maxLength={40}
            />

            <Input
              label="Area / Station"
              id="report-area"
              required
              placeholder="e.g. Andheri East, Dadar Station..."
              value={formData.area}
              onChange={(e) => handleFieldChange('area', e.target.value)}
              error={errors.area}
              maxLength={80}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Mode"
              id="report-mode"
              value={formData.mode}
              onChange={(e) => handleFieldChange('mode', e.target.value)}
              options={[
                { value: 'auto', label: 'Shared Auto / Taxi' },
                { value: 'train', label: 'Local Train' },
                { value: 'metro', label: 'Metro' },
                { value: 'bus', label: 'BEST Bus' },
                { value: 'walk', label: 'Footpath / Walk' }
              ]}
            />

            <Select
              label="Impact Level"
              id="report-impact"
              value={formData.impact}
              onChange={(e) => handleFieldChange('impact', e.target.value)}
              options={[
                { value: 'high', label: 'High (Severe delay/refusal)' },
                { value: 'medium', label: 'Medium (Moderate slowdown)' },
                { value: 'low', label: 'Low (Minor / Smooth flow)' }
              ]}
            />

            <Input
              label="Observed Route (Opt.)"
              id="report-route-name"
              placeholder="e.g. Line 1, Bus 418"
              value={formData.route_name}
              onChange={(e) => handleFieldChange('route_name', e.target.value)}
              error={errors.route_name}
              maxLength={50}
            />
          </div>

          <Textarea
            label="Observation / Report Message"
            id="report-message"
            required
            rows={3}
            maxLength={250}
            showCount
            placeholder="e.g. Low auto availability near Andheri Station. Long queues, meter auto drivers refusing Powai trips."
            value={formData.message}
            onChange={(e) => handleFieldChange('message', e.target.value)}
            error={errors.message}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-95 focus:outline-none focus:ring-2 focus:ring-amber-400"
            >
              <Send className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{isSubmitting ? 'Broadcasting...' : 'Broadcast to Students'}</span>
            </button>
          </div>
        </form>
    </Modal>
  );
}

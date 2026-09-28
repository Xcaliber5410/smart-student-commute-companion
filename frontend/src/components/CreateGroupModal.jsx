import React, { useState } from 'react';
import { Users, ShieldCheck, Plus } from 'lucide-react';
import { Modal, Input, Select, Textarea } from './ui';
import {
  validateForm,
  validateRequired,
  validateText,
  validateDepartureTime,
  focusFirstInvalid,
} from '../utils/validation';

/** Field → DOM id map so the first invalid control can receive focus. */
const FIELD_IDS = {
  creator_pseudonym: 'group-pseudonym',
  departure_time: 'group-departure-time',
  origin_area: 'group-origin',
  destination_college: 'group-destination',
  notes: 'group-notes',
};

export default function CreateGroupModal({ isOpen, onClose, onSubmit, isSubmitting }) {
  const [formData, setFormData] = useState({
    creator_pseudonym: '',
    origin_area: '',
    destination_college: 'IIT Bombay Powai',
    departure_time: '08:15 AM',
    mode: 'Shared Auto / Cab',
    max_members: 3,
    notes: ''
  });

  const [errors, setErrors] = useState({});

  if (!isOpen) return null;

  const handleFieldChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: null }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Client-side validation (UX only — the backend re-validates every request)
    const { isValid, errors: validationErrors } = validateForm(formData, {
      creator_pseudonym: [
        (v) => (v && v.trim() ? validateText(v, { maxLength: 50, label: 'Your pseudonym' }) : null)
      ],
      origin_area: [
        (v) => validateRequired(v, 'Origin area'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'Origin area' })
      ],
      destination_college: [
        (v) => validateRequired(v, 'Destination college'),
        (v) => validateText(v, { minLength: 2, maxLength: 100, label: 'Destination college' })
      ],
      departure_time: [(v) => validateDepartureTime(v, 'Departure time')],
      notes: [
        (v) => validateText(v, { maxLength: 500, label: 'Coordination notes' })
      ]
    });

    if (!isValid) {
      setErrors(validationErrors);
      focusFirstInvalid(validationErrors, FIELD_IDS);
      return;
    }

    setErrors({});
    onSubmit({
      ...formData,
      creator_pseudonym: formData.creator_pseudonym.trim() || 'Student_Traveler',
      origin_area: formData.origin_area.trim(),
      destination_college: formData.destination_college.trim(),
      departure_time: formData.departure_time.trim(),
      notes: formData.notes.trim()
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Commute Coordination Group"
      icon={<Users className="w-5 h-5 text-indigo-400" />}
      size="lg"
    >
        <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
          <div className="bg-indigo-950/20 border border-indigo-500/30 rounded-xl p-3 text-xs text-indigo-300 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Safe Area-Level meeting points only. Exact residential addresses are never displayed.
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Your Pseudonym"
              id="group-pseudonym"
              placeholder="e.g. Advait_VJTI"
              value={formData.creator_pseudonym}
              onChange={(e) => handleFieldChange('creator_pseudonym', e.target.value)}
              error={errors.creator_pseudonym}
              hint="Defaults to Student_Traveler"
              maxLength={50}
            />

            <Input
              label="Departure Time"
              id="group-departure-time"
              required
              placeholder="e.g. 08:30 AM"
              value={formData.departure_time}
              onChange={(e) => handleFieldChange('departure_time', e.target.value)}
              error={errors.departure_time}
              hint="Use HH:MM, optionally with AM/PM"
              maxLength={30}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Origin Area (Meeting Spot)"
              id="group-origin"
              required
              placeholder="e.g. Andheri East Metro Pillar 40"
              value={formData.origin_area}
              onChange={(e) => handleFieldChange('origin_area', e.target.value)}
              error={errors.origin_area}
              maxLength={100}
            />

            <Input
              label="Destination College"
              id="group-destination"
              required
              placeholder="e.g. IIT Bombay Main Gate"
              value={formData.destination_college}
              onChange={(e) => handleFieldChange('destination_college', e.target.value)}
              error={errors.destination_college}
              maxLength={100}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Select
              label="Commute Mode"
              id="group-mode"
              value={formData.mode}
              onChange={(e) => handleFieldChange('mode', e.target.value)}
              options={[
                { value: 'Shared Auto / Cab', label: 'Shared Auto / Cab' },
                { value: 'Local Train (WR Fast/Slow)', label: 'Local Train (WR Fast/Slow)' },
                { value: 'Local Train (CR Fast/Slow)', label: 'Local Train (CR Fast/Slow)' },
                { value: 'Metro Line 1 / 2A / 7', label: 'Metro Line 1 / 2A / 7' },
                { value: 'BEST Bus Feeder', label: 'BEST Bus Feeder' },
              ]}
            />

            <Select
              label="Max Group Capacity"
              id="group-max-members"
              value={String(formData.max_members)}
              onChange={(e) => handleFieldChange('max_members', parseInt(e.target.value, 10))}
              options={[
                { value: '2', label: '2 students' },
                { value: '3', label: '3 students' },
                { value: '4', label: '4 students' },
                { value: '5', label: '5 students' },
                { value: '6', label: '6 students' },
              ]}
            />
          </div>

          <Textarea
            label="Coordination Notes / Fare Split"
            id="group-notes"
            rows={2}
            maxLength={500}
            showCount
            placeholder="e.g. Splitting meter fare ~₹35 each from station auto stand. Meet 10 mins before departure."
            value={formData.notes}
            onChange={(e) => handleFieldChange('notes', e.target.value)}
            error={errors.notes}
          />

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white shadow-lg shadow-indigo-500/20 flex items-center gap-1.5 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              <span>{isSubmitting ? 'Creating...' : 'Create Group'}</span>
            </button>
          </div>
        </form>
    </Modal>
  );
}

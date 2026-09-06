import React, { useState } from 'react';
import { X, ThumbsUp, ThumbsDown, Send, CheckCircle2 } from 'lucide-react';

const FEEDBACK_TAGS = [
  'Route accurate',
  'Disruption accurate',
  'Travel time inaccurate',
  'Better route existed',
  'Weather issue'
];

export default function FeedbackModal({ isOpen, onClose, onSubmit, recommendationId }) {
  const [isUseful, setIsUseful] = useState(true);
  const [selectedTags, setSelectedTags] = useState([]);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const toggleTag = (tag) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSending(true);
    try {
      await onSubmit({
        recommendation_id: recommendationId || '',
        is_useful: isUseful,
        tags: selectedTags,
        comment
      });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        onClose();
      }, 1400);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-950/60">
          <h3 className="text-base font-bold text-white">Rate Commute Recommendation</h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {submitted ? (
          <div className="p-8 text-center space-y-2">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto animate-bounce" />
            <h4 className="text-base font-bold text-white">Thank you for your feedback!</h4>
            <p className="text-xs text-slate-400">Your student ratings help refine route recommendations.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="text-center">
              <label className="block text-xs font-semibold text-slate-300 mb-2.5">
                Was this recommendation useful?
              </label>
              <div className="flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => setIsUseful(true)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all ${
                    isUseful
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ThumbsUp className="w-4 h-4" />
                  <span>Yes, Useful</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsUseful(false)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border font-bold text-sm transition-all ${
                    !isUseful
                      ? 'bg-rose-500/20 border-rose-500 text-rose-400 shadow-md shadow-rose-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <ThumbsDown className="w-4 h-4" />
                  <span>Could be better</span>
                </button>
              </div>
            </div>

            {/* Optional feedback tags */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">
                What influenced your rating? (Optional)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {FEEDBACK_TAGS.map((tag) => {
                  const isSelected = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => toggleTag(tag)}
                      className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300 font-medium'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Optional Comment */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Any specific thoughts? (Optional)
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Metro was accurate, but auto line was longer than expected..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Skip
              </button>
              <button
                type="submit"
                disabled={isSending}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center gap-1.5 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSending ? 'Submitting...' : 'Submit Feedback'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

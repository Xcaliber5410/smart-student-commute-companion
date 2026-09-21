import { API_BASE_URL } from '../config/index.js';

export async function checkHealth() {
  const res = await fetch(`${API_BASE_URL}/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function planCommute(planData) {
  const res = await fetch(`${API_BASE_URL}/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(planData)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || errorData.error || 'Failed to plan commute');
  }
  return res.json();
}

export async function fetchLiveReports() {
  const res = await fetch(`${API_BASE_URL}/live-reports`);
  if (!res.ok) throw new Error('Failed to fetch live reports');
  return res.json();
}

export async function postLiveReport(reportData) {
  const res = await fetch(`${API_BASE_URL}/live-reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reportData)
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || 'Failed to submit report');
  }
  return res.json();
}

export async function confirmReport(reportId) {
  const res = await fetch(`${API_BASE_URL}/live-reports/${reportId}/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': getOrGenerateUserToken()
    }
  });
  if (!res.ok) throw new Error('Failed to confirm report');
  return res.json();
}

export async function contradictReport(reportId) {
  const res = await fetch(`${API_BASE_URL}/live-reports/${reportId}/contradict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': getOrGenerateUserToken()
    }
  });
  if (!res.ok) throw new Error('Failed to contradict report');
  return res.json();
}

export async function fetchRideGroups() {
  const res = await fetch(`${API_BASE_URL}/ride-groups`);
  if (!res.ok) throw new Error('Failed to fetch ride groups');
  return res.json();
}

export async function postRideGroup(groupData) {
  const res = await fetch(`${API_BASE_URL}/ride-groups`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(groupData)
  });
  if (!res.ok) throw new Error('Failed to create commute group');
  return res.json();
}

export async function joinRideGroup(groupId) {
  const res = await fetch(`${API_BASE_URL}/ride-groups/${groupId}/join`, {
    method: 'POST'
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to join group');
  }
  return res.json();
}

export async function submitFeedback(feedbackData) {
  const res = await fetch(`${API_BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(feedbackData)
  });
  if (!res.ok) throw new Error('Failed to submit feedback');
  return res.json();
}

export async function resetDemoState() {
  const res = await fetch(`${API_BASE_URL}/demo/reset`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to reset demo state');
  return res.json();
}

function getOrGenerateUserToken() {
  let token = localStorage.getItem('smart_commute_user_token');
  if (!token) {
    token = 'student-' + Math.random().toString(36).substring(2, 10);
    localStorage.setItem('smart_commute_user_token', token);
  }
  return token;
}

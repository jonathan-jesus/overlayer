const SESSION_ID_KEY = 'overlayer_session_id';

export function getSessionId(): string {
  const existing = localStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;

  const newId = crypto.randomUUID();
  localStorage.setItem(SESSION_ID_KEY, newId);
  return newId;
}

export function clearSessionId(): void {
  localStorage.removeItem(SESSION_ID_KEY);
}

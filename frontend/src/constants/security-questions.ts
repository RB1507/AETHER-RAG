// Preset security questions offered at signup and shown during password reset.
// The chosen question text is stored with the account; the answer is hashed
// on the backend and matched case-insensitively.
export const SECURITY_QUESTIONS = [
  'What was the name of your first pet?',
  'What city were you born in?',
  'What was the name of your primary school?',
  'What is your mother’s maiden name?',
  'What was the make of your first car?',
  'What is your favourite book?',
] as const

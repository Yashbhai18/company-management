/**
 * Validates password strength according to the custom security policy:
 * - Length: 8 to 12 characters
 * - Mix of uppercase and lowercase letters
 * - Contains numbers
 * - Contains special symbols (non-alphanumeric characters)
 * 
 * Returns an error string if validation fails, or null if the password is valid.
 */
export const validatePassword = (password: string): string | null => {
  if (!password) {
    return 'Password is required.';
  }
  
  if (password.length < 8 || password.length > 12) {
    return 'Password must be between 8 and 12 characters long.';
  }
  
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter.';
  }
  
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter.';
  }
  
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number.';
  }
  
  if (!/[^A-Za-z0-9]/.test(password)) {
    return 'Password must contain at least one special symbol.';
  }
  
  return null;
};

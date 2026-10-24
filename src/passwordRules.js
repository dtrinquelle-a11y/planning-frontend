// Regles de mot de passe, alignees sur Supabase (Authentication > Sign In / Providers > Email)
export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_HINT = `min. ${PASSWORD_MIN_LENGTH} caracteres, une majuscule, une minuscule et un chiffre`;

// Renvoie le message d'erreur, ou '' si le mot de passe respecte les regles
export function passwordError(password) {
  if (password.length < PASSWORD_MIN_LENGTH) return `Le mot de passe doit contenir au moins ${PASSWORD_MIN_LENGTH} caracteres.`;
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre.';
  }
  return '';
}

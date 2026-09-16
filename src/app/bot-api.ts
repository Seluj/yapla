/**
 * Dépôt du CSV directement dans le bot Discord.
 *
 * L'appel vise `/api/adherents` sur **notre propre origine** : le nginx qui sert
 * cette application relaie vers le conteneur du bot, sur le réseau interne. Cela
 * évite d'exposer le bot sur Internet, dispense de CORS, et permet de conserver
 * une politique `connect-src 'self'` stricte.
 */

/** Chemin relayé par nginx vers l'API du bot. */
export const BOT_UPLOAD_PATH = '/api/adherents';

/** Clé de stockage du jeton d'API. */
const TOKEN_KEY = 'bot-api-token';

/** Résultat d'un dépôt réussi, tel que le renvoie le bot. */
export interface UploadResult {
  rows: number;
  columns: number;
}

/** Échec du dépôt, porteur d'un message affichable tel quel. */
export class UploadError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

/**
 * Lit le jeton enregistré.
 *
 * Comme pour le mapping, tout accès au stockage est protégé : navigation privée
 * et stockage désactivé lèvent une exception.
 */
export function loadBotToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

/** Enregistre le jeton, ou l'efface s'il est vide. */
export function saveBotToken(token: string): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Stockage indisponible : le jeton reste valable pour la session en cours.
  }
}

/** Message d'erreur par défaut selon le code de statut renvoyé. */
function defaultMessage(status: number): string {
  if (status === 401)
    return "Jeton refusé par le bot. Vérifiez qu'il correspond à celui du serveur.";
  if (status === 413) return 'Fichier trop volumineux pour le bot (8 Mo maximum).';
  if (status === 404 || status === 502 || status === 503) {
    return "Le bot est injoignable. Vérifiez qu'il tourne et que le relais est configuré.";
  }
  return `Le bot a refusé le fichier (HTTP ${status}).`;
}

/**
 * Envoie le CSV au bot.
 *
 * Le bot rejoue de son côté toutes les validations de `/upload` : ce qui est
 * accepté ici l'aurait été par la commande Discord, et inversement.
 */
export async function sendCsvToBot(csv: string, token: string): Promise<UploadResult> {
  if (!token.trim()) {
    throw new UploadError("Renseignez le jeton d'API du bot avant l'envoi.", null);
  }

  let response: Response;
  try {
    response = await fetch(BOT_UPLOAD_PATH, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        Authorization: `Bearer ${token.trim()}`,
      },
      body: csv,
    });
  } catch {
    throw new UploadError(
      "Impossible de joindre le bot. L'application est-elle bien servie par le nginx du déploiement ?",
      null,
    );
  }

  // Le corps est du JSON en temps normal ; un relais en panne peut renvoyer du HTML.
  let payload: { error?: string; rows?: number; columns?: number } = {};
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    // On garde l'objet vide et on retombe sur le message par défaut.
  }

  if (!response.ok) {
    throw new UploadError(payload.error ?? defaultMessage(response.status), response.status);
  }

  return { rows: payload.rows ?? 0, columns: payload.columns ?? 0 };
}

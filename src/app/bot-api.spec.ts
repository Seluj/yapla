import { afterEach, describe, expect, it, vi } from 'vitest';

import { BOT_UPLOAD_PATH, UploadError, loadBotToken, saveBotToken, sendCsvToBot } from './bot-api';

const CSV = 'Nom;Prénom;Début;Fin\nDupont;Jean;01/09/2025;31/08/2026\n';
const TOKEN = 'jeton-de-test';

/** Réponse `fetch` minimale, suffisante pour ce que le client en lit. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('loadBotToken / saveBotToken', () => {
  it('relit un jeton enregistré', () => {
    saveBotToken(TOKEN);
    expect(loadBotToken()).toBe(TOKEN);
  });

  it('efface le jeton quand on enregistre une chaîne vide', () => {
    saveBotToken(TOKEN);
    saveBotToken('');
    expect(loadBotToken()).toBe('');
  });

  it('renvoie une chaîne vide quand le stockage est indisponible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage désactivé');
    });
    expect(loadBotToken()).toBe('');
  });

  it("n'échoue pas quand l'écriture est refusée", () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota dépassé');
    });
    expect(() => saveBotToken(TOKEN)).not.toThrow();
  });
});

describe('sendCsvToBot', () => {
  it('refuse d’envoyer sans jeton, sans toucher au réseau', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(sendCsvToBot(CSV, '   ')).rejects.toBeInstanceOf(UploadError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('poste le CSV sur l’origine courante avec le jeton en Bearer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { rows: 42, columns: 4 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendCsvToBot(CSV, `  ${TOKEN}  `);

    expect(result).toEqual({ rows: 42, columns: 4 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BOT_UPLOAD_PATH);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(CSV);
    // Le jeton est transmis débarrassé des espaces d'un copier-coller.
    expect(init.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('remonte le message d’erreur renvoyé par le bot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(422, { error: 'Nombre de colonnes incohérent.' })),
    );

    await expect(sendCsvToBot(CSV, TOKEN)).rejects.toThrow('Nombre de colonnes incohérent.');
  });

  it('retombe sur un message par défaut quand le corps n’est pas du JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new Error('réponse HTML');
        },
      } as unknown as Response),
    );

    // Un relais en panne renvoie une page HTML : l'utilisateur doit quand même
    // comprendre que c'est le bot qui est injoignable.
    await expect(sendCsvToBot(CSV, TOKEN)).rejects.toThrow(/injoignable/);
  });

  it('distingue un jeton refusé d’une panne de relais', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(401, {})));
    await expect(sendCsvToBot(CSV, TOKEN)).rejects.toThrow(/Jeton refusé/);
  });

  it('traduit une erreur réseau en message explicite', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const error = await sendCsvToBot(CSV, TOKEN).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(UploadError);
    expect((error as UploadError).status).toBeNull();
  });
});

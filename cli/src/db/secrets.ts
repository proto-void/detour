/**
 * Secret store for the DB host. Prefers OS keychain via @napi-rs/keyring when available;
 * falls back to an in-memory map (tests / environments without keyring).
 * In a SEA binary, keyring is loaded from node_modules beside the executable (ADR-029).
 */
import { isRunningAsSea, tryRequireBeside } from './sea-require.ts';

const SERVICE = 'com.detour.db';

type KeyringMod = {
  Entry?: new (service: string, account: string) => {
    getPassword(): string | null;
    setPassword(password: string): void;
    deletePassword(): boolean;
  };
  getPassword?: (service: string, account: string) => string | null;
  setPassword?: (service: string, account: string, password: string) => void;
  deletePassword?: (service: string, account: string) => boolean;
};

type KeyringLike = {
  getPassword(service: string, account: string): string | null;
  setPassword(service: string, account: string, password: string): void;
  deletePassword(service: string, account: string): boolean;
};

const memory = new Map<string, string>();
let keyring: KeyringLike | null | undefined;

function wrapKeyring(mod: KeyringMod): KeyringLike | null {
  if (mod.Entry) {
    return {
      getPassword(service, account) {
        return new mod.Entry!(service, account).getPassword();
      },
      setPassword(service, account, password) {
        new mod.Entry!(service, account).setPassword(password);
      },
      deletePassword(service, account) {
        return new mod.Entry!(service, account).deletePassword();
      },
    };
  }
  if (mod.getPassword && mod.setPassword && mod.deletePassword) {
    return {
      getPassword: mod.getPassword,
      setPassword: mod.setPassword,
      deletePassword: mod.deletePassword,
    };
  }
  return null;
}

async function getKeyring(): Promise<KeyringLike | null> {
  if (keyring !== undefined) return keyring;

  if (isRunningAsSea()) {
    const beside = tryRequireBeside<KeyringMod>('@napi-rs/keyring');
    if (beside) {
      const wrapped = wrapKeyring(beside);
      if (wrapped) {
        keyring = wrapped;
        return keyring;
      }
    }
  }

  try {
    const mod = (await import(/* webpackIgnore: true */ '@napi-rs/keyring' as string)) as KeyringMod;
    const wrapped = wrapKeyring(mod);
    if (wrapped) {
      keyring = wrapped;
      return keyring;
    }
  } catch {
    /* fall through */
  }
  keyring = null;
  return null;
}

export async function setSecret(account: string, value: string): Promise<void> {
  const kr = await getKeyring();
  if (kr) {
    kr.setPassword(SERVICE, account, value);
    return;
  }
  memory.set(account, value);
}

export async function getSecret(account: string): Promise<string | null> {
  const kr = await getKeyring();
  if (kr) return kr.getPassword(SERVICE, account);
  return memory.get(account) ?? null;
}

export async function deleteSecret(account: string): Promise<void> {
  const kr = await getKeyring();
  if (kr) {
    kr.deletePassword(SERVICE, account);
    return;
  }
  memory.delete(account);
}

/** Test-only: clear memory fallback and reset keyring probe. */
export function _resetSecretsForTests(): void {
  memory.clear();
  keyring = undefined;
}

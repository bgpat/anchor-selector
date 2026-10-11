import { useCallback, useEffect, useMemo, useState } from 'react';
import variables from '@/util/variables';
import {
  CLICK_ACTIONS,
  MODIFIER_KEYS,
  cloneStoredConfig,
  configKey,
  defaultClickAction,
  keySignature,
  type ClickAction,
  type ModifierKey,
  type StoredConfig,
} from '@/util/config';

function findClickAction(
  click: ClickAction[],
  keys: ModifierKey[],
): ClickAction | undefined {
  const sig = keySignature(keys);
  return click.find((entry) => keySignature(entry.keys) === sig);
}

function formatBinding(entry: ClickAction): string {
  const actionLabel =
    CLICK_ACTIONS.find((a) => a.value === entry.action)?.label ??
    entry.action;
  const keyPart =
    entry.keys.length === 0
      ? 'no key'
      : entry.keys
          .map(
            (k) =>
              `[${MODIFIER_KEYS.find((m) => m.value === k)?.label ?? k}]`,
          )
          .join(' + ');
  return `${keyPart}: ${actionLabel}`;
}

export function App() {
  const [config, setConfig] = useState<StoredConfig | null>(null);
  const [modifiers, setModifiers] = useState<ModifierKey[]>([]);

  useEffect(() => {
    void variables.config.getAll().then((loaded) => {
      const next = cloneStoredConfig(loaded as StoredConfig);
      setConfig(next);
      setModifiers([]);
    });
  }, []);

  const selectedAction = useMemo(() => {
    if (config == null) {
      return defaultClickAction;
    }
    return (
      findClickAction(config.click, modifiers)?.action ?? defaultClickAction
    );
  }, [config, modifiers]);

  const persist = useCallback(async (next: StoredConfig) => {
    setConfig(next);
    await Promise.all([
      variables.config.set(configKey.hue, next[configKey.hue]),
      variables.config.set(configKey.click, next[configKey.click]),
    ]);
  }, []);

  const ensureBinding = useCallback(
    (draft: StoredConfig, keys: ModifierKey[]): ClickAction => {
      let entry = findClickAction(draft.click, keys);
      if (entry == null) {
        entry = { action: defaultClickAction, keys: [...keys] };
        draft.click.push(entry);
      }
      return entry;
    },
    [],
  );

  const onModifiersChange = (nextKeys: ModifierKey[]) => {
    if (config == null) {
      return;
    }
    setModifiers(nextKeys);
    const draft = cloneStoredConfig(config);
    ensureBinding(draft, nextKeys);
    void persist(draft);
  };

  const onActionChange = (action: ClickAction['action']) => {
    if (config == null) {
      return;
    }
    const draft = cloneStoredConfig(config);
    const entry = ensureBinding(draft, modifiers);
    entry.action = action;
    void persist(draft);
  };

  const onHueChange = (hue: number) => {
    if (config == null) {
      return;
    }
    void persist({ ...config, hue });
  };

  const onReset = async () => {
    if (!confirm('Do you reset to default?')) {
      return;
    }
    const defaults = await variables.config.resetToDefaults();
    setConfig(cloneStoredConfig(defaults));
    setModifiers([]);
  };

  if (config == null) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }

  const huePreview = `hsl(${config.hue}, 100%, 50%)`;

  return (
    <main>
      <header>
        <h1>Anchor Selector</h1>
        <p>Configure click behavior and highlight color.</p>
      </header>

      <section aria-labelledby="click-heading">
        <h2 id="click-heading">Click</h2>
        <fieldset>
          <legend>Modifier keys</legend>
          <div>
            {MODIFIER_KEYS.map(({ value, label }) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={modifiers.includes(value)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...modifiers, value]
                      : modifiers.filter((k) => k !== value);
                    onModifiersChange(next);
                  }}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        <label htmlFor="click-action">
          Action for selected keys
          <select
            id="click-action"
            value={selectedAction}
            onChange={(e) =>
              onActionChange(e.target.value as ClickAction['action'])
            }
          >
            {CLICK_ACTIONS.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <ul>
          {config.click.map((entry) => (
            <li key={keySignature(entry.keys)}>{formatBinding(entry)}</li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="color-heading">
        <h2 id="color-heading">Color</h2>
        <label>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="32"
            height="32"
            viewBox="0 0 32 32"
            aria-hidden
          >
            <rect width="32" height="32" fill={huePreview} />
          </svg>
          <input
            type="range"
            min={0}
            max={359}
            value={config.hue}
            onChange={(e) => onHueChange(Number(e.target.value))}
            style={{ accentColor: huePreview }}
          />
        </label>
      </section>

      <footer>
        <button type="button" onClick={() => void onReset()}>
          Reset to defaults
        </button>
      </footer>
    </main>
  );
}

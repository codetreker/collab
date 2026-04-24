import React, { useState, useCallback, useEffect } from 'react';
import type { RemoteCommand } from '../commands/registry';

interface Props {
  command: RemoteCommand;
  onExecute: (params: Array<{ name: string; value: string }>) => void;
  onCancel: () => void;
}

export default function CommandParamForm({ command, onExecute, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const p of command.params) {
      init[p.name] = '';
    }
    return init;
  });
  const [errors, setErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onCancel]);

  const handleChange = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: false }));
  }, []);

  const handleSubmit = useCallback(() => {
    const newErrors: Record<string, boolean> = {};
    let hasError = false;
    for (const p of command.params) {
      if (p.required && !values[p.name]?.trim()) {
        newErrors[p.name] = true;
        hasError = true;
      }
    }
    if (hasError) {
      setErrors(newErrors);
      return;
    }
    const params = command.params.map(p => ({
      name: p.name,
      value: values[p.name]?.trim() ?? '',
    }));
    onExecute(params);
  }, [command.params, values, onExecute]);

  return (
    <div className="command-param-form">
      <div className="command-param-header">
        <span className="command-param-title">
          ⚡ /{command.name}
          <span className="command-param-agent"> — {command.agentName}</span>
        </span>
      </div>
      <div className="command-param-fields">
        {command.params.map(p => (
          <label key={p.name} className="command-param-field">
            <span className="command-param-label">
              {p.name}
              {p.required && <span className="command-param-required"> *</span>}
            </span>
            <input
              type="text"
              className={`command-param-input${errors[p.name] ? ' command-param-input-error' : ''}`}
              placeholder={p.placeholder ?? ''}
              value={values[p.name] ?? ''}
              onChange={e => handleChange(p.name, e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              autoFocus={p === command.params[0]}
            />
          </label>
        ))}
      </div>
      <div className="command-param-actions">
        <button className="btn btn-sm" onClick={onCancel}>Cancel</button>
        <button className="btn btn-sm btn-primary" onClick={handleSubmit}>Execute</button>
      </div>
    </div>
  );
}

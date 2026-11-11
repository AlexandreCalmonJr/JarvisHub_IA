import React, { useState, useEffect } from 'react';
import { Modal } from '../common/Modal';
import { Send, CheckCircle2 } from 'lucide-react';
import { fetchWebhooksConfig, saveWebhooksConfig, testWebhooksNotification } from '../../api';
import { notify } from '../common/Toast';

interface WebhooksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WebhooksModal: React.FC<WebhooksModalProps> = ({ isOpen, onClose }) => {
  const [enabled, setEnabled] = useState(false);
  const [discordUrl, setDiscordUrl] = useState('');
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [notifyOnExport, setNotifyOnExport] = useState(true);
  const [notifyOnDockerize, setNotifyOnDockerize] = useState(true);
  const [notifyOnLongTask, setNotifyOnLongTask] = useState(true);

  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchWebhooksConfig()
        .then((cfg) => {
          setLoadError(null);
          if (cfg) {
            setEnabled(Boolean(cfg.enabled));
            setDiscordUrl(cfg.discord_webhook_url || '');
            setTelegramToken(cfg.telegram_bot_token || '');
            setTelegramChatId(cfg.telegram_chat_id || '');
            if (cfg.notify_on_export !== undefined) setNotifyOnExport(cfg.notify_on_export);
            if (cfg.notify_on_dockerize !== undefined) setNotifyOnDockerize(cfg.notify_on_dockerize);
            if (cfg.notify_on_long_task !== undefined) setNotifyOnLongTask(cfg.notify_on_long_task);
          }
        })
        .catch((error) => setLoadError(error instanceof Error ? error.message : 'Falha ao carregar webhooks.'));
    }
  }, [isOpen]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await saveWebhooksConfig({
        enabled,
        discord_webhook_url: discordUrl.trim(),
        telegram_bot_token: telegramToken.trim(),
        telegram_chat_id: telegramChatId.trim(),
        notify_on_export: notifyOnExport,
        notify_on_dockerize: notifyOnDockerize,
        notify_on_long_task: notifyOnLongTask,
      });
      notify('Configurações de Webhook salvas com sucesso!', 'success');
      onClose();
    } catch (err: any) {
      notify(`Erro ao salvar webhooks: ${err.message}`, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await testWebhooksNotification();
      if (res.sent) {
        notify(`Notificação enviada com sucesso para: ${res.channels.join(', ')}!`, 'success');
      } else {
        notify(`Falha no envio de teste: ${res.errors?.join('; ') || res.reason || 'Verifique as credenciais'}`, 'error');
      }
    } catch (err: any) {
      notify(`Erro ao testar webhook: ${err.message}`, 'error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Notificações & Webhooks (Discord / Telegram)">
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loadError && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: '8px', border: '1px solid rgba(248, 113, 113, 0.3)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            Não foi possível carregar as configurações atuais: {loadError}. Evite salvar alterações até confirmar os valores no servidor.
          </div>
        )}
        <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
          Receba avisos instantâneos no seu celular quando tarefas longas (exportações ZIP, dockerização ou auditorias de segurança) forem concluídas.
        </p>

        {/* Ativação Geral */}
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '10px 14px',
            borderRadius: '10px',
            backgroundColor: enabled ? 'rgba(56, 189, 248, 0.12)' : 'rgba(255, 255, 255, 0.03)',
            border: `1px solid ${enabled ? 'rgba(56, 189, 248, 0.3)' : 'rgba(255, 255, 255, 0.08)'}`,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            style={{ width: '16px', height: '16px', accentColor: '#38bdf8' }}
          />
          <span style={{ fontSize: '0.86rem', fontWeight: 600, color: enabled ? '#38bdf8' : 'var(--text-primary)' }}>
            Ativar Notificações por Webhooks Locais
          </span>
        </label>

        {/* Discord */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            URL do Webhook do Discord:
          </label>
          <input
            type="text"
            placeholder="https://discord.com/api/webhooks/..."
            value={discordUrl}
            onChange={(e) => setDiscordUrl(e.target.value)}
            disabled={!enabled}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: 'var(--text-primary)',
              fontSize: '0.82rem',
              outline: 'none',
              opacity: enabled ? 1 : 0.5,
            }}
          />
        </div>

        {/* Telegram */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Token do Bot Telegram:
            </label>
            <input
              type="text"
              placeholder="123456789:ABCdef..."
              value={telegramToken}
              onChange={(e) => setTelegramToken(e.target.value)}
              disabled={!enabled}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
                opacity: enabled ? 1 : 0.5,
              }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
              Chat ID do Telegram:
            </label>
            <input
              type="text"
              placeholder="Ex: -1001234567 ou 98765432"
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              disabled={!enabled}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-primary)',
                fontSize: '0.82rem',
                outline: 'none',
                opacity: enabled ? 1 : 0.5,
              }}
            />
          </div>
        </div>

        {/* Eventos selecionáveis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            Eventos que Disparam Notificação:
          </span>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnExport} onChange={(e) => setNotifyOnExport(e.target.checked)} disabled={!enabled} />
              <span>Exportar Pacote ZIP</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnDockerize} onChange={(e) => setNotifyOnDockerize(e.target.checked)} disabled={!enabled} />
              <span>Dockerização em 1 Clique</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
              <input type="checkbox" checked={notifyOnLongTask} onChange={(e) => setNotifyOnLongTask(e.target.checked)} disabled={!enabled} />
              <span>Tarefas Longas do Chat</span>
            </label>
          </div>
        </div>

        {/* Botões de Ação */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px' }}>
          <button
            type="button"
            onClick={handleTest}
            disabled={!enabled || testing}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Send size={13} />
            <span>{testing ? 'Testando...' : 'Testar Conexão'}</span>
          </button>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost"
              style={{ fontSize: '0.80rem', padding: '7px 14px' }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !!loadError}
              className="btn btn-primary"
              style={{ fontSize: '0.80rem', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <CheckCircle2 size={14} />
              <span>{saving ? 'Salvando...' : 'Salvar Configuração'}</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

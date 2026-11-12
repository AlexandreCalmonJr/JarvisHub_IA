import React, { useState, useEffect } from 'react';
import {
  fetchModels,
  fetchHybridConfig,
  saveHybridConfig,
  testHybridConnection,
  fetchCuratedHuggingFaceModels,
  searchHuggingFaceModels,
  fetchAgentModelRecommendations,
  API_BASE,
} from '../api';
import { SetupWizardModal } from './common/SetupWizardModal';
import { notify } from './common/Toast';
import { ModelStatusHero } from './models/ModelStatusHero';
import { HybridGatewayConfig, ProviderCard } from './models/HybridGatewayConfig';
import { HuggingFaceHubSection } from './models/HuggingFaceHubSection';
import { LocalModelsGrid } from './models/LocalModelsGrid';
import { KeyVaultManager } from './models/KeyVaultManager';
import { ModelQualityPanel } from './models/ModelQualityPanel';

export const ModelManagerView: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState(false);
  const [activeTab, setActiveTab] = useState<'vault' | 'local' | 'hybrid' | 'hub' | 'quality'>('local');

  // Form State para Gateway Híbrido
  const [provider, setProvider] = useState<string>('gemini');
  const [apiKey, setApiKey] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [defaultModel, setDefaultModel] = useState<string>('gemini-2.5-flash');
  const [baseUrl, setBaseUrl] = useState<string>('https://generativelanguage.googleapis.com/v1beta/openai');
  const [maxBudget, setMaxBudget] = useState<number>(5.0);
  const [enabled, setEnabled] = useState<boolean>(false);

  // Estado dos testes e salvamento
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; error?: string } | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Estados Hugging Face Hub & Instalação 1-Clique
  const [hfCurated, setHfCurated] = useState<any[]>([]);
  const [hfSearchQuery, setHfSearchQuery] = useState('');
  const [hfSearchResults, setHfSearchResults] = useState<any[]>([]);
  const [isHfSearching, setIsHfSearching] = useState(false);
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [downloadStatusText, setDownloadStatusText] = useState<string>('');
  const [agentRecommendations, setAgentRecommendations] = useState<Record<string, { model: string; reason: string }>>({});

  const loadData = async (includeAdminConfig = isAdmin) => {
    setLoading(true);
    try {
      const results = await Promise.allSettled([
        fetchModels(),
        includeAdminConfig ? fetchHybridConfig() : Promise.resolve(null),
        fetchCuratedHuggingFaceModels(),
        fetchAgentModelRecommendations(),
      ]);
      const failures: string[] = [];
      const [modelsResult, hybridResult, curatedResult, recommendationsResult] = results;

      if (modelsResult.status === 'fulfilled') setData(modelsResult.value);
      else { setData(null); failures.push(modelsResult.reason instanceof Error ? modelsResult.reason.message : 'Falha ao consultar modelos.'); }

      if (hybridResult.status === 'fulfilled' && hybridResult.value) {
        const hybridRes = hybridResult.value;
        setProvider(hybridRes.provider_name || 'gemini');
        setEnabled(Boolean(hybridRes.enabled));
        setDefaultModel(hybridRes.default_model || 'gemini-2.5-flash');
        setBaseUrl(hybridRes.base_url || '');
        setMaxBudget(hybridRes.max_budget_usd || 5.0);
      } else if (includeAdminConfig && hybridResult.status === 'rejected') failures.push(hybridResult.reason instanceof Error ? hybridResult.reason.message : 'Falha ao consultar gateway híbrido.');

      if (curatedResult.status === 'fulfilled') setHfCurated(curatedResult.value);
      else failures.push(curatedResult.reason instanceof Error ? curatedResult.reason.message : 'Falha ao consultar Hugging Face.');

      if (recommendationsResult.status === 'fulfilled') setAgentRecommendations(recommendationsResult.value);
      else failures.push(recommendationsResult.reason instanceof Error ? recommendationsResult.reason.message : 'Falha ao consultar recomendações.');

      setLoadError(failures.length ? failures.join(' ') : null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar modelos e configurações.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const admin = principal?.kind === 'human' && principal?.role === 'admin';
        setIsAdmin(admin);
        setActiveTab(admin ? 'vault' : 'local');
        setRoleLoaded(true);
        void loadData(admin);
      })
      .catch(() => {
        if (cancelled) return;
        setIsAdmin(false);
        setActiveTab('local');
        setRoleLoaded(true);
        void loadData(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleProviderSelect = (card: ProviderCard) => {
    setProvider(card.id);
    setDefaultModel(card.defaultModel);
    setBaseUrl(card.baseUrl);
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    if (!isAdmin) return;
    setTestLoading(true);
    setTestResult(null);
    try {
      const payload: any = {
        provider_name: provider,
        default_model: defaultModel,
        base_url: baseUrl || undefined,
      };
      if (apiKey && apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      const res = await testHybridConnection(payload);
      if (res.success) {
        setTestResult({
          success: true,
          message: `${res.message} (Latência: ${res.latency_ms}ms)`,
        });
      } else {
        setTestResult({
          success: false,
          error: res.error || 'Falha ao conectar ao provedor especificado.',
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        error: err.message || 'Erro inesperado ao testar conexão.',
      });
    } finally {
      setTestLoading(false);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setSaveLoading(true);
    setSaveMessage(null);
    try {
      const payload: any = {
        provider_name: provider,
        enabled: enabled,
        default_model: defaultModel,
        base_url: baseUrl || undefined,
        max_budget_usd: Number(maxBudget),
      };
      if (apiKey && apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      await saveHybridConfig(payload);
      setSaveMessage('Configurações salvas e aplicadas com sucesso!');
      setApiKey(''); // Limpa por segurança
      await loadData();
      setTimeout(() => setSaveMessage(null), 4000);
    } catch (err: any) {
      notify(`Erro ao salvar: ${err.message}`, 'error');
    } finally {
      setSaveLoading(false);
    }
  };

  const handleSearchHf = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!hfSearchQuery.trim()) {
      setHfSearchResults([]);
      return;
    }
    setIsHfSearching(true);
    try {
      const results = await searchHuggingFaceModels(hfSearchQuery.trim(), 8);
      setHfSearchResults(results);
      if (results.length === 0) {
        notify('Nenhum modelo compatível encontrado no Hugging Face', 'info');
      }
    } catch (err: any) {
      notify(`Erro ao buscar no Hugging Face: ${err.message}`, 'error');
    } finally {
      setIsHfSearching(false);
    }
  };

  const isModelInstalled = (tag: string) => {
    if (!data?.models || !Array.isArray(data.models)) return false;
    const cleanTag = tag.toLowerCase().replace(/^hf\.co\//, '');
    return data.models.some((m: any) => {
      const mName = (m.name || '').toLowerCase();
      return Boolean(mName) && (mName.includes(cleanTag) || cleanTag.includes(mName));
    });
  };

  const handleInstallModel = async (modelTag: string, displayName: string) => {
    if (!isAdmin) return;
    if (downloadingModelId) {
      notify('Já existe uma instalação em andamento', 'warning');
      return;
    }
    setDownloadingModelId(modelTag);
    setDownloadProgress(5);
    setDownloadStatusText('Conectando ao Hugging Face & Ollama Engine...');
    notify(`Iniciando download de ${displayName}...`, 'info');

    try {
      const response = await fetch(`${API_BASE}/models/huggingface/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ model_tag: modelTag, display_name: displayName }),
      });

      if (!response.ok || !response.body) {
        throw new Error('Falha ao iniciar stream de instalação');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let terminalEventReceived = false;

      const processEventLine = async (line: string) => {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) return;
        try {
          const eventData = JSON.parse(trimmed.slice(6));
          if (eventData.status === 'downloading') {
            if (eventData.total && eventData.completed) {
              const pct = Math.min(99, Math.round((eventData.completed / eventData.total) * 100));
              setDownloadProgress(pct);
              setDownloadStatusText(`A descarregar camadas: ${pct}% concluído`);
            } else if (typeof eventData.percent === 'number') {
              setDownloadProgress(eventData.percent);
              setDownloadStatusText(`A descarregar: ${eventData.percent}%`);
            }
          } else if (eventData.status === 'success') {
            terminalEventReceived = true;
            setDownloadProgress(100);
            setDownloadStatusText('Modelo instalado e confirmado pelo servidor.');
            notify(`Modelo ${displayName} instalado com sucesso!`, 'success');
            await loadData();
          } else if (eventData.status === 'error') {
            terminalEventReceived = true;
            const message = eventData.message || 'Erro durante a instalação do modelo.';
            setDownloadStatusText(message);
            notify(message, 'error');
          }
        } catch {
          // Ignora heartbeats e linhas SSE incompletas que não contenham JSON válido.
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) await processEventLine(line);
      }

      buffer += decoder.decode();
      if (buffer.trim()) await processEventLine(buffer);
      if (!terminalEventReceived) {
        throw new Error('O stream terminou sem confirmar a instalação do modelo.');
      }
    } catch (err: any) {
      notify(`Falha ao instalar modelo: ${err.message}`, 'error');
    } finally {
      window.setTimeout(() => {
        setDownloadingModelId(null);
        setDownloadProgress(0);
        setDownloadStatusText('');
      }, 3500);
    }
  };

  const isOnlineActive = isAdmin && Boolean(data?.hybrid_gateway?.enabled);
  const currentSpend = data?.hybrid_gateway?.current_spend_usd || 0;
  const budgetMax = data?.hybrid_gateway?.max_budget_usd || maxBudget || 5.0;
  const budgetPercent = Math.min(100, Math.round((currentSpend / budgetMax) * 100));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1280px', margin: '0 auto' }}>
      {!roleLoaded ? (
        <div role="status" className="glass-panel" style={{ padding: '28px', color: 'var(--text-secondary)' }}>A verificar permissões do Gestor de Modelos…</div>
      ) : (
      <>
      {loadError && (
        <div role="alert" className="glass-card" style={{ padding: '12px 16px', border: '1px solid rgba(248, 113, 113, 0.35)', borderRadius: '10px', color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
          Algumas informações não puderam ser carregadas: {loadError}
        </div>
      )}

      {/* Barra de Navegação por Abas Limpas */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
        }}
      >
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setActiveTab('vault')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 500,
              backgroundColor: activeTab === 'vault' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'vault' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'vault' ? '2px solid var(--accent-color)' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            Cofre de Chaves (KeyVault)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('local')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 500,
              backgroundColor: activeTab === 'local' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'local' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'local' ? '2px solid var(--accent-color)' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            Modelos Locais ({data?.models?.length || 0})
          </button>

          {isAdmin && <button
            type="button"
            onClick={() => setActiveTab('hybrid')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 500,
              backgroundColor: activeTab === 'hybrid' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'hybrid' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'hybrid' ? '2px solid var(--accent-color)' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            Gateway Híbrido & Nuvem
            {isOnlineActive && (
              <span style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', color: 'var(--text-primary)', marginLeft: '6px' }}>
                ONLINE
              </span>
            )}
          </button>}

          <button
            type="button"
            onClick={() => setActiveTab('hub')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 500,
              backgroundColor: activeTab === 'hub' ? 'var(--accent-glow)' : 'transparent',
              color: activeTab === 'hub' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'hub' ? '2px solid var(--accent-color)' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            Hugging Face Hub
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('quality')}
            style={{
              padding: '8px 16px',
              borderRadius: '8px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.84rem',
              fontWeight: 500,
              backgroundColor: activeTab === 'quality' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: activeTab === 'quality' ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'quality' ? '2px solid var(--accent-color)' : '2px solid transparent',
              transition: 'all 0.2s ease',
            }}
          >
            Qualidade & Aprendizagem
          </button>
        </div>

        {/* Botões de Ação Global */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {isAdmin && <button
            type="button"
            onClick={() => setShowWizard(true)}
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '6px 12px' }}
          >
            Assistente Rápido
          </button>}
          <button
            type="button"
            onClick={() => loadData()}
            disabled={loading}
            className="btn btn-ghost"
            style={{ fontSize: '0.8rem', padding: '6px 10px', color: 'var(--text-muted)' }}
            title="Recarregar status de modelos"
          >
            {loading ? '...' : 'Atualizar'}
          </button>
        </div>
      </div>

      {/* Conteúdo Aba 0: Cofre de Chaves de API (KeyVault) */}
      {activeTab === 'vault' && <KeyVaultManager />}

      {/* Conteúdo Aba 1: Modelos Locais & Status do Sistema */}
      {activeTab === 'local' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {isAdmin && <ModelStatusHero
            isOnlineActive={Boolean(isOnlineActive)}
            loading={loading}
            currentSpend={currentSpend}
            budgetMax={budgetMax}
            budgetPercent={budgetPercent}
            providerName={data?.hybrid_gateway?.provider}
            onOpenWizard={() => setShowWizard(true)}
            onRefresh={() => loadData()}
          />}
          <LocalModelsGrid models={data?.models} />
        </div>
      )}

      {/* Conteúdo Aba 2: Gateway Híbrido & Conexão em Nuvem */}
      {isAdmin && activeTab === 'hybrid' && (
        <HybridGatewayConfig
          provider={provider}
          enabled={enabled}
          apiKey={apiKey}
          showKey={showKey}
          defaultModel={defaultModel}
          baseUrl={baseUrl}
          maxBudget={maxBudget}
          testLoading={testLoading}
          testResult={testResult}
          saveLoading={saveLoading}
          saveMessage={saveMessage}
          onProviderSelect={handleProviderSelect}
          onToggleEnabled={(val) => setEnabled(val)}
          onApiKeyChange={(val) => setApiKey(val)}
          onToggleShowKey={() => setShowKey(!showKey)}
          onDefaultModelChange={(val) => setDefaultModel(val)}
          onBaseUrlChange={(val) => setBaseUrl(val)}
          onMaxBudgetChange={(val) => setMaxBudget(val)}
          onTestConnection={handleTestConnection}
          onSaveConfig={handleSaveConfig}
        />
      )}

      {/* Conteúdo Aba 3: Hugging Face Hub (App Store de Modelos) */}
      {activeTab === 'hub' && (
        <HuggingFaceHubSection
          curatedModels={hfCurated}
          searchResults={hfSearchResults}
          searchQuery={hfSearchQuery}
          isSearching={isHfSearching}
          downloadingModelId={downloadingModelId}
          downloadProgress={downloadProgress}
          downloadStatusText={downloadStatusText}
          agentRecommendations={agentRecommendations}
          canInstall={isAdmin}
          isModelInstalled={isModelInstalled}
          onSearchChange={(q) => setHfSearchQuery(q)}
          onSearchSubmit={handleSearchHf}
          onClearSearch={() => {
            setHfSearchResults([]);
            setHfSearchQuery('');
          }}
          onInstallModel={handleInstallModel}
        />
      )}

      {activeTab === 'quality' && <ModelQualityPanel />}

      {/* Modal do Assistente de Configuração */}
      {isAdmin && <SetupWizardModal
        isOpen={showWizard}
        onClose={() => setShowWizard(false)}
        onCompleted={() => loadData()}
      />}
      </>
      )}
    </div>
  );
};

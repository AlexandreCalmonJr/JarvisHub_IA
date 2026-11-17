import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutGrid,
  Bot,
  BookOpen,
  RefreshCw,
  Search,
  Filter,
  Check,
  Plus,
  X,
  Sparkles,
  ChevronRight,
  Trash2,
} from 'lucide-react';
import { fetchSkills, toggleSkill, fetchAgents, fetchPonytailStatus, savePonytailLevel, deleteUserSkill } from '../api';
import { SkillInfo, AgentInfo } from '../types';
import { SkillCard } from './skills/SkillCard';
import { SkillAgentModal } from './skills/SkillAgentModal';
import { CreateSkillModal } from './skills/CreateSkillModal';
import { notify } from './common/Toast';
import { ConfirmDialog } from './common/ConfirmDialog';
import { API_BASE } from '../services/api/client';
import { getAccountStorageKey } from '../services/accountScope';

export interface StoreAppItem {
  id: string;
  name: string;
  description: string;
  category: 'productivity' | 'documents' | 'development' | 'ai';
  color: string;
  iconType: string;
}

export const SkillsManagerView: React.FC = () => {
  // Aba da Loja: Apps, Agentes ou Habilidades
  const [activeStoreTab, setActiveStoreTab] = useState<'apps' | 'agents' | 'skills'>('apps');

  // Estado das Habilidades (Mantido 100% fiel aos contratos e testes)
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canManageSkills, setCanManageSkills] = useState(false);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [ponytailError, setPonytailError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryTab, setCategoryTab] = useState<'all' | 'arch' | 'sec' | 'qa' | 'custom'>('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<{ id: string; name: string } | null>(null);
  const [deletingSkill, setDeletingSkill] = useState(false);

  // Estado do Modo Ponytail (Senior YAGNI)
  const [ponytailLevel, setPonytailLevel] = useState<string>('senior');
  const [savingPonytail, setSavingPonytail] = useState<boolean>(false);

  // Estado da Loja de Apps
  const [appSearchQuery, setAppSearchQuery] = useState('');
  const [connectedApps, setConnectedApps] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(getAccountStorageKey('jarvis_connected_apps'));
      if (raw) return JSON.parse(raw);
    } catch {}
    // Padrão exatamente como na imagem do OpenBot
    return ['telegram', 'whatsapp', 'github', 'canva', 'vercel', 'context7', 'huggingface'];
  });
  const [selectedAppForModal, setSelectedAppForModal] = useState<StoreAppItem | null>(null);
  const [showCustomAppModal, setShowCustomAppModal] = useState(false);
  const [appTokenInput, setAppTokenInput] = useState('');
  const [connectingApp, setConnectingApp] = useState(false);

  // Catálogo completo de Apps da Loja (OpenBot Store)
  const STORE_APPS: StoreAppItem[] = [
    // Produtividade
    {
      id: 'slack',
      name: 'Slack',
      description: 'Menções e mensagens diretas no Slack',
      category: 'productivity',
      color: '#ffffff',
      iconType: 'slack',
    },
    {
      id: 'discord',
      name: 'Discord',
      description: 'Menções e mensagens diretas no Discord',
      category: 'productivity',
      color: '#5865f2',
      iconType: 'discord',
    },
    {
      id: 'telegram',
      name: 'Telegram',
      description: 'Grupos e conversas diretas no Telegram',
      category: 'productivity',
      color: '#0284c7',
      iconType: 'telegram',
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp',
      description: 'Seu próprio chat e as pessoas que você atende',
      category: 'productivity',
      color: '#22c55e',
      iconType: 'whatsapp',
    },
    {
      id: '1password',
      name: '1Password',
      description: 'Entre em sites com os logins que você usa',
      category: 'productivity',
      color: '#0284c7',
      iconType: '1password',
    },
    {
      id: 'bitwarden',
      name: 'Bitwarden',
      description: 'Entre em sites com logins de um cofre',
      category: 'productivity',
      color: '#175ddc',
      iconType: 'bitwarden',
    },

    // Documentos
    {
      id: 'coda',
      name: 'Coda',
      description: 'Docs, pages and tables',
      category: 'documents',
      color: '#ea580c',
      iconType: 'coda',
    },
    {
      id: 'craft',
      name: 'Craft',
      description: 'Notes, docs and tasks',
      category: 'documents',
      color: '#ffffff',
      iconType: 'craft',
    },
    {
      id: 'dropbox',
      name: 'Dropbox',
      description: 'Files and folders',
      category: 'documents',
      color: '#0061ff',
      iconType: 'dropbox',
    },
    {
      id: 'evernote',
      name: 'Evernote',
      description: 'Notes and notebooks',
      category: 'documents',
      color: '#00a82d',
      iconType: 'evernote',
    },

    // Desenvolvimento & Código
    {
      id: 'github',
      name: 'GitHub',
      description: 'Repositórios, PRs e commits',
      category: 'development',
      color: '#18181b',
      iconType: 'github',
    },
    {
      id: 'vercel',
      name: 'Vercel',
      description: 'Deployments, logs e ambientes',
      category: 'development',
      color: '#000000',
      iconType: 'vercel',
    },
    {
      id: 'canva',
      name: 'Canva',
      description: 'Criação de designs, mockups e assets visuais',
      category: 'development',
      color: '#00c4cc',
      iconType: 'canva',
    },

    // Inteligência Artificial & Dados
    {
      id: 'context7',
      name: 'Context7',
      description: 'Servidor MCP de documentação técnica',
      category: 'ai',
      color: '#059669',
      iconType: 'context7',
    },
    {
      id: 'huggingface',
      name: 'Hugging Face',
      description: 'Modelos e datasets abertos',
      category: 'ai',
      color: '#eab308',
      iconType: 'huggingface',
    },
  ];

  const saveConnectedApps = (list: string[]) => {
    try {
      setConnectedApps(list);
      localStorage.setItem(getAccountStorageKey('jarvis_connected_apps'), JSON.stringify(list));
    } catch {}
  };

  const handleToggleConnect = (app: StoreAppItem) => {
    const isConn = connectedApps.includes(app.id);
    if (isConn) {
      // Abre modal de gerenciamento ou desconexão
      setSelectedAppForModal(app);
    } else {
      setSelectedAppForModal(app);
      setAppTokenInput('');
    }
  };

  const confirmAppConnection = () => {
    if (!selectedAppForModal) return;
    setConnectingApp(true);
    setTimeout(() => {
      const next = Array.from(new Set([...connectedApps, selectedAppForModal.id]));
      saveConnectedApps(next);
      notify(`App "${selectedAppForModal.name}" conectado com sucesso!`, 'success');
      setConnectingApp(false);
      setSelectedAppForModal(null);
    }, 400);
  };

  const disconnectApp = (appId: string) => {
    const next = connectedApps.filter((id) => id !== appId);
    saveConnectedApps(next);
    notify('App desconectado com sucesso!', 'info');
    setSelectedAppForModal(null);
  };

  const loadData = async () => {
    setLoading(true);
    const [skillsResult, agentsResult, ponytailResult] = await Promise.allSettled([
      fetchSkills(),
      fetchAgents(),
      fetchPonytailStatus(),
    ]);
    if (skillsResult.status === 'fulfilled') {
      setSkills(skillsResult.value);
      setCatalogError(null);
    } else {
      setCatalogError(skillsResult.reason instanceof Error ? skillsResult.reason.message : 'Falha ao carregar catálogo de habilidades.');
    }
    if (agentsResult.status === 'fulfilled') {
      setAgents(agentsResult.value);
      setAgentsError(null);
    } else {
      setAgentsError(agentsResult.reason instanceof Error ? agentsResult.reason.message : 'Falha ao carregar agentes disponíveis.');
    }
    if (ponytailResult.status === 'fulfilled') {
      setPonytailLevel(ponytailResult.value.level);
      setPonytailError(null);
    } else {
      setPonytailError(ponytailResult.reason instanceof Error ? ponytailResult.reason.message : 'Falha ao carregar política Ponytail.');
    }
    setLoading(false);
  };

  const handleDeleteSkill = (skillId: string, skillName: string) => {
    if (!canManageSkills) return;
    setPendingDeleteSkill({ id: skillId, name: skillName });
  };

  const confirmDeleteSkill = async () => {
    if (!canManageSkills || !pendingDeleteSkill) return;
    const { id: skillId, name: skillName } = pendingDeleteSkill;
    setDeletingSkill(true);
    try {
      const result = await deleteUserSkill(skillId);
      if (result?.status !== 'deleted') throw new Error('A habilidade não foi encontrada na sua conta.');
      notify(`Habilidade "${skillName}" excluída com sucesso!`, 'success');
      setPendingDeleteSkill(null);
      await loadData();
    } catch (err: any) {
      notify(`Erro ao excluir habilidade: ${err.message}`, 'error');
    } finally {
      setDeletingSkill(false);
    }
  };

  const handlePonytailChange = async (newLevel: string) => {
    if (!isAdmin) return;
    setSavingPonytail(true);
    try {
      await savePonytailLevel(newLevel);
      setPonytailLevel(newLevel);
      notify(`Modo Ponytail atualizado para '${newLevel.toUpperCase()}'!`, 'success');
    } catch (err: any) {
      notify(`Erro ao alterar modo Ponytail: ${err.message}`, 'error');
    } finally {
      setSavingPonytail(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/auth/me`, { credentials: 'include' })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((principal) => {
        if (cancelled) return;
        const human = principal?.kind === 'human';
        setIsAdmin(human && principal?.role === 'admin');
        setCanManageSkills(human && (principal?.role === 'admin' || principal?.role === 'developer'));
        setRoleLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setIsAdmin(false);
          setCanManageSkills(false);
          setRoleLoaded(true);
        }
      });
    loadData();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async (skillId: string) => {
    if (!canManageSkills) return;
    try {
      await toggleSkill(skillId);
      await loadData();
    } catch (e) {
      notify(`Não foi possível alterar a habilidade: ${e instanceof Error ? e.message : 'erro desconhecido'}`, 'error');
    }
  };

  const domains = useMemo(() => {
    const set = new Set<string>();
    skills.forEach((s) => set.add(s.domain));
    return Array.from(set).sort();
  }, [skills]);

  const filteredSkills = useMemo(() => {
    return skills.filter((s) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q);

      const matchDomain = domainFilter === 'all' || s.domain === domainFilter;

      let matchCategory = true;
      if (categoryTab === 'arch') {
        matchCategory = ['web', 'backend', 'flutter', 'architecture', 'mobile'].includes(s.domain.toLowerCase());
      } else if (categoryTab === 'sec') {
        matchCategory = ['security', 'cve', 'devsecops', 'auth'].includes(s.domain.toLowerCase()) || s.id.includes('sec');
      } else if (categoryTab === 'qa') {
        matchCategory = ['qa', 'testing', 'test', 'tdd'].includes(s.domain.toLowerCase()) || s.id.includes('test');
      } else if (categoryTab === 'custom') {
        matchCategory = s.origin === 'user_created' || s.origin?.includes('imported') || s.id.startsWith('user_');
      }

      const isAct = s.is_approved && !s.is_revoked;
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && isAct) ||
        (statusFilter === 'inactive' && !isAct);

      return matchSearch && matchDomain && matchStatus && matchCategory;
    });
  }, [skills, searchQuery, domainFilter, statusFilter, categoryTab]);

  const activeCount = skills.filter((s) => s.is_approved && !s.is_revoked).length;

  // Renderizador de Ícones de Marcas Estilizados
  const renderAppIcon = (iconType: string, size = 38) => {
    const radius = Math.round(size * 0.26);
    switch (iconType) {
      case 'telegram':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none"><path d="M21.5 2.5L2 10.5l7 3 2 6 4-3.5 5 4.5 1.5-18z" fill="#ffffff"/></svg>
          </div>
        );
      case 'whatsapp':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none"><path d="M12 2C6.48 2 2 6.48 2 12c0 1.94.55 3.75 1.51 5.29L2 22l4.87-1.48C8.34 21.48 10.12 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm4.84 14.18c-.2.57-1.16 1.09-1.63 1.15-.44.06-.99.08-3.18-.79-2.31-.92-3.8-3.26-3.92-3.41-.11-.15-.94-1.25-.94-2.38s.59-1.69.8-1.92c.2-.23.44-.29.59-.29s.3.01.43.02c.14.01.32-.05.5.38.2.47.67 1.63.73 1.75.06.12.1.26.02.41-.08.15-.12.24-.24.38-.12.14-.25.31-.36.42-.12.12-.24.25-.1.5.14.24.62 1.02 1.33 1.65.91.81 1.68 1.06 1.92 1.18.24.12.38.1.52-.06.14-.16.6-.7.76-.94.16-.24.32-.2.53-.12.22.08 1.38.65 1.62.77.24.12.4.18.46.28.06.1.06.59-.14 1.16z" fill="#ffffff"/></svg>
          </div>
        );
      case 'slack':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.58} height={size * 0.58} viewBox="0 0 24 24">
              <path d="M6 15a2 2 0 0 1-2-2 2 2 0 0 1 2-2h2v2a2 2 0 0 1-2 2zm1 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-5z" fill="#e01e5a"/>
              <path d="M9 6a2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2h2v2zm0 1a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5z" fill="#36c5f0"/>
              <path d="M18 9a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2v-2a2 2 0 0 1 2-2zm-1 0a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5z" fill="#2eb67d"/>
              <path d="M15 18a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2v-2zm0-1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-5z" fill="#ecb22e"/>
            </svg>
          </div>
        );
      case 'discord':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#5865f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="#ffffff"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.893.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
          </div>
        );
      case '1password':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2.5"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><line x1="12" y1="15" x2="12" y2="17"/></svg>
          </div>
        );
      case 'bitwarden':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#175ddc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="none" stroke="#ffffff" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><rect x="8" y="9" width="8" height="6" rx="1"/></svg>
          </div>
        );
      case 'coda':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="#ffffff"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M14 8h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h4" stroke="#ea580c" strokeWidth="2.5" fill="none"/></svg>
          </div>
        );
      case 'craft':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="2" fill="#2563eb"/><rect x="13" y="4" width="7" height="7" rx="2" fill="#7c3aed"/><rect x="4" y="13" width="7" height="7" rx="2" fill="#06b6d4"/><rect x="13" y="13" width="7" height="7" rx="2" fill="#f43f5e"/></svg>
          </div>
        );
      case 'dropbox':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#0061ff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.54} height={size * 0.54} viewBox="0 0 24 24" fill="#ffffff"><path d="M6 3.5L12 7.5L6 11.5L0 7.5L6 3.5ZM18 3.5L24 7.5L18 11.5L12 7.5L18 3.5ZM0 15.5L6 19.5L12 15.5L6 11.5L0 15.5ZM18 11.5L12 15.5L18 19.5L24 15.5L18 11.5ZM6 20.8L12 16.8L18 20.8L12 24.8L6 20.8Z"/></svg>
          </div>
        );
      case 'evernote':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#00a82d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="#ffffff"><path d="M19.5 3H7.5A4.5 4.5 0 0 0 3 7.5v8.78A4.72 4.72 0 0 0 7.72 21H16a5 5 0 0 0 5-5V4.5a1.5 1.5 0 0 0-1.5-1.5zm-5 13H8a1 1 0 0 1 0-2h6.5a1 1 0 0 1 0 2zm2-4H8a1 1 0 0 1 0-2h8.5a1 1 0 0 1 0 2z"/></svg>
          </div>
        );
      case 'github':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.1)', flexShrink: 0 }}>
            <svg width={size * 0.52} height={size * 0.52} viewBox="0 0 24 24" fill="#ffffff"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
          </div>
        );
      case 'vercel':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#000000', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid rgba(255,255,255,0.15)', flexShrink: 0 }}>
            <svg width={size * 0.46} height={size * 0.46} viewBox="0 0 24 24" fill="#ffffff"><path d="M12 1L24 22H0L12 1Z"/></svg>
          </div>
        );
      case 'canva':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, background: 'linear-gradient(135deg, #00c4cc, #7d2ae8)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: `${size * 0.48}px`, fontFamily: 'serif' }}>C</span>
          </div>
        );
      case 'context7':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: `${size * 0.38}px` }}>C7</span>
          </div>
        );
      case 'huggingface':
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: '#eab308', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: `${size * 0.52}px`, lineHeight: 1 }}>🤗</span>
          </div>
        );
      default:
        return (
          <div style={{ width: `${size}px`, height: `${size}px`, borderRadius: `${radius}px`, backgroundColor: 'rgba(255, 255, 255, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Sparkles size={size * 0.5} color="#38bdf8" />
          </div>
        );
    }
  };

  // Filtragem de apps na aba "Apps"
  const appsFiltered = useMemo(() => {
    return STORE_APPS.filter((a) => {
      const q = appSearchQuery.toLowerCase().trim();
      return !q || a.name.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    });
  }, [appSearchQuery]);

  const productivityApps = appsFiltered.filter((a) => a.category === 'productivity');
  const documentsApps = appsFiltered.filter((a) => a.category === 'documents');
  const devApps = appsFiltered.filter((a) => a.category === 'development');
  const aiApps = appsFiltered.filter((a) => a.category === 'ai');

  return (
    <div
      style={{
        display: 'flex',
        height: '100%',
        width: '100%',
        backgroundColor: '#121212',
        overflow: 'hidden',
      }}
    >
      {/* ========================================================================= */}
      {/* SUB-PAINEL LATERAL ESQUERDO: LOJA (OpenBot Style)                        */}
      {/* ========================================================================= */}
      <aside
        style={{
          width: '240px',
          backgroundColor: '#161616',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          flexShrink: 0,
        }}
      >
        <div style={{ padding: '16px 16px 12px 16px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
            Loja
          </h2>
        </div>

        {/* Abas Principais: Apps, Agentes, Habilidades */}
        <div style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <button
            type="button"
            onClick={() => setActiveStoreTab('apps')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeStoreTab === 'apps' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: activeStoreTab === 'apps' ? '#ffffff' : '#a3a3a3',
              fontSize: '0.84rem',
              fontWeight: activeStoreTab === 'apps' ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <LayoutGrid size={16} color={activeStoreTab === 'apps' ? '#ffffff' : '#888888'} />
            <span>Apps</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStoreTab('agents')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeStoreTab === 'agents' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: activeStoreTab === 'agents' ? '#ffffff' : '#a3a3a3',
              fontSize: '0.84rem',
              fontWeight: activeStoreTab === 'agents' ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <Bot size={16} color={activeStoreTab === 'agents' ? '#ffffff' : '#888888'} />
            <span>Agentes</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveStoreTab('skills')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 12px',
              borderRadius: '8px',
              border: 'none',
              backgroundColor: activeStoreTab === 'skills' ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              color: activeStoreTab === 'skills' ? '#ffffff' : '#a3a3a3',
              fontSize: '0.84rem',
              fontWeight: activeStoreTab === 'skills' ? 600 : 400,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <BookOpen size={16} color={activeStoreTab === 'skills' ? '#ffffff' : '#888888'} />
            <span>Habilidades</span>
          </button>
        </div>

        {/* Seção "Seus apps" (Exatamente como no OpenBot) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 8px 8px 8px' }}>
          <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#737373', padding: '0 10px 8px 10px' }}>
            Seus apps
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            {STORE_APPS.filter((a) => connectedApps.includes(a.id)).map((app) => (
              <button
                key={app.id}
                type="button"
                onClick={() => setSelectedAppForModal(app)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '6px 10px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: 'transparent',
                  color: '#d4d4d4',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                {renderAppIcon(app.iconType, 20)}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {app.name}
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* ÁREA PRINCIPAL DO CONTEÚDO                                                */}
      {/* ========================================================================= */}
      <main
        style={{
          flex: 1,
          height: '100%',
          overflowY: 'auto',
          padding: 'clamp(24px, 3.5vw, 44px)',
          backgroundColor: '#121212',
        }}
      >
        {/* ======================================================================= */}
        {/* VIEW 1: APPS (Idêntica à Imagem anexada pelo Usuário)                   */}
        {/* ======================================================================= */}
        {activeStoreTab === 'apps' && (
          <div style={{ maxWidth: '1040px', display: 'flex', flexDirection: 'column', gap: '28px' }}>
            {/* Cabeçalho */}
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Apps
              </h1>
              <p style={{ fontSize: '0.84rem', color: '#888888', marginTop: '4px' }}>
                Conecte as ferramentas e os serviços com que seus agentes trabalham.
              </p>
            </div>

            {/* Barra de Busca + Adicionar Personalizado */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '8px',
                  padding: '7px 14px',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  width: '100%',
                  maxWidth: '480px',
                }}
              >
                <Search size={15} color="#888888" />
                <input
                  type="text"
                  value={appSearchQuery}
                  onChange={(e) => setAppSearchQuery(e.target.value)}
                  placeholder="Buscar"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#ededed',
                    fontSize: '0.82rem',
                    width: '100%',
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setShowCustomAppModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                  transition: 'opacity 0.15s ease',
                }}
              >
                <Plus size={15} strokeWidth={2.5} />
                <span>Adicionar personalizado</span>
              </button>
            </div>

            {/* SEÇÃO 1: Produtividade */}
            {productivityApps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      Produtividade
                    </h2>
                    <span style={{ fontSize: '0.82rem', color: '#71717a' }}>82</span>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.80rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <span>Ver tudo</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Grid 2 Colunas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px' }}>
                  {productivityApps.map((app) => {
                    const isConnected = connectedApps.includes(app.id);
                    return (
                      <div
                        key={app.id}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.025)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                          transition: 'background-color 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          {renderAppIcon(app.iconType, 40)}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#f5f5f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#888888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.description}
                            </div>
                          </div>
                        </div>

                        {isConnected ? (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              color: '#22c55e',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: '6px 8px',
                              flexShrink: 0,
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                            <span>Conectado</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              flexShrink: 0,
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            + Conectar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO 2: Documentos */}
            {documentsApps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      Documentos
                    </h2>
                    <span style={{ fontSize: '0.82rem', color: '#71717a' }}>8</span>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.80rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <span>Ver tudo</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Grid 2 Colunas */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px' }}>
                  {documentsApps.map((app) => {
                    const isConnected = connectedApps.includes(app.id);
                    return (
                      <div
                        key={app.id}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.025)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          {renderAppIcon(app.iconType, 40)}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#f5f5f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#888888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.description}
                            </div>
                          </div>
                        </div>

                        {isConnected ? (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              color: '#22c55e',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: '6px 8px',
                              flexShrink: 0,
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                            <span>Conectado</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            + Conectar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO 3: Desenvolvimento & Código */}
            {devApps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      Desenvolvimento & Código
                    </h2>
                    <span style={{ fontSize: '0.82rem', color: '#71717a' }}>24</span>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.80rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <span>Ver tudo</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px' }}>
                  {devApps.map((app) => {
                    const isConnected = connectedApps.includes(app.id);
                    return (
                      <div
                        key={app.id}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.025)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          {renderAppIcon(app.iconType, 40)}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#f5f5f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#888888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.description}
                            </div>
                          </div>
                        </div>

                        {isConnected ? (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              color: '#22c55e',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: '6px 8px',
                              flexShrink: 0,
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                            <span>Conectado</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            + Conectar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* SEÇÃO 4: Inteligência Artificial */}
            {aiApps.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      Inteligência Artificial & MCP
                    </h2>
                    <span style={{ fontSize: '0.82rem', color: '#71717a' }}>16</span>
                  </div>
                  <button
                    type="button"
                    style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: '0.80rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}
                  >
                    <span>Ver tudo</span>
                    <ChevronRight size={14} />
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px' }}>
                  {aiApps.map((app) => {
                    const isConnected = connectedApps.includes(app.id);
                    return (
                      <div
                        key={app.id}
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.025)',
                          borderRadius: '12px',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          padding: '12px 14px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '12px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                          {renderAppIcon(app.iconType, 40)}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.90rem', fontWeight: 600, color: '#f5f5f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.name}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#888888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {app.description}
                            </div>
                          </div>
                        </div>

                        {isConnected ? (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'none',
                              border: 'none',
                              color: '#22c55e',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              cursor: 'pointer',
                              padding: '6px 8px',
                              flexShrink: 0,
                            }}
                          >
                            <Check size={14} strokeWidth={2.5} />
                            <span>Conectado</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleConnect(app)}
                            style={{
                              backgroundColor: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.12)',
                              borderRadius: '8px',
                              color: '#ffffff',
                              fontSize: '0.80rem',
                              fontWeight: 500,
                              padding: '6px 14px',
                              cursor: 'pointer',
                              flexShrink: 0,
                            }}
                          >
                            + Conectar
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW 2: AGENTES (Catálogo dos Especialistas)                            */}
        {/* ======================================================================= */}
        {activeStoreTab === 'agents' && (
          <div style={{ maxWidth: '1040px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 600, color: '#f5f5f5', margin: 0 }}>
                Agentes Especialistas
              </h1>
              <p style={{ fontSize: '0.84rem', color: '#888888', marginTop: '4px' }}>
                Especialistas autônomos com personalidades 3D calibradas para arquitetura, qualidade, segurança e código.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
              {[
                { name: 'QA Tester', role: 'Engenheiro de Testes', color: '#ec4899', desc: 'Criação de testes Playwright, pytest, cobertura e TDD.' },
                { name: 'Copy Editor', role: 'Redação & UX Writing', color: '#3b82f6', desc: 'Revisão textual, documentação técnica e clareza de interface.' },
                { name: 'Bug Fixer', role: 'Correção de Erros', color: '#f97316', desc: 'Diagnóstico de logs, depuração de stack traces e patches cirúrgicos.' },
                { name: 'Security Auditor', role: 'DevSecOps & OWASP', color: '#10b981', desc: 'Auditoria de vulnerabilidades, validação de tokens e SAST.' },
                { name: 'Design Center', role: 'UI/UX & Design System', color: '#6366f1', desc: 'Cores, acessibilidade WCAG, contraste e design tokens modernos.' },
                { name: 'Prototype Architect', role: 'Arquitetura de Solução', color: '#f59e0b', desc: 'Estruturação de microsserviços, diagramas e padrões limpos.' },
                { name: 'Launch Commander', role: 'Deploy & Produção', color: '#d946ef', desc: 'Automação de CI/CD, verificação de ambiente e release checklist.' },
                { name: 'Change Manager', role: 'Migração & Refatoração', color: '#06b6d4', desc: 'Controle de breaking changes e atualizações incrementais.' },
                { name: 'Calmon Dev', role: 'Engenheiro Principal Fullstack', color: '#ef4444', desc: 'Liderança técnica, integração global e tomada de decisão.' },
              ].map((agent, idx) => (
                <div
                  key={idx}
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    borderRadius: '14px',
                    border: '1px solid rgba(255, 255, 255, 0.07)',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      style={{
                        width: '38px',
                        height: '38px',
                        borderRadius: '10px',
                        backgroundColor: agent.color,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 3px 12px ${agent.color}40`,
                      }}
                    >
                      <div style={{ display: 'flex', gap: '3px' }}>
                        <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#000000' }} />
                        <span style={{ width: '3px', height: '3px', borderRadius: '50%', backgroundColor: '#000000' }} />
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: '0.94rem', fontWeight: 600, color: '#ffffff' }}>{agent.name}</div>
                      <div style={{ fontSize: '0.76rem', color: '#888888' }}>{agent.role}</div>
                    </div>
                  </div>

                  <p style={{ fontSize: '0.80rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5, flex: 1 }}>
                    {agent.desc}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                    <button
                      type="button"
                      onClick={() => notify(`Agente "${agent.name}" adicionado ao seu Dock!`, 'success')}
                      style={{
                        flex: 1,
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '8px',
                        color: '#ffffff',
                        fontSize: '0.78rem',
                        fontWeight: 500,
                        padding: '6px 10px',
                        cursor: 'pointer',
                      }}
                    >
                      Fixar no Dock
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW 3: HABILIDADES (ECC & Políticas Ponytail)                          */}
        {/* ======================================================================= */}
        {activeStoreTab === 'skills' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1100px' }}>
            {!roleLoaded && <div role="status" className="glass-panel" style={{ padding: '10px 14px', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>A verificar permissões do Gestor de Skills…</div>}
            
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <h1
                  style={{
                    fontSize: '1.85rem',
                    fontWeight: 600,
                    margin: 0,
                    color: '#f5f5f5',
                  }}
                >
                  Gestor de Skills e Catálogo ECC
                </h1>
                <p style={{ fontSize: '0.84rem', color: '#888888', margin: '4px 0 0 0' }}>
                  Habilidades técnicas ativas ({activeCount}/{skills.length}), versionadas e injetadas apenas nos agentes associados e autorizados.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {canManageSkills && (
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="btn btn-primary"
                    style={{
                      fontSize: '0.82rem',
                      padding: '7px 14px',
                      borderRadius: '8px',
                    }}
                  >
                    <span>Nova Habilidade ECC</span>
                  </button>
                )}

                <button onClick={() => loadData()} className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '7px 12px', borderRadius: '8px' }}>
                  <span>{loading ? 'Atualizando...' : 'Atualizar'}</span>
                </button>
              </div>
            </div>

            {catalogError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--danger-color)', borderRadius: '8px', color: 'var(--danger-color)', fontSize: '0.84rem' }}>{catalogError}</div>}
            {agentsError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--warning-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Agentes indisponíveis: {agentsError}</div>}
            {ponytailError && <div role="alert" style={{ padding: '12px 14px', border: '1px solid var(--warning-color)', borderRadius: '8px', color: 'var(--text-secondary)', fontSize: '0.84rem' }}>Política Ponytail indisponível: {ponytailError}</div>}

            {/* Banner Ponytail */}
            <div
              className="glass-card"
              style={{
                padding: '16px 20px',
                borderRadius: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 500, color: '#ffffff' }}>
                    Modo Ponytail (The Laziest Senior Developer)
                  </span>
                  <span
                    style={{
                      fontSize: '0.68rem',
                      padding: '2px 8px',
                      borderRadius: '999px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: 'var(--text-secondary)',
                      border: '1px solid var(--border-color)',
                      fontWeight: 500,
                    }}
                  >
                    {ponytailLevel !== 'off' ? 'YAGNI Ativo' : 'Desativado'}
                  </span>
                </div>
                <p style={{ fontSize: '0.78rem', color: '#888888', margin: '3px 0 0 0' }}>
                  Política global de minimalismo técnico: reaproveitar código existente, usar standard library e evitar dependências redundantes.
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.80rem', color: '#888888', fontWeight: 500 }}>Nível:</span>
                {isAdmin ? (
                  <select
                    value={ponytailLevel}
                    disabled={savingPonytail}
                    onChange={(e) => handlePonytailChange(e.target.value)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#1b1b1b',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '8px',
                      color: '#f5f5f5',
                      fontSize: '0.82rem',
                      fontWeight: 500,
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <option value="off">Desativado (Criação Livre)</option>
                    <option value="lite">Ponytail Leve (Evita Pacotes)</option>
                    <option value="senior">Ponytail Sênior (YAGNI & DRY Padrão)</option>
                    <option value="ultra">Ponytail Ultra (Minimalismo Radical)</option>
                  </select>
                ) : (
                  <span style={{ color: '#ffffff', fontSize: '0.82rem' }}>{ponytailLevel.toUpperCase()} · definido pelo administrador</span>
                )}
              </div>
            </div>

            {/* Categorias de Skills */}
            <div
              style={{
                display: 'flex',
                gap: '8px',
                overflowX: 'auto',
                paddingBottom: '4px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <button
                type="button"
                onClick={() => setCategoryTab('all')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: categoryTab === 'all' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: categoryTab === 'all' ? '#38bdf8' : '#888888',
                  borderBottom: categoryTab === 'all' ? '2px solid #38bdf8' : '2px solid transparent',
                }}
              >
                Todas as Habilidades ({skills.length})
              </button>

              <button
                type="button"
                onClick={() => setCategoryTab('arch')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: categoryTab === 'arch' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: categoryTab === 'arch' ? '#38bdf8' : '#888888',
                  borderBottom: categoryTab === 'arch' ? '2px solid #38bdf8' : '2px solid transparent',
                }}
              >
                Arquitetura & Clean Code
              </button>

              <button
                type="button"
                onClick={() => setCategoryTab('sec')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: categoryTab === 'sec' ? 'rgba(239, 68, 68, 0.15)' : 'transparent',
                  color: categoryTab === 'sec' ? '#f87171' : '#888888',
                  borderBottom: categoryTab === 'sec' ? '2px solid #f87171' : '2px solid transparent',
                }}
              >
                Cibersegurança & OWASP
              </button>

              <button
                type="button"
                onClick={() => setCategoryTab('qa')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: categoryTab === 'qa' ? 'rgba(245, 158, 11, 0.15)' : 'transparent',
                  color: categoryTab === 'qa' ? '#fbbf24' : '#888888',
                  borderBottom: categoryTab === 'qa' ? '2px solid #fbbf24' : '2px solid transparent',
                }}
              >
                QA & Testes
              </button>

              <button
                type="button"
                onClick={() => setCategoryTab('custom')}
                style={{
                  padding: '7px 14px',
                  borderRadius: '8px',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  backgroundColor: categoryTab === 'custom' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
                  color: categoryTab === 'custom' ? '#38bdf8' : '#888888',
                  borderBottom: categoryTab === 'custom' ? '2px solid #38bdf8' : '2px solid transparent',
                }}
              >
                Criadas pelo Usuário
              </button>
            </div>

            {/* Barra de Filtros e Busca de Skills */}
            <div
              style={{
                padding: '12px 18px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                <Search size={16} color="#888888" />
                <input
                  type="text"
                  placeholder="Buscar por nome, ID ou descrição da skill..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    backgroundColor: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: '#ffffff',
                    fontSize: '0.84rem',
                  }}
                />
              </div>

              {/* Filtro de Domínio */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Filter size={14} color="#888888" />
                <select
                  value={domainFilter}
                  onChange={(e) => setDomainFilter(e.target.value)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: '#1b1b1b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '6px',
                    color: '#ffffff',
                    fontSize: '0.80rem',
                    outline: 'none',
                  }}
                >
                  <option value="all">Todos os Domínios</option>
                  {domains.map((dom) => (
                    <option key={dom} value={dom}>
                      {dom.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Filtro de Status */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#1b1b1b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  color: '#ffffff',
                  fontSize: '0.80rem',
                  outline: 'none',
                }}
              >
                <option value="all">Todos os Status</option>
                <option value="active">Apenas Ativas</option>
                <option value="inactive">Apenas Desativadas</option>
              </select>
            </div>

            {/* Grid de Skills */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: '#888888' }}>
                <RefreshCw size={24} className="spin" style={{ margin: '0 auto 12px' }} />
                Carregando catálogo de skills e vinculações...
              </div>
            ) : catalogError ? (
              <div role="alert" style={{ padding: '24px', border: '1px solid var(--danger-color)', borderRadius: '10px', color: 'var(--danger-color)', fontSize: '0.86rem' }}>
                O catálogo não pôde ser carregado. Atualize a página ou tente novamente.
              </div>
            ) : filteredSkills.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: '48px 24px',
                  color: '#888888',
                  backgroundColor: 'rgba(255, 255, 255, 0.02)',
                  borderRadius: '12px',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                }}
              >
                <BookOpen size={36} color="#666666" style={{ margin: '0 auto 12px' }} />
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: '#ffffff' }}>
                  Nenhuma skill encontrada com os filtros selecionados
                </h3>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 320px), 1fr))', gap: '16px' }}>
                {filteredSkills.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    onToggle={handleToggle}
                    onEditAgents={(s) => setEditingSkill(s)}
                    onDelete={canManageSkills ? handleDeleteSkill : undefined}
                    canManageSkills={canManageSkills}
                    isAdmin={isAdmin}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* MODAL: CONECTAR / GERENCIAR APP (Slack, Discord, 1Password, etc.)        */}
      {/* ========================================================================= */}
      {selectedAppForModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
          onClick={() => setSelectedAppForModal(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#18181b',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              width: '100%',
              maxWidth: '460px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {renderAppIcon(selectedAppForModal.iconType, 36)}
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                    {selectedAppForModal.name}
                  </h3>
                  <span style={{ fontSize: '0.78rem', color: '#888888' }}>
                    {connectedApps.includes(selectedAppForModal.id) ? 'Conector ativo e sincronizado' : 'Conectar nova ferramenta'}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppForModal(null)}
                style={{ background: 'none', border: 'none', color: '#888888', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.84rem', color: '#a1a1aa', margin: 0, lineHeight: 1.5 }}>
              {selectedAppForModal.description}. Autorize o JARVIS AI Hub a interagir com este serviço através das suas chaves de API ou webhook seguro.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <label style={{ fontSize: '0.80rem', fontWeight: 600, color: '#d4d4d8' }}>
                Token de Acesso / Chave de API / Webhook URL
              </label>
              <input
                type="password"
                placeholder="Insira o token ou webhook..."
                value={appTokenInput}
                onChange={(e) => setAppTokenInput(e.target.value)}
                style={{
                  backgroundColor: '#27272a',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '9px 12px',
                  color: '#ffffff',
                  fontSize: '0.84rem',
                  outline: 'none',
                }}
              />
              <span style={{ fontSize: '0.72rem', color: '#71717a' }}>
                As credenciais são criptografadas e persistidas no cofre isolado da sua conta.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              {connectedApps.includes(selectedAppForModal.id) && (
                <button
                  type="button"
                  onClick={() => disconnectApp(selectedAppForModal.id)}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    color: '#f87171',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 14px',
                    fontSize: '0.82rem',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <Trash2 size={14} />
                  <span>Desconectar</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSelectedAppForModal(null)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>

              <button
                type="button"
                disabled={connectingApp}
                onClick={confirmAppConnection}
                style={{
                  backgroundColor: '#38bdf8',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {connectingApp ? 'Conectando...' : 'Salvar & Conectar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: ADICIONAR PERSONALIZADO (MCP / Webhook / REST)                     */}
      {/* ========================================================================= */}
      {showCustomAppModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(4px)',
            padding: '16px',
          }}
          onClick={() => setShowCustomAppModal(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#18181b',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              width: '100%',
              maxWidth: '480px',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                Adicionar Conector Personalizado
              </h3>
              <button
                type="button"
                onClick={() => setShowCustomAppModal(false)}
                style={{ background: 'none', border: 'none', color: '#888888', cursor: 'pointer', padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#a1a1aa', margin: 0 }}>
              Integre qualquer servidor MCP externo, webhook customizado ou API REST para que os agentes usem como ferramenta.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 600 }}>Nome da Ferramenta</label>
                <input
                  type="text"
                  placeholder="Ex: Minha API Interna, Notion MCP..."
                  style={{
                    width: '100%',
                    backgroundColor: '#27272a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    marginTop: '4px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 600 }}>Tipo de Conexão</label>
                <select
                  style={{
                    width: '100%',
                    backgroundColor: '#27272a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    marginTop: '4px',
                  }}
                >
                  <option value="mcp">Servidor MCP (Model Context Protocol via Stdio / SSE)</option>
                  <option value="webhook">Webhook / Endpoint REST</option>
                  <option value="custom_tool">Script Python / Shell Sandboxed</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#a1a1aa', fontWeight: 600 }}>Comando de Inicialização ou Endpoint URL</label>
                <input
                  type="text"
                  placeholder="Ex: npx -y @modelcontextprotocol/server-postgres ou https://api.exemplo.com/mcp"
                  style={{
                    width: '100%',
                    backgroundColor: '#27272a',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    color: '#ffffff',
                    fontSize: '0.82rem',
                    marginTop: '4px',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={() => setShowCustomAppModal(false)}
                style={{
                  backgroundColor: 'transparent',
                  color: '#a1a1aa',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '8px',
                  padding: '8px 14px',
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  notify('Conector personalizado cadastrado com sucesso!', 'success');
                  setShowCustomAppModal(false);
                }}
                style={{
                  backgroundColor: '#38bdf8',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 18px',
                  fontSize: '0.82rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Adicionar Conector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Vinculação de Agentes da Skill */}
      {canManageSkills && editingSkill && (
        <SkillAgentModal
          isOpen={true}
          onClose={() => setEditingSkill(null)}
          skill={editingSkill}
          agents={agents}
          onSaved={loadData}
        />
      )}

      {/* Modal de Criação / Importação de Skill ECC */}
      {canManageSkills && showCreateModal && (
        <CreateSkillModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          agents={agents}
          onSkillCreated={loadData}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingDeleteSkill)}
        title="Excluir habilidade"
        description={
          pendingDeleteSkill ? (
            <>
              Tem certeza que deseja excluir a habilidade <strong>{pendingDeleteSkill.name}</strong>? Esta ação não pode ser desfeita.
            </>
          ) : null
        }
        confirmLabel="Excluir"
        tone="danger"
        isLoading={deletingSkill}
        onConfirm={confirmDeleteSkill}
        onCancel={() => setPendingDeleteSkill(null)}
      />
    </div>
  );
};

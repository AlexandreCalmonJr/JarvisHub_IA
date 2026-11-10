import React, { useState } from 'react';
import {
  Sparkles,
  Globe,
  Smartphone,
  ShieldCheck,
  TestTube,
  Cpu,
  Terminal,
  Coffee,
  Code2,
  Zap,
  Layers,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

interface QuickPromptsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

const PROMPT_CHIPS = [
  {
    icon: Terminal,
    label: '🐍 Projeto Python (FastAPI)',
    text: 'crie um projeto em python com fastapi, pydantic e testes automatizados',
    color: '#38bdf8',
  },
  {
    icon: Coffee,
    label: '☕ Projeto Java (Maven)',
    text: 'crie um projeto em java 21 com maven e testes junit 5',
    color: '#f59e0b',
  },
  {
    icon: Code2,
    label: '⚡ Projeto .NET (C# 12)',
    text: 'crie um projeto em c# com .net 8, records e servicos',
    color: '#a855f7',
  },
  {
    icon: Zap,
    label: '🚀 Projeto Go (Golang)',
    text: 'crie um projeto em go com servidor http e rotas rest',
    color: '#06b6d4',
  },
  {
    icon: Layers,
    label: '🟣 Projeto Kotlin (Gradle)',
    text: 'crie um projeto em kotlin com gradle dsl e data classes',
    color: '#c084fc',
  },
  {
    icon: Globe,
    label: '🌐 Criar Website (HTML/CSS)',
    text: 'cria um site simples de cafeteria para mim com index.html e style.css',
    color: '#818cf8',
  },
  {
    icon: Smartphone,
    label: '📱 Criar App Mobile (Flutter)',
    text: 'cria um aplicativo mobile flutter com tela inicial, catalogo e dark theme',
    color: '#c084fc',
  },
  {
    icon: ShieldCheck,
    label: '🛡️ Auditar Segurança',
    text: 'auditar vulnerabilidades owasp e segredos expostos no projeto',
    color: '#f87171',
  },
  {
    icon: TestTube,
    label: '🧪 Gerar Testes QA',
    text: 'validar testes automatizados de regressão e casos de borda',
    color: '#fbbf24',
  },
  {
    icon: Cpu,
    label: '📐 Analisar Arquitetura',
    text: 'analisar a arquitetura modular e padrões clean architecture do sistema',
    color: '#34d399',
  },
];

export const QuickPrompts: React.FC<QuickPromptsProps> = ({ onSelect, disabled }) => {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('jarvis_quick_prompts_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    try {
      localStorage.setItem('jarvis_quick_prompts_collapsed', String(next));
    } catch {}
  };

  if (isCollapsed) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', padding: '2px 0' }}>
        <button
          type="button"
          onClick={toggleCollapse}
          className="btn btn-ghost"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            padding: '3px 8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            cursor: 'pointer',
          }}
          title="Clique para expandir as sugestões rápidas de projetos"
        >
          <ChevronRight size={13} color="#818cf8" />
          <Sparkles size={12} color="#818cf8" />
          <span>Ações Rápidas (10 modelos de projetos)</span>
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        overflowX: 'auto',
        padding: '6px 2px',
        scrollbarWidth: 'none',
      }}
    >
      <button
        type="button"
        onClick={toggleCollapse}
        className="btn btn-ghost"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '0.74rem',
          color: 'var(--text-muted)',
          fontWeight: 600,
          whiteSpace: 'nowrap',
          padding: '4px 6px',
          borderRadius: '6px',
          cursor: 'pointer',
          border: '1px solid transparent',
        }}
        title="Ocultar barra de ações rápidas"
      >
        <ChevronDown size={14} color="#818cf8" />
        <Sparkles size={12} color="#818cf8" />
        <span>Ações Rápidas:</span>
      </button>

      {PROMPT_CHIPS.map((chip, idx) => {
        const IconComponent = chip.icon;
        return (
          <button
            key={idx}
            type="button"
            onClick={() => onSelect(chip.text)}
            disabled={disabled}
            className="btn btn-ghost"
            style={{
              padding: '4px 10px',
              borderRadius: '999px',
              fontSize: '0.74rem',
              fontWeight: 500,
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: 'var(--text-secondary)',
              cursor: disabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!disabled) {
                e.currentTarget.style.backgroundColor = 'rgba(99, 102, 241, 0.12)';
                e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.3)';
                e.currentTarget.style.color = '#fff';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.04)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
              e.currentTarget.style.color = 'var(--text-secondary)';
            }}
          >
            <IconComponent size={13} color={chip.color} />
            <span>{chip.label}</span>
          </button>
        );
      })}
    </div>
  );
};

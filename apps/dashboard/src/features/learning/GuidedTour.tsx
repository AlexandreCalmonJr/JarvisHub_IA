import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, X } from 'lucide-react';

type TourStep = { tab: string; title: string; description: string; permission: string };
const TOUR_STEPS: TourStep[] = [
  {tab:'overview',title:'Visão Geral',description:'Comece aqui para acompanhar a disponibilidade dos serviços, indicadores do ambiente e aprovações pendentes.',permission:'system:read'},
  {tab:'chat',title:'Chat JARVIS e Maestro',description:'Envie pedidos ao Maestro. Acompanhe as etapas, os resultados efetivamente produzidos e as aprovações solicitadas.',permission:'chat:read'},
  {tab:'agents',title:'Centro de Agentes',description:'Consulte os agentes registados, as respetivas capacidades e os estados apresentados pelo servidor.',permission:'agents:read'},
  {tab:'office',title:'Escritório Virtual',description:'Acompanhe a organização visual dos agentes. A representação não substitui a confirmação de execução na tarefa.',permission:'agents:read'},
  {tab:'tasks',title:'Gestão de Tarefas',description:'Consulte tarefas, estados, histórico e bloqueios. Use os detalhes para distinguir o que foi planeado do que foi concluído.',permission:'tasks:read'},
  {tab:'workspace',title:'Workspace',description:'Organize projetos e artefactos no espaço autorizado à sua conta. Associe um projeto ao chat quando necessário.',permission:'workspace:read'},
  {tab:'models',title:'Modelos e Providers',description:'Veja os modelos realmente disponíveis, configure providers e mantenha credenciais no cofre protegido.',permission:'models:read'},
  {tab:'skills',title:'Skills',description:'Consulte as capacidades instaladas e disponíveis. A execução respeita as permissões e políticas do Hub.',permission:'skills:read'},
  {tab:'knowledge',title:'Base de Conhecimento',description:'Gira documentos autorizados e pesquise conteúdo indexado, verificando sempre as fontes apresentadas.',permission:'knowledge:read'},
  {tab:'approvals',title:'Central de Aprovações',description:'Revise o escopo e os recursos afetados antes de aprovar ou rejeitar operações que exigem controlo humano.',permission:'approvals:read'},
  {tab:'security',title:'Centro de Segurança',description:'Consulte políticas, auditoria e controlos de segurança disponíveis para o seu perfil.',permission:'security:read'},
  {tab:'coding',title:'Coding Agent',description:'Utilize as ferramentas de desenvolvimento disponíveis e confirme os pedidos de execução e aprovação.',permission:'coding:read'},
  {tab:'backend_studio',title:'Backend Studio',description:'Explore os recursos de backend e os diagnósticos disponibilizados pelo servidor.',permission:'studios:read'},
  {tab:'quality',title:'Quality Studio',description:'Acompanhe os recursos de qualidade e os resultados reais das verificações disponíveis.',permission:'studios:read'},
  {tab:'design',title:'Design Studio',description:'Aceda às ferramentas de design disponíveis no Hub e aos artefactos associados.',permission:'studios:read'},
  {tab:'executive_report',title:'Relatórios Executivos',description:'Consulte relatórios e indicadores limitados ao seu projeto e às permissões da sua conta.',permission:'studios:read'},
  {tab:'advisor',title:'Hardware Advisor',description:'Consulte o perfil de hardware e, quando autorizado, as opções de otimização do ambiente.',permission:'hardware:read'},
  {tab:'server_logs',title:'Logs do Servidor',description:'Os registos globais e ações administrativas são apresentados apenas a perfis autorizados.',permission:'system:logs'},
  {tab:'learning',title:'Centro de Aprendizagem',description:'Encontre guias, pesquise funcionalidades e acompanhe o progresso sincronizado da sua conta.',permission:'profile:read'},
];

interface Props { isOpen: boolean; permissions: string[]; onNavigate: (tab: string) => void; onClose: () => void; }

export const GuidedTour: React.FC<Props> = ({ isOpen, permissions, onNavigate, onClose }) => {
  const steps = useMemo(() => TOUR_STEPS.filter(step => permissions.includes('*') || permissions.includes(step.permission)), [permissions]);
  const [index, setIndex] = useState(0);
  useEffect(() => { if (isOpen) setIndex(0); }, [isOpen]);
  useEffect(() => { if (isOpen && steps[index]) onNavigate(steps[index].tab); }, [isOpen, index, steps, onNavigate]);
  if (!isOpen || !steps.length) return null;
  const step = steps[index];
  const move = (next: number) => {
    if (next < 0) return;
    if (next >= steps.length) { onClose(); return; }
    setIndex(next);
  };
  return <div role="dialog" aria-modal="true" aria-labelledby="jarvis-tour-title" style={{position:'fixed',inset:0,zIndex:1400,display:'grid',placeItems:'end center',padding:'18px',background:'rgba(0,0,0,.38)',pointerEvents:'none'}}>
    <section className="glass-panel" style={{pointerEvents:'auto',width:'min(100%,560px)',padding:'20px',background:'var(--bg-secondary)',borderColor:'var(--border-accent)',boxShadow:'0 20px 70px rgba(0,0,0,.55)',marginBottom:12}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:12}}>
        <div style={{display:'flex',alignItems:'center',gap:8,color:'var(--accent-color)',fontSize:'.75rem',fontWeight:700}}><BookOpen size={16}/> TOUR GUIADO · {index+1}/{steps.length}</div>
        <button type="button" className="btn btn-ghost" aria-label="Fechar tour" onClick={onClose}><X size={17}/></button>
      </div>
      <div style={{height:4,background:'var(--bg-tertiary)',borderRadius:9,overflow:'hidden',marginTop:12}}><div style={{height:'100%',width:`${((index+1)/steps.length)*100}%`,background:'var(--accent-color)',transition:'width .2s'}}/></div>
      <h2 id="jarvis-tour-title" style={{color:'var(--text-primary)',fontSize:'1.15rem',margin:'14px 0 7px'}}>{step.title}</h2>
      <p style={{color:'var(--text-secondary)',fontSize:'.86rem',lineHeight:1.6,margin:0}}>{step.description}</p>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginTop:18}}>
        <button type="button" className="btn btn-ghost" onClick={()=>move(index-1)} disabled={index===0}><ArrowLeft size={15}/> Anterior</button>
        <button type="button" className="btn btn-primary" onClick={()=>move(index+1)}>{index===steps.length-1?'Concluir tour':'Próxima página'} <ArrowRight size={15}/></button>
      </div>
    </section>
  </div>;
};

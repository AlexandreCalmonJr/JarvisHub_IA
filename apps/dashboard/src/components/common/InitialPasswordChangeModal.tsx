import React from 'react';

export const InitialPasswordChangeModal: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  if (!isOpen) return null;
  return <div role="dialog" aria-modal="true" className="glass-panel" style={{position:'fixed',inset:0,zIndex:1500,display:'grid',placeItems:'center',background:'rgba(0,0,0,.8)'}}><section style={{padding:24,maxWidth:460,background:'var(--bg-secondary)'}}><h2>Atualização de segurança</h2><p>Altere a palavra-passe inicial para continuar.</p></section></div>;
};

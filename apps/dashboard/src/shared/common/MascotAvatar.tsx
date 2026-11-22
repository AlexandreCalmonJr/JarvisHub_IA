import React, { useState } from 'react';
import {
  Crown,
  Glasses,
  Headphones,
  PenTool,
  Shield,
  Terminal,
} from 'lucide-react';
import {
  MascotAccessory,
  getDefaultMascotForRole,
  getMascotById,
} from '../../services/mascots';
import { AgentMascotMeta } from '../../types';

interface MascotAvatarProps {
  mascot?: AgentMascotMeta | null;
  role?: string;
  name?: string;
  size?: number;
  showAccessory?: boolean;
}

const ACCESSORY_ICON_MAP: Record<MascotAccessory, React.ComponentType<{ size?: number }> | null> = {
  none: null,
  headphones: Headphones,
  shield: Shield,
  glasses: Glasses,
  stylus: PenTool,
  visor: Terminal,
  crown: Crown,
};

export const MascotAvatar: React.FC<MascotAvatarProps> = ({
  mascot,
  role = 'jarvis_master',
  name = 'Especialista',
  size = 42,
  showAccessory = true,
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const resolved = mascot?.id ? mascot : getDefaultMascotForRole(role);
  const preset = getMascotById(resolved.id);
  const accentColor = resolved.color || preset.defaultColor;
  const accessoryKey = (resolved.accessory || 'none') as MascotAccessory;
  const AccessoryIcon = showAccessory && size >= 36 ? ACCESSORY_ICON_MAP[accessoryKey] || null : null;

  return (
    <div
      style={{
        position: 'relative',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '100%',
          height: '100%',
          borderRadius: size >= 48 ? '14px' : '10px',
          overflow: 'hidden',
          backgroundColor: '#12161f',
          border: `1px solid ${accentColor}55`,
          boxShadow: `0 0 0 1px rgba(11, 13, 18, 0.9), 0 4px 12px ${accentColor}22`,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        {!imgFailed ? (
          <img
            src={preset.imageUrl}
            alt={`Mascote ${preset.name} de ${name}`}
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              background: `radial-gradient(circle at 30% 25%, ${accentColor}38, #12161f 75%)`,
              color: accentColor,
              fontWeight: 700,
              fontSize: `${Math.max(12, Math.round(size * 0.36))}px`,
            }}
            aria-label={name}
          >
            {name.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>

      {AccessoryIcon && (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: '-4px',
            bottom: '-4px',
            width: '18px',
            height: '18px',
            borderRadius: '6px',
            backgroundColor: '#12161f',
            border: `1px solid ${accentColor}88`,
            color: accentColor,
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <AccessoryIcon size={10} />
        </span>
      )}
    </div>
  );
};

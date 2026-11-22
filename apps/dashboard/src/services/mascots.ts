export type MascotId =
  | 'maestro_slime'
  | 'sentinel_owl'
  | 'scholar_fox'
  | 'creator_cat'
  | 'coder_slime';

export type MascotMood =
  | 'idle'
  | 'thinking'
  | 'searching'
  | 'creating'
  | 'celebrating'
  | 'alert';

export type MascotAccessory =
  | 'none'
  | 'headphones'
  | 'shield'
  | 'glasses'
  | 'stylus'
  | 'visor'
  | 'crown';

export interface MascotConfig {
  id: MascotId;
  color: string;
  accessory: MascotAccessory;
  mood: MascotMood;
}

export interface MascotPreset {
  id: MascotId;
  name: string;
  species: string;
  description: string;
  imageUrl: string;
  defaultColor: string;
  defaultAccessory: MascotAccessory;
  emojiFallback: string;
}

export const MASCOT_CATALOG: MascotPreset[] = [
  {
    id: 'maestro_slime',
    name: 'Slime Maestro',
    species: 'Slime Laranja',
    description: 'Energético e acolhedor, ideal para o orquestrador principal e rotinas.',
    imageUrl: '/src/assets/images/mascot_maestro_orange_1795113331453.jpg',
    defaultColor: '#f97316',
    defaultAccessory: 'headphones',
    emojiFallback: '🟠',
  },
  {
    id: 'sentinel_owl',
    name: 'Coruja Sentinela',
    species: 'Coruja Guardiã',
    description: 'Vigilante e protetora, feita para cibersegurança, auditoria e privacidade.',
    imageUrl: '/src/assets/images/mascot_sentinel_owl_1795113318479.jpg',
    defaultColor: '#10b981',
    defaultAccessory: 'shield',
    emojiFallback: '🦉',
  },
  {
    id: 'scholar_fox',
    name: 'Raposa Sábia',
    species: 'Raposa Pesquisadora',
    description: 'Curiosa e didática, perfeita para estudos, idiomas, matemática e pesquisa web.',
    imageUrl: '/src/assets/images/mascot_scholar_fox_1795113396443.jpg',
    defaultColor: '#38bdf8',
    defaultAccessory: 'glasses',
    emojiFallback: '🦊',
  },
  {
    id: 'creator_cat',
    name: 'Gato Criativo',
    species: 'Gato Designer',
    description: 'Expressivo e visual, feito para design, slides, PDFs e criação de imagens.',
    imageUrl: '/src/assets/images/mascot_creator_cat_1795113321092.jpg',
    defaultColor: '#fb7185',
    defaultAccessory: 'stylus',
    emojiFallback: '🐱',
  },
  {
    id: 'coder_slime',
    name: 'Slime Dev',
    species: 'Slime Engenheiro',
    description: 'Focado e preciso, especialista em arquitetura, código, testes e automação.',
    imageUrl: '/src/assets/images/mascot_coder_slime_1795113330060.jpg',
    defaultColor: '#2dd4bf',
    defaultAccessory: 'visor',
    emojiFallback: '🟢',
  },
];

export const MASCOT_COLOR_PALETTE: Array<{ label: string; value: string }> = [
  { label: 'Laranja JARVIS', value: '#f97316' },
  { label: 'Esmeralda', value: '#10b981' },
  { label: 'Azul Celeste', value: '#38bdf8' },
  { label: 'Coral Criativo', value: '#fb7185' },
  { label: 'Menta Dev', value: '#2dd4bf' },
  { label: 'Âmbar Dourado', value: '#f59e0b' },
  { label: 'Violeta', value: '#a78bfa' },
];

export const MASCOT_MOOD_LABELS: Record<MascotMood, string> = {
  idle: 'Disponível',
  thinking: 'Pensando',
  searching: 'Pesquisando',
  creating: 'Criando',
  celebrating: 'Concluído',
  alert: 'Alerta',
};

export const MASCOT_ACCESSORY_LABELS: Record<MascotAccessory, string> = {
  none: 'Sem acessório',
  headphones: 'Headset',
  shield: 'Escudo',
  glasses: 'Óculos',
  stylus: 'Caneta Stylus',
  visor: 'Visor Dev',
  crown: 'Coroa',
};

export function getMascotById(id?: string | null): MascotPreset {
  return MASCOT_CATALOG.find((item) => item.id === id) || MASCOT_CATALOG[0];
}

export function getDefaultMascotForRole(role: string): MascotConfig {
  const key = (role || '').toLowerCase();
  if (key.includes('master') || key.includes('flow') || key.includes('orchestr')) {
    return { id: 'maestro_slime', color: '#f97316', accessory: 'headphones', mood: 'idle' };
  }
  if (
    key.includes('sentinel') ||
    key.includes('security') ||
    key.includes('cyber') ||
    key.includes('audit') ||
    key.includes('privacy') ||
    key.includes('soc')
  ) {
    return { id: 'sentinel_owl', color: '#10b981', accessory: 'shield', mood: 'idle' };
  }
  if (
    key.includes('english') ||
    key.includes('math') ||
    key.includes('research') ||
    key.includes('study') ||
    key.includes('business') ||
    key.includes('finance') ||
    key.includes('data')
  ) {
    return { id: 'scholar_fox', color: '#38bdf8', accessory: 'glasses', mood: 'idle' };
  }
  if (
    key.includes('design') ||
    key.includes('image') ||
    key.includes('slide') ||
    key.includes('pptx') ||
    key.includes('pdf') ||
    key.includes('doc') ||
    key.includes('ux')
  ) {
    return { id: 'creator_cat', color: '#fb7185', accessory: 'stylus', mood: 'idle' };
  }
  return { id: 'coder_slime', color: '#2dd4bf', accessory: 'visor', mood: 'idle' };
}

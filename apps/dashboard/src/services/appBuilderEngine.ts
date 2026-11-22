export type AppTargetPlatform = 'android' | 'windows' | 'both';

export type AppPresetId = 'vendas_loja' | 'habitos_diarios' | 'agenda_servicos' | 'lista_compras';

export interface AppFieldSpec {
  key: string;
  label: string;
  type: 'text' | 'number' | 'currency' | 'select';
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

export interface AppBlueprintSpec {
  id: string;
  name: string;
  slug: string;
  packageId: string;
  tagline: string;
  description: string;
  platform: AppTargetPlatform;
  accentColor: string;
  entityName: string;
  entityPlural: string;
  primaryMetricLabel: string;
  metricMode: 'sum_currency' | 'count_done' | 'count_all';
  valueFieldKey?: string;
  statusOptions: string[];
  fields: AppFieldSpec[];
  sampleItems: Array<Record<string, string | number | boolean>>;
  source: 'modelo_pronto' | 'gemini_ai';
  modelUsed: string;
  createdAt: string;
}

export interface GeneratedProjectFile {
  path: string;
  language: 'html' | 'json' | 'javascript' | 'markdown';
  content: string;
}

export interface AppPresetInfo {
  id: AppPresetId;
  name: string;
  description: string;
  defaultPlatform: AppTargetPlatform;
  accentColor: string;
  highlights: string[];
}

export const APP_BUILDER_PRESETS: AppPresetInfo[] = [
  {
    id: 'vendas_loja',
    name: 'Controle de Vendas da Loja',
    description: 'Registre vendas rápidas no balcão ou celular, acompanhe faturamento diário e filtre por forma de pagamento.',
    defaultPlatform: 'both',
    accentColor: '#f97316',
    highlights: ['Faturamento automático', 'Filtro Pix / Cartão', 'Funciona offline'],
  },
  {
    id: 'habitos_diarios',
    name: 'Meus Hábitos & Rotina',
    description: 'Checklist diário visual com progresso em tempo real, prioridades e histórico salvo no dispositivo.',
    defaultPlatform: 'android',
    accentColor: '#10b981',
    highlights: ['Progresso do dia', '1 toque para concluir', 'Leve no Android'],
  },
  {
    id: 'agenda_servicos',
    name: 'Agenda de Clientes & Serviços',
    description: 'Organize horários, serviços prestados, valores cobrados e status de atendimento em qualquer tela.',
    defaultPlatform: 'both',
    accentColor: '#38bdf8',
    highlights: ['Controle de horários', 'Receita prevista', 'Desktop + Mobile'],
  },
  {
    id: 'lista_compras',
    name: 'Lista de Compras & Orçamento',
    description: 'Monte sua lista de supermercado ou reposição com preços estimados e soma automática do carrinho.',
    defaultPlatform: 'android',
    accentColor: '#a855f7',
    highlights: ['Soma do carrinho', 'Marcação rápida', 'Exportação CSV'],
  },
];

export function slugifyAppName(name: string): string {
  const slug = String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 42);
  return slug || 'meu-app-jarvis';
}

export function buildPackageId(name: string): string {
  const clean = slugifyAppName(name)
    .replace(/-/g, '')
    .replace(/[^a-z0-9]/g, '');
  const safeSuffix = /^[a-z]/.test(clean) ? clean : `app${clean || 'jarvis'}`;
  return `br.jarvis.${safeSuffix.slice(0, 28)}`;
}

export function detectAppPresetFromPrompt(prompt: string): AppPresetId {
  const q = (prompt || '').toLowerCase();
  if (/\b(h[aá]bito|rotina|exerc[ií]cio|estudo|tarefa|meta|checklist)\b/.test(q)) {
    return 'habitos_diarios';
  }
  if (/\b(agenda|cliente|sal[aã]o|cl[ií]nica|consulta|servi[cç]o|hor[aá]rio)\b/.test(q)) {
    return 'agenda_servicos';
  }
  if (/\b(compra|mercado|supermercado|lista|carrinho|mantimento)\b/.test(q)) {
    return 'lista_compras';
  }
  return 'vendas_loja';
}

export function buildPresetAppBlueprint(
  presetId: AppPresetId,
  platform: AppTargetPlatform,
  customName?: string,
  customAccent?: string
): AppBlueprintSpec {
  const id = `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const createdAt = new Date().toISOString();

  if (presetId === 'habitos_diarios') {
    const name = customName?.trim() || 'Meus Hábitos & Rotina';
    return {
      id,
      name,
      slug: slugifyAppName(name),
      packageId: buildPackageId(name),
      tagline: 'Acompanhe sua rotina diária com clareza e foco',
      description: 'Aplicativo leve de hábitos diários com marcação rápida, categorias e taxa de conclusão automática.',
      platform,
      accentColor: customAccent || '#10b981',
      entityName: 'Hábito',
      entityPlural: 'Hábitos',
      primaryMetricLabel: 'Concluídos hoje',
      metricMode: 'count_done',
      statusOptions: ['Pendente', 'Concluído'],
      fields: [
        { key: 'titulo', label: 'Hábito ou meta', type: 'text', placeholder: 'Ex.: Caminhar 30 minutos', required: true },
        { key: 'categoria', label: 'Área', type: 'select', options: ['Saúde', 'Estudos', 'Trabalho', 'Casa'] },
        { key: 'horario', label: 'Horário ideal', type: 'text', placeholder: 'Ex.: 07:30' },
      ],
      sampleItems: [
        { id: '1', titulo: 'Beber 2L de água', categoria: 'Saúde', horario: 'Dia todo', status: 'Concluído', done: true },
        { id: '2', titulo: 'Praticar 15 min de inglês', categoria: 'Estudos', horario: '08:00', status: 'Concluído', done: true },
        { id: '3', titulo: 'Revisar prioridades do dia', categoria: 'Trabalho', horario: '09:00', status: 'Pendente', done: false },
        { id: '4', titulo: 'Caminhada leve ao ar livre', categoria: 'Saúde', horario: '18:00', status: 'Pendente', done: false },
      ],
      source: 'modelo_pronto',
      modelUsed: 'rafael-template-builder',
      createdAt,
    };
  }

  if (presetId === 'agenda_servicos') {
    const name = customName?.trim() || 'Agenda de Clientes & Serviços';
    return {
      id,
      name,
      slug: slugifyAppName(name),
      packageId: buildPackageId(name),
      tagline: 'Gestão prática de atendimentos, clientes e valores',
      description: 'Controle seus atendimentos agendados, serviços realizados e faturamento previsto diretamente no celular ou Windows.',
      platform,
      accentColor: customAccent || '#38bdf8',
      entityName: 'Atendimento',
      entityPlural: 'Atendimentos',
      primaryMetricLabel: 'Total em atendimentos',
      metricMode: 'sum_currency',
      valueFieldKey: 'valor',
      statusOptions: ['Agendado', 'Concluído', 'Cancelado'],
      fields: [
        { key: 'titulo', label: 'Cliente', type: 'text', placeholder: 'Ex.: Mariana Silva', required: true },
        { key: 'servico', label: 'Serviço', type: 'text', placeholder: 'Ex.: Consultoria / Manutenção', required: true },
        { key: 'horario', label: 'Data / Hora', type: 'text', placeholder: 'Ex.: Hoje · 14:30' },
        { key: 'valor', label: 'Valor (R$)', type: 'currency', placeholder: '150' },
      ],
      sampleItems: [
        { id: '1', titulo: 'Mariana Costa', servico: 'Atendimento Completo', horario: 'Hoje · 10:00', valor: 180, status: 'Concluído', done: true },
        { id: '2', titulo: 'Carlos Eduardo', servico: 'Manutenção Preventiva', horario: 'Hoje · 14:30', valor: 240, status: 'Agendado', done: false },
        { id: '3', titulo: 'Fernanda Lima', servico: 'Consultoria Express', horario: 'Amanhã · 09:00', valor: 150, status: 'Agendado', done: false },
      ],
      source: 'modelo_pronto',
      modelUsed: 'rafael-template-builder',
      createdAt,
    };
  }

  if (presetId === 'lista_compras') {
    const name = customName?.trim() || 'Lista de Compras & Orçamento';
    return {
      id,
      name,
      slug: slugifyAppName(name),
      packageId: buildPackageId(name),
      tagline: 'Calcule seu carrinho antes de chegar ao caixa',
      description: 'Adicione produtos, marque o que já está no carrinho e acompanhe o gasto estimado em tempo real.',
      platform,
      accentColor: customAccent || '#a855f7',
      entityName: 'Item',
      entityPlural: 'Itens',
      primaryMetricLabel: 'Total estimado',
      metricMode: 'sum_currency',
      valueFieldKey: 'valor',
      statusOptions: ['Falta pegar', 'No carrinho'],
      fields: [
        { key: 'titulo', label: 'Produto', type: 'text', placeholder: 'Ex.: Café torrado 500g', required: true },
        { key: 'categoria', label: 'Setor', type: 'select', options: ['Mercearia', 'Hortifruti', 'Carnes', 'Limpeza', 'Bebidas'] },
        { key: 'valor', label: 'Preço estimado (R$)', type: 'currency', placeholder: '24.90' },
      ],
      sampleItems: [
        { id: '1', titulo: 'Café Artesanal 500g', categoria: 'Mercearia', valor: 28.9, status: 'No carrinho', done: true },
        { id: '2', titulo: 'Frutas da Semana', categoria: 'Hortifruti', valor: 45.0, status: 'Falta pegar', done: false },
        { id: '3', titulo: 'Azeite Extra Virgem', categoria: 'Mercearia', valor: 39.5, status: 'Falta pegar', done: false },
      ],
      source: 'modelo_pronto',
      modelUsed: 'rafael-template-builder',
      createdAt,
    };
  }

  // Default: vendas_loja
  const name = customName?.trim() || 'Controle de Vendas da Loja';
  return {
    id,
    name,
    slug: slugifyAppName(name),
    packageId: buildPackageId(name),
    tagline: 'Registre vendas em segundos no Android ou Windows',
    description: 'Aplicativo offline-first para registrar pedidos, formas de pagamento, clientes e acompanhar o caixa do dia.',
    platform,
    accentColor: customAccent || '#f97316',
    entityName: 'Venda',
    entityPlural: 'Vendas',
    primaryMetricLabel: 'Faturamento registrado',
    metricMode: 'sum_currency',
    valueFieldKey: 'valor',
    statusOptions: ['Pago', 'A receber'],
    fields: [
      { key: 'titulo', label: 'Produto ou Pedido', type: 'text', placeholder: 'Ex.: Kit Presente Premium', required: true },
      { key: 'cliente', label: 'Cliente', type: 'text', placeholder: 'Ex.: João Pedro' },
      { key: 'pagamento', label: 'Pagamento', type: 'select', options: ['Pix', 'Cartão Crédito', 'Cartão Débito', 'Dinheiro'] },
      { key: 'valor', label: 'Valor (R$)', type: 'currency', placeholder: '129.90', required: true },
    ],
    sampleItems: [
      { id: '1', titulo: 'Fone Bluetooth Pro', cliente: 'Ana Beatriz', pagamento: 'Pix', valor: 189.9, status: 'Pago', done: true },
      { id: '2', titulo: 'Carregador Turbo 65W', cliente: 'Lucas Rocha', pagamento: 'Cartão Crédito', valor: 119.9, status: 'Pago', done: true },
      { id: '3', titulo: 'Suporte Notebook Alumínio', cliente: 'Carla Mendes', pagamento: 'Pix', valor: 129.0, status: 'A receber', done: false },
    ],
    source: 'modelo_pronto',
    modelUsed: 'rafael-template-builder',
    createdAt,
  };
}

function escapeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildInteractiveAppHtml(spec: AppBlueprintSpec): string {
  const safeName = escapeHtml(spec.name);
  const safeTagline = escapeHtml(spec.tagline);
  const accent = /^#[0-9a-fA-F]{6}$/.test(spec.accentColor) ? spec.accentColor : '#f97316';
  const serializedConfig = JSON.stringify({
    storageKey: `jarvis_app_${spec.slug}`,
    entityName: spec.entityName,
    entityPlural: spec.entityPlural,
    primaryMetricLabel: spec.primaryMetricLabel,
    metricMode: spec.metricMode,
    valueFieldKey: spec.valueFieldKey || 'valor',
    statusOptions: spec.statusOptions,
    fields: spec.fields,
    sampleItems: spec.sampleItems,
  }).replace(/<\/script/gi, '<\\/script');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <meta name="theme-color" content="#0b0d12" />
  <title>${safeName}</title>
  <style>
    :root {
      --bg: #0b0d12;
      --surface: #12161f;
      --surface-2: #191f2c;
      --border: rgba(255,255,255,0.09);
      --text: #f3f4f6;
      --muted: #9ca3af;
      --accent: ${accent};
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
    }
    .shell {
      max-width: 780px;
      margin: 0 auto;
      padding: 18px 16px 40px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    header {
      background: linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.01));
      border: 1px solid var(--border);
      border-top: 3px solid var(--accent);
      border-radius: 14px;
      padding: 16px;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
    }
    h1 { margin: 0; font-size: 1.15rem; letter-spacing: -0.02em; }
    .tagline { margin: 4px 0 0; font-size: 0.82rem; color: var(--muted); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 10px;
    }
    .metric-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px 14px;
    }
    .metric-label { font-size: 0.72rem; color: var(--muted); }
    .metric-value { font-size: 1.25rem; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .form-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 8px;
    }
    label { display: flex; flex-direction: column; gap: 4px; font-size: 0.74rem; color: var(--muted); }
    input, select {
      background: var(--bg);
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 9px;
      padding: 9px 10px;
      font-size: 0.85rem;
      outline: none;
    }
    input:focus, select:focus { border-color: var(--accent); }
    .btn {
      border: none;
      border-radius: 9px;
      padding: 10px 14px;
      font-size: 0.84rem;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-primary { background: var(--accent); color: #ffffff; }
    .btn-ghost { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); }
    .toolbar { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .toolbar input { flex: 1; min-width: 160px; }
    .list { display: flex; flex-direction: column; gap: 8px; }
    .item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: 11px;
      padding: 11px 12px;
    }
    .item.is-done { opacity: 0.72; }
    .item-title { font-weight: 600; font-size: 0.9rem; }
    .item-meta { font-size: 0.76rem; color: var(--muted); margin-top: 2px; }
    .item-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }
    .val { font-weight: 700; font-variant-numeric: tabular-nums; color: var(--accent); font-size: 0.88rem; }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <div>
        <h1>${safeName}</h1>
        <p class="tagline">${safeTagline}</p>
      </div>
      <button type="button" class="btn btn-ghost" id="btn-csv">Exportar CSV</button>
    </header>

    <section class="metrics" id="metrics"></section>

    <form class="card" id="entry-form">
      <strong style="font-size: 0.88rem;">Novo registro</strong>
      <div class="form-grid" id="form-fields"></div>
      <div style="display:flex; justify-content:flex-end;">
        <button type="submit" class="btn btn-primary" id="btn-add">Adicionar</button>
      </div>
    </form>

    <section class="card">
      <div class="toolbar">
        <input type="search" id="search" placeholder="Buscar registros..." aria-label="Buscar registros" />
      </div>
      <div class="list" id="list"></div>
    </section>
  </div>

  <script>
    const CONFIG = ${serializedConfig};
    function loadItems() {
      try {
        const saved = localStorage.getItem(CONFIG.storageKey);
        if (saved) return JSON.parse(saved);
      } catch (e) {}
      return CONFIG.sampleItems.slice();
    }
    let items = loadItems();
    function saveItems() {
      try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(items)); } catch (e) {}
    }
    function fmtBRL(n) {
      return Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    function renderFields() {
      const wrap = document.getElementById('form-fields');
      wrap.innerHTML = '';
      CONFIG.fields.forEach((f) => {
        const label = document.createElement('label');
        label.textContent = f.label;
        let el;
        if (f.type === 'select') {
          el = document.createElement('select');
          (f.options || []).forEach((opt) => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            el.appendChild(o);
          });
        } else {
          el = document.createElement('input');
          el.type = f.type === 'number' || f.type === 'currency' ? 'number' : 'text';
          if (f.type === 'currency') el.step = '0.01';
          el.placeholder = f.placeholder || '';
          if (f.required) el.required = true;
        }
        el.name = f.key;
        label.appendChild(el);
        wrap.appendChild(label);
      });
      document.getElementById('btn-add').textContent = 'Adicionar ' + CONFIG.entityName;
    }
    function renderMetrics() {
      const total = items.length;
      const done = items.filter((i) => i.done).length;
      const sum = items.reduce((acc, i) => acc + (Number(i[CONFIG.valueFieldKey]) || 0), 0);
      const primary = CONFIG.metricMode === 'sum_currency'
        ? fmtBRL(sum)
        : CONFIG.metricMode === 'count_done'
          ? done + ' / ' + total
          : String(total);
      document.getElementById('metrics').innerHTML =
        '<div class="metric-card"><div class="metric-label">' + CONFIG.primaryMetricLabel + '</div><div class="metric-value">' + primary + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">Total de ' + CONFIG.entityPlural + '</div><div class="metric-value">' + total + '</div></div>' +
        '<div class="metric-card"><div class="metric-label">Concluídos</div><div class="metric-value">' + done + '</div></div>';
    }
    function renderList() {
      const q = (document.getElementById('search').value || '').toLowerCase().trim();
      const wrap = document.getElementById('list');
      const filtered = items.filter((it) => !q || JSON.stringify(it).toLowerCase().includes(q));
      if (filtered.length === 0) {
        wrap.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:0.84rem;padding:18px;">Nenhum registro encontrado.</div>';
        return;
      }
      wrap.innerHTML = '';
      filtered.forEach((it) => {
        const row = document.createElement('div');
        row.className = 'item' + (it.done ? ' is-done' : '');
        const info = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'item-title';
        title.textContent = String(it.titulo || it[CONFIG.fields[0].key] || 'Item');
        const metaParts = CONFIG.fields.slice(1)
          .filter((f) => f.key !== CONFIG.valueFieldKey && it[f.key])
          .map((f) => it[f.key]);
        if (it.status) metaParts.push(it.status);
        const meta = document.createElement('div');
        meta.className = 'item-meta';
        meta.textContent = metaParts.join(' · ');
        info.appendChild(title);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'item-actions';
        if (it[CONFIG.valueFieldKey] !== undefined && it[CONFIG.valueFieldKey] !== '') {
          const val = document.createElement('span');
          val.className = 'val';
          val.textContent = fmtBRL(it[CONFIG.valueFieldKey]);
          actions.appendChild(val);
        }
        const toggleBtn = document.createElement('button');
        toggleBtn.type = 'button';
        toggleBtn.className = 'btn btn-ghost';
        toggleBtn.textContent = it.done ? 'Reabrir' : 'Concluir';
        toggleBtn.onclick = () => {
          it.done = !it.done;
          it.status = it.done ? (CONFIG.statusOptions[CONFIG.statusOptions.length - 1] || 'Concluído') : (CONFIG.statusOptions[0] || 'Pendente');
          saveItems();
          renderMetrics();
          renderList();
        };
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-ghost';
        delBtn.textContent = '✕';
        delBtn.ariaLabel = 'Remover';
        delBtn.onclick = () => {
          items = items.filter((x) => x.id !== it.id);
          saveItems();
          renderMetrics();
          renderList();
        };
        actions.appendChild(toggleBtn);
        actions.appendChild(delBtn);
        row.appendChild(info);
        row.appendChild(actions);
        wrap.appendChild(row);
      });
    }
    document.getElementById('entry-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const item = { id: String(Date.now()), done: false, status: CONFIG.statusOptions[0] || 'Ativo' };
      CONFIG.fields.forEach((f) => {
        const raw = fd.get(f.key);
        item[f.key] = (f.type === 'number' || f.type === 'currency') ? Number(raw || 0) : String(raw || '').trim();
      });
      items.unshift(item);
      saveItems();
      e.target.reset();
      renderMetrics();
      renderList();
    });
    document.getElementById('search').addEventListener('input', renderList);
    document.getElementById('btn-csv').addEventListener('click', () => {
      const keys = CONFIG.fields.map((f) => f.key).concat(['status']);
      const rows = [keys.join(',')].concat(items.map((it) => keys.map((k) => '"' + String(it[k] ?? '').replace(/"/g, '""') + '"').join(',')));
      const blob = new Blob(['\\uFEFF' + rows.join('\\r\\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = CONFIG.storageKey + '.csv';
      a.click();
    });
    renderFields();
    renderMetrics();
    renderList();
  </script>
</body>
</html>
`;
}

export function buildAppProjectFiles(spec: AppBlueprintSpec): GeneratedProjectFile[] {
  const includeAndroid = spec.platform === 'android' || spec.platform === 'both';
  const includeWindows = spec.platform === 'windows' || spec.platform === 'both';

  const scripts: Record<string, string> = {
    preview: 'npx serve www',
  };
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  if (includeAndroid) {
    dependencies['@capacitor/core'] = '^6.1.2';
    dependencies['@capacitor/android'] = '^6.1.2';
    devDependencies['@capacitor/cli'] = '^6.1.2';
    scripts['android:init'] = 'npx cap add android';
    scripts['android:sync'] = 'npx cap sync android';
    scripts['android:open'] = 'npx cap open android';
  }

  if (includeWindows) {
    devDependencies.electron = '^33.2.0';
    devDependencies['electron-builder'] = '^25.1.8';
    scripts['win:dev'] = 'electron .';
    scripts['win:exe'] = 'electron-builder --win nsis';
  }

  const pkgJson: Record<string, any> = {
    name: spec.slug,
    version: '1.0.0',
    description: spec.description,
    private: true,
    ...(includeWindows ? { main: 'electron/main.cjs' } : {}),
    scripts,
    dependencies,
    devDependencies,
    ...(includeWindows
      ? {
          build: {
            appId: spec.packageId,
            productName: spec.name,
            files: ['www/**/*', 'electron/**/*', 'package.json'],
            win: {
              target: ['nsis'],
            },
            nsis: {
              oneClick: false,
              allowToChangeInstallationDirectory: true,
            },
          },
        }
      : {}),
  };

  const files: GeneratedProjectFile[] = [
    {
      path: 'www/index.html',
      language: 'html',
      content: buildInteractiveAppHtml(spec),
    },
    {
      path: 'www/manifest.webmanifest',
      language: 'json',
      content: JSON.stringify(
        {
          name: spec.name,
          short_name: spec.name.slice(0, 14),
          description: spec.description,
          start_url: './index.html',
          display: 'standalone',
          background_color: '#0b0d12',
          theme_color: spec.accentColor,
        },
        null,
        2
      ),
    },
    {
      path: 'package.json',
      language: 'json',
      content: JSON.stringify(pkgJson, null, 2),
    },
  ];

  if (includeAndroid) {
    files.push({
      path: 'capacitor.config.json',
      language: 'json',
      content: JSON.stringify(
        {
          appId: spec.packageId,
          appName: spec.name,
          webDir: 'www',
          bundledWebRuntime: false,
          android: {
            allowMixedContent: false,
            backgroundColor: '#0b0d12',
          },
        },
        null,
        2
      ),
    });
  }

  if (includeWindows) {
    files.push(
      {
        path: 'electron/main.cjs',
        language: 'javascript',
        content: `const path = require('node:path');
const { app, BrowserWindow } = require('electron');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 420,
    minHeight: 560,
    title: ${JSON.stringify(spec.name)},
    backgroundColor: '#0b0d12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, '..', 'www', 'index.html'));
}

app.whenReady().then(() => {
  createMainWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
`,
      },
      {
        path: 'electron/preload.cjs',
        language: 'javascript',
        content: `const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('jarvisDesktopApp', {
  appName: ${JSON.stringify(spec.name)},
  platform: process.platform,
});
`,
      }
    );
  }

  const guideLines: string[] = [
    `# ${spec.name} — Guia Passo a Passo`,
    '',
    `> ${spec.description}`,
    '',
    `- **Pacote / ID**: \`${spec.packageId}\``,
    `- **Plataforma alvo**: ${
      spec.platform === 'both'
        ? 'Android (.apk / .aab) + Windows (.exe)'
        : spec.platform === 'android'
          ? 'Android (.apk / .aab)'
          : 'Windows (.exe)'
    }`,
    '',
    '## 1. Testar imediatamente no computador',
    '1. Extraia este arquivo `.zip` em uma pasta limpa.',
    '2. Abra a pasta `www/` e dê duplo clique em `index.html` (ou rode `npm run preview` no terminal).',
    '3. Todos os dados são salvos localmente no aparelho (`localStorage`) e podem ser exportados em CSV.',
    '',
  ];

  if (includeAndroid) {
    guideLines.push(
      '## 2. Gerar o aplicativo Android (.apk / .aab)',
      '**Pré-requisitos**: Node.js 20+ e Android Studio instalado.',
      '```bash',
      'npm install',
      'npm run android:init',
      'npm run android:sync',
      'npm run android:open',
      '```',
      'No **Android Studio**:',
      '1. Aguarde a sincronização do Gradle terminar.',
      '2. Para instalar direto no seu celular: clique em **Build → Build Bundle(s) / APK(s) → Build APK(s)**.',
      '3. Para publicar na Google Play Store: clique em **Build → Generate Signed Bundle / APK → Android App Bundle (.aab)**.',
      ''
    );
  }

  if (includeWindows) {
    guideLines.push(
      `## ${includeAndroid ? '3' : '2'}. Gerar o instalador Windows (.exe)`,
      '**Pré-requisitos**: Node.js 20+ no Windows.',
      '```bash',
      'npm install',
      'npm run win:dev   # Testa a janela nativa do Windows',
      'npm run win:exe   # Gera o instalador .exe na pasta dist/',
      '```',
      'O instalador pronto estará dentro da pasta `dist/` com extensão `.exe`, pronto para distribuir ou instalar no seu PC.',
      ''
    );
  }

  files.push({
    path: 'README_GUIA_PASSO_A_PASSO.md',
    language: 'markdown',
    content: guideLines.join('\n'),
  });

  return files;
}

import difflib
import logging
from pathlib import Path

from packages.contracts.security import ProjectWorkMode
from services.security_core import SecurityCore

from .analyzer import ArchitectureReport, ProjectAnalyzer
from .scanner import ProjectInventory, ProjectScanner

logger = logging.getLogger("jarvis.workspace")


class ProjectWorkspaceService:
    """
    Serviço central de Project Workspace.
    Controla o registo seguro de pastas locais, inventário, análise e scaffolding/modificação física de arquivos.
    """

    def __init__(self, security_core: SecurityCore):
        self.security_core = security_core
        self.scanner = ProjectScanner()
        self.analyzer = ProjectAnalyzer()
        self._inventories: dict[str, ProjectInventory] = {}
        self._reports: dict[str, ArchitectureReport] = {}

    def register_and_scan(
        self,
        project_id: str,
        folder_path: str,
        mode: ProjectWorkMode = ProjectWorkMode.READ_ONLY,
    ) -> ArchitectureReport:
        # 1. Regista no Permission Engine para garantir que apenas essa pasta seja lida
        self.security_core.permission_engine.register_project(
            project_id=project_id,
            root_path=folder_path,
            mode=mode,
        )

        resolved_path = self.security_core.permission_engine.validate_path_access(project_id, ".")

        # 2. Executa inventário de leitura
        inventory = self.scanner.scan(project_id=project_id, root_path=resolved_path)
        self._inventories[project_id] = inventory

        # 3. Executa análise de arquitetura e segurança (read-only)
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        return report

    def get_inventory(self, project_id: str) -> ProjectInventory | None:
        return self._inventories.get(project_id)

    def get_report(self, project_id: str) -> ArchitectureReport | None:
        return self._reports.get(project_id)

    def scaffold_project(
        self,
        project_id: str,
        name: str,
        description: str = "",
        project_type: str = "web",
        files: dict[str, str] | None = None,
    ) -> dict:
        """
        Cria a pasta física no computador em workspace/<project_id>
        e grava todos os arquivos do projeto (index.html, style.css, app.js, README.md).
        """
        base_dir = Path("workspace").resolve()
        base_dir.mkdir(parents=True, exist_ok=True)

        project_dir = (base_dir / project_id).resolve()
        if not str(project_dir).startswith(str(base_dir)):
            raise ValueError(f"Identificador de projeto inválido: '{project_id}'")

        project_dir.mkdir(parents=True, exist_ok=True)

        if not files:
            files = self._generate_default_web_scaffold(project_id, name, description)

        created_files: list[str] = []
        for rel_path, content in files.items():
            target_file = (project_dir / rel_path).resolve()
            if not str(target_file).startswith(str(project_dir)):
                continue
            target_file.parent.mkdir(parents=True, exist_ok=True)
            target_file.write_text(content, encoding="utf-8")
            created_files.append(rel_path)

        # Regista no Permission Engine para acesso futuro
        try:
            self.security_core.permission_engine.register_project(
                project_id=project_id,
                root_path=str(project_dir),
                mode=ProjectWorkMode.EDIT_APPROVED,
            )
        except Exception as exc:
            logger.debug("Registo de permissão já existente ou ignorado: %s", exc)

        inventory = self.scanner.scan(project_id=project_id, root_path=project_dir)
        self._inventories[project_id] = inventory
        report = self.analyzer.analyze(inventory)
        self._reports[project_id] = report

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_SCAFFOLDED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"files_created": created_files, "path": str(project_dir)},
            )

        return {
            "project_id": project_id,
            "name": name,
            "root_path": str(project_dir),
            "files_created": created_files,
            "report": report,
        }

    def read_project_file(self, project_id: str, rel_path: str) -> str:
        """Lê o arquivo físico do projeto no computador de forma segura."""
        base_dir = Path("workspace").resolve()
        project_dir = (base_dir / project_id).resolve()
        if not str(project_dir).startswith(str(base_dir)) or not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe em workspace/.")

        target = (project_dir / rel_path).resolve()
        if not str(target).startswith(str(project_dir)) or not target.exists():
            raise FileNotFoundError(
                f"Arquivo '{rel_path}' não foi encontrado no projeto '{project_id}'."
            )

        return target.read_text(encoding="utf-8")

    def modify_project_file(
        self,
        project_id: str,
        rel_path: str,
        new_content: str,
        reason: str = "Modificação solicitada via chat",
    ) -> dict:
        """Modifica um arquivo no disco, gerando backup .bak e diff unificado."""
        base_dir = Path("workspace").resolve()
        project_dir = (base_dir / project_id).resolve()
        if not str(project_dir).startswith(str(base_dir)) or not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe em workspace/.")

        target = (project_dir / rel_path).resolve()
        if not str(target).startswith(str(project_dir)):
            raise ValueError(f"Caminho inválido: '{rel_path}'")

        old_content = target.read_text(encoding="utf-8") if target.exists() else ""

        # Gera backup se o arquivo já existia
        if target.exists():
            backup_path = target.with_suffix(target.suffix + ".bak")
            backup_path.write_text(old_content, encoding="utf-8")

        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(new_content, encoding="utf-8")

        # Gera diff unificado
        diff_lines = list(
            difflib.unified_diff(
                old_content.splitlines(keepends=True),
                new_content.splitlines(keepends=True),
                fromfile=f"a/{rel_path}",
                tofile=f"b/{rel_path}",
            )
        )
        diff_str = "".join(diff_lines)

        inventory = self.scanner.scan(project_id=project_id, root_path=project_dir)
        self._inventories[project_id] = inventory
        self._reports[project_id] = self.analyzer.analyze(inventory)

        if self.security_core.audit:
            self.security_core.audit.record_event(
                operation="PROJECT_FILE_MODIFIED",
                status="SUCCESS",
                project_id=project_id,
                parameters={"file": rel_path, "diff_size": len(diff_str), "reason": reason},
            )

        return {
            "project_id": project_id,
            "file": rel_path,
            "diff": diff_str,
            "status": "modified",
        }

    def list_available_projects(self) -> list[dict]:
        """Lista todos os projetos na pasta workspace/."""
        base_dir = Path("workspace").resolve()
        if not base_dir.exists():
            return []
        projects = []
        for item in base_dir.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                files = [
                    p.name for p in item.rglob("*") if p.is_file() and not p.name.startswith(".")
                ]
                projects.append(
                    {
                        "id": item.name,
                        "name": item.name.replace("-", " ").replace("_", " ").title(),
                        "path": str(item),
                        "file_count": len(files),
                        "files": files[:8],
                    }
                )
        return projects

    def _generate_default_web_scaffold(
        self, project_id: str, name: str, description: str
    ) -> dict[str, str]:
        title = name or project_id.replace("-", " ").title()
        desc = description or f"Website moderno e responsivo gerado pelo JARVIS AI HUB para {title}."

        index_html = f"""<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <link rel="stylesheet" href="style.css">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700;800&display=swap" rel="stylesheet">
</head>
<body>
    <header class="navbar">
        <div class="container nav-container">
            <div class="logo">✨ {title}</div>
            <nav class="nav-links">
                <a href="#inicio">Início</a>
                <a href="#destaques">Destaques</a>
                <a href="#sobre">Sobre</a>
                <a href="#contato" class="btn-nav">Contato</a>
            </nav>
        </div>
    </header>

    <main>
        <section id="inicio" class="hero">
            <div class="container hero-content">
                <span class="badge">Projeto Criado com Sucesso</span>
                <h1>Bem-vindo ao <span>{title}</span></h1>
                <p>{desc}</p>
                <div class="hero-actions">
                    <button class="btn btn-primary" onclick="mostrarAlerta()">Explorar Agora</button>
                    <a href="#destaques" class="btn btn-outline">Saber Mais</a>
                </div>
            </div>
        </section>

        <section id="destaques" class="features">
            <div class="container">
                <h2 class="section-title">Nossos Diferenciais</h2>
                <div class="grid-cards">
                    <div class="card">
                        <div class="card-icon">⚡</div>
                        <h3>Alta Performance</h3>
                        <p>Estrutura limpa, carregamento instantâneo e código otimizado sem dependências pesadas.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🎨</div>
                        <h3>Design Responsivo</h3>
                        <p>Interface adaptada para celulares, tablets e desktops com foco na melhor experiência de uso.</p>
                    </div>
                    <div class="card">
                        <div class="card-icon">🔒</div>
                        <h3>Seguro & Confiável</h3>
                        <p>Construído seguindo as melhores práticas de acessibilidade e padrões modernos do ecossistema web.</p>
                    </div>
                </div>
            </div>
        </section>

        <section id="sobre" class="about">
            <div class="container about-container">
                <div class="about-text">
                    <h2>Sobre o Projeto</h2>
                    <p>Este website foi gerado automaticamente pelo **JARVIS AI HUB** no diretório <code>workspace/{project_id}/</code>.</p>
                    <p>Você pode editar os arquivos <code>index.html</code>, <code>style.css</code> e <code>app.js</code> diretamente pelo chat ou pelo seu editor de código favorito.</p>
                </div>
            </div>
        </section>

        <section id="contato" class="contact">
            <div class="container contact-container">
                <h2>Fale Conosco</h2>
                <form id="contact-form" onsubmit="enviarMensagem(event)">
                    <div class="form-group">
                        <input type="text" id="nome" placeholder="Seu Nome" required>
                    </div>
                    <div class="form-group">
                        <input type="email" id="email" placeholder="Seu E-mail" required>
                    </div>
                    <div class="form-group">
                        <textarea id="mensagem" placeholder="Sua Mensagem..." rows="4" required></textarea>
                    </div>
                    <button type="submit" class="btn btn-primary">Enviar Mensagem</button>
                </form>
            </div>
        </section>
    </main>

    <footer class="footer">
        <div class="container footer-content">
            <p>&copy; 2026 {title} • Desenvolvido com JARVIS AI HUB</p>
        </div>
    </footer>

    <script src="app.js"></script>
</body>
</html>
"""

        style_css = """:root {
    --primary: #6366f1;
    --primary-hover: #4f46e5;
    --bg-dark: #0f172a;
    --bg-card: #1e293b;
    --text-light: #f8fafc;
    --text-muted: #94a3b8;
    --border: #334155;
    --radius: 12px;
}

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
}

body {
    background-color: var(--bg-dark);
    color: var(--text-light);
    line-height: 1.6;
}

.container {
    max-width: 1100px;
    margin: 0 auto;
    padding: 0 24px;
}

/* Navbar */
.navbar {
    background: rgba(15, 23, 42, 0.9);
    backdrop-filter: blur(8px);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 100;
}

.nav-container {
    display: flex;
    justifyContent: space-between;
    align-items: center;
    height: 70px;
}

.logo {
    font-size: 1.3rem;
    font-weight: 800;
    color: var(--text-light);
}

.nav-links {
    display: flex;
    align-items: center;
    gap: 20px;
}

.nav-links a {
    color: var(--text-muted);
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 500;
    transition: color 0.2s;
}

.nav-links a:hover {
    color: var(--text-light);
}

.btn-nav {
    background: var(--primary);
    color: #fff !important;
    padding: 8px 16px;
    border-radius: 6px;
    transition: background 0.2s;
}

.btn-nav:hover {
    background: var(--primary-hover);
}

/* Hero Section */
.hero {
    padding: 90px 0;
    text-align: center;
    background: radial-gradient(circle at 50% 20%, rgba(99, 102, 241, 0.15), transparent 70%);
}

.badge {
    display: inline-block;
    padding: 6px 14px;
    background: rgba(99, 102, 241, 0.2);
    border: 1px solid var(--primary);
    color: #a5b4fc;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 20px;
}

.hero h1 {
    font-size: 3rem;
    font-weight: 800;
    margin-bottom: 16px;
}

.hero h1 span {
    color: var(--primary);
}

.hero p {
    font-size: 1.15rem;
    color: var(--text-muted);
    max-width: 650px;
    margin: 0 auto 32px;
}

.hero-actions {
    display: flex;
    justify-content: center;
    gap: 16px;
}

.btn {
    padding: 12px 28px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 0.95rem;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.2s ease;
    border: none;
}

.btn-primary {
    background: var(--primary);
    color: #fff;
}

.btn-primary:hover {
    background: var(--primary-hover);
    transform: translateY(-2px);
}

.btn-outline {
    background: transparent;
    color: var(--text-light);
    border: 1px solid var(--border);
}

.btn-outline:hover {
    background: var(--border);
}

/* Features */
.features {
    padding: 80px 0;
}

.section-title {
    text-align: center;
    font-size: 2rem;
    font-weight: 700;
    margin-bottom: 48px;
}

.grid-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
}

.card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 32px 24px;
    transition: transform 0.2s, border-color 0.2s;
}

.card:hover {
    transform: translateY(-4px);
    border-color: var(--primary);
}

.card-icon {
    font-size: 2.2rem;
    margin-bottom: 16px;
}

.card h3 {
    font-size: 1.2rem;
    margin-bottom: 10px;
}

.card p {
    color: var(--text-muted);
    font-size: 0.9rem;
}

/* About */
.about {
    padding: 60px 0;
    background: rgba(30, 41, 59, 0.5);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
}

.about-text {
    max-width: 800px;
    margin: 0 auto;
    text-align: center;
}

.about-text h2 {
    font-size: 2rem;
    margin-bottom: 16px;
}

.about-text p {
    color: var(--text-muted);
    margin-bottom: 12px;
}

code {
    background: rgba(99, 102, 241, 0.2);
    color: #c7d2fe;
    padding: 2px 6px;
    border-radius: 4px;
    font-family: monospace;
}

/* Contact */
.contact {
    padding: 80px 0;
}

.contact-container {
    max-width: 500px;
    text-align: center;
}

.contact h2 {
    font-size: 2rem;
    margin-bottom: 24px;
}

.form-group {
    margin-bottom: 16px;
}

.form-group input, .form-group textarea {
    width: 100%;
    padding: 12px 16px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    color: #fff;
    font-size: 0.95rem;
    outline: none;
}

.form-group input:focus, .form-group textarea:focus {
    border-color: var(--primary);
}

/* Footer */
.footer {
    padding: 24px 0;
    text-align: center;
    border-top: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.85rem;
}
"""

        app_js = f"""// Script interativo de {title}
document.addEventListener('DOMContentLoaded', () => {{
    console.log('Projeto {title} inicializado com sucesso via JARVIS AI HUB!');
}});

function mostrarAlerta() {{
    alert('Parabéns! O seu website {title} está em execução local.');
}}

function enviarMensagem(event) {{
    event.preventDefault();
    const nome = document.getElementById('nome').value;
    alert(`Obrigado pelo contato, ${{nome}}! Sua mensagem foi simulada com sucesso.`);
    document.getElementById('contact-form').reset();
}}
"""

        readme_md = f"""# {title}

{desc}

---

## 📁 Estrutura de Arquivos Criados

- `index.html`: Estrutura HTML5 semântica e acessível.
- `style.css`: Estilização moderna responsiva em Dark Theme.
- `app.js`: Script cliente com interações e formulários.
- `README.md`: Documentação do projeto.

## 🚀 Como Visualizar no Navegador

Basta abrir o arquivo `index.html` em qualquer navegador:
- Caminho: `workspace/{project_id}/index.html`

## 🛠️ Modificações via JARVIS AI HUB

Você pode solicitar alterações diretamente pelo chat do JARVIS (ex: *"Mude o tema para claro"*, *"Adicione uma nova seção de preços"*).
"""

        return {
            "index.html": index_html,
            "style.css": style_css,
            "app.js": app_js,
            "README.md": readme_md,
        }


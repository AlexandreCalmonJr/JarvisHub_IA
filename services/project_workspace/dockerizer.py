import logging
from pathlib import Path
from typing import Any

logger = logging.getLogger("jarvis.project_workspace.dockerizer")


class ProjectDockerizer:
    """Gerador modular de Dockerfiles e docker-compose multi-stage."""

    def __init__(self, workspace=None):
        self.workspace = workspace

    def dockerize_project(self, project_id: str, project_dir: Path) -> dict[str, Any]:
        """Cria automaticamente Dockerfile, docker-compose.yml e .dockerignore para a stack do projeto."""
        if not project_dir.exists():
            raise FileNotFoundError(f"Projeto '{project_id}' não existe no disco.")

        files = [f.name.lower() for f in project_dir.rglob("*") if f.is_file()]

        # Detecção de Stack Tecnológica
        if any(f.endswith(".py") or f in ("requirements.txt", "pyproject.toml") for f in files):
            stack = "Python (FastAPI / Uvicorn)"
            dockerfile = """# Multi-stage Dockerfile gerado pelo JARVIS AI Hub
FROM python:3.12-slim AS base
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

COPY requirements.txt* pyproject.toml* ./
RUN if [ -f requirements.txt ]; then pip install --no-cache-dir -r requirements.txt; fi

COPY . .

EXPOSE 8000
CMD ["python", "main.py"]
"""
            compose = f"""version: '3.8'
services:
  app:
    build: .
    container_name: {project_id}-app
    restart: unless-stopped
    ports:
      - "8000:8000"
    environment:
      - PORT=8000
      - HOST=0.0.0.0
"""
            ignore = """__pycache__/
*.pyc
*.pyo
*.pyd
.venv/
venv/
env/
.git/
*.bak
"""
        elif any(f in ("package.json", "index.html", "app.js") for f in files):
            # Verifica se é Node.js com package.json ou Web estático
            if "package.json" in files:
                stack = "Node.js Web Application"
                dockerfile = """# Multi-stage Dockerfile para Node.js gerado pelo JARVIS
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN if grep -q '"build":' package.json; then npm run build; fi

FROM nginx:alpine AS runner
COPY --from=build /app/dist /usr/share/nginx/html 2>/dev/null || COPY --from=build /app/build /usr/share/nginx/html 2>/dev/null || COPY --from=build /app /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"""
            else:
                stack = "HTML5/CSS3/JS Web Estático"
                dockerfile = """# Servidor Nginx estático gerado pelo JARVIS AI Hub
FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
"""
            compose = f"""version: '3.8'
services:
  web:
    build: .
    container_name: {project_id}-web
    restart: unless-stopped
    ports:
      - "8080:80"
"""
            ignore = """node_modules/
.git/
dist/
build/
*.bak
"""
        elif any(f.endswith(".go") or f == "go.mod" for f in files):
            stack = "Go (Golang)"
            dockerfile = """# Multi-stage Dockerfile para Go gerado pelo JARVIS
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.* ./
RUN if [ -f go.mod ]; then go mod download; fi
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server .

FROM alpine:latest AS runner
WORKDIR /app
COPY --from=builder /app/server .
EXPOSE 8080
CMD ["./server"]
"""
            compose = f"""version: '3.8'
services:
  api:
    build: .
    container_name: {project_id}-api
    restart: unless-stopped
    ports:
      - "8080:8080"
"""
            ignore = """.git/
bin/
*.bak
"""
        elif any(f == "pom.xml" or f.endswith(".java") for f in files):
            stack = "Java (Spring Boot / Maven)"
            dockerfile = """# Multi-stage Dockerfile para Java gerado pelo JARVIS
FROM maven:3.9-eclipse-temurin-21-alpine AS build
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B
COPY src ./src
RUN mvn clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine AS runner
WORKDIR /app
COPY --from=build /app/target/*.jar app.jar
EXPOSE 8080
CMD ["java", "-jar", "app.jar"]
"""
            compose = f"""version: '3.8'
services:
  app:
    build: .
    container_name: {project_id}-java
    restart: unless-stopped
    ports:
      - "8080:8080"
"""
            ignore = """target/
.git/
*.bak
"""
        elif any(f.endswith(".csproj") or f.endswith(".cs") for f in files):
            stack = ".NET 8 / C#"
            dockerfile = """# Multi-stage Dockerfile para .NET 8 gerado pelo JARVIS
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY *.csproj ./
RUN dotnet restore
COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runner
WORKDIR /app
COPY --from=build /app/publish .
EXPOSE 8080
ENV ASPNETCORE_URLS=http://+:8080
ENTRYPOINT ["dotnet", "App.dll"]
"""
            compose = f"""version: '3.8'
services:
  app:
    build: .
    container_name: {project_id}-dotnet
    restart: unless-stopped
    ports:
      - "5000:8080"
"""
            ignore = """bin/
obj/
.git/
*.bak
"""
        else:
            stack = "Aplicação Genérica"
            dockerfile = """# Dockerfile genérico gerado pelo JARVIS AI Hub
FROM alpine:latest
WORKDIR /app
COPY . .
CMD ["sh"]
"""
            compose = f"""version: '3.8'
services:
  app:
    build: .
    container_name: {project_id}-generic
"""
            ignore = """.git/
*.bak
"""

        # Grava os arquivos no disco
        df_path = project_dir / "Dockerfile"
        dc_path = project_dir / "docker-compose.yml"
        di_path = project_dir / ".dockerignore"

        df_path.write_text(dockerfile.strip() + "\n", encoding="utf-8")
        dc_path.write_text(compose.strip() + "\n", encoding="utf-8")
        di_path.write_text(ignore.strip() + "\n", encoding="utf-8")

        # Registra commit Git semântico e rescaneia inventário via workspace
        if self.workspace:
            try:
                self.workspace.ensure_git_repo(project_id)
                self.workspace.commit_project_changes(project_id, f"feat(devops): Dockerizacao em 1 clique para {stack}")
            except Exception:
                logger.debug("Falha ao registar commit Git da dockerização.", exc_info=True)
            try:
                inventory = self.workspace.scanner.scan(project_id=project_id, root_path=project_dir)
                self.workspace._inventories[project_id] = inventory
                self.workspace._reports[project_id] = self.workspace.analyzer.analyze(inventory)
            except Exception:
                logger.debug("Falha ao atualizar inventário após dockerização.", exc_info=True)
            if hasattr(self.workspace.security_core, "audit") and self.workspace.security_core.audit:
                self.workspace.security_core.audit.record_event(
                    operation="PROJECT_DOCKERIZED",
                    status="SUCCESS",
                    project_id=project_id,
                    parameters={"stack": stack, "files": ["Dockerfile", "docker-compose.yml", ".dockerignore"]},
                )

        return {
            "status": "dockerized",
            "project_id": project_id,
            "stack": stack,
            "files_created": ["Dockerfile", "docker-compose.yml", ".dockerignore"],
            "run_command": "docker compose up --build",
            "message": f"Projeto '{project_id}' dockerizado com sucesso! Stack identificada: {stack}.",
        }



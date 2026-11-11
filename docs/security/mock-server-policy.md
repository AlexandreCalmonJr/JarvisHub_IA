# Política de segurança do Mock Server

O Mock Server não é uma rota pública. Os endpoints simulados em /api/v1/mock/* exigem sessão autenticada e o escopo mock:serve. O papel developer recebe esse escopo; auditor e dispositivos não o recebem por padrão. Administradores mantêm acesso por RBAC.

Os endpoints de gestão continuam sujeitos às permissões studios:read e studios:use. O CORS preflight é tratado pelo middleware CORS e OPTIONS não é servido pelo handler de mocks.

Não coloque tokens reais, dados pessoais, dados de pacientes ou respostas de produção em fixtures de mock. Use dados sintéticos. A habilitação do Mock Server não desativa autenticação nem políticas do restante da API.

Os aliases do relatório executivo têm operation IDs diferentes para manter o OpenAPI válido.
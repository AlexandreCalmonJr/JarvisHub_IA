# Assinatura Android de produção — JARVIS Mobile 3.0.1

## Política

O APK de distribuição nunca pode ser assinado com a chave debug. O Gradle usa uma configuração release dedicada e interrompe assembleRelease, packageRelease e bundleRelease quando as quatro variáveis de assinatura não estão definidas.

## Criar o keystore uma única vez

No Windows, num terminal PowerShell com o JDK instalado:

```powershell
keytool -genkeypair -v -keystore "$env:USERPROFILE\jarvis-release.jks" -keyalg RSA -keysize 4096 -validity 10000 -alias jarvis-release
```

- Guarde o ficheiro fora do repositório, de preferência num volume cifrado e com backup offline controlado.
- Guarde a senha do keystore e a senha da chave num gestor de segredos.
- Registe o alias, responsável pela custódia, data de criação e procedimento de recuperação.
- Não envie o .jks, senhas ou ficheiros key.properties para GitHub, chat, tickets ou logs.
- Não recrie o keystore para cada versão: updates Android precisam manter a mesma identidade de assinatura.

## Configurar build local

Defina as variáveis apenas na sessão de terminal que fará a compilação. As senhas devem ser injetadas por um gestor de segredos no processo Gradle; não as grave em ficheiros versionados.

```powershell
$env:JARVIS_KEYSTORE_PATH = "$env:USERPROFILE\jarvis-release.jks"
$env:JARVIS_KEY_ALIAS = "jarvis-release"
# Disponibilize JARVIS_KEYSTORE_PASSWORD e JARVIS_KEY_PASSWORD pelo gestor de segredos.
cd apps/mobile
flutter build appbundle --release
flutter build apk --release
```

O build release falha intencionalmente se a assinatura não estiver configurada. O CI atual gera apenas APK debug para validação; a publicação release requer secrets protegidos e aprovação de release.

## Rotação e custódia

1. Não substituir a chave de assinatura de uma aplicação já distribuída sem plano de rotação Android App Signing.
2. Manter duas cópias cifradas do keystore em locais separados e acesso restrito a responsáveis designados.
3. Auditar acessos e testar a recuperação em ambiente isolado.
4. Se houver suspeita de exposição, suspender distribuição e avaliar o mecanismo de rotação suportado pela plataforma antes de emitir nova versão.

## Verificação

```powershell
apksigner verify --verbose --print-certs build\app\outputs\flutter-apk\app-release.apk
```

Guardar o SHA-256 do certificado público no registo de release. Nunca publicar a chave privada nem a senha.
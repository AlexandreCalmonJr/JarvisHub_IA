import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';

void main() {
  runApp(const JarvisMobileApp());
}

class JarvisMobileApp extends StatelessWidget {
  const JarvisMobileApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'JARVIS AI HUB Mobile',
      debugShowCheckedModeBanner: false,
      theme: ThemeData.dark().copyWith(
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFF38BDF8),
          secondary: Color(0xFF818CF8),
          surface: Color(0xFF1E293B),
          error: Color(0xFFEF4444),
        ),
        cardTheme: const CardThemeData(
          color: Color(0xFF1E293B),
          elevation: 2,
          margin: EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF1E293B),
          elevation: 0,
        ),
      ),
      home: const MainNavigationScreen(),
    );
  }
}

// ==========================================
// CONFIGURAÇÃO DE AMBIENTES E REDE
// ==========================================

enum NetworkEnvironment {
  emulator(
    id: 'emulator',
    label: 'Android Emulator',
    defaultUrl: 'http://10.0.2.2:8000',
    description: 'Emulador Android local na máquina de desenvolvimento',
    requiresHttps: false,
  ),
  localDev(
    id: 'local_dev',
    label: 'Desktop / Loopback',
    defaultUrl: 'http://127.0.0.1:8000',
    description: 'Execução local desktop Windows ou Web no mesmo host',
    requiresHttps: false,
  ),
  physicalLan(
    id: 'physical_lan',
    label: 'Android Físico (Wi-Fi Local)',
    defaultUrl: 'http://192.168.1.100:8000',
    description: 'Dispositivo físico conectado na mesma rede Wi-Fi local do servidor',
    requiresHttps: false,
  ),
  tailscale(
    id: 'tailscale',
    label: 'Acesso Remoto Seguro (Tailscale)',
    defaultUrl: 'https://jarvis.tailnet.ts.net',
    description: 'VPN P2P criptografada com Tailscale Serve / MagicDNS',
    requiresHttps: true,
  ),
  production(
    id: 'production',
    label: 'Produção (HTTPS Estrito)',
    defaultUrl: 'https://api.jarvis-hub.com',
    description: 'Ambiente de produção corporativo com terminação TLS/HTTPS obrigatória',
    requiresHttps: true,
  );

  final String id;
  final String label;
  final String defaultUrl;
  final String description;
  final bool requiresHttps;

  const NetworkEnvironment({
    required this.id,
    required this.label,
    required this.defaultUrl,
    required this.description,
    required this.requiresHttps,
  });

  static NetworkEnvironment fromId(String id) {
    return NetworkEnvironment.values.firstWhere(
      (e) => e.id == id,
      orElse: () => NetworkEnvironment.emulator,
    );
  }
}

// Parâmetros opcionais fornecidos em tempo de build via --dart-define
const String _kBuildTimeBackendUrl = String.fromEnvironment('JARVIS_BACKEND_URL');
const String _kBuildTimeEnv = String.fromEnvironment('JARVIS_ENV');

class AppConfig {
  static NetworkEnvironment currentEnv = _detectInitialEnvironment();
  static String baseUrl = _detectInitialBaseUrl();
  static String deviceToken = '';
  static String deviceName = 'Android Mobile Client';
  static bool isRevoked = false;

  static NetworkEnvironment _detectInitialEnvironment() {
    if (_kBuildTimeEnv.isNotEmpty) {
      return NetworkEnvironment.fromId(_kBuildTimeEnv);
    }
    // Em compilação release estrita, adota Produção HTTPS por padrão
    if (const bool.fromEnvironment('dart.vm.product')) {
      return NetworkEnvironment.production;
    }
    try {
      if (Platform.isAndroid) {
        return NetworkEnvironment.emulator;
      }
    } catch (_) {}
    return NetworkEnvironment.localDev;
  }

  static String _detectInitialBaseUrl() {
    if (_kBuildTimeBackendUrl.isNotEmpty) {
      return _kBuildTimeBackendUrl;
    }
    return currentEnv.defaultUrl;
  }

  static String? validateUrl(String url, NetworkEnvironment env) {
    final trimmed = url.trim();
    if (trimmed.isEmpty) {
      return 'O endereço do servidor não pode estar vazio.';
    }
    final uri = Uri.tryParse(trimmed);
    if (uri == null || !uri.hasScheme || !uri.hasAuthority || uri.host.isEmpty) {
      return 'Formato de URL inválido. Use ex: http://192.168.1.50:8000 ou https://...';
    }
    final scheme = uri.scheme.toLowerCase();
    if (scheme != 'http' && scheme != 'https') {
      return 'Esquema de URL inválido ($scheme). Apenas "http" e "https" são suportados.';
    }
    if (env.requiresHttps && scheme != 'https') {
      return 'O ambiente ${env.label} exige conexão segura via HTTPS para proteger dados em trânsito.';
    }
    return null;
  }
}

// ==========================================
// COFRE DE ARMAZENAMENTO SEGURO DO TOKEN
// ==========================================
class SecureTokenStore {
  static const String _vaultFileName = '.jarvis_mobile_vault.enc';
  static const String _secretKey = 'JARVIS_MOBILE_DEVICE_VAULT_KEY_2026';

  static Future<File> _getVaultFile() async {
    String basePath = '';
    try {
      if (Platform.isAndroid) {
        final dir = Directory('/data/user/0/com.jarvis.hub.jarvis_mobile/app_flutter');
        if (await dir.exists()) {
          basePath = dir.path;
        }
      }
    } catch (_) {}
    if (basePath.isEmpty) {
      basePath = Directory.current.path;
    }
    return File('$basePath/$_vaultFileName');
  }

  static List<int> _encrypt(String plainText) {
    final bytes = utf8.encode(plainText);
    final keyBytes = utf8.encode(_secretKey);
    final result = List<int>.filled(bytes.length, 0);
    for (int i = 0; i < bytes.length; i++) {
      result[i] = bytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return result;
  }

  static String _decrypt(List<int> cipherBytes) {
    final keyBytes = utf8.encode(_secretKey);
    final result = List<int>.filled(cipherBytes.length, 0);
    for (int i = 0; i < cipherBytes.length; i++) {
      result[i] = cipherBytes[i] ^ keyBytes[i % keyBytes.length];
    }
    return utf8.decode(result);
  }

  static Future<void> saveCredentials(
    String token, {
    String? baseUrl,
    String? environmentId,
  }) async {
    try {
      final file = await _getVaultFile();
      final data = {
        'token': token.trim(),
        'baseUrl': (baseUrl ?? AppConfig.baseUrl).trim(),
        'environmentId': environmentId ?? AppConfig.currentEnv.id,
        'savedAt': DateTime.now().toIso8601String(),
      };
      final jsonStr = jsonEncode(data);
      final encryptedBytes = _encrypt(jsonStr);
      await file.writeAsBytes(encryptedBytes, flush: true);
    } catch (_) {}
  }

  static Future<Map<String, String>> loadCredentials() async {
    try {
      final file = await _getVaultFile();
      if (!await file.exists()) {
        return {
          'token': '',
          'baseUrl': AppConfig.baseUrl,
          'environmentId': AppConfig.currentEnv.id,
        };
      }
      final bytes = await file.readAsBytes();
      final jsonStr = _decrypt(bytes);
      final map = jsonDecode(jsonStr) as Map<String, dynamic>;
      return {
        'token': map['token'] as String? ?? '',
        'baseUrl': map['baseUrl'] as String? ?? AppConfig.baseUrl,
        'environmentId': map['environmentId'] as String? ?? AppConfig.currentEnv.id,
      };
    } catch (_) {
      return {
        'token': '',
        'baseUrl': AppConfig.baseUrl,
        'environmentId': AppConfig.currentEnv.id,
      };
    }
  }

  static Future<void> clear() async {
    try {
      final file = await _getVaultFile();
      if (await file.exists()) {
        await file.writeAsBytes(List<int>.filled(64, 0));
        await file.delete();
      }
    } catch (_) {}
  }
}

// ==========================================
// RESPOSTA E CLIENTE HTTP AUTENTICADO
// ==========================================

class JarvisApiResponse {
  final int statusCode;
  final String body;
  final dynamic json;
  final bool isSuccess;
  final String? errorMessage;

  const JarvisApiResponse({
    required this.statusCode,
    required this.body,
    this.json,
    required this.isSuccess,
    this.errorMessage,
  });
}

class JarvisApiClient {
  static const Duration connectionTimeout = Duration(seconds: 7);
  static const Duration responseTimeout = Duration(seconds: 15);

  static Future<JarvisApiResponse> request({
    required String method,
    required String path,
    Map<String, dynamic>? jsonBody,
    String? customBaseUrl,
  }) async {
    final effectiveBase = customBaseUrl ?? AppConfig.baseUrl;

    // Validação de transporte seguro
    final validationError = AppConfig.validateUrl(effectiveBase, AppConfig.currentEnv);
    if (validationError != null && customBaseUrl == null) {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: validationError,
      );
    }

    final fullUrl = '$effectiveBase$path';
    final uri = Uri.parse(fullUrl);

    final client = HttpClient();
    client.connectionTimeout = connectionTimeout;

    try {
      HttpClientRequest req;
      switch (method.toUpperCase()) {
        case 'POST':
          req = await client.postUrl(uri).timeout(connectionTimeout);
          break;
        case 'GET':
          req = await client.getUrl(uri).timeout(connectionTimeout);
          break;
        case 'DELETE':
          req = await client.deleteUrl(uri).timeout(connectionTimeout);
          break;
        default:
          req = await client.getUrl(uri).timeout(connectionTimeout);
      }

      req.headers.set('Accept', 'application/json');
      if (jsonBody != null) {
        req.headers.set('Content-Type', 'application/json');
        req.add(utf8.encode(jsonEncode(jsonBody)));
      }

      // Injeta credenciais em todas as chamadas autenticadas
      if (AppConfig.deviceToken.isNotEmpty) {
        req.headers.set('X-Device-Token', AppConfig.deviceToken);
        req.headers.set('Authorization', 'Bearer ${AppConfig.deviceToken}');
      }

      final resp = await req.close().timeout(responseTimeout);
      final bodyStr = await resp.transform(utf8.decoder).join().timeout(responseTimeout);

      dynamic decodedJson;
      try {
        decodedJson = jsonDecode(bodyStr);
      } catch (_) {
        decodedJson = null;
      }

      final statusCode = resp.statusCode;
      if (statusCode == 401 || statusCode == 403) {
        AppConfig.isRevoked = true;
        return JarvisApiResponse(
          statusCode: statusCode,
          body: bodyStr,
          json: decodedJson,
          isSuccess: false,
          errorMessage: 'Acesso negado: Dispositivo móvel não autorizado, token expirado ou revogado pelo administrador.',
        );
      } else if (statusCode >= 200 && statusCode < 300) {
        AppConfig.isRevoked = false;
        return JarvisApiResponse(
          statusCode: statusCode,
          body: bodyStr,
          json: decodedJson,
          isSuccess: true,
        );
      } else if (statusCode >= 500) {
        return JarvisApiResponse(
          statusCode: statusCode,
          body: bodyStr,
          json: decodedJson,
          isSuccess: false,
          errorMessage: 'Falha interna no servidor JARVIS HUB (HTTP $statusCode). Tente novamente mais tarde.',
        );
      } else {
        final detail = decodedJson is Map ? (decodedJson['detail'] ?? decodedJson['message']) : null;
        return JarvisApiResponse(
          statusCode: statusCode,
          body: bodyStr,
          json: decodedJson,
          isSuccess: false,
          errorMessage: detail != null ? '$detail (HTTP $statusCode)' : 'Requisição rejeitada pelo servidor (HTTP $statusCode).',
        );
      }
    } on SocketException catch (e) {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: 'Servidor indisponível ou sem conexão de rede em $effectiveBase. '
            'Verifique se o backend está em execução e o endereço IP/Wi-Fi/Tailscale está correto. (${e.message})',
      );
    } on TimeoutException {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: 'Tempo limite esgotado (timeout). O servidor $effectiveBase demorou mais de 15s para responder.',
      );
    } on HandshakeException catch (e) {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: 'Falha de segurança SSL/TLS. Não foi possível validar o certificado HTTPS do servidor. (${e.message})',
      );
    } on FormatException {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: 'Resposta do servidor em formato inválido (não é um JSON reconhecido).',
      );
    } catch (e) {
      return JarvisApiResponse(
        statusCode: 0,
        body: '',
        isSuccess: false,
        errorMessage: 'Erro inesperado na comunicação com o servidor: $e',
      );
    } finally {
      client.close();
    }
  }

  /// Realiza teste de conexão em tempo real para o endereço informado
  static Future<Map<String, dynamic>> testConnection(String targetUrl) async {
    final stopwatch = Stopwatch()..start();
    final res = await request(
      method: 'GET',
      path: '/api/v1/system/health',
      customBaseUrl: targetUrl,
    );
    stopwatch.stop();

    return {
      'isSuccess': res.isSuccess,
      'statusCode': res.statusCode,
      'latencyMs': stopwatch.elapsedMilliseconds,
      'errorMessage': res.errorMessage,
      'status': res.json is Map ? res.json['status'] : null,
    };
  }
}

// ==========================================
// TELA PRINCIPAL COM NAVEGAÇÃO E BANNER DE SEGURANÇA
// ==========================================
class MainNavigationScreen extends StatefulWidget {
  const MainNavigationScreen({super.key});

  @override
  State<MainNavigationScreen> createState() => _MainNavigationScreenState();
}

class _MainNavigationScreenState extends State<MainNavigationScreen> {
  int _currentIndex = 0;

  final List<Widget> _screens = const [
    ChatScreen(),
    ApprovalsScreen(),
    ProjectsScreen(),
    SystemStatusScreen(),
  ];

  @override
  void initState() {
    super.initState();
    // Restaura credenciais e ambiente do cofre seguro
    SecureTokenStore.loadCredentials().then((creds) {
      if (mounted) {
        setState(() {
          AppConfig.deviceToken = creds['token'] ?? '';
          AppConfig.baseUrl = creds['baseUrl'] ?? AppConfig.baseUrl;
          final envId = creds['environmentId'];
          if (envId != null && envId.isNotEmpty) {
            AppConfig.currentEnv = NetworkEnvironment.fromId(envId);
          }
        });
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(6),
              decoration: BoxDecoration(
                color: const Color(0xFF38BDF8).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.hub_outlined, color: Color(0xFF38BDF8), size: 20),
            ),
            const SizedBox(width: 10),
            const Text(
              'JARVIS HUB',
              style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18, letterSpacing: 1.1),
            ),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.settings_outlined),
            onPressed: () => _openSettings(context),
            tooltip: 'Configurações de Rede & Segurança',
          ),
        ],
      ),
      body: Column(
        children: [
          // Banner de alerta se o dispositivo foi revogado ou não está emparelhado
          if (AppConfig.isRevoked)
            Container(
              width: double.infinity,
              color: const Color(0xFFEF4444),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: const Row(
                children: [
                  Icon(Icons.block, color: Colors.white, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Dispositivo Revogado! O acesso deste dispositivo foi bloqueado pelo administrador.',
                      style: TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            )
          else if (AppConfig.deviceToken.isEmpty)
            Container(
              width: double.infinity,
              color: const Color(0xFFF59E0B),
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: const Row(
                children: [
                  Icon(Icons.warning_amber_rounded, color: Colors.black, size: 18),
                  SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Não Emparelhado: adicione o token nas configurações para autorizar operações.',
                      style: TextStyle(color: Colors.black, fontSize: 12, fontWeight: FontWeight.bold),
                    ),
                  ),
                ],
              ),
            ),
          Expanded(
            child: IndexedStack(
              index: _currentIndex,
              children: _screens,
            ),
          ),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        backgroundColor: const Color(0xFF1E293B),
        indicatorColor: const Color(0xFF38BDF8).withValues(alpha: 0.25),
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() {
            _currentIndex = index;
          });
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.chat_bubble_outline),
            selectedIcon: Icon(Icons.chat_bubble, color: Color(0xFF38BDF8)),
            label: 'Chat',
          ),
          NavigationDestination(
            icon: Icon(Icons.verified_user_outlined),
            selectedIcon: Icon(Icons.verified_user, color: Color(0xFF38BDF8)),
            label: 'Aprovações',
          ),
          NavigationDestination(
            icon: Icon(Icons.folder_outlined),
            selectedIcon: Icon(Icons.folder, color: Color(0xFF38BDF8)),
            label: 'Projetos',
          ),
          NavigationDestination(
            icon: Icon(Icons.speed_outlined),
            selectedIcon: Icon(Icons.speed, color: Color(0xFF38BDF8)),
            label: 'Estado',
          ),
        ],
      ),
    );
  }

  void _openSettings(BuildContext context) {
    final urlController = TextEditingController(text: AppConfig.baseUrl);
    final tokenController = TextEditingController(text: AppConfig.deviceToken);
    NetworkEnvironment selectedEnv = AppConfig.currentEnv;
    String? testResultMsg;
    bool isTesting = false;
    bool? testSuccess;

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) {
          return AlertDialog(
            backgroundColor: const Color(0xFF1E293B),
            title: const Text('Configuração de Rede & Conexão'),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text(
                    'Ambiente de Conexão:',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
                  ),
                  const SizedBox(height: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.white24),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: DropdownButtonHideUnderline(
                      child: DropdownButton<NetworkEnvironment>(
                        isExpanded: true,
                        value: selectedEnv,
                        dropdownColor: const Color(0xFF1E293B),
                        items: NetworkEnvironment.values.map((env) {
                          return DropdownMenuItem(
                            value: env,
                            child: Text(env.label, style: const TextStyle(fontSize: 13)),
                          );
                        }).toList(),
                        onChanged: (newEnv) {
                          if (newEnv != null) {
                            setDialogState(() {
                              selectedEnv = newEnv;
                              urlController.text = newEnv.defaultUrl;
                              testResultMsg = null;
                              testSuccess = null;
                            });
                          }
                        },
                      ),
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    selectedEnv.description,
                    style: const TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Endereço Base do Servidor JARVIS:',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: urlController,
                    decoration: InputDecoration(
                      hintText: selectedEnv.defaultUrl,
                      border: const OutlineInputBorder(),
                      isDense: true,
                      prefixIcon: Icon(
                        selectedEnv.requiresHttps ? Icons.lock : Icons.lock_open,
                        size: 18,
                        color: selectedEnv.requiresHttps ? const Color(0xFF10B981) : Colors.grey,
                      ),
                    ),
                  ),
                  const SizedBox(height: 14),
                  const Text(
                    'Token de Dispositivo Autorizado:',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.bold, color: Colors.grey),
                  ),
                  const SizedBox(height: 6),
                  TextField(
                    controller: tokenController,
                    decoration: const InputDecoration(
                      hintText: 'Token seguro (jrv_m_...)',
                      border: OutlineInputBorder(),
                      isDense: true,
                      prefixIcon: Icon(Icons.key, size: 18, color: Color(0xFF38BDF8)),
                    ),
                  ),
                  const SizedBox(height: 12),
                  // Botão para testar conexão com diagnóstico de latência
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      style: OutlinedButton.styleFrom(
                        foregroundColor: const Color(0xFF38BDF8),
                        side: const BorderSide(color: Color(0xFF38BDF8)),
                      ),
                      onPressed: isTesting
                          ? null
                          : () async {
                              final testUrl = urlController.text.trim();
                              final valErr = AppConfig.validateUrl(testUrl, selectedEnv);
                              if (valErr != null) {
                                setDialogState(() {
                                  testResultMsg = valErr;
                                  testSuccess = false;
                                });
                                return;
                              }
                              setDialogState(() {
                                isTesting = true;
                                testResultMsg = 'A testar conexão com $testUrl...';
                                testSuccess = null;
                              });

                              final diag = await JarvisApiClient.testConnection(testUrl);

                              setDialogState(() {
                                isTesting = false;
                                testSuccess = diag['isSuccess'] == true;
                                if (diag['isSuccess'] == true) {
                                  testResultMsg = 'Conexão OK! Latência: ${diag['latencyMs']} ms • Servidor ativo.';
                                } else {
                                  testResultMsg = diag['errorMessage'] ?? 'Falha na conexão.';
                                }
                              });
                            },
                      icon: isTesting
                          ? const SizedBox(width: 14, height: 14, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.network_check, size: 16),
                      label: Text(isTesting ? 'Testando...' : 'Testar Conexão'),
                    ),
                  ),
                  if (testResultMsg != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: testSuccess == true
                            ? const Color(0xFF10B981).withValues(alpha: 0.15)
                            : (testSuccess == false
                                ? const Color(0xFFEF4444).withValues(alpha: 0.15)
                                : Colors.white10),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        testResultMsg!,
                        style: TextStyle(
                          fontSize: 11,
                          color: testSuccess == true
                              ? const Color(0xFF10B981)
                              : (testSuccess == false ? const Color(0xFFEF4444) : Colors.white70),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () async {
                  await SecureTokenStore.clear();
                  setState(() {
                    AppConfig.deviceToken = '';
                    AppConfig.isRevoked = false;
                  });
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(content: Text('Credenciais removidas do cofre seguro.')),
                    );
                  }
                },
                child: const Text('Desconectar', style: TextStyle(color: Color(0xFFEF4444))),
              ),
              TextButton(
                onPressed: () => Navigator.pop(ctx),
                child: const Text('Cancelar'),
              ),
              ElevatedButton(
                style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF38BDF8)),
                onPressed: () async {
                  final newUrl = urlController.text.trim();
                  final newToken = tokenController.text.trim();

                  final err = AppConfig.validateUrl(newUrl, selectedEnv);
                  if (err != null) {
                    setDialogState(() {
                      testResultMsg = err;
                      testSuccess = false;
                    });
                    return;
                  }

                  AppConfig.currentEnv = selectedEnv;
                  AppConfig.baseUrl = newUrl;
                  AppConfig.deviceToken = newToken;
                  AppConfig.isRevoked = false;

                  await SecureTokenStore.saveCredentials(
                    newToken,
                    baseUrl: newUrl,
                    environmentId: selectedEnv.id,
                  );

                  setState(() {});
                  if (ctx.mounted) Navigator.pop(ctx);
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                      SnackBar(content: Text('Configurações salvas para o ambiente ${selectedEnv.label}!')),
                    );
                  }
                },
                child: const Text('Guardar', style: TextStyle(color: Colors.black, fontWeight: FontWeight.bold)),
              ),
            ],
          );
        },
      ),
    );
  }
}

// ==========================================
// 1. TELA DE CHAT
// ==========================================
class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});

  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final TextEditingController _msgController = TextEditingController();
  final List<Map<String, String>> _messages = [
    {
      'role': 'assistant',
      'text': 'Olá! Sou o JARVIS Master. Pronto para orquestrar seus 26 agentes especializados com segurança local-first.',
    }
  ];
  bool _isLoading = false;

  Future<void> _sendMessage() async {
    final text = _msgController.text.trim();
    if (text.isEmpty) return;

    setState(() {
      _messages.add({'role': 'user', 'text': text});
      _isLoading = true;
    });
    _msgController.clear();

    final response = await JarvisApiClient.request(
      method: 'POST',
      path: '/api/v1/chat',
      jsonBody: {'prompt': text},
    );

    if (response.isSuccess && response.json is Map) {
      final reply = response.json['final_response'] ?? 'Tarefa concluída ou despachada com sucesso.';
      setState(() {
        _messages.add({'role': 'assistant', 'text': reply.toString()});
      });
    } else {
      final err = response.errorMessage ?? 'Erro na comunicação com o servidor.';
      setState(() {
        _messages.add({'role': 'assistant', 'text': err});
      });
    }

    setState(() {
      _isLoading = false;
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        Expanded(
          child: ListView.builder(
            padding: const EdgeInsets.all(16),
            itemCount: _messages.length,
            itemBuilder: (ctx, index) {
              final msg = _messages[index];
              final isUser = msg['role'] == 'user';
              return Align(
                alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
                child: Container(
                  margin: const EdgeInsets.only(bottom: 12),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.8),
                  decoration: BoxDecoration(
                    color: isUser ? const Color(0xFF0284C7) : const Color(0xFF1E293B),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: isUser ? Colors.transparent : Colors.white12,
                    ),
                  ),
                  child: Text(
                    msg['text']!,
                    style: const TextStyle(fontSize: 14, height: 1.4),
                  ),
                ),
              );
            },
          ),
        ),
        if (_isLoading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 8),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2)),
                SizedBox(width: 10),
                Text('JARVIS a deliberar...', style: TextStyle(color: Colors.grey, fontSize: 13)),
              ],
            ),
          ),
        Container(
          padding: const EdgeInsets.all(12),
          color: const Color(0xFF1E293B),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _msgController,
                  decoration: const InputDecoration(
                    hintText: 'Digite uma instrução para o Master...',
                    hintStyle: TextStyle(color: Colors.grey, fontSize: 14),
                    border: InputBorder.none,
                  ),
                  onSubmitted: (_) => _sendMessage(),
                ),
              ),
              IconButton(
                icon: const Icon(Icons.send, color: Color(0xFF38BDF8)),
                onPressed: _sendMessage,
              ),
            ],
          ),
        ),
      ],
    );
  }
}

// ==========================================
// 2. TELA DE APROVAÇÕES
// ==========================================
class ApprovalsScreen extends StatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  State<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends State<ApprovalsScreen> {
  List<dynamic> _pendingApprovals = [];
  bool _loading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchApprovals();
  }

  Future<void> _fetchApprovals() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final response = await JarvisApiClient.request(
      method: 'GET',
      path: '/api/v1/approvals',
    );

    if (response.isSuccess && response.json is List) {
      setState(() {
        _pendingApprovals = response.json;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _pendingApprovals = [];
        _errorMessage = response.errorMessage;
      });
    }

    setState(() => _loading = false);
  }

  Future<void> _decide(String requestId, String action) async {
    final response = await JarvisApiClient.request(
      method: 'POST',
      path: '/api/v1/approvals/$requestId/decide',
      jsonBody: {
        'action': action,
        'reason': 'Aprovado via App Android Móvel',
      },
    );

    if (response.isSuccess) {
      _fetchApprovals();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(action == 'approve' ? 'Operação Aprovada com sucesso!' : 'Operação Rejeitada!'),
            backgroundColor: action == 'approve' ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response.errorMessage ?? 'Falha ao processar decisão.'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.cloud_off, color: Color(0xFFEF4444), size: 56),
              const SizedBox(height: 12),
              const Text(
                'Falha de Comunicação',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
              ),
              const SizedBox(height: 8),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _fetchApprovals,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Tentar Novamente'),
              ),
            ],
          ),
        ),
      );
    }

    if (_pendingApprovals.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.check_circle_outline, color: Color(0xFF10B981), size: 56),
            const SizedBox(height: 12),
            const Text(
              'Zero Aprovações Pendentes',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 6),
            const Text('Todas as operações do JARVIS estão em conformidade.', style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _fetchApprovals,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Atualizar'),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.symmetric(vertical: 8),
      itemCount: _pendingApprovals.length,
      itemBuilder: (ctx, i) {
        final req = _pendingApprovals[i];
        return Card(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(
                      req['operation'] ?? 'OPERAÇÃO CRÍTICA',
                      style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 15, color: Color(0xFF38BDF8)),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF59E0B).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        req['risk_level'] ?? 'HIGH',
                        style: const TextStyle(color: Color(0xFFF59E0B), fontSize: 11, fontWeight: FontWeight.bold),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 8),
                Text(
                  req['reason'] ?? 'Requer validação explícita de operador humano.',
                  style: const TextStyle(fontSize: 13),
                ),
                const SizedBox(height: 14),
                Row(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    OutlinedButton(
                      style: OutlinedButton.styleFrom(foregroundColor: const Color(0xFFEF4444)),
                      onPressed: () => _decide(req['id'], 'reject'),
                      child: const Text('Rejeitar'),
                    ),
                    const SizedBox(width: 10),
                    ElevatedButton(
                      style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF10B981)),
                      onPressed: () => _decide(req['id'], 'approve'),
                      child: const Text('Aprovar', style: TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                    ),
                  ],
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

// ==========================================
// 3. TELA DE PROJETOS (DINÂMICA AUTENTICADA)
// ==========================================
class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});

  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  List<dynamic> _projects = [];
  bool _loading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _fetchProjects();
  }

  Future<void> _fetchProjects() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final response = await JarvisApiClient.request(
      method: 'GET',
      path: '/api/v1/workspace/projects',
    );

    if (response.isSuccess && response.json is List) {
      setState(() {
        _projects = response.json;
        _errorMessage = null;
      });
    } else {
      setState(() {
        _projects = [];
        _errorMessage = response.errorMessage;
      });
    }

    setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_errorMessage != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.folder_off, color: Color(0xFFEF4444), size: 56),
              const SizedBox(height: 12),
              const Text('Falha ao Carregar Projetos', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text(
                _errorMessage!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: Colors.white70, fontSize: 13),
              ),
              const SizedBox(height: 16),
              ElevatedButton.icon(
                onPressed: _fetchProjects,
                icon: const Icon(Icons.refresh, size: 16),
                label: const Text('Tentar Novamente'),
              ),
            ],
          ),
        ),
      );
    }

    if (_projects.isEmpty) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.folder_open, color: Colors.grey, size: 56),
            const SizedBox(height: 12),
            const Text('Nenhum projeto localizado no workspace.', style: TextStyle(color: Colors.grey)),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _fetchProjects,
              icon: const Icon(Icons.refresh, size: 16),
              label: const Text('Atualizar'),
            ),
          ],
        ),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: _projects.length,
      itemBuilder: (ctx, i) {
        final p = _projects[i];
        final name = p['name'] ?? p['id'] ?? 'Projeto';
        final pType = (p['type'] ?? 'web').toString().toUpperCase();
        final fileCount = p['file_count'] ?? 0;
        return Card(
          child: ListTile(
            leading: const Icon(Icons.folder, color: Color(0xFF38BDF8)),
            title: Text(name, style: const TextStyle(fontWeight: FontWeight.bold)),
            subtitle: Text('Tipo: $pType • Arquivos: $fileCount'),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text('Ativo', style: TextStyle(color: Color(0xFF10B981), fontSize: 12)),
            ),
          ),
        );
      },
    );
  }
}

// ==========================================
// 4. TELA DE ESTADO (HEALTH & KILL SWITCH)
// ==========================================
class SystemStatusScreen extends StatefulWidget {
  const SystemStatusScreen({super.key});

  @override
  State<SystemStatusScreen> createState() => _SystemStatusScreenState();
}

class _SystemStatusScreenState extends State<SystemStatusScreen> {
  Map<String, dynamic>? _health;
  bool _loading = false;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _checkHealth();
  }

  Future<void> _checkHealth() async {
    setState(() {
      _loading = true;
      _errorMessage = null;
    });

    final response = await JarvisApiClient.request(
      method: 'GET',
      path: '/api/v1/system/health',
    );

    if (response.isSuccess && response.json is Map) {
      setState(() {
        _health = Map<String, dynamic>.from(response.json);
        _errorMessage = null;
      });
    } else {
      setState(() {
        _errorMessage = response.errorMessage;
      });
    }

    setState(() => _loading = false);
  }

  Future<void> _triggerGlobalKill() async {
    final response = await JarvisApiClient.request(
      method: 'POST',
      path: '/api/v1/system/kill-switch',
      jsonBody: {
        'target': 'global',
        'reason': 'Acionado de emergência pelo app móvel Android.',
      },
    );

    if (response.isSuccess) {
      _checkHealth();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('KILL SWITCH GLOBAL ACIONADO! Todos os agentes interrompidos.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
      }
    } else {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(response.errorMessage ?? 'Falha ao acionar Kill Switch.'),
            backgroundColor: const Color(0xFFEF4444),
          ),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        if (_errorMessage != null)
          Container(
            margin: const EdgeInsets.only(bottom: 16),
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: const Color(0xFFEF4444).withValues(alpha: 0.15),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFEF4444)),
            ),
            child: Row(
              children: [
                const Icon(Icons.cloud_off, color: Color(0xFFEF4444), size: 20),
                const SizedBox(width: 8),
                Expanded(
                  child: Text(
                    _errorMessage!,
                    style: const TextStyle(fontSize: 12, color: Colors.white70),
                  ),
                ),
                IconButton(
                  icon: const Icon(Icons.refresh, size: 18),
                  onPressed: _checkHealth,
                ),
              ],
            ),
          ),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.monitor_heart, color: Color(0xFF38BDF8)),
                    SizedBox(width: 8),
                    Text('Integridade do Monólito', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  ],
                ),
                const Divider(height: 24),
                _statusRow('Ambiente', AppConfig.currentEnv.label),
                _statusRow('Estado Geral', _health?['status']?.toString().toUpperCase() ?? 'DESCONHECIDO'),
                _statusRow('Security Core', _health?['components']?['security_core'] ?? 'OPERATIONAL'),
                _statusRow('Model Runtime', _health?['components']?['model_runtime'] ?? 'OPERATIONAL'),
                _statusRow('Kill Switch Global', _health?['components']?['kill_switch']?['global_killed'] == true ? 'ATIVADO' : 'NORMAL'),
                _statusRow('Dispositivo Mobile', AppConfig.isRevoked ? 'REVOGADO' : (AppConfig.deviceToken.isNotEmpty ? 'AUTORIZADO' : 'ANÔNIMO')),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        Card(
          color: const Color(0xFF450A0A),
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Row(
                  children: [
                    Icon(Icons.dangerous, color: Color(0xFFEF4444)),
                    SizedBox(width: 8),
                    Text('Interrupção de Emergência', style: TextStyle(fontWeight: FontWeight.bold, color: Color(0xFFEF4444), fontSize: 16)),
                  ],
                ),
                const SizedBox(height: 8),
                const Text(
                  'O Kill Switch Global aborta imediatamente todos os agentes em execução, cancela requisições de inferência e desativa execuções no Tool Gateway.',
                  style: TextStyle(fontSize: 13, color: Colors.white70),
                ),
                const SizedBox(height: 16),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: const Color(0xFFDC2626),
                      foregroundColor: Colors.white,
                    ),
                    onPressed: _triggerGlobalKill,
                    icon: const Icon(Icons.power_settings_new),
                    label: const Text('DISPARAR KILL SWITCH GLOBAL', style: TextStyle(fontWeight: FontWeight.bold)),
                  ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  Widget _statusRow(String label, String value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: const TextStyle(color: Colors.grey)),
          Text(value, style: const TextStyle(fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}

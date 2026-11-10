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

class AppConfig {
  static String baseUrl = 'http://10.0.2.2:8000'; // Padrão emulador Android / Tailscale
  static String deviceToken = '';
  static String deviceName = 'Android Pixel Client';
}

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
            tooltip: 'Configurações de Conexão',
          ),
        ],
      ),
      body: IndexedStack(
        index: _currentIndex,
        children: _screens,
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

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: const Color(0xFF1E293B),
        title: const Text('Conexão Segura & Tailscale'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'Endereço do Servidor JARVIS (IP Tailscale ou Localhost):',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: urlController,
              decoration: const InputDecoration(
                hintText: 'Ex: http://100.85.12.34:8000',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
            const SizedBox(height: 16),
            const Text(
              'Token de Emparelhamento do Dispositivo:',
              style: TextStyle(fontSize: 12, color: Colors.grey),
            ),
            const SizedBox(height: 6),
            TextField(
              controller: tokenController,
              decoration: const InputDecoration(
                hintText: 'Token seguro (jrv_m_...)',
                border: OutlineInputBorder(),
                isDense: true,
              ),
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Cancelar'),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: const Color(0xFF38BDF8)),
            onPressed: () {
              AppConfig.baseUrl = urlController.text.trim();
              AppConfig.deviceToken = tokenController.text.trim();
              Navigator.pop(ctx);
              ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(content: Text('Configurações de conexão atualizadas!')),
              );
            },
            child: const Text('Guardar', style: TextStyle(color: Colors.black)),
          ),
        ],
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

    try {
      final client = HttpClient();
      final uri = Uri.parse('${AppConfig.baseUrl}/api/v1/chat');
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (AppConfig.deviceToken.isNotEmpty) {
        request.headers.set('X-Device-Token', AppConfig.deviceToken);
      }
      request.add(utf8.encode(jsonEncode({'prompt': text})));
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final data = jsonDecode(body);

      setState(() {
        _messages.add({
          'role': 'assistant',
          'text': data['final_response'] ?? 'Tarefa concluída ou despachada com sucesso.',
        });
      });
    } catch (e) {
      setState(() {
        _messages.add({
          'role': 'assistant',
          'text': 'Erro de comunicação: $e. Verifique o endereço IP ou a VPN Tailscale nas configurações.',
        });
      });
    } finally {
      setState(() {
        _isLoading = false;
      });
    }
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

  @override
  void initState() {
    super.initState();
    _fetchApprovals();
  }

  Future<void> _fetchApprovals() async {
    setState(() => _loading = true);
    try {
      final client = HttpClient();
      final uri = Uri.parse('${AppConfig.baseUrl}/api/v1/approvals');
      final request = await client.getUrl(uri);
      if (AppConfig.deviceToken.isNotEmpty) {
        request.headers.set('X-Device-Token', AppConfig.deviceToken);
      }
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      setState(() {
        _pendingApprovals = jsonDecode(body);
      });
    } catch (_) {
      // Offline fallback
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _decide(String requestId, String action) async {
    try {
      final client = HttpClient();
      final uri = Uri.parse('${AppConfig.baseUrl}/api/v1/approvals/$requestId/decide');
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (AppConfig.deviceToken.isNotEmpty) {
        request.headers.set('X-Device-Token', AppConfig.deviceToken);
      }
      request.add(utf8.encode(jsonEncode({
        'action': action,
        'reason': 'Aprovado via App Android Móvel',
      })));
      await request.close();
      _fetchApprovals();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(action == 'approve' ? 'Operação Aprovada!' : 'Operação Rejeitada!'),
            backgroundColor: action == 'approve' ? const Color(0xFF10B981) : const Color(0xFFEF4444),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Falha ao decidir: $e')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
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
// 3. TELA DE PROJETOS
// ==========================================
class ProjectsScreen extends StatelessWidget {
  const ProjectsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.all(8),
      children: [
        Card(
          child: ListTile(
            leading: const Icon(Icons.smartphone, color: Color(0xFF38BDF8)),
            title: const Text('demo_flutter_app', style: TextStyle(fontWeight: FontWeight.bold)),
            subtitle: const Text('Branch: jarvis/task-001 • Stack: Flutter/Dart'),
            trailing: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: const Color(0xFF10B981).withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(6),
              ),
              child: const Text('Em Análise', style: TextStyle(color: Color(0xFF10B981), fontSize: 12)),
            ),
          ),
        ),
      ],
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

  @override
  void initState() {
    super.initState();
    _checkHealth();
  }

  Future<void> _checkHealth() async {
    setState(() => _loading = true);
    try {
      final client = HttpClient();
      final uri = Uri.parse('${AppConfig.baseUrl}/api/v1/system/health');
      final request = await client.getUrl(uri);
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      setState(() {
        _health = jsonDecode(body);
      });
    } catch (_) {
      // Offline fallback
    } finally {
      setState(() => _loading = false);
    }
  }

  Future<void> _triggerGlobalKill() async {
    try {
      final client = HttpClient();
      final uri = Uri.parse('${AppConfig.baseUrl}/api/v1/system/kill-switch');
      final request = await client.postUrl(uri);
      request.headers.set('Content-Type', 'application/json');
      if (AppConfig.deviceToken.isNotEmpty) {
        request.headers.set('X-Device-Token', AppConfig.deviceToken);
      }
      request.add(utf8.encode(jsonEncode({
        'target': 'global',
        'reason': 'Acionado de emergência pelo app móvel Android.',
      })));
      await request.close();
      _checkHealth();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('KILL SWITCH GLOBAL ACIONADO! Todos os agentes interrompidos.'),
            backgroundColor: Color(0xFFEF4444),
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Erro: $e')));
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
                _statusRow('Estado Geral', _health?['status']?.toUpperCase() ?? 'DESCONHECIDO'),
                _statusRow('Security Core', _health?['components']?['security_core'] ?? 'OPERATIONAL'),
                _statusRow('Model Runtime', _health?['components']?['model_runtime'] ?? 'OPERATIONAL'),
                _statusRow('Kill Switch Global', _health?['components']?['kill_switch']?['global_killed'] == true ? 'ATIVADO' : 'NORMAL'),
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

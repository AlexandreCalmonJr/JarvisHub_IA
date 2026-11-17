import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jarvis_mobile/main.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  const secureStorageChannel = MethodChannel('plugins.it_nomads.com/flutter_secure_storage');
  final secureStorageData = <String, String>{};
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(secureStorageChannel, (call) async {
    final args = Map<String, dynamic>.from(call.arguments as Map? ?? const {});
    switch (call.method) {
      case 'write':
        secureStorageData[args['key'] as String] = args['value'] as String;
        return null;
      case 'read':
        return secureStorageData[args['key'] as String];
      case 'delete':
        secureStorageData.remove(args['key'] as String);
        return null;
      case 'readAll':
        return Map<String, String>.from(secureStorageData);
      case 'deleteAll':
        secureStorageData.clear();
        return null;
      default:
        return null;
    }
  });
  group('NetworkEnvironment and URL Validation Tests', () {
    test('Todos os 5 ambientes de rede estão declarados com suas políticas', () {
      expect(NetworkEnvironment.values.length, 5);

      final emulator = NetworkEnvironment.emulator;
      expect(emulator.id, 'emulator');
      expect(emulator.defaultUrl, 'http://10.0.2.2:8000');
      expect(emulator.requiresHttps, false);

      final localDev = NetworkEnvironment.localDev;
      expect(localDev.id, 'local_dev');
      expect(localDev.defaultUrl, 'http://127.0.0.1:8000');
      expect(localDev.requiresHttps, false);

      final physicalLan = NetworkEnvironment.physicalLan;
      expect(physicalLan.id, 'physical_lan');
      expect(physicalLan.defaultUrl, 'http://192.168.1.100:8000');
      expect(physicalLan.requiresHttps, false);

      final tailscale = NetworkEnvironment.tailscale;
      expect(tailscale.id, 'tailscale');
      expect(tailscale.defaultUrl, 'https://jarvis.tailnet.ts.net');
      expect(tailscale.requiresHttps, true);

      final production = NetworkEnvironment.production;
      expect(production.id, 'production');
      expect(production.defaultUrl, 'https://api.jarvis-hub.com');
      expect(production.requiresHttps, true);
    });

    test('NetworkEnvironment.fromId retorna o ambiente correto com fallback seguro', () {
      expect(NetworkEnvironment.fromId('production'), NetworkEnvironment.production);
      expect(NetworkEnvironment.fromId('tailscale'), NetworkEnvironment.tailscale);
      expect(NetworkEnvironment.fromId('physical_lan'), NetworkEnvironment.physicalLan);
      expect(NetworkEnvironment.fromId('local_dev'), NetworkEnvironment.localDev);
      expect(NetworkEnvironment.fromId('emulator'), NetworkEnvironment.emulator);
      expect(NetworkEnvironment.fromId('unknown_id'), NetworkEnvironment.emulator);
    });

    test('Validação de URL rejeita strings vazias ou malformadas', () {
      expect(AppConfig.validateUrl('', NetworkEnvironment.emulator), isNotNull);
      expect(AppConfig.validateUrl('   ', NetworkEnvironment.localDev), isNotNull);
      expect(AppConfig.validateUrl('htp://invalid', NetworkEnvironment.localDev), isNotNull);
      expect(AppConfig.validateUrl('just_text_not_url', NetworkEnvironment.localDev), isNotNull);
    });

    test('Ambientes seguros (Produção e Tailscale) rejeitam HTTP desprotegido', () {
      final errProd = AppConfig.validateUrl('http://api.jarvis-hub.com', NetworkEnvironment.production);
      expect(errProd, contains('exige conexão segura via HTTPS'));

      final errTail = AppConfig.validateUrl('http://jarvis.tailnet.ts.net', NetworkEnvironment.tailscale);
      expect(errTail, contains('exige conexão segura via HTTPS'));

      // Conexões HTTPS devem ser aceitas com sucesso (retorno null)
      expect(AppConfig.validateUrl('https://api.jarvis-hub.com', NetworkEnvironment.production), isNull);
      expect(AppConfig.validateUrl('https://jarvis.tailnet.ts.net', NetworkEnvironment.tailscale), isNull);
    });

    test('Ambientes locais (Emulador, Loopback, Wi-Fi LAN) aceitam HTTP para desenvolvimento', () {
      expect(AppConfig.validateUrl('http://10.0.2.2:8000', NetworkEnvironment.emulator), isNull);
      expect(AppConfig.validateUrl('http://127.0.0.1:8000', NetworkEnvironment.localDev), isNull);
      expect(AppConfig.validateUrl('http://192.168.1.50:8000', NetworkEnvironment.physicalLan), isNull);
    });
  });

  group('JarvisApiResponse and Error Handling Tests', () {
    test('JarvisApiResponse encapsula status de sucesso e erro corretamente', () {
      const okResponse = JarvisApiResponse(
        statusCode: 200,
        body: '{"status":"ok"}',
        json: {'status': 'ok'},
        isSuccess: true,
      );
      expect(okResponse.isSuccess, true);
      expect(okResponse.statusCode, 200);
      expect(okResponse.errorMessage, isNull);

      const errResponse = JarvisApiResponse(
        statusCode: 403,
        body: '{"detail":"Revogado"}',
        json: {'detail': 'Revogado'},
        isSuccess: false,
        errorMessage: 'Acesso negado: Dispositivo revogado.',
      );
      expect(errResponse.isSuccess, false);
      expect(errResponse.statusCode, 403);
      expect(errResponse.errorMessage, contains('Dispositivo revogado'));
    });
  });

  group('SecureTokenStore Vault Tests', () {
    test('Cofre seguro persiste e recupera credenciais sem erro', () async {
      await SecureTokenStore.saveCredentials(
        'jrv_m_test_secret_token_123',
        baseUrl: 'https://test-jarvis.tailnet.ts.net',
        environmentId: 'tailscale',
      );

      final creds = await SecureTokenStore.loadCredentials();
      expect(creds['token'], 'jrv_m_test_secret_token_123');
      expect(creds['baseUrl'], 'https://test-jarvis.tailnet.ts.net');
      expect(creds['environmentId'], 'tailscale');

      // Limpeza segura
      await SecureTokenStore.clear();
      final credsAfterClear = await SecureTokenStore.loadCredentials();
      expect(credsAfterClear['token'], '');
    });
  });

  group('QR Code Pairing & Network Discovery Tests', () {
    test('QrPairingPayload decodifica JSON completo com sucesso', () {
      const jsonPayload = '{"hub":"jarvis-hub","v":"3.0.1","url":"http://192.168.1.81:8000","token":"jrv_m_valid_token_abc","device_name":"Pixel 8"}';
      final parsed = QrPairingPayload.parse(jsonPayload);
      expect(parsed, isNotNull);
      expect(parsed!.serverUrl, 'http://192.168.1.81:8000');
      expect(parsed.deviceToken, 'jrv_m_valid_token_abc');
      expect(parsed.deviceName, 'Pixel 8');
      expect(parsed.version, '3.0.1');
    });

    test('QrPairingPayload decodifica URI jarvis://pair com query params', () {
      const uriPayload = 'jarvis://pair?url=http%3A%2F%2F192.168.1.81%3A8000&token=jrv_m_uri_token_xyz';
      final parsed = QrPairingPayload.parse(uriPayload);
      expect(parsed, isNotNull);
      expect(parsed!.serverUrl, 'http://192.168.1.81:8000');
      expect(parsed.deviceToken, 'jrv_m_uri_token_xyz');
    });

    test('QrPairingPayload decodifica formato simples delimitado por barra vertical', () {
      const pipePayload = 'http://192.168.1.81:8000|jrv_m_pipe_token_123';
      final parsed = QrPairingPayload.parse(pipePayload);
      expect(parsed, isNotNull);
      expect(parsed!.serverUrl, 'http://192.168.1.81:8000');
      expect(parsed.deviceToken, 'jrv_m_pipe_token_123');
    });

    test('QrPairingPayload rejeita strings vazias ou inválidas', () {
      expect(QrPairingPayload.parse(''), isNull);
      expect(QrPairingPayload.parse('   '), isNull);
      expect(QrPairingPayload.parse('just_some_random_text'), isNull);
      expect(QrPairingPayload.parse('{"invalid":"no_token_or_url"}'), isNull);
    });

    test('AppConfig.detectEnvironmentFromUrl infere o ambiente correto por IP e protocolo', () {
      expect(AppConfig.detectEnvironmentFromUrl('http://10.0.2.2:8000'), NetworkEnvironment.emulator);
      expect(AppConfig.detectEnvironmentFromUrl('http://127.0.0.1:8000'), NetworkEnvironment.localDev);
      expect(AppConfig.detectEnvironmentFromUrl('http://localhost:8000'), NetworkEnvironment.localDev);
      expect(AppConfig.detectEnvironmentFromUrl('http://192.168.1.81:8000'), NetworkEnvironment.physicalLan);
      expect(AppConfig.detectEnvironmentFromUrl('http://10.5.0.12:8000'), NetworkEnvironment.physicalLan);
      expect(AppConfig.detectEnvironmentFromUrl('https://myhub.tailnet.ts.net'), NetworkEnvironment.tailscale);
      expect(AppConfig.detectEnvironmentFromUrl('https://api.jarvis-hub.com'), NetworkEnvironment.production);
    });

    test('Timeouts de rede do JarvisApiClient foram reduzidos para resposta rápida (sem espera de 15s)', () {
      expect(JarvisApiClient.connectionTimeout.inSeconds, lessThanOrEqualTo(3));
      expect(JarvisApiClient.responseTimeout.inSeconds, lessThanOrEqualTo(4));
    });

    test('DiscoveredServer serializa e deserializa propriedades de diagnóstico', () {
      const server = DiscoveredServer(
        service: 'jarvis-hub',
        version: '3.0.1',
        serverUrl: 'http://192.168.1.81:8000',
        localIp: '192.168.1.81',
        apiPort: 8000,
        latencyMs: 14,
        discoverySource: 'udp_beacon',
      );
      final json = server.toJson();
      expect(json['service'], 'jarvis-hub');
      expect(json['serverUrl'], 'http://192.168.1.81:8000');
      expect(json['latencyMs'], 14);
      expect(json['discoverySource'], 'udp_beacon');
    });
  });
}


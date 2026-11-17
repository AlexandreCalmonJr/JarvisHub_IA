import 'package:flutter_test/flutter_test.dart';
import 'package:jarvis_mobile/main.dart';

void main() {
  group('Mobile Voice Assistant Tests (V4)', () {
    test('ChatMessage model suporta mensagens de texto e voz com intenção e aprovação', () {
      const msg1 = ChatMessage(role: 'user', text: 'que horas são', isVoice: true);
      expect(msg1.role, 'user');
      expect(msg1.text, 'que horas são');
      expect(msg1.isVoice, true);
      expect(msg1.approvalRequired, false);

      const msg2 = ChatMessage(
        role: 'assistant',
        text: 'Agora são 18:30.',
        isVoice: true,
        intent: 'time.now',
        approvalRequired: false,
      );
      expect(msg2.intent, 'time.now');
      expect(msg2.isVoice, true);

      const msg3 = ChatMessage(
        role: 'assistant',
        text: 'Preciso que aprove a ação no painel.',
        isVoice: true,
        intent: 'approval.required',
        approvalRequired: true,
      );
      expect(msg3.approvalRequired, true);
      expect(msg3.intent, 'approval.required');

      const msg4 = ChatMessage(
        role: 'assistant',
        text: 'Ambiente com 2 computadores e 1 monitor.',
        isVision: true,
        intent: 'vision.objects',
      );
      expect(msg4.isVision, true);
      expect(msg4.intent, 'vision.objects');
    });

    test('ChatMessage model suporta todas as intenções determinísticas do Gate 4', () {
      final intents = <String, String>{
        'time.now': 'Agora são 15:45.',
        'date.today': 'Hoje é 17/11/2026.',
        'timer.set': 'Timer de 10 minutos iniciado.',
        'reminder.create': 'Lembrete criado: pagar conta.',
        'weather.info': 'O tempo está ameno com céu limpo e temperatura de 22 graus.',
        'system.status': 'O JARVIS está com todos os módulos operacionais.',
        'calc.eval': 'O resultado é 42.',
        'voice.repeat': 'Repetindo: Agora são 15:45.',
        'voice.cancel': 'Operação cancelada.',
        'system.killed': 'JARVIS está em modo de parada de emergência. Comandos de voz suspensos.',
      };

      for (final entry in intents.entries) {
        final msg = ChatMessage(
          role: 'assistant',
          text: entry.value,
          isVoice: true,
          intent: entry.key,
        );
        expect(msg.intent, entry.key);
        expect(msg.text, entry.value);
        expect(msg.isVoice, true);
      }
    });

    test('ChatMessage identifica corretamente parada de emergência do Kill Switch', () {
      const killedMsg = ChatMessage(
        role: 'assistant',
        text: 'JARVIS está em modo de parada de emergência.',
        isVoice: true,
        intent: 'system.killed',
        approvalRequired: false,
      );
      expect(killedMsg.intent, 'system.killed');
      expect(killedMsg.text, contains('parada de emergência'));
    });
  });
}

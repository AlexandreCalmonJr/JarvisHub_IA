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
    });
  });
}

import 'package:flutter_test/flutter_test.dart';
import 'package:jarvis_mobile/main.dart';

void main() {
  testWidgets('Jarvis mobile app smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const JarvisMobileApp());

    expect(find.text('JARVIS HUB'), findsOneWidget);
    expect(find.text('Chat'), findsOneWidget);
    expect(find.text('Aprovações'), findsOneWidget);
    expect(find.text('Projetos'), findsOneWidget);
    expect(find.text('Estado'), findsOneWidget);
  });
}

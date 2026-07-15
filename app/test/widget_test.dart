import 'package:beacon_app/src/app.dart';
import 'package:beacon_app/src/bootstrap.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

// backendReady: false keeps these tests off the network — BeaconPage skips its
// restore-and-join path entirely in that state.
BootstrapResult _degraded({String? warning}) => BootstrapResult(
      backendReady: false,
      pushReady: false,
      warning: warning,
    );

// With no stored code, BeaconPage's restore path returns before it reaches
// Amplify, so the field is live without a backend behind it.
BootstrapResult _ready() =>
    const BootstrapResult(backendReady: true, pushReady: false);

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('shows the code entry field before joining', (tester) async {
    await tester.pumpWidget(BeaconApp(bootstrap: _degraded()));

    expect(find.text('Beacon code'), findsOneWidget);
    expect(find.text('Enter a code to start watching a beacon.'), findsOneWidget);
    // The AppBar title shares this text, so match the button itself.
    expect(
      find.widgetWithText(FilledButton, 'Light the Beacon'),
      findsNothing,
    );
    expect(find.widgetWithText(FilledButton, 'Join beacon'), findsOneWidget);
  });

  testWidgets('disables joining when the backend is unconfigured',
      (tester) async {
    await tester.pumpWidget(BeaconApp(bootstrap: _degraded()));

    final field = tester.widget<TextField>(find.byType(TextField));
    expect(field.enabled, isFalse);

    final button = tester.widget<FilledButton>(find.byType(FilledButton));
    expect(button.onPressed, isNull);
  });

  testWidgets('surfaces a bootstrap warning to the user', (tester) async {
    await tester.pumpWidget(
      BeaconApp(bootstrap: _degraded(warning: 'Push unavailable')),
    );

    expect(find.text('Push unavailable'), findsOneWidget);
  });

  testWidgets('will not join an empty code', (tester) async {
    await tester.pumpWidget(BeaconApp(bootstrap: _ready()));
    await tester.pumpAndSettle();

    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNull,
    );
  });

  testWidgets('enables joining once a code is typed', (tester) async {
    await tester.pumpWidget(BeaconApp(bootstrap: _ready()));
    await tester.pumpAndSettle();

    await tester.enterText(find.byType(TextField), 'abc');
    await tester.pump();

    expect(
      tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
      isNotNull,
    );
  });

  testWidgets('code field stays editable so the code can be changed',
      (tester) async {
    await tester.pumpWidget(BeaconApp(bootstrap: _ready()));
    await tester.pumpAndSettle();

    expect(tester.widget<TextField>(find.byType(TextField)).enabled, isTrue);
  });
}

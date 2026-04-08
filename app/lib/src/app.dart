import 'package:flutter/material.dart';

import 'features/beacon/beacon_page.dart';

class BeaconApp extends StatelessWidget {
  const BeaconApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Beacon',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.blue),
      home: const BeaconPage(),
    );
  }
}

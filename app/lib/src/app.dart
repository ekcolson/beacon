import 'package:flutter/material.dart';

import 'bootstrap.dart';
import 'features/beacon/beacon_page.dart';

class BeaconApp extends StatelessWidget {
  const BeaconApp({super.key, required this.bootstrap});

  final BootstrapResult bootstrap;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Light the Beacon',
      theme: ThemeData(useMaterial3: true, colorSchemeSeed: Colors.deepOrange),
      home: BeaconPage(bootstrap: bootstrap),
    );
  }
}

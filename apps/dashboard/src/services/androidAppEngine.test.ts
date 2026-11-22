import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_ANDROID_CAPABILITIES,
  buildAndroidMobileProjectFiles,
  buildPairingQrPayload,
  normalizeAndroidAppId,
  validateBrainServerUrl,
} from './androidAppEngine.ts';

test('normalizeAndroidAppId enforces valid reverse-domain Android package IDs', () => {
  assert.equal(normalizeAndroidAppId('BR.Jarvis.Mobile!'), 'br.jarvis.mobile');
  assert.equal(normalizeAndroidAppId('meuapp'), 'br.jarvis.mobile');
  assert.equal(normalizeAndroidAppId('com.empresa.123jarvis'), 'com.empresa.app123jarvis');
});

test('validateBrainServerUrl allows HTTPS and local LAN HTTP while blocking external HTTP and unsafe schemes', () => {
  assert.equal(validateBrainServerUrl('https://meu-jarvis.ts.net/api'), 'https://meu-jarvis.ts.net');
  assert.equal(validateBrainServerUrl('http://192.168.1.50:3000'), 'http://192.168.1.50:3000');
  assert.equal(validateBrainServerUrl('http://localhost:3000'), 'http://localhost:3000');
  assert.throws(() => validateBrainServerUrl('http://public-server.example.com:3000'));
  assert.throws(() => validateBrainServerUrl('javascript:alert(1)'));
  assert.throws(() => validateBrainServerUrl('https://user:secret@meu-jarvis.ts.net'));
});

test('buildPairingQrPayload produces structured zero-typing JSON payload', () => {
  const payload = JSON.parse(
    buildPairingQrPayload({
      brainName: 'Casa Docker',
      serverUrl: 'https://jarvis.ts.net',
      pairingCode: 'A1B2-C3D4',
      expiresAt: '2026-11-21T14:00:00Z',
      assistantName: 'Luna',
    })
  );
  assert.equal(payload.protocol, 'jarvis-mobile-pair/v1');
  assert.equal(payload.code, 'A1B2-C3D4');
  assert.equal(payload.assistant, 'Luna');
});

test('buildAndroidMobileProjectFiles generates complete Capacitor 6 + native Kotlin/XML Android artifacts', () => {
  const files = buildAndroidMobileProjectFiles({
    appName: 'Luna Mobile',
    assistantName: 'Luna',
    packageId: 'br.jarvis.luna',
    serverUrl: 'https://luna.ts.net',
    brainName: 'Cérebro Docker',
    accentColor: '#f97316',
    capabilities: DEFAULT_ANDROID_CAPABILITIES,
  });

  assert.equal(files.length, 10);
  const byPath = new Map(files.map((f) => [f.path, f.content]));

  const manifest = byPath.get('android-overlay/app/src/main/AndroidManifest.xml')!;
  assert.ok(manifest.includes('android.permission.RECORD_AUDIO'));
  assert.ok(manifest.includes('android.permission.CAMERA'));
  assert.ok(manifest.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(manifest.includes('android.permission.USE_BIOMETRIC'));
  assert.ok(manifest.includes('android.intent.action.SEND'));
  assert.ok(manifest.includes('JarvisVoiceWidgetProvider'));

  const netSec = byPath.get('android-overlay/app/src/main/res/xml/network_security_config.xml')!;
  assert.ok(netSec.includes('cleartextTrafficPermitted="false"'));

  const kotlinWidget = byPath.get('android-overlay/app/src/main/java/br/jarvis/luna/JarvisVoiceWidgetProvider.kt')!;
  assert.ok(kotlinWidget.includes('package br.jarvis.luna'));
  assert.ok(kotlinWidget.includes('jarvis://voice/listen'));

  const ci = byPath.get('.github/workflows/android-release.yml')!;
  assert.ok(ci.includes('secrets.ANDROID_KEYSTORE_BASE64'));
  assert.ok(ci.includes('assembleRelease bundleRelease'));
});

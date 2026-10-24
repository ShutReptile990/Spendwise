import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { derivePinVerifier, equalVerifier, retryDelayMs, validPin } from '@/domain/pin';
import { colors } from '@/theme/palette';

const KEY = 'spendwise.appLock.v1';
type LockConfig = { version: 1; salt: string; verifier: string; biometrics: boolean; lockOnBackground: boolean; failures: number; retryAt: number };
type AppLockContextValue = {
  config: LockConfig | null; locked: boolean; ready: boolean; error: string | null;
  setup(pin: string): Promise<void>; verifyPin(pin: string): Promise<boolean>; authenticateBiometric(): Promise<boolean>;
  disable(pin: string): Promise<void>; changePin(current: string, next: string): Promise<void>;
  setBiometrics(enabled: boolean, currentPin: string): Promise<void>; setLockOnBackground(enabled: boolean, currentPin: string): Promise<void>;
};
const Context = createContext<AppLockContextValue | null>(null);

const digest = async (value: Uint8Array<ArrayBuffer>) => new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, value.buffer));
function isConfig(value: unknown): value is LockConfig {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return item.version === 1 && typeof item.salt === 'string' && /^[a-f0-9]{32}$/.test(item.salt) &&
    typeof item.verifier === 'string' && /^[a-f0-9]{64}$/.test(item.verifier) &&
    typeof item.biometrics === 'boolean' && typeof item.lockOnBackground === 'boolean' &&
    Number.isSafeInteger(item.failures) && Number.isSafeInteger(item.retryAt);
}

export function AppLockProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<LockConfig | null>(null);
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lockEpoch, setLockEpoch] = useState(0);
  const [appState, setAppState] = useState(AppState.currentState);
  const biometricInFlight = useRef(false);
  const sessionEpoch = useRef(0);
  const autoAttemptedEpoch = useRef(0);

  const save = useCallback(async (next: LockConfig) => { await SecureStore.setItemAsync(KEY, JSON.stringify(next)); setConfig(next); }, []);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync(KEY).then((raw) => {
      if (!active) return;
      if (!raw) { setLocked(false); setReady(true); return; }
      const parsed: unknown = JSON.parse(raw);
      if (!isConfig(parsed)) throw new Error('App Lock settings could not be read. Your records are still safe.');
      sessionEpoch.current = 1;
      setConfig(parsed); setLocked(true); setReady(true); setLockEpoch(1);
    }).catch(() => { if (active) { setError('App Lock settings could not be read. Your records are still safe.'); setReady(true); } });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      setAppState(state);
      if (state === 'background' && config?.lockOnBackground) {
        sessionEpoch.current += 1;
        setLocked(true); setLockEpoch(sessionEpoch.current);
      }
    });
    return () => subscription.remove();
  }, [config?.lockOnBackground]);

  const setup = useCallback(async (pin: string) => {
    if (config) throw new Error('App Lock is already enabled');
    if (!validPin(pin)) throw new Error('Choose a 4–6 digit PIN');
    const salt = Array.from(await Crypto.getRandomBytesAsync(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
    const verifier = await derivePinVerifier(pin, salt, digest);
    await save({ version: 1, salt, verifier, biometrics: false, lockOnBackground: true, failures: 0, retryAt: 0 });
    setLocked(false);
  }, [config, save]);

  const verifyPin = useCallback(async (pin: string): Promise<boolean> => {
    if (!config) return false;
    if (Date.now() < config.retryAt) throw new Error(`Try again in ${Math.ceil((config.retryAt - Date.now()) / 1000)} seconds`);
    if (!validPin(pin)) return false;
    const startedEpoch = sessionEpoch.current;
    const candidate = await derivePinVerifier(pin, config.salt, digest);
    if (equalVerifier(candidate, config.verifier)) {
      if (sessionEpoch.current !== startedEpoch || AppState.currentState !== 'active') return false;
      await save({ ...config, failures: 0, retryAt: 0 });
      if (sessionEpoch.current !== startedEpoch || AppState.currentState !== 'active') return false;
      setLocked(false);
      return true;
    }
    const failures = config.failures + 1;
    await save({ ...config, failures, retryAt: Date.now() + retryDelayMs(failures) });
    return false;
  }, [config, save]);

  const authenticateBiometric = useCallback(async (): Promise<boolean> => {
    if (!config?.biometrics || biometricInFlight.current) return false;
    biometricInFlight.current = true;
    const startedEpoch = sessionEpoch.current;
    try {
      if (!(await LocalAuthentication.hasHardwareAsync()) || !(await LocalAuthentication.isEnrolledAsync())) return false;
      const result = await LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock SpendWise', disableDeviceFallback: true, biometricsSecurityLevel: 'strong' });
      if (!result.success) return false;
      if (sessionEpoch.current !== startedEpoch) return false;
      if (config.failures > 0 || config.retryAt > 0) await save({ ...config, failures: 0, retryAt: 0 });
      if (sessionEpoch.current !== startedEpoch) return false;
      setLocked(false);
      return true;
    } finally { biometricInFlight.current = false; }
  }, [config, save]);

  useEffect(() => {
    if (ready && locked && appState === 'active' && config?.biometrics && lockEpoch > autoAttemptedEpoch.current) {
      autoAttemptedEpoch.current = lockEpoch;
      void authenticateBiometric().catch(() => {});
    }
  }, [ready, locked, appState, config?.biometrics, lockEpoch, authenticateBiometric]);

  const disable = useCallback(async (pin: string) => {
    if (!(await verifyPin(pin))) throw new Error('Incorrect current PIN');
    await SecureStore.deleteItemAsync(KEY);
    setConfig(null); setLocked(false);
  }, [verifyPin]);
  const changePin = useCallback(async (current: string, next: string) => {
    if (!validPin(next)) throw new Error('Choose a 4–6 digit PIN');
    if (!(await verifyPin(current))) throw new Error('Incorrect current PIN');
    if (!config) throw new Error('App Lock is not enabled');
    const salt = Array.from(await Crypto.getRandomBytesAsync(16), (byte) => byte.toString(16).padStart(2, '0')).join('');
    await save({ ...config, salt, verifier: await derivePinVerifier(next, salt, digest), failures: 0, retryAt: 0 });
  }, [config, save, verifyPin]);
  const setBiometrics = useCallback(async (enabled: boolean, currentPin: string) => {
    if (!config) throw new Error('Set a PIN first');
    if (!(await verifyPin(currentPin))) throw new Error('Incorrect current PIN');
    if (enabled && (!(await LocalAuthentication.hasHardwareAsync()) ||
      (await LocalAuthentication.getEnrolledLevelAsync()) !== LocalAuthentication.SecurityLevel.BIOMETRIC_STRONG)) throw new Error('Strong biometrics are not set up on this device');
    await save({ ...config, biometrics: enabled, failures: 0, retryAt: 0 });
  }, [config, save, verifyPin]);
  const setLockOnBackground = useCallback(async (enabled: boolean, currentPin: string) => {
    if (!config) throw new Error('Set a PIN first');
    if (!(await verifyPin(currentPin))) throw new Error('Incorrect current PIN');
    await save({ ...config, lockOnBackground: enabled, failures: 0, retryAt: 0 });
  }, [config, save, verifyPin]);

  const value = useMemo(() => ({ config, locked, ready, error, setup, verifyPin, authenticateBiometric, disable, changePin, setBiometrics, setLockOnBackground }),
    [config, locked, ready, error, setup, verifyPin, authenticateBiometric, disable, changePin, setBiometrics, setLockOnBackground]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppLock(): AppLockContextValue {
  const value = useContext(Context);
  if (!value) throw new Error('AppLockProvider is missing');
  return value;
}

export function AppLockGate({ children }: PropsWithChildren) {
  const { ready, locked, error, config, verifyPin, authenticateBiometric } = useAppLock();
  const [pin, setPin] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  if (!ready) return <View style={styles.center}><ActivityIndicator color={colors.primary} /><Text style={styles.muted}>Checking App Lock…</Text></View>;
  if (error) return <View style={styles.center}><Text style={styles.heading}>SpendWise is locked</Text><Text style={styles.muted}>{error}</Text></View>;
  if (!locked) return <>{children}</>;
  const unlock = async () => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { if (!(await verifyPin(pin))) setMessage('Incorrect PIN'); else setPin(''); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Could not unlock'); }
    finally { setPin(''); setBusy(false); }
  };
  return <View style={styles.center}>
    <Text style={styles.heading}>SpendWise is locked</Text>
    <Text style={styles.muted}>Enter your app PIN to continue.</Text>
    <TextInput value={pin} onChangeText={setPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="4–6 digit PIN" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="App Lock PIN" />
    {message ? <Text style={styles.error}>{message}</Text> : null}
    <Pressable onPress={() => void unlock()} disabled={busy || pin.length < 4} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Checking…' : 'Unlock'}</Text></Pressable>
    {config?.biometrics ? <Pressable onPress={() => void authenticateBiometric().then((ok) => { if (!ok) setMessage('Biometric authentication was cancelled or unavailable. Use your PIN.'); }).catch(() => setMessage('Biometric authentication failed. Use your PIN.'))} style={styles.secondary}><Text style={styles.secondaryText}>Use biometrics</Text></Pressable> : null}
    <Text style={styles.help}>If both your PIN and biometrics become unavailable, App Lock cannot be recovered. App Lock does not encrypt the database.</Text>
  </View>;
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16 },
  heading: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  muted: { color: colors.secondaryText, fontSize: 14, textAlign: 'center' },
  input: { width: '100%', maxWidth: 320, backgroundColor: colors.surface, color: colors.text, borderRadius: 14, padding: 16, fontSize: 18, textAlign: 'center' },
  button: { backgroundColor: colors.primary, paddingVertical: 15, paddingHorizontal: 42, borderRadius: 13 },
  buttonText: { color: colors.background, fontWeight: '800' },
  secondary: { padding: 10 }, secondaryText: { color: colors.primary, fontWeight: '700' },
  error: { color: colors.expense, textAlign: 'center' }, help: { color: colors.secondaryText, fontSize: 11, textAlign: 'center', lineHeight: 17 },
});

import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { Check, ChevronRight, Database, Download, FileSpreadsheet, Fingerprint, KeyRound, RotateCcw, ShieldCheck, Trash2, Upload } from 'lucide-react-native';
import { type ReactNode, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/screen';
import { BACKUP_VERSION, MAX_BACKUP_BYTES, createBackup, deleteAllFinancialData, parseBackup, replaceFromBackup, type SpendWiseBackup } from '@/data/backup';
import { useTransactionEvents } from '@/data/transaction-events';
import { getAllTransactions } from '@/data/transactions';
import { transactionsToCsv } from '@/domain/csv-export';
import { defaultTransactionFilters } from '@/domain/transaction-filters';
import { validPin } from '@/domain/pin';
import { useAppLock } from '@/features/security/app-lock';
import { colors } from '@/theme/palette';

type ExportMode = 'all' | 'income' | 'expense' | 'month' | 'custom';
type PinMode = 'setup' | 'disable' | 'change';
const exportModes: { id: ExportMode; label: string }[] = [
  { id: 'all', label: 'All Transactions' }, { id: 'income', label: 'Income Only' },
  { id: 'expense', label: 'Expenses Only' }, { id: 'month', label: 'Current Month' },
  { id: 'custom', label: 'Custom Date Range' },
];

function localDate(raw: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error('Enter dates as YYYY-MM-DD');
  const [year, month, day] = raw.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) throw new Error('Enter a valid calendar date');
  return date.getTime();
}

async function shareText(name: string, mimeType: string, contents: string, maxBytes?: number): Promise<void> {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(contents);
  if (maxBytes !== undefined && (file.size ?? contents.length) > maxBytes) {
    file.delete();
    throw new Error('Backup is too large for this format');
  }
  if (!(await Sharing.isAvailableAsync())) throw new Error('Android sharing is unavailable on this device');
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: 'Save or share this SpendWise file' });
}

function dateStamp() { return new Date().toISOString().slice(0, 10); }

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const { notifyChanged, notifyBudgetChanged, notifyGoalChanged } = useTransactionEvents();
  const lock = useAppLock();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<SpendWiseBackup | null>(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportMode, setExportMode] = useState<ExportMode>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [pinMode, setPinMode] = useState<PinMode | null>(null);
  const [preferenceMode, setPreferenceMode] = useState<'biometric' | 'background' | null>(null);
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [managementOpen, setManagementOpen] = useState(false);
  const [recordCounts, setRecordCounts] = useState({ transactions: 0, budgets: 0, goals: 0 });

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try { await work(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : 'The action could not be completed'); }
    finally { setBusy(false); }
  };

  const handleBackup = () => void run(async () => {
    const backup = await createBackup(db);
    await shareText(`SpendWise_Backup_${dateStamp()}.json`, 'application/json', JSON.stringify(backup, null, 2), MAX_BACKUP_BYTES);
    setMessage('Backup created and share sheet opened. Choose a destination to keep a permanent copy.');
  });

  const handlePick = () => void run(async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true, multiple: false });
    if (result.canceled) return;
    const asset = result.assets[0];
    const file = new File(asset.uri);
    if ((asset.size ?? file.size ?? 0) > MAX_BACKUP_BYTES) throw new Error('Backup file is too large');
    const backup = parseBackup(await file.text());
    setRestoreConfirm(''); setPreview(backup);
  });

  const handleRestore = () => void run(async () => {
    if (!preview || restoreConfirm !== 'REPLACE') throw new Error('Type REPLACE to confirm');
    await replaceFromBackup(db, preview);
    notifyChanged(); notifyBudgetChanged(); notifyGoalChanged();
    setPreview(null); setRestoreConfirm('');
    setMessage('Backup restored. Dashboard, transactions, budgets, goals and analytics will refresh.');
  });

  const handleExport = () => void run(async () => {
    const filters = defaultTransactionFilters();
    if (exportMode === 'income' || exportMode === 'expense') filters.type = exportMode;
    if (exportMode === 'month') filters.datePreset = 'thisMonth';
    if (exportMode === 'custom') {
      filters.datePreset = 'custom';
      filters.customStartDate = localDate(startDate);
      filters.customEndDate = localDate(endDate);
      if (filters.customStartDate > filters.customEndDate) throw new Error('Start date must be on or before end date');
    }
    const csv = transactionsToCsv(await getAllTransactions(db), filters);
    await shareText(`SpendWise_Transactions_${dateStamp()}.csv`, 'text/csv', csv);
    setExportOpen(false);
    setMessage('CSV created and share sheet opened. Choose a destination to keep a permanent copy.');
  });

  const openPin = (mode: PinMode) => { setPinMode(mode); setCurrentPin(''); setNewPin(''); setConfirmPin(''); setMessage(''); };
  const handlePin = () => void run(async () => {
    if (pinMode === 'setup') {
      if (!validPin(newPin) || newPin !== confirmPin) throw new Error('Enter and confirm a matching 4–6 digit PIN');
      await lock.setup(newPin); setMessage('App Lock enabled. Your PIN is required when SpendWise opens.');
    } else if (pinMode === 'disable') {
      await lock.disable(currentPin); setMessage('App Lock disabled.');
    } else if (pinMode === 'change') {
      if (!validPin(newPin) || newPin !== confirmPin) throw new Error('Enter and confirm a matching 4–6 digit PIN');
      await lock.changePin(currentPin, newPin); setMessage('App Lock PIN changed.');
    }
    setCurrentPin(''); setNewPin(''); setConfirmPin(''); setPinMode(null);
  });

  const handlePreference = () => void run(async () => {
    if (preferenceMode === 'biometric') {
      await lock.setBiometrics(!lock.config?.biometrics, currentPin);
      setMessage(lock.config?.biometrics ? 'Biometric unlock disabled.' : 'Biometric unlock enabled. Your PIN remains available.');
    } else if (preferenceMode === 'background') {
      await lock.setLockOnBackground(!lock.config?.lockOnBackground, currentPin);
      setMessage('Lock preference updated.');
    }
    setCurrentPin(''); setPreferenceMode(null);
  });

  const handleDelete = () => void run(async () => {
    if (deleteConfirm !== 'DELETE') throw new Error('Type DELETE to confirm');
    await deleteAllFinancialData(db);
    notifyChanged(); notifyBudgetChanged(); notifyGoalChanged();
    setDeleteOpen(false); setDeleteConfirm('');
    setMessage('All local transactions, budgets and savings goals were deleted. Categories and App Lock remain.');
  });

  const handleManagement = () => void run(async () => {
    const transactions = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM transactions');
    const budgets = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM budgets');
    const goals = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM savings_goals');
    setRecordCounts({ transactions: transactions?.count ?? 0, budgets: budgets?.count ?? 0, goals: goals?.count ?? 0 });
    setManagementOpen(true);
  });

  return <Screen title="Settings" subtitle="Your data and privacy, in your hands">
    {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
    <Text style={styles.section}>PRIVACY & DATA</Text>
    <View style={styles.card}>
      <SettingRow icon={<Download color={colors.primary} size={21} />} title="Create Backup" detail="Export a complete JSON copy" onPress={handleBackup} disabled={busy} />
      <SettingRow icon={<FileSpreadsheet color={colors.primary} size={21} />} title="Export Transactions" detail="Save a CSV for Excel or Sheets" onPress={() => { setMessage(''); setExportOpen(true); }} disabled={busy} />
      <SettingRow icon={<Upload color={colors.primary} size={21} />} title="Restore Backup" detail="Preview before replacing local records" onPress={handlePick} disabled={busy} />
      <SettingRow icon={<Database color={colors.primary} size={21} />} title="Data Management" detail="See local record counts" onPress={handleManagement} disabled={busy} last />
    </View>
    <Text style={styles.section}>SECURITY</Text>
    <View style={styles.card}>
      <SettingRow icon={<ShieldCheck color={colors.primary} size={21} />} title="App Lock" detail={lock.config ? 'Enabled · Change or disable with your PIN' : 'Off · Set a 4–6 digit PIN'} onPress={() => openPin(lock.config ? 'change' : 'setup')} disabled={busy} />
      {lock.config ? <SettingRow icon={<KeyRound color={colors.primary} size={21} />} title="Disable App Lock" detail="Requires your current PIN" onPress={() => openPin('disable')} disabled={busy} /> : null}
      <SettingRow icon={<Fingerprint color={colors.primary} size={21} />} title="Biometric Authentication" detail={lock.config?.biometrics ? 'On · Tap to turn off' : 'Off · Requires App Lock and enrolled biometrics'} onPress={() => { setMessage(''); setCurrentPin(''); setPreferenceMode('biometric'); }} disabled={busy || !lock.config} />
      <SettingRow icon={<RotateCcw color={colors.primary} size={21} />} title="Lock on Background" detail={lock.config?.lockOnBackground ? 'On · Lock when leaving SpendWise' : 'Off · Lock only when opening SpendWise'} onPress={() => { setMessage(''); setCurrentPin(''); setPreferenceMode('background'); }} disabled={busy || !lock.config} last />
    </View>
    <Text style={styles.help}>App Lock protects access to the app. It does not encrypt SQLite. If both your PIN and biometrics become unavailable, App Lock cannot be recovered.</Text>
    <Text style={[styles.section, styles.dangerHeading]}>DANGER ZONE</Text>
    <View style={styles.card}><SettingRow icon={<Trash2 color={colors.expense} size={21} />} title="Delete All Local Data" detail="Permanently remove transactions, budgets and goals" onPress={() => { setMessage(''); setDeleteConfirm(''); setDeleteOpen(true); }} disabled={busy} last danger /></View>

    <Dialog visible={!!preview} title="Replace Existing Data" message={message} onClose={() => setPreview(null)}>
      {preview ? <>
        <Text style={styles.body}>Created: {new Date(preview.createdAt).toLocaleString()}</Text>
        <Text style={styles.body}>Backup format: v{preview.backupVersion} · Schema: v{preview.databaseSchemaVersion}</Text>
        <Text style={styles.body}>{preview.data.transactions.length} transactions · {preview.data.categories.length} categories · {preview.data.budgets.length} budgets · {preview.data.savingsGoals.length} goals</Text>
        <Text style={styles.warning}>This replaces every existing local transaction, category and budget. Deleted records cannot be recovered unless you saved a separate backup first. Create a backup of your current data before continuing.</Text>
        <TextInput value={restoreConfirm} onChangeText={setRestoreConfirm} autoCapitalize="characters" placeholder="Type REPLACE" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Type REPLACE to confirm restoration" />
        <Pressable onPress={handleRestore} disabled={busy || restoreConfirm !== 'REPLACE'} style={[styles.button, (busy || restoreConfirm !== 'REPLACE') && styles.disabled]}><Text style={styles.buttonText}>{busy ? 'Restoring…' : 'Replace Existing Data'}</Text></Pressable>
      </> : null}
    </Dialog>

    <Dialog visible={exportOpen} title="Export Transactions" message={message} onClose={() => setExportOpen(false)}>
      {exportModes.map((option) => <Pressable key={option.id} style={styles.option} onPress={() => setExportMode(option.id)} accessibilityRole="radio" accessibilityState={{ checked: exportMode === option.id }}><Text style={[styles.optionText, exportMode === option.id && styles.active]}>{option.label}</Text>{exportMode === option.id ? <Check color={colors.primary} size={19} /> : null}</Pressable>)}
      {exportMode === 'custom' ? <><TextInput value={startDate} onChangeText={setStartDate} placeholder="Start date · YYYY-MM-DD" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Export start date" /><TextInput value={endDate} onChangeText={setEndDate} placeholder="End date · YYYY-MM-DD" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Export end date" /></> : null}
      <Pressable style={styles.button} onPress={handleExport} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Creating…' : 'Create CSV'}</Text></Pressable>
    </Dialog>

    <Dialog visible={!!pinMode} title={pinMode === 'setup' ? 'Enable App Lock' : pinMode === 'change' ? 'Change App PIN' : 'Disable App Lock'} message={message} onClose={() => setPinMode(null)}>
      {pinMode !== 'setup' ? <TextInput value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Current PIN" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Current App Lock PIN" /> : null}
      {pinMode !== 'disable' ? <><TextInput value={newPin} onChangeText={setNewPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="New 4–6 digit PIN" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="New App Lock PIN" /><TextInput value={confirmPin} onChangeText={setConfirmPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Confirm new PIN" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Confirm App Lock PIN" /></> : null}
      <Pressable style={styles.button} onPress={handlePin} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Checking…' : pinMode === 'setup' ? 'Enable App Lock' : pinMode === 'change' ? 'Change PIN' : 'Disable App Lock'}</Text></Pressable>
    </Dialog>

    <Dialog visible={!!preferenceMode} title={preferenceMode === 'biometric' ? 'Biometric Authentication' : 'Lock on Background'} message={message} onClose={() => setPreferenceMode(null)}>
      <Text style={styles.body}>Enter your current PIN to change this App Lock preference.</Text>
      <TextInput value={currentPin} onChangeText={setCurrentPin} secureTextEntry keyboardType="number-pad" maxLength={6} placeholder="Current PIN" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Current App Lock PIN" />
      <Pressable style={styles.button} onPress={handlePreference} disabled={busy}><Text style={styles.buttonText}>{busy ? 'Checking…' : 'Confirm Change'}</Text></Pressable>
    </Dialog>

    <Dialog visible={managementOpen} title="Data Management" onClose={() => setManagementOpen(false)}>
      <Text style={styles.body}>{recordCounts.transactions} transactions, {recordCounts.budgets} budgets and {recordCounts.goals} goals are stored locally.</Text>
      <Text style={styles.body}>JSON backup includes categories and alert history. CSV export includes transactions only. Neither export changes your records.</Text>
      <Text style={styles.body}>Backup format version: {BACKUP_VERSION}</Text>
    </Dialog>

    <Dialog visible={deleteOpen} title="Delete All Local Data" message={message} onClose={() => setDeleteOpen(false)}>
      <Text style={styles.warning}>This permanently deletes all local transactions, monthly budgets, category budgets and budget alerts. You cannot recover them unless you saved a backup. Categories and App Lock settings remain.</Text>
      <TextInput value={deleteConfirm} onChangeText={setDeleteConfirm} autoCapitalize="characters" placeholder="Type DELETE" placeholderTextColor={colors.placeholder} style={styles.input} accessibilityLabel="Type DELETE to confirm data deletion" />
      <Pressable style={[styles.button, styles.dangerButton, (busy || deleteConfirm !== 'DELETE') && styles.disabled]} onPress={handleDelete} disabled={busy || deleteConfirm !== 'DELETE'}><Text style={styles.buttonText}>{busy ? 'Deleting…' : 'Delete All Local Data'}</Text></Pressable>
    </Dialog>
  </Screen>;
}

function SettingRow({ icon, title, detail, onPress, disabled, last, danger }: { icon: ReactNode; title: string; detail: string; onPress: () => void; disabled?: boolean; last?: boolean; danger?: boolean }) {
  return <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" style={[styles.row, !last && styles.separator, disabled && styles.disabled]}>
    <View style={styles.icon}>{icon}</View><View style={styles.rowText}><Text style={[styles.rowTitle, danger && styles.dangerText]}>{title}</Text><Text style={styles.rowDetail}>{detail}</Text></View><ChevronRight color={colors.secondaryText} size={18} />
  </Pressable>;
}

function Dialog({ visible, title, message, onClose, children }: { visible: boolean; title: string; message?: string; onClose: () => void; children: ReactNode }) {
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.dialog}><View style={styles.dialogHeader}><Text style={styles.dialogTitle}>{title}</Text><Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.close}>Close</Text></Pressable></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.dialogContent}>{message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}{children}</ScrollView></View></View></Modal>;
}

const styles = StyleSheet.create({
  section: { color: colors.secondaryText, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginTop: 22, marginBottom: 10 },
  card: { backgroundColor: colors.surface, borderRadius: 18, paddingHorizontal: 15 },
  row: { minHeight: 67, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12 },
  separator: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.secondaryText },
  icon: { width: 30, alignItems: 'center' }, rowText: { flex: 1, gap: 3 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' }, rowDetail: { color: colors.secondaryText, fontSize: 11, lineHeight: 16 },
  help: { color: colors.secondaryText, fontSize: 11, lineHeight: 17, marginTop: 12 },
  dangerHeading: { color: colors.expense }, dangerText: { color: colors.expense },
  message: { color: colors.text, backgroundColor: colors.surface, borderRadius: 12, padding: 12, fontSize: 12, lineHeight: 18 },
  overlay: { flex: 1, backgroundColor: '#0A0F1EEB', justifyContent: 'center', padding: 20 },
  dialog: { backgroundColor: colors.surface, borderRadius: 20, padding: 19, maxHeight: '85%' },
  dialogHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10 },
  dialogTitle: { color: colors.text, fontSize: 19, fontWeight: '800', flex: 1 }, close: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  dialogContent: { gap: 11, paddingBottom: 8 }, body: { color: colors.text, fontSize: 13, lineHeight: 19 },
  warning: { color: colors.text, fontSize: 13, lineHeight: 20, backgroundColor: colors.background, padding: 13, borderRadius: 12 },
  input: { backgroundColor: colors.background, color: colors.text, borderRadius: 12, minHeight: 49, paddingHorizontal: 14, fontSize: 14 },
  button: { backgroundColor: colors.primary, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, marginTop: 3 },
  buttonText: { color: colors.background, fontWeight: '800', fontSize: 13 }, dangerButton: { backgroundColor: colors.expense },
  disabled: { opacity: 0.48 }, option: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  optionText: { color: colors.text, fontSize: 14 }, active: { color: colors.primary, fontWeight: '800' },
});

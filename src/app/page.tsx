'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { loadFromFirestore, saveToFirestore, subscribeToFirestore, migrateFromLocalStorage, type FirestoreDataType } from '@/lib/firestore';
import {
  LayoutDashboard,
  Receipt,
  Settings,
  LogOut,
  Plus,
  Minus,
  TrendingUp,
  TrendingDown,
  Wallet,
  X,
  Trash2,
  ChevronRight,
  Menu,
  PieChart,
  BarChart3,
  AlertCircle,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  Edit3,
  Target,
  CalendarDays,
  AlertTriangle,
  CheckCircle2,
  Camera,
  ScanLine,
  Loader2,
  Eye,
  Filter,
  RotateCcw,
} from 'lucide-react';

// --- TYPES ---
interface Category {
  id: string;
  name: string;
  icon: string;
  color: string;
}

interface Transaction {
  id: string;
  merchant: string;
  amount: number;
  type: 'income' | 'expense';
  categoryId: string;
  date: string;
  createdAt: string;
}

interface BudgetItem {
  categoryId: string;
  limit: number;
}

interface ScannedItem {
  name: string;
  price: number;
  categoryId: string;
}

type TabType = 'dashboard' | 'history' | 'budget' | 'settings';
type ModalType = 'income' | 'expense' | 'category' | null;

// --- DEFAULT CATEGORIES ---
// Note: Green (#10B981) reserved for income, Red (#EF4444) reserved for expense
// Category colors use other colors to avoid confusion
const DEFAULT_CATEGORIES: Category[] = [
  { id: 'gaji', name: 'Gaji', icon: '💵', color: '#0EA5E9' },
  { id: 'makan', name: 'Makanan', icon: '🍽️', color: '#F97316' },
  { id: 'trans', name: 'Transport', icon: '🚗', color: '#3B82F6' },
  { id: 'belanja', name: 'Belanja', icon: '🛍️', color: '#F59E0B' },
  { id: 'hiburan', name: 'Hiburan', icon: '🎬', color: '#8B5CF6' },
  { id: 'tagihan', name: 'Tagihan', icon: '📄', color: '#6366F1' },
  { id: 'kesehatan', name: 'Kesehatan', icon: '💊', color: '#EC4899' },
];

// --- FIRESTORE HELPERS ---
// Wrappers that call Firestore async functions
async function loadData<T>(uid: string, type: FirestoreDataType, fallback: T): Promise<T> {
  return loadFromFirestore<T>(uid, type, fallback);
}

async function saveData<T>(uid: string, type: FirestoreDataType, data: T): Promise<void> {
  return saveToFirestore<T>(uid, type, data);
}

// --- LOGO COMPONENT ---
function GlanceLogo({ size = 40 }: { size?: number }) {
  return (
    <div style={{ width: size, height: size, borderRadius: size / 3, overflow: 'hidden', flexShrink: 0 }}>
      <svg viewBox="0 0 512 512" style={{ width: '100%', height: '100%' }}>
        <rect width="512" height="512" fill="#6366F1" rx="128" />
        <path d="M120 180C120 146.863 146.863 120 180 120H332C365.137 120 392 146.863 392 180V332C392 365.137 365.137 392 332 392H180C146.863 392 120 365.137 120 332V180Z" fill="white" />
        <path d="M392 250H300C277.909 250 260 272.386 260 300C260 327.614 277.909 350 300 350H392V250Z" fill="#6366F1" />
        <circle cx="315" cy="300" r="18" fill="white" />
        <circle cx="215" cy="185" r="28" fill="#6366F1" />
        <circle cx="215" cy="185" r="10" fill="white" />
        <circle cx="235" cy="225" r="14" fill="#6366F1" />
      </svg>
    </div>
  );
}

// --- FORMAT HELPERS ---
function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount);
}

function formatDate(dateStr: string): string {
  // If it's YYYY-MM-DD format, convert to locale
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return inputDateToLocale(dateStr);
  }
  return dateStr;
}

function toInputDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function inputDateToLocale(inputDate: string): string {
  const parts = inputDate.split('-');
  if (parts.length !== 3) return inputDate;
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  return d.toLocaleDateString('id-ID');
}

// Normalize any date string to YYYY-MM-DD format
function normalizeDate(dateStr: string): string {
  if (!dateStr) return toInputDate(new Date());
  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  // Try parsing slash-separated format (Indonesian locale: DD/MM/YYYY)
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3) {
    const [part1, part2, part3] = slashParts.map(Number);
    // Indonesian locale: DD/MM/YYYY
    if (part3 > 100) {
      const day = part1;
      const month = part2;
      const year = part3;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Try parsing dot-separated format (e.g. "5.3.2026")
  const dotParts = dateStr.split('.');
  if (dotParts.length === 3) {
    const [part1, part2, part3] = dotParts.map(Number);
    if (part3 > 100) {
      const day = part1;
      const month = part2;
      const year = part3;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  // Fallback: try native Date parsing
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) return toInputDate(d);
  } catch { /* ignore */ }
  return dateStr;
}

// --- DONUT CHART COMPONENT ---
function DonutChart({ transactions, categories }: { transactions: Transaction[]; categories: Category[] }) {
  const expenses = transactions.filter(t => t.type === 'expense');

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    expenses.forEach(t => {
      totals[t.categoryId] = (totals[t.categoryId] || 0) + t.amount;
    });
    return totals;
  }, [expenses]);

  const totalExp = expenses.reduce((s, e) => s + e.amount, 0);
  const segments = useMemo(() => {
    if (totalExp === 0) return [];
    let offset = 0;
    return Object.entries(categoryTotals).map(([catId, amount]) => {
      const pct = (amount / totalExp) * 100;
      const cat = categories.find(c => c.id === catId);
      const seg = { catId, name: cat?.name || 'Lainnya', icon: cat?.icon || '💰', color: cat?.color || '#6B7280', pct, offset };
      offset += pct;
      return seg;
    }).sort((a, b) => b.pct - a.pct);
  }, [categoryTotals, totalExp, categories]);

  if (totalExp === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-6">
        <div className="w-24 h-24 rounded-full glass-subtle flex items-center justify-center mb-3">
          <PieChart className="w-8 h-8 text-gray-300" />
        </div>
        <p className="text-sm text-gray-400 font-medium">Belum ada pengeluaran</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="14" fill="transparent" stroke="rgba(0,0,0,0.04)" strokeWidth="3.5" />
          {segments.map((seg) => (
            <circle
              key={seg.catId}
              cx="18"
              cy="18"
              r="14"
              fill="transparent"
              stroke={seg.color}
              strokeWidth="3.5"
              strokeDasharray={`${seg.pct * 0.88} ${100 - seg.pct * 0.88}`}
              strokeDashoffset={-seg.offset * 0.88}
              strokeLinecap="round"
              className="transition-all duration-700"
              style={{ opacity: 0.85 }}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-gray-800" style={{ fontFamily: 'var(--font-poppins), Poppins' }}>{expenses.length}</span>
          <span className="text-[10px] text-gray-400 font-medium">Transaksi</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 justify-center">
        {segments.slice(0, 4).map(seg => (
          <div key={seg.catId} className="flex items-center gap-1.5 text-xs">
            <div className="w-2 h-2 rounded-full" style={{ background: seg.color }} />
            <span className="text-gray-500 font-medium">{seg.icon} {seg.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- BAR CHART COMPONENT ---
function BarChartComponent({ transactions }: { transactions: Transaction[] }) {
  const dailyData = useMemo(() => {
    const last7: { label: string; dateStr: string; income: number; expense: number }[] = [];
    const days = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dayStr = toInputDate(d);
      const dayLabel = days[d.getDay()];
      // Debug: log to help troubleshoot date matching
      const dayTxs = transactions.filter(t => {
        const normalized = normalizeDate(t.date);
        return normalized === dayStr;
      });
      const incomeTotal = dayTxs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const expenseTotal = dayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
      last7.push({
        label: dayLabel,
        dateStr: dayStr,
        income: incomeTotal,
        expense: expenseTotal,
      });
    }
    return last7;
  }, [transactions]);

  // Use a single max value for consistent scaling between income and expense
  const maxValue = Math.max(...dailyData.map(d => Math.max(d.income, d.expense)), 1);

  const hasAnyData = dailyData.some(d => d.income > 0 || d.expense > 0);

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-[180px] py-6">
        <BarChart3 className="w-8 h-8 text-gray-300 mb-2" />
        <p className="text-xs text-gray-400 font-medium">Belum ada data 7 hari terakhir</p>
      </div>
    );
  }

  return (
    <div className="flex items-end gap-2 h-[180px] pt-2">
      {dailyData.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          {/* Amount label */}
          <div className="text-[8px] font-bold text-gray-400 h-3 flex items-end">
            {d.expense > 0 && d.income > 0
              ? `${(d.expense/1000).toFixed(0)}k/${(d.income/1000).toFixed(0)}k`
              : d.expense > 0 ? `${(d.expense/1000).toFixed(0)}k`
              : d.income > 0 ? `${(d.income/1000).toFixed(0)}k`
              : ''}
          </div>
          <div className="w-full flex gap-0.5 items-end" style={{ height: '130px' }}>
            {d.expense > 0 ? (
              <div
                className="glass-bar flex-1"
                style={{
                  height: `${Math.max((d.expense / maxValue) * 100, 8)}%`,
                  background: 'linear-gradient(to top, #EF4444, #F87171)',
                }}
                title={`Pengeluaran: Rp ${formatRupiah(d.expense)}`}
              />
            ) : (
              <div
                className="glass-bar flex-1"
                style={{
                  height: '4px',
                  background: 'rgba(239, 68, 68, 0.15)',
                }}
              />
            )}
            {d.income > 0 ? (
              <div
                className="glass-bar flex-1"
                style={{
                  height: `${Math.max((d.income / maxValue) * 100, 8)}%`,
                  background: 'linear-gradient(to top, #10B981, #34D399)',
                }}
                title={`Pemasukan: Rp ${formatRupiah(d.income)}`}
              />
            ) : (
              <div
                className="glass-bar flex-1"
                style={{
                  height: '4px',
                  background: 'rgba(16, 185, 129, 0.15)',
                }}
              />
            )}
          </div>
          <span className="text-[10px] text-gray-400 font-medium">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// --- AUTH SCREEN ---
function AuthScreen({ onAuth }: { onAuth: (email: string, password: string, isLogin: boolean) => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Mohon isi email dan sandi.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await onAuth(email, password, isLogin);
    } catch {
      setError('Akses ditolak. Periksa email/sandi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="glance-app min-h-screen flex items-center justify-center relative">
      <div className="glance-bg" />
      <div className="glance-orb glance-orb-1" />
      <div className="glance-orb glance-orb-2" />
      <div className="glance-orb glance-orb-3" />

      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        className="glass-auth rounded-[32px] p-10 w-[400px] relative z-10"
      >
        <div className="flex flex-col items-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
          >
            <GlanceLogo size={72} />
          </motion.div>
          <h1 className="glance-h1 text-3xl mt-5 text-gray-800">Glance V2</h1>
          <p className="text-gray-400 text-sm mt-1 mb-6">Kelola keuangan semudah berkedip ✨</p>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="w-full flex items-center gap-2 bg-red-50 text-red-600 text-sm font-semibold p-3 rounded-2xl mb-4"
              >
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleSubmit} className="w-full">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="glass-input mb-3"
            />
            <input
              type="password"
              placeholder="Sandi"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="glass-input mb-5"
            />
            <button
              type="submit"
              disabled={loading}
              className="glass-btn glass-btn-primary w-full text-[15px]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isLogin ? (
                'Masuk'
              ) : (
                'Daftar'
              )}
            </button>
          </form>

          <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="mt-5 text-sm font-semibold text-indigo-500 hover:text-indigo-600 transition-colors"
          >
            {isLogin ? 'Belum punya akun? Daftar' : 'Sudah punya akun? Masuk'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// --- MAIN APP COMPONENT ---
export default function GlanceApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customCats, setCustomCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);
  const [isModalOpen, setIsModalOpen] = useState<ModalType>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Form state
  const [formMerchant, setFormMerchant] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formCatId, setFormCatId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCatName, setFormCatName] = useState('');
  const [formCatIcon, setFormCatIcon] = useState('');

  // Budget form
  const [budgetCatId, setBudgetCatId] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetEditId, setBudgetEditId] = useState<string | null>(null);

  // Scan receipt state
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [scanItems, setScanItems] = useState<ScannedItem[]>([]);
  const [scanMerchant, setScanMerchant] = useState('');

  // Filter state for History tab
  const [filterCatId, setFilterCatId] = useState<string>('');
  const [filterType, setFilterType] = useState<'' | 'income' | 'expense'>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Data loading state
  const [dataLoading, setDataLoading] = useState(false);

  const ALL_CATS = useMemo(() => [...DEFAULT_CATEGORIES, ...customCats], [customCats]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isModalOpen]);

  // Auth state
  useEffect(() => {
    return onAuthStateChanged(auth, setUser);
  }, []);

  // Load data from Firestore when user changes + real-time sync
  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setCustomCats([]);
      setBudgets([]);
      setDataLoading(false);
      return;
    }

    setDataLoading(true);

    let loadedCount = 0;
    let initialLoadDone = false;
    const markLoaded = () => {
      loadedCount++;
      if (loadedCount >= 1) {
        setDataLoading(false);
        initialLoadDone = true;
      }
    };

    // Step 1: Migrate localStorage → Firestore (one-time, non-blocking)
    migrateFromLocalStorage(user.uid).then((didMigrate) => {
      if (didMigrate) {
        console.log('Data migrated from localStorage to Firestore');
      }
    }).catch(() => {});

    // Step 2: Subscribe to real-time updates from Firestore
    const unsubTx = subscribeToFirestore<Transaction[]>(user.uid, 'transactions', [], (data) => {
      const normalized = data.map(t => {
        const nd = normalizeDate(t.date);
        return nd !== t.date ? { ...t, date: nd } : t;
      });
      // Only update if Firestore has actual data, OR this is the initial load
      // This prevents Firestore's empty data from overwriting optimistic local updates
      setTransactions(prev => {
        if (normalized.length > 0) {
          return normalized.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        }
        // If Firestore returns empty but we have local data, keep local data
        if (prev.length > 0 && initialLoadDone) return prev;
        return [];
      });
      markLoaded();
    });

    const unsubCats = subscribeToFirestore<Category[]>(user.uid, 'categories', [], (data) => {
      setCustomCats(prev => {
        if (data.length > 0) return data;
        if (prev.length > 0 && initialLoadDone) return prev;
        return [];
      });
      markLoaded();
    });

    const unsubBudgets = subscribeToFirestore<BudgetItem[]>(user.uid, 'budgets', [], (data) => {
      setBudgets(prev => {
        if (data.length > 0) return data;
        if (prev.length > 0 && initialLoadDone) return prev;
        return [];
      });
      markLoaded();
    });

    // Fallback: if Firestore takes too long, stop loading after 3s
    const fallbackTimer = setTimeout(() => {
      setDataLoading(false);
      initialLoadDone = true;
    }, 3000);

    return () => {
      unsubTx();
      unsubCats();
      unsubBudgets();
      clearTimeout(fallbackTimer);
    };
  }, [user]);

  // Calculations
  const totalExp = useMemo(() => transactions.filter(t => t.type === 'expense').reduce((s, e) => s + e.amount, 0), [transactions]);
  const totalInc = useMemo(() => transactions.filter(t => t.type === 'income').reduce((s, e) => s + e.amount, 0), [transactions]);
  const balance = totalInc - totalExp;

  // Budget spending per category (current month)
  const categorySpending = useMemo(() => {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    const spending: Record<string, number> = {};
    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      const tDate = new Date(t.createdAt);
      if (tDate.getMonth() === currentMonth && tDate.getFullYear() === currentYear) {
        spending[t.categoryId] = (spending[t.categoryId] || 0) + t.amount;
      }
    });
    return spending;
  }, [transactions]);

  const totalBudget = useMemo(() => budgets.reduce((s, b) => s + b.limit, 0), [budgets]);

  // Filtered transactions for History tab
  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      if (filterCatId && t.categoryId !== filterCatId) return false;
      if (filterType && t.type !== filterType) return false;
      if (filterDateFrom) {
        const tDate = normalizeDate(t.date);
        if (tDate < filterDateFrom) return false;
      }
      if (filterDateTo) {
        const tDate = normalizeDate(t.date);
        if (tDate > filterDateTo) return false;
      }
      return true;
    });
  }, [transactions, filterCatId, filterType, filterDateFrom, filterDateTo]);

  const filteredTotalExp = useMemo(() => filteredTransactions.filter(t => t.type === 'expense').reduce((s, e) => s + e.amount, 0), [filteredTransactions]);
  const filteredTotalInc = useMemo(() => filteredTransactions.filter(t => t.type === 'income').reduce((s, e) => s + e.amount, 0), [filteredTransactions]);

  const hasActiveFilter = filterCatId || filterType || filterDateFrom || filterDateTo;

  const resetFilter = () => {
    setFilterCatId('');
    setFilterType('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  // Auth handler
  const handleAuth = async (email: string, password: string, isLogin: boolean) => {
    if (isLogin) await signInWithEmailAndPassword(auth, email, password);
    else await createUserWithEmailAndPassword(auth, email, password);
  };

  // Add transaction
  const addTx = async (txType: 'income' | 'expense') => {
    if (!user) return;
    setFormError('');

    // If we have scanned items, create a separate transaction for each
    if (txType === 'expense' && scanItems.length > 0) {
      // Validate all scanned items have categories
      const missingCat = scanItems.some(item => !item.categoryId);
      if (missingCat) {
        setFormError('Pilih kategori untuk semua item.');
        return;
      }

      setSaving(true);
      try {
        const dateValue = formDate || toInputDate(new Date());
        const newTransactions: Transaction[] = scanItems.map((item, idx) => ({
          id: 'tx_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 9),
          merchant: item.name,
          amount: item.price,
          type: txType as const,
          categoryId: item.categoryId,
          date: dateValue,
          createdAt: new Date().toISOString(),
        }));

        const updatedTx = [...newTransactions, ...transactions].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setTransactions(updatedTx);
        await saveData(user.uid, 'transactions', updatedTx);
        showToast('Berhasil disimpan! ✨');
        resetForm();
        setIsModalOpen(null);
      } catch {
        // Even if save fails, data is kept locally with localStorage fallback
        showToast('Berhasil disimpan! ✨');
        resetForm();
        setIsModalOpen(null);
      } finally {
        setSaving(false);
      }
      return;
    }

    if (!formMerchant.trim()) {
      setFormError('Keterangan harus diisi.');
      return;
    }
    if (!formAmount || Number(formAmount) <= 0) {
      setFormError('Nominal harus lebih dari 0.');
      return;
    }
    if (!formCatId) {
      setFormError('Pilih kategori terlebih dahulu.');
      return;
    }

    setSaving(true);
    try {
      const dateValue = formDate || toInputDate(new Date());

      const newTx: Transaction = {
        id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
        merchant: formMerchant.trim(),
        amount: Number(formAmount),
        type: txType,
        categoryId: formCatId,
        date: dateValue,
        createdAt: new Date().toISOString(),
      };

      const updatedTx = [newTx, ...transactions].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
      setTransactions(updatedTx);
      await saveData(user.uid, 'transactions', updatedTx);
      showToast('Berhasil disimpan! ✨');
      resetForm();
      setIsModalOpen(null);
    } catch {
      // Even if save fails, data is kept locally with localStorage fallback
      showToast('Berhasil disimpan! ✨');
      resetForm();
      setIsModalOpen(null);
    } finally {
      setSaving(false);
    }
  };

  // Add category
  const addCategory = () => {
    if (!user || !formCatName.trim()) return;
    // Cycle through non-red/green colors for custom categories
    const customColors = ['#6366F1', '#8B5CF6', '#3B82F6', '#F59E0B', '#F97316', '#EC4899', '#0EA5E9', '#D946EF'];
    const colorIndex = customCats.length % customColors.length;
    const newCat: Category = {
      id: 'cat_' + Date.now(),
      name: formCatName.trim(),
      icon: formCatIcon || '📁',
      color: customColors[colorIndex],
    };
    const updatedCats = [...customCats, newCat];
    setCustomCats(updatedCats);
    saveData(user.uid, 'categories', updatedCats);
    showToast('Kategori baru ditambahkan! 🎉');
    resetForm();
    setIsModalOpen(null);
  };

  // Delete custom category
  const deleteCategory = (catId: string) => {
    if (!user) return;
    const updatedCats = customCats.filter(c => c.id !== catId);
    setCustomCats(updatedCats);
    saveData(user.uid, 'categories', updatedCats);
    // Also remove related budgets
    const updatedBudgets = budgets.filter(b => b.categoryId !== catId);
    if (updatedBudgets.length !== budgets.length) {
      setBudgets(updatedBudgets);
      saveData(user.uid, 'budgets', updatedBudgets);
    }
    showToast('Kategori dihapus');
  };

  // Save budget
  const saveBudget = () => {
    if (!user || !budgetCatId || !budgetLimit || Number(budgetLimit) <= 0) {
      showToast('Pilih kategori dan masukkan batas anggaran.');
      return;
    }
    const existing = budgets.filter(b => b.categoryId !== budgetCatId);
    const newBudgets = [...existing, { categoryId: budgetCatId, limit: Number(budgetLimit) }];
    setBudgets(newBudgets);
    saveData(user.uid, 'budgets', newBudgets);
    setBudgetCatId('');
    setBudgetLimit('');
    setBudgetEditId(null);
    showToast('Anggaran disimpan! 🎯');
  };

  // Delete budget
  const deleteBudget = (catId: string) => {
    if (!user) return;
    const newBudgets = budgets.filter(b => b.categoryId !== catId);
    setBudgets(newBudgets);
    saveData(user.uid, 'budgets', newBudgets);
    showToast('Anggaran dihapus');
  };

  // Delete transaction
  const handleDelete = (txId: string) => {
    if (!user) return;
    const updatedTx = transactions.filter(t => t.id !== txId);
    setTransactions(updatedTx);
    saveData(user.uid, 'transactions', updatedTx);
    setDeleteConfirm(null);
    showToast('Transaksi dihapus');
  };

  const resetForm = () => {
    setFormMerchant('');
    setFormAmount('');
    setFormCatId('');
    setFormDate('');
    setFormCatName('');
    setFormCatIcon('');
    setFormError('');
    setScanPreview(null);
    setScanItems([]);
    setScanMerchant('');
  };

  const openTxModal = (type: 'income' | 'expense') => {
    resetForm();
    setFormDate(toInputDate(new Date()));
    setIsModalOpen(type);
  };

  // Scan receipt handler
  const handleScanReceipt = async (file: File) => {
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
      setFormError('Harap pilih file gambar (JPG, PNG, dll)');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setFormError('Ukuran gambar maksimal 10MB');
      return;
    }

    setScanning(true);
    setFormError('');
    setScanItems([]);
    setScanMerchant('');

    try {
      // Convert to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64Image = await base64Promise;
      setScanPreview(base64Image);

      // Call API
      const response = await fetch('/api/scan-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image }),
      });

      const result = await response.json();

      if (!result.success) {
        setFormError(result.error || 'Gagal memindai nota. Coba lagi.');
        return;
      }

      const data = result.data;
      const merchantName = data.merchant || '';

      // Store merchant name
      setScanMerchant(merchantName);

      // Process items from the new API format
      if (data.items && data.items.length > 0) {
        const processedItems: ScannedItem[] = data.items.map((item: { name?: string; price?: number; categoryId?: string }) => {
          const itemName = item.name || 'Item';
          const displayName = merchantName ? `${itemName} - ${merchantName}` : itemName;
          return {
            name: displayName,
            price: Number(item.price) || 0,
            categoryId: (item.categoryId && ALL_CATS.some(c => c.id === item.categoryId)) ? item.categoryId : 'belanja',
          };
        });
        setScanItems(processedItems);

        // Auto-fill form fields with first item data for single-item case
        setFormMerchant(processedItems[0].name);
        setFormAmount(String(processedItems.reduce((sum: number, i: ScannedItem) => sum + i.price, 0)));
        setFormCatId(processedItems[0].categoryId);
      } else {
        // Fallback: no items detected, use total amount
        if (merchantName) setFormMerchant(merchantName);
        if (data.totalAmount && data.totalAmount > 0) setFormAmount(String(data.totalAmount));
      }

      if (data.date) setFormDate(data.date);

      showToast('Nota berhasil dipindai! ✨');
    } catch {
      setFormError('Gagal memindai nota. Pastikan gambar jelas.');
    } finally {
      setScanning(false);
    }
  };

  // Loading state
  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-purple-50">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-4"
        >
          <GlanceLogo size={56} />
          <div className="flex items-center gap-2 text-gray-400 font-medium">
            <div className="w-5 h-5 border-2 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
            Memuat Glance...
          </div>
        </motion.div>
      </div>
    );
  }

  // Auth screen
  if (user === null) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  // Get category for transaction
  const getCat = (catId: string) => ALL_CATS.find(c => c.id === catId);

  // Nav items
  const navItems = [
    { id: 'dashboard' as TabType, label: 'Ringkasan', icon: LayoutDashboard },
    { id: 'history' as TabType, label: 'Transaksi', icon: Receipt },
    { id: 'budget' as TabType, label: 'Anggaran', icon: Target },
    { id: 'settings' as TabType, label: 'Pengaturan', icon: Settings },
  ];

  return (
    <div className="glance-app min-h-screen relative flex">
      {/* Background effects */}
      <div className="glance-bg" />
      <div className="glance-orb glance-orb-1" />
      <div className="glance-orb glance-orb-2" />
      <div className="glance-orb glance-orb-3" />

      {/* === SIDEBAR === */}
      <aside className="glass-sidebar w-[260px] flex-shrink-0 flex flex-col p-6 relative z-10 hidden lg:flex">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 mb-10"
        >
          <GlanceLogo size={44} />
          <h2 className="glance-h2 text-xl text-gray-800">Glance</h2>
        </motion.div>

        {/* Quick actions */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex flex-col gap-2 mb-8"
        >
          <button
            onClick={() => openTxModal('expense')}
            className="glass-btn glass-btn-danger text-sm w-full"
          >
            <Minus className="w-4 h-4" />
            Pengeluaran
          </button>
          <button
            onClick={() => openTxModal('income')}
            className="glass-btn glass-btn-success text-sm w-full"
          >
            <Plus className="w-4 h-4" />
            Pemasukan
          </button>
        </motion.div>

        {/* Navigation */}
        <nav className="flex-1">
          {navItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className={`glass-nav ${activeTab === item.id ? 'glass-nav-active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <item.icon className="w-[18px] h-[18px]" />
              {item.label}
            </motion.div>
          ))}
        </nav>

        {/* User info & logout */}
        <div className="mt-auto">
          <div className="glass rounded-2xl p-3 mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold">
                {user.email?.[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate">{user.email}</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => signOut(auth)}
            className="glass-btn glass-btn-ghost w-full text-sm text-red-500 hover:!bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            Keluar
          </button>
        </div>
      </aside>

      {/* === MAIN CONTENT === */}
      <main className="flex-1 relative z-10 overflow-y-auto custom-scroll min-h-screen bg-[#F0F2F5]/95">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center justify-between p-4 glass-sidebar sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <GlanceLogo size={36} />
            <h2 className="glance-h2 text-lg">Glance</h2>
          </div>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 glass rounded-xl">
            <Menu className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Mobile nav dropdown */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="lg:hidden glass-sidebar border-b border-white/30 overflow-hidden"
            >
              <div className="p-4 flex flex-col gap-2">
                {navItems.map(item => (
                  <div
                    key={item.id}
                    className={`glass-nav ${activeTab === item.id ? 'glass-nav-active' : ''}`}
                    onClick={() => { setActiveTab(item.id); setMobileMenuOpen(false); }}
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </div>
                ))}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => { openTxModal('expense'); setMobileMenuOpen(false); }}
                    className="glass-btn glass-btn-danger text-xs flex-1"
                  >
                    <Minus className="w-3 h-3" /> Pengeluaran
                  </button>
                  <button
                    onClick={() => { openTxModal('income'); setMobileMenuOpen(false); }}
                    className="glass-btn glass-btn-success text-xs flex-1"
                  >
                    <Plus className="w-3 h-3" /> Pemasukan
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="p-4 lg:p-8 pb-24 lg:pb-8">
          {/* Data loading overlay */}
          {dataLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin" />
                <p className="text-sm text-gray-400 font-medium">Memuat data...</p>
              </div>
            </div>
          )}

          {!dataLoading && (
          <>
          {/* === DASHBOARD === */}
          {activeTab === 'dashboard' && (
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h1 className="glance-h1 text-3xl lg:text-4xl text-gray-800">
                  Halo! 👋
                </h1>
                <p className="text-gray-400 text-sm mt-1">Berikut ringkasan aktivitas keuangan Anda.</p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                {/* Hero Balance Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="glass-hero rounded-[28px] p-7 md:col-span-2 lg:col-span-3 flex justify-between items-center min-h-[180px]"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Wallet className="w-5 h-5 opacity-80" />
                      <span className="text-sm font-bold opacity-80 tracking-wider uppercase">Saldo Bersih</span>
                    </div>
                    <div className="balance-amount">
                      Rp {formatRupiah(balance)}
                    </div>
                    <div className="flex items-center gap-4 mt-3">
                      <div className="flex items-center gap-1.5 text-sm">
                        <ArrowUpRight className="w-4 h-4 text-emerald-300" />
                        <span className="text-white/80 font-semibold">+{formatRupiah(totalInc)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <ArrowDownRight className="w-4 h-4 text-red-300" />
                        <span className="text-white/80 font-semibold">-{formatRupiah(totalExp)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden sm:block opacity-30">
                    <GlanceLogo size={100} />
                  </div>
                </motion.div>

                {/* Stats Cards Row */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="glass rounded-[24px] p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h3 className="glance-h3 text-sm text-gray-500">Pemasukan</h3>
                    </div>
                  </div>
                  <p className="glance-h2 text-2xl text-emerald-600">+Rp {formatRupiah(totalInc)}</p>
                  <p className="text-xs text-gray-400 mt-1">{transactions.filter(t => t.type === 'income').length} transaksi</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="glass rounded-[24px] p-5"
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-red-600" />
                      </div>
                      <h3 className="glance-h3 text-sm text-gray-500">Pengeluaran</h3>
                    </div>
                  </div>
                  <p className="glance-h2 text-2xl text-red-500">-Rp {formatRupiah(totalExp)}</p>
                  <p className="text-xs text-gray-400 mt-1">{transactions.filter(t => t.type === 'expense').length} transaksi</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="glass rounded-[24px] p-5"
                >
                  <h3 className="glance-h3 text-sm text-gray-500 mb-3 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Distribusi
                  </h3>
                  <DonutChart transactions={transactions} categories={ALL_CATS} />
                </motion.div>

                {/* Bar Chart */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="glass rounded-[24px] p-5 md:col-span-2"
                >
                  <h3 className="glance-h3 text-sm text-gray-500 mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Tren 7 Hari Terakhir
                  </h3>
                  <BarChartComponent transactions={transactions} />
                  <div className="flex items-center gap-4 mt-3 justify-center">
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-red-500 to-red-400" />
                      Pengeluaran
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <div className="w-3 h-2 rounded-sm bg-gradient-to-r from-emerald-500 to-emerald-400" />
                      Pemasukan
                    </div>
                  </div>
                </motion.div>

                {/* Budget Summary on Dashboard */}
                {budgets.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="glass rounded-[24px] p-5"
                  >
                    <h3 className="glance-h3 text-sm text-gray-500 mb-3 flex items-center gap-2">
                      <Target className="w-4 h-4 text-indigo-400" />
                      Anggaran Bulan Ini
                    </h3>
                    <div className="space-y-3">
                      {budgets.slice(0, 4).map(b => {
                        const cat = getCat(b.categoryId);
                        const spent = categorySpending[b.categoryId] || 0;
                        const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                        const overBudget = spent > b.limit;
                        return (
                          <div key={b.categoryId}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-semibold text-gray-600">
                                {cat?.icon || '💰'} {cat?.name || 'Lainnya'}
                              </span>
                              <span className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-gray-500'}`}>
                                {formatRupiah(spent)} / {formatRupiah(b.limit)}
                              </span>
                            </div>
                            <div className="w-full h-2 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: overBudget
                                    ? 'linear-gradient(to right, #EF4444, #DC2626)'
                                    : `linear-gradient(to right, ${cat?.color || '#6366F1'}, ${cat?.color || '#818CF8'})`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                      {budgets.length > 4 && (
                        <button
                          onClick={() => setActiveTab('budget')}
                          className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 flex items-center gap-1"
                        >
                          Lihat Semua <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )}

                {/* Recent Transactions */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="glass rounded-[24px] p-5 lg:col-span-3"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="glance-h3 text-sm text-gray-500 flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-indigo-400" />
                      Aktivitas Terakhir
                    </h3>
                    <button
                      onClick={() => setActiveTab('history')}
                      className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                    >
                      Lihat Semua
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>

                  {transactions.length === 0 ? (
                    <div className="flex flex-col items-center py-8">
                      <div className="w-16 h-16 rounded-2xl glass-subtle flex items-center justify-center mb-3">
                        <Receipt className="w-6 h-6 text-gray-300" />
                      </div>
                      <p className="text-sm text-gray-400 font-medium">Belum ada transaksi</p>
                      <p className="text-xs text-gray-300 mt-1">Mulai catat pemasukan atau pengeluaran</p>
                    </div>
                  ) : (
                    <div>
                      {transactions.slice(0, 5).map(t => {
                        const cat = getCat(t.categoryId);
                        return (
                          <div key={t.id} className="tx-row flex items-center justify-between cursor-pointer" onClick={() => setDetailTx(t)}>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                                style={{ background: `${cat?.color || '#6B7280'}15` }}
                              >
                                {cat?.icon || '💰'}
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">{t.merchant}</p>
                                <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                              </div>
                            </div>
                            <span
                              className="font-bold text-sm"
                              style={{ color: t.type === 'income' ? '#10B981' : '#EF4444' }}
                            >
                              {t.type === 'income' ? '+' : '-'}Rp {formatRupiah(t.amount)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </motion.div>
              </div>
            </div>
          )}

          {/* === HISTORY === */}
          {activeTab === 'history' && (
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="glance-h1 text-3xl lg:text-4xl text-gray-800">
                      Riwayat Transaksi
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">{filteredTransactions.length} transaksi{hasActiveFilter ? ' (terfilter)' : ''}</p>
                  </div>
                  <button
                    onClick={() => setFilterOpen(!filterOpen)}
                    className={`glass-btn text-xs !py-2.5 !px-4 ${hasActiveFilter ? 'glass-btn-primary' : 'glass-btn-ghost'}`}
                  >
                    <Filter className="w-3.5 h-3.5" />
                    Filter{hasActiveFilter ? ' ✦' : ''}
                  </button>
                </div>
              </motion.div>

              {/* Filter panel */}
              <AnimatePresence>
                {filterOpen && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden mb-5"
                  >
                    <div className="glass rounded-[24px] p-5">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="glance-h3 text-sm text-gray-600 flex items-center gap-2">
                          <Filter className="w-4 h-4 text-indigo-400" />
                          Filter Transaksi
                        </h3>
                        {hasActiveFilter && (
                          <button
                            onClick={resetFilter}
                            className="flex items-center gap-1 text-xs font-semibold text-red-500 hover:text-red-600 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <select
                          value={filterType}
                          onChange={e => setFilterType(e.target.value as '' | 'income' | 'expense')}
                          className="glass-select text-sm !py-3"
                        >
                          <option value="">Semua Tipe</option>
                          <option value="income">Pemasukan</option>
                          <option value="expense">Pengeluaran</option>
                        </select>
                        <select
                          value={filterCatId}
                          onChange={e => setFilterCatId(e.target.value)}
                          className="glass-select text-sm !py-3"
                        >
                          <option value="">Semua Kategori</option>
                          {ALL_CATS.map(c => (
                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          value={filterDateFrom}
                          onChange={e => setFilterDateFrom(e.target.value)}
                          className="glass-input text-sm !py-3"
                          placeholder="Dari tanggal"
                        />
                        <input
                          type="date"
                          value={filterDateTo}
                          onChange={e => setFilterDateTo(e.target.value)}
                          className="glass-input text-sm !py-3"
                          placeholder="Sampai tanggal"
                        />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Filtered totals */}
              {hasActiveFilter && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="grid grid-cols-2 gap-3 mb-5"
                >
                  <div className="glass rounded-[20px] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                      </div>
                      <span className="text-xs font-semibold text-gray-500">Pemasukan</span>
                    </div>
                    <p className="glance-h2 text-lg text-emerald-600">+Rp {formatRupiah(filteredTotalInc)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{filteredTransactions.filter(t => t.type === 'income').length} transaksi</p>
                  </div>
                  <div className="glass rounded-[20px] p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-7 h-7 rounded-lg bg-red-100 flex items-center justify-center">
                        <TrendingDown className="w-3.5 h-3.5 text-red-600" />
                      </div>
                      <span className="text-xs font-semibold text-gray-500">Pengeluaran</span>
                    </div>
                    <p className="glance-h2 text-lg text-red-500">-Rp {formatRupiah(filteredTotalExp)}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{filteredTransactions.filter(t => t.type === 'expense').length} transaksi</p>
                  </div>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-[24px] p-5 lg:p-6"
              >
                {filteredTransactions.length === 0 ? (
                  <div className="flex flex-col items-center py-16">
                    <div className="w-20 h-20 rounded-2xl glass-subtle flex items-center justify-center mb-4">
                      <Receipt className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-semibold">{hasActiveFilter ? 'Tidak ada transaksi yang cocok' : 'Belum ada transaksi'}</p>
                    <p className="text-sm text-gray-400 mt-1">{hasActiveFilter ? 'Coba ubah filter Anda' : 'Mulai catat keuangan Anda'}</p>
                    {hasActiveFilter && (
                      <button
                        onClick={resetFilter}
                        className="glass-btn glass-btn-ghost text-xs mt-3 !py-2 !px-4"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Reset Filter
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    {/* Table header */}
                    <div className="hidden md:grid grid-cols-[1fr_120px_140px_80px] gap-4 pb-3 border-b border-gray-100">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Detail</span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Kategori</span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Nominal</span>
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-wider text-right">Aksi</span>
                    </div>
                    {filteredTransactions.map((t, i) => {
                      const cat = getCat(t.categoryId);
                      return (
                        <motion.div
                          key={t.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.02 }}
                          className="py-3 border-b border-gray-50 last:border-b-0"
                        >
                          {/* Desktop layout */}
                          <div className="hidden md:grid grid-cols-[1fr_120px_140px_80px] gap-4 items-center cursor-pointer" onClick={() => setDetailTx(t)}>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-9 h-9 rounded-xl flex items-center justify-center text-base"
                                style={{ background: `${cat?.color || '#6B7280'}15` }}
                              >
                                {cat?.icon || '💰'}
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">{t.merchant}</p>
                                <p className="text-xs text-gray-400">{formatDate(t.date)}</p>
                              </div>
                            </div>
                            <span className="text-xs font-semibold text-gray-500">{cat?.name || 'Lainnya'}</span>
                            <span
                              className="font-bold text-sm"
                              style={{ color: t.type === 'income' ? '#10B981' : '#EF4444' }}
                            >
                              {t.type === 'income' ? '+' : '-'}Rp {formatRupiah(t.amount)}
                            </span>
                            <div className="flex justify-end" onClick={e => e.stopPropagation()}>
                              {deleteConfirm === t.id ? (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    className="text-xs font-bold text-red-500 hover:text-red-600"
                                  >
                                    Hapus
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-xs text-gray-400 hover:text-gray-600"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(t.id)}
                                  className="glass-delete-btn"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Mobile layout */}
                          <div className="md:hidden flex items-center justify-between cursor-pointer" onClick={() => setDetailTx(t)}>
                            <div className="flex items-center gap-3">
                              <div
                                className="w-10 h-10 rounded-xl flex items-center justify-center text-lg"
                                style={{ background: `${cat?.color || '#6B7280'}15` }}
                              >
                                {cat?.icon || '💰'}
                              </div>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">{t.merchant}</p>
                                <p className="text-xs text-gray-400">{cat?.name || 'Lainnya'} · {formatDate(t.date)}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                              <span
                                className="font-bold text-sm"
                                style={{ color: t.type === 'income' ? '#10B981' : '#EF4444' }}
                              >
                                {t.type === 'income' ? '+' : '-'}Rp {formatRupiah(t.amount)}
                              </span>
                              {deleteConfirm === t.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleDelete(t.id)}
                                    className="text-[10px] font-bold text-red-500"
                                  >
                                    Hapus
                                  </button>
                                  <button
                                    onClick={() => setDeleteConfirm(null)}
                                    className="text-[10px] text-gray-400"
                                  >
                                    Batal
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirm(t.id)}
                                  className="glass-delete-btn"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </div>
          )}

          {/* === BUDGET TAB === */}
          {activeTab === 'budget' && (
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h1 className="glance-h1 text-3xl lg:text-4xl text-gray-800">
                  Anggaran 🎯
                </h1>
                <p className="text-gray-400 text-sm mt-1">Atur batas pengeluaran per kategori setiap bulan.</p>
              </motion.div>

              {/* Budget Overview */}
              {budgets.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="glass-hero rounded-[28px] p-6 mb-5 flex justify-between items-center"
                >
                  <div>
                    <span className="text-sm font-bold opacity-80 tracking-wider uppercase">Total Anggaran</span>
                    <div className="glance-h2 text-3xl mt-1">Rp {formatRupiah(totalBudget)}</div>
                    <p className="text-sm text-white/70 mt-1">
                      Terpakai Rp {formatRupiah(
                        budgets.reduce((s, b) => s + (categorySpending[b.categoryId] || 0), 0)
                      )} ({totalBudget > 0 ? Math.round(
                        budgets.reduce((s, b) => s + (categorySpending[b.categoryId] || 0), 0) / totalBudget * 100
                      ) : 0}%)
                    </p>
                  </div>
                  <div className="hidden sm:block opacity-30">
                    <Target className="w-20 h-20" />
                  </div>
                </motion.div>
              )}

              {/* Add Budget Form */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass rounded-[24px] p-6 mb-5"
              >
                <h3 className="glance-h3 text-gray-700 mb-4 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-indigo-400" />
                  {budgetEditId ? 'Edit Anggaran' : 'Tambah Anggaran'}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                  <select
                    value={budgetCatId}
                    onChange={e => setBudgetCatId(e.target.value)}
                    className="glass-select"
                  >
                    <option value="">Pilih Kategori</option>
                    {ALL_CATS.filter(c => !budgets.some(b => b.categoryId === c.id) || c.id === budgetEditId).map(c => (
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="Batas pengeluaran (Rp)"
                    value={budgetLimit}
                    onChange={e => setBudgetLimit(e.target.value)}
                    className="glass-input !mb-0"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={saveBudget}
                      className="glass-btn glass-btn-primary text-sm whitespace-nowrap"
                    >
                      {budgetEditId ? 'Perbarui' : 'Simpan'}
                    </button>
                    {budgetEditId && (
                      <button
                        onClick={() => { setBudgetEditId(null); setBudgetCatId(''); setBudgetLimit(''); }}
                        className="glass-btn glass-btn-ghost text-sm"
                      >
                        Batal
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>

              {/* Budget List */}
              {budgets.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="glass rounded-[24px] p-10"
                >
                  <div className="flex flex-col items-center">
                    <div className="w-20 h-20 rounded-2xl glass-subtle flex items-center justify-center mb-4">
                      <Target className="w-8 h-8 text-gray-300" />
                    </div>
                    <p className="text-gray-500 font-semibold">Belum ada anggaran</p>
                    <p className="text-sm text-gray-400 mt-1">Atur batas pengeluaran per kategori untuk mengontrol keuangan</p>
                  </div>
                </motion.div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {budgets.map((b, i) => {
                    const cat = getCat(b.categoryId);
                    const spent = categorySpending[b.categoryId] || 0;
                    const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                    const overBudget = spent > b.limit;
                    const remaining = b.limit - spent;

                    return (
                      <motion.div
                        key={b.categoryId}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 + i * 0.05 }}
                        className={`glass rounded-[24px] p-5 ${overBudget ? 'ring-2 ring-red-200' : ''}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                              style={{ background: `${cat?.color || '#6B7280'}15` }}
                            >
                              {cat?.icon || '💰'}
                            </div>
                            <div>
                              <p className="font-bold text-gray-800">{cat?.name || 'Lainnya'}</p>
                              <p className="text-xs text-gray-400">Batas: Rp {formatRupiah(b.limit)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setBudgetEditId(b.categoryId);
                                setBudgetCatId(b.categoryId);
                                setBudgetLimit(String(b.limit));
                              }}
                              className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button
                              onClick={() => deleteBudget(b.categoryId)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-400" />
                            </button>
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full h-3 rounded-full bg-gray-100 overflow-hidden mb-2">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${pct}%`,
                              background: overBudget
                                ? 'linear-gradient(to right, #EF4444, #DC2626)'
                                : `linear-gradient(to right, ${cat?.color || '#6366F1'}, ${cat?.color || '#818CF8'})`,
                            }}
                          />
                        </div>

                        {/* Stats */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            {overBudget ? (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                                <span className="text-xs font-bold text-red-500">
                                  Lebih Rp {formatRupiah(Math.abs(remaining))}
                                </span>
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-xs font-semibold text-emerald-600">
                                  Sisa Rp {formatRupiah(remaining)}
                                </span>
                              </>
                            )}
                          </div>
                          <span className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-gray-400'}`}>
                            {Math.round(pct)}% terpakai
                          </span>
                        </div>

                        {/* Spending detail */}
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <div className="flex justify-between items-center">
                            <span className="text-xs text-gray-400">Terpakai bulan ini</span>
                            <span className="text-xs font-bold text-gray-600">Rp {formatRupiah(spent)}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* === SETTINGS === */}
          {activeTab === 'settings' && (
            <div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h1 className="glance-h1 text-3xl lg:text-4xl text-gray-800">
                  Pengaturan
                </h1>
                <p className="text-gray-400 text-sm mt-1">Kustomisasi pengalaman Glance Anda.</p>
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-5">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="glass rounded-[24px] p-6 lg:col-span-2"
                >
                  <div className="flex items-center justify-between mb-5">
                    <h3 className="glance-h3 text-gray-700 flex items-center gap-2">
                      <Edit3 className="w-4 h-4 text-indigo-400" />
                      Kategori Kustom
                    </h3>
                    <button
                      onClick={() => { resetForm(); setIsModalOpen('category'); }}
                      className="glass-btn glass-btn-primary text-xs !py-2.5 !px-4"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {DEFAULT_CATEGORIES.map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="glass-pill"
                      >
                        <span className="text-base">{c.icon}</span>
                        <span>{c.name}</span>
                        <span className="text-[10px] text-gray-400 font-medium ml-1">default</span>
                      </motion.div>
                    ))}
                    {customCats.map((c, i) => (
                      <motion.div
                        key={c.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: (DEFAULT_CATEGORIES.length + i) * 0.03 }}
                        className="glass-pill group"
                      >
                        <span className="text-base">{c.icon}</span>
                        <span>{c.name}</span>
                        <button
                          onClick={() => deleteCategory(c.id)}
                          className="ml-1 w-4 h-4 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Hapus kategori"
                        >
                          ✕
                        </button>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="glass rounded-[24px] p-6"
                >
                  <h3 className="glance-h3 text-gray-700 mb-4 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-indigo-400" />
                    Akun Anda
                  </h3>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-lg font-bold">
                      {user.email?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{user.email}</p>
                      <p className="text-xs text-gray-400">Terverifikasi</p>
                    </div>
                  </div>

                  <div className="glass rounded-xl p-3 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 font-medium">Total Transaksi</span>
                      <span className="text-sm font-bold text-gray-700">{transactions.length}</span>
                    </div>
                  </div>
                  <div className="glass rounded-xl p-3 mb-3">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 font-medium">Kategori</span>
                      <span className="text-sm font-bold text-gray-700">{ALL_CATS.length}</span>
                    </div>
                  </div>
                  <div className="glass rounded-xl p-3 mb-4">
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-gray-400 font-medium">Anggaran Aktif</span>
                      <span className="text-sm font-bold text-gray-700">{budgets.length}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => signOut(auth)}
                    className="glass-btn glass-btn-ghost w-full text-sm text-red-500 hover:!bg-red-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Keluar Akun
                  </button>
                </motion.div>
              </div>
            </div>
          )}
          </>
          )}
        </div>
        <div className="lg:hidden fixed bottom-0 left-0 right-0 glass-mobile-nav z-20 safe-area-bottom">
          <div className="flex items-center justify-around py-2 px-2">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all ${
                  activeTab === item.id
                    ? 'text-indigo-500'
                    : 'text-gray-400'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="text-[9px] font-semibold">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>

      {/* === MODALS === */}
      <AnimatePresence>
        {isModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-modal-bg fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => { setIsModalOpen(null); setFormError(''); setScanPreview(null); setScanItems([]); setScanMerchant(''); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-modal rounded-[28px] w-full max-w-[420px] relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              <div className="max-h-[85vh] overflow-y-auto custom-scroll">
              {/* Sticky header - close button + title */}
              <div className="sticky top-0 z-10 px-7 pt-7 pb-4 bg-white">
                <div className="flex items-center justify-between">
                  {isModalOpen === 'category' ? (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center">
                        <Edit3 className="w-5 h-5 text-indigo-500" />
                      </div>
                      <h2 className="glance-h2 text-xl text-gray-800">Kategori Baru</h2>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isModalOpen === 'income' ? 'bg-emerald-100' : 'bg-red-100'
                      }`}>
                        {isModalOpen === 'income' ? (
                          <TrendingUp className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <TrendingDown className="w-5 h-5 text-red-500" />
                        )}
                      </div>
                      <h2 className="glance-h2 text-xl text-gray-800">
                        {isModalOpen === 'income' ? 'Tambah Pemasukan' : 'Catat Pengeluaran'}
                      </h2>
                    </div>
                  )}
                  <button
                    onClick={() => { setIsModalOpen(null); setFormError(''); setScanPreview(null); setScanItems([]); setScanMerchant(''); }}
                    className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {isModalOpen === 'category' ? (
                <div className="px-7 pb-7">
                  <input
                    placeholder="Nama Kategori"
                    value={formCatName}
                    onChange={e => setFormCatName(e.target.value)}
                    className="glass-input mb-3"
                  />
                  <input
                    placeholder="Emoji (contoh: 🚀)"
                    value={formCatIcon}
                    onChange={e => setFormCatIcon(e.target.value)}
                    className="glass-input mb-5"
                  />

                  <div className="flex gap-3">
                    <button className="glass-btn glass-btn-primary flex-1" onClick={addCategory}>
                      <Sparkles className="w-4 h-4" />
                      Buat Kategori
                    </button>
                    <button className="glass-btn glass-btn-ghost flex-1" onClick={() => { setIsModalOpen(null); setFormError(''); setScanPreview(null); setScanItems([]); setScanMerchant(''); }}>
                      Batal
                    </button>
                  </div>
                </div>
              ) : (
                <div className="px-7 pb-7">
                  {/* Scan Receipt - only for expense */}
                  {isModalOpen === 'expense' && (
                    <div className="mb-4">
                      <input
                        type="file"
                        accept="image/*"
                        capture="environment"
                        id="receipt-file-input"
                        className="hidden"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleScanReceipt(file);
                          e.target.value = '';
                        }}
                      />
                      <button
                        onClick={() => document.getElementById('receipt-file-input')?.click()}
                        disabled={scanning}
                        className="scan-receipt-btn w-full"
                      >
                        {scanning ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span>Memindai Nota...</span>
                          </>
                        ) : (
                          <>
                            <ScanLine className="w-5 h-5" />
                            <span>Scan Nota</span>
                          </>
                        )}
                        <Camera className="w-4 h-4 opacity-50" />
                      </button>

                      {/* Scan preview */}
                      <AnimatePresence>
                        {scanPreview && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-3 overflow-hidden"
                          >
                            <div className="relative rounded-2xl overflow-hidden border border-white/40">
                              <img
                                src={scanPreview}
                                alt="Preview Nota"
                                className="w-full h-32 object-cover"
                              />
                              <button
                                onClick={() => { setScanPreview(null); setScanItems([]); setScanMerchant(''); }}
                                className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center"
                              >
                                <X className="w-3 h-3 text-white" />
                              </button>
                              {scanning && (
                                <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] flex items-center justify-center">
                                  <div className="scan-animation">
                                    <ScanLine className="w-8 h-8 text-white animate-pulse" />
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Detected items - multi-category selector */}
                            {scanItems.length > 0 && (
                              <div className="mt-2 p-3 rounded-xl bg-indigo-50/50">
                                <p className="text-xs font-semibold text-indigo-500 mb-2 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  {scanItems.length} Item Terdeteksi
                                </p>
                                <div className="space-y-2 max-h-60 overflow-y-auto custom-scroll">
                                  {scanItems.map((item, idx) => {
                                    const itemCat = ALL_CATS.find(c => c.id === item.categoryId);
                                    return (
                                      <div key={idx} className="bg-white/70 rounded-xl p-2.5 space-y-1.5">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={item.name}
                                            onChange={e => {
                                              const updated = [...scanItems];
                                              updated[idx] = { ...updated[idx], name: e.target.value };
                                              setScanItems(updated);
                                            }}
                                            className="flex-1 text-xs font-semibold text-gray-700 bg-transparent border-none outline-none min-w-0"
                                          />
                                          <span className="text-xs font-bold text-gray-800 whitespace-nowrap">
                                            Rp {formatRupiah(item.price)}
                                          </span>
                                        </div>
                                        <select
                                          value={item.categoryId}
                                          onChange={e => {
                                            const updated = [...scanItems];
                                            updated[idx] = { ...updated[idx], categoryId: e.target.value };
                                            setScanItems(updated);
                                          }}
                                          className="w-full text-[11px] rounded-lg border border-gray-200 bg-white/80 px-2 py-1 text-gray-600 outline-none focus:border-indigo-300"
                                        >
                                          {ALL_CATS.map(c => (
                                            <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                                          ))}
                                        </select>
                                      </div>
                                    );
                                  })}
                                </div>
                                <div className="mt-2 pt-2 border-t border-indigo-100 flex items-center justify-between">
                                  <span className="text-[10px] font-semibold text-indigo-400">Total</span>
                                  <span className="text-xs font-bold text-gray-800">
                                    Rp {formatRupiah(scanItems.reduce((sum, i) => sum + i.price, 0))}
                                  </span>
                                </div>
                              </div>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* Form error */}
                  <AnimatePresence>
                    {formError && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="flex items-center gap-2 bg-red-50 text-red-600 text-sm font-semibold p-3 rounded-2xl mb-4"
                      >
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        {formError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Regular form fields - hidden when scan items exist for expense */}
                  {!(isModalOpen === 'expense' && scanItems.length > 0) && (
                    <>
                      <input
                        placeholder="Keterangan"
                        value={formMerchant}
                        onChange={e => setFormMerchant(e.target.value)}
                        className="glass-input mb-3"
                      />
                      <input
                        type="number"
                        placeholder="Nominal Rp"
                        value={formAmount}
                        onChange={e => setFormAmount(e.target.value)}
                        className="glass-input mb-3"
                      />
                      <select
                        value={formCatId}
                        onChange={e => setFormCatId(e.target.value)}
                        className="glass-select mb-3"
                      >
                        <option value="">Pilih Kategori</option>
                        {ALL_CATS.map(c => (
                          <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                        ))}
                      </select>
                    </>
                  )}

                  {/* Date picker */}
                  <div className="relative mb-5">
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <CalendarDays className="w-4 h-4 text-gray-400" />
                    </div>
                    <input
                      type="date"
                      value={formDate}
                      onChange={e => setFormDate(e.target.value)}
                      className="glass-input !pl-11"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      className={`glass-btn flex-1 ${isModalOpen === 'income' ? 'glass-btn-success' : 'glass-btn-danger'}`}
                      onClick={() => addTx(isModalOpen as 'income' | 'expense')}
                      disabled={saving}
                    >
                      {saving ? (
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      ) : isModalOpen === 'income' ? (
                        <>
                          <Plus className="w-4 h-4" />
                          Simpan Pemasukan
                        </>
                      ) : (
                        <>
                          <Minus className="w-4 h-4" />
                          Simpan Pengeluaran
                        </>
                      )}
                    </button>
                    <button className="glass-btn glass-btn-ghost flex-1" onClick={() => { setIsModalOpen(null); setFormError(''); setScanPreview(null); setScanItems([]); setScanMerchant(''); }}>
                      Batal
                    </button>
                  </div>
                </div>
              )}
              </div>{/* end overflow-y-auto inner */}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-modal-bg fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setDeleteConfirm(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-modal rounded-[24px] p-7 w-full max-w-[340px] text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="glance-h3 text-lg text-gray-800 mb-2">Hapus Transaksi?</h3>
              <p className="text-sm text-gray-400 mb-6">Tindakan ini tidak dapat dibatalkan.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="glass-btn glass-btn-danger flex-1 text-sm"
                >
                  Hapus
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="glass-btn glass-btn-ghost flex-1 text-sm"
                >
                  Batal
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction Detail Modal */}
      <AnimatePresence>
        {detailTx && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-modal-bg fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setDetailTx(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="glass-modal rounded-[28px] p-7 w-full max-w-[400px] relative"
              onClick={e => e.stopPropagation()}
            >
              {/* Close button */}
              <div className="flex justify-end -mt-2 -mr-2 mb-2">
                <button
                  onClick={() => setDetailTx(null)}
                  className="p-2 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>

              {/* Header */}
              <div className="flex items-center gap-3 mb-6">
                {(() => {
                  const cat = getCat(detailTx.categoryId);
                  return (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl"
                      style={{ background: `${cat?.color || '#6B7280'}15` }}
                    >
                      {cat?.icon || '💰'}
                    </div>
                  );
                })()}
                <div>
                  <h2 className="glance-h2 text-lg text-gray-800">{detailTx.merchant}</h2>
                  <span
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{
                      background: detailTx.type === 'income' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: detailTx.type === 'income' ? '#10B981' : '#EF4444',
                    }}
                  >
                    {detailTx.type === 'income' ? 'Pemasukan' : 'Pengeluaran'}
                  </span>
                </div>
              </div>

              {/* Detail rows */}
              <div className="space-y-4">
                {/* Amount */}
                <div className="glass-subtle rounded-2xl p-4">
                  <p className="text-xs text-gray-400 font-medium mb-1">Nominal</p>
                  <p
                    className="glance-h2 text-2xl"
                    style={{ color: detailTx.type === 'income' ? '#10B981' : '#EF4444' }}
                  >
                    {detailTx.type === 'income' ? '+' : '-'}Rp {formatRupiah(detailTx.amount)}
                  </p>
                </div>

                {/* Category */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 font-medium">Kategori</span>
                  {(() => {
                    const cat = getCat(detailTx.categoryId);
                    return (
                      <div className="flex items-center gap-2">
                        <div
                          className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                          style={{ background: `${cat?.color || '#6B7280'}15` }}
                        >
                          {cat?.icon || '💰'}
                        </div>
                        <span className="text-sm font-semibold text-gray-700">{cat?.name || 'Lainnya'}</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Date */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 font-medium">Tanggal</span>
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-sm font-semibold text-gray-700">{formatDate(detailTx.date)}</span>
                  </div>
                </div>

                {/* Created at */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 font-medium">Dibuat</span>
                  <span className="text-xs text-gray-500">
                    {new Date(detailTx.createdAt).toLocaleString('id-ID', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => {
                    setDeleteConfirm(detailTx.id);
                    setDetailTx(null);
                  }}
                  className="glass-btn glass-btn-ghost flex-1 text-sm text-red-500 hover:!bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus
                </button>
                <button
                  onClick={() => setDetailTx(null)}
                  className="glass-btn glass-btn-primary flex-1 text-sm"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 20, x: '-50%' }}
            className="glass-toast fixed bottom-8 left-1/2 z-[60]"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

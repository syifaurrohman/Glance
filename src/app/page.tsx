'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
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
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

import Confetti from 'react-confetti';


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
  updatedAt?: string;

}

interface BudgetItem {
  categoryId: string;
  limit: number;
  startDate?: string; 
  endDate?: string;    
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
    <img
      src="/logo.svg"
      alt="Glance Logo"
      style={{ width: size, height: size, borderRadius: size / 3, objectFit: 'cover', flexShrink: 0 }}
    />
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

  // State untuk menyimpan segmen yang sedang di-hover kursor
  const [hoveredSeg, setHoveredSeg] = useState<{ name: string; amount: number; icon: string } | null>(null);

  const segments = useMemo(() => {
    if (totalExp === 0) return [];
    let offset = 0;
    return Object.entries(categoryTotals).map(([catId, amount]) => {
      const pct = (amount / totalExp) * 100;
      const cat = categories.find(c => c.id === catId);
      const seg = { 
        catId, 
        name: cat?.name || 'Lainnya', 
        icon: cat?.icon || '💰', 
        color: cat?.color || '#6B7280', 
        pct, 
        offset,
        amount 
      };
      offset += pct;
      return seg;
    }).sort((a, b) => b.pct - a.pct);
  }, [categoryTotals, totalExp, categories]);

  if (totalExp === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-6">
        <div className="w-24 h-24 rounded-full glass-subtle flex items-center justify-center mb-3">
          <PieChart className="w-8 h-8 text-gray-300 dark:text-gray-600" />
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500 font-medium">Belum ada pengeluaran</p>
      </div>
    );
  }

  return (
    // Pembungkus utama disetel tetap center secara vertikal dan horizontal
    <div className="flex flex-col items-center justify-center gap-3 select-none w-full h-full pb-2">
      
      {/* Container Diagram Bulat */}
      <div className="relative w-50 h-50 flex items-center justify-center flex-shrink-0">
        <svg 
          viewBox="-3 -3 42 42" 
          className="w-full h-full -rotate-90 drop-shadow-[0_6px_14px_rgba(0,0,0,0.06)]"
        >
          {/* 1. Lingkaran Background / Track bawah */}
          <circle cx="18" cy="18" r="14" fill="transparent" stroke="rgba(0,0,0,0.02)" strokeWidth="6" />

          {/* 2. Segmen Kategori */}
          {[...segments]
            .sort((a, b) => {
              if (hoveredSeg && a.name === hoveredSeg.name) return 1;
              if (hoveredSeg && b.name === hoveredSeg.name) return -1;
              return 0;
            })
            .map((seg) => {
              const isHovered = hoveredSeg && hoveredSeg.name === seg.name;
              return (
                <circle
                  key={seg.catId}
                  cx="18"
                  cy="18"
                  r={isHovered ? 14.8 : 14}
                  fill="transparent"
                  stroke={seg.color}
                  strokeDasharray={`${seg.pct * 0.88} ${100 - seg.pct * 0.88}`}
                  strokeDashoffset={-seg.offset * 0.88}
                  strokeLinecap="butt"
                  className="cursor-pointer transition-all duration-300 ease-out"
                  style={{ 
                    opacity: hoveredSeg ? (isHovered ? 1 : 0.3) : 0.9, 
                    strokeWidth: isHovered ? '8' : '6'
                  }}
                  onMouseEnter={() => setHoveredSeg({ name: seg.name, amount: seg.amount, icon: seg.icon })}
                  onMouseLeave={() => setHoveredSeg(null)}
                />
              );
            })}
        </svg>

        {/* PERBAIKAN UTAMA: Angka Transaksi & Teks di Tengah Lingkaran */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
          {hoveredSeg ? (
            <div className="w-full max-w-[85px] flex flex-col items-center justify-center overflow-hidden">
              {/* Icon kategori aktif */}
              <span className="text-sm mb-0.5 flex-shrink-0">{hoveredSeg.icon}</span>
              {/* Nama kategori dikunci lebarnya dan diberi truncate agar tidak merusak lingkaran */}
              <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wide truncate w-full">
                {hoveredSeg.name}
              </p>
              {/* Ukuran Rupiah disesuaikan jadi text-xs agar muat sempurna di dalam */}
              <p className="text-xs font-black text-red-500 dark:text-red-400 mt-0.5 whitespace-nowrap">
                Rp{formatRupiah(hoveredSeg.amount)}
              </p>
            </div>
          ) : (
            <>
              <p className="text-2xl font-black text-gray-800 dark:text-gray-100 leading-none mb-1">{expenses.length}</p>
              <p className="text-[9px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">Transaksi</p>
            </>
          )}
        </div>
      </div>

      {/* Daftar Kategori di Bawah Diagram (Hanya menampilkan 4 kategori teratas & berposisi center) */}
      <div className="flex flex-wrap justify-center items-center gap-x-4 gap-y-2 mt-2 w-full px-4">
        {segments.slice(0, 4).map((seg) => {
          const isHovered = hoveredSeg && hoveredSeg.name === seg.name;
          return (
            <div 
              key={seg.catId} 
              // Lebar maksimal teks legenda dibatasi agar dipotong titik-titik jika kepanjangan
              className={`flex items-center gap-1.5 text-[11px] font-medium transition-all duration-200 cursor-pointer max-w-[120px] ${
                hoveredSeg && !isHovered ? 'opacity-40 grayscale' : 'opacity-100'
              }`}
              onMouseEnter={() => setHoveredSeg({ name: seg.name, amount: seg.amount, icon: seg.icon })}
              onMouseLeave={() => setHoveredSeg(null)}
            >
              <div 
                className={`w-2.5 h-2.5 rounded-full flex-shrink-0 transition-transform duration-200 ${isHovered ? 'scale-125 shadow-sm' : ''}`}
                style={{ backgroundColor: seg.color }}
              />
              <span className="text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                <span className="flex-shrink-0">{seg.icon}</span>
                <span className={`truncate ${isHovered ? 'text-gray-800 dark:text-gray-200 font-bold' : ''}`}>{seg.name}</span>
              </span>
            </div>
          );
        })}
      </div>

    </div>
  );
} // Batas Akhir Penutup Fungsi Komponen DonutChart

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
      const dayTxs = transactions.filter(t => normalizeDate(t.date) === dayStr);
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

  // Gunakan batas maksimum konstan untuk skala grafik
  const maxValue = Math.max(...dailyData.map(d => Math.max(d.income, d.expense)), 1);
  const hasAnyData = dailyData.some(d => d.income > 0 || d.expense > 0);

  if (!hasAnyData) {
    return (
      <div className="flex flex-col items-center justify-center h-[200px] py-6">
        <BarChart3 className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">Belum ada data 7 hari terakhir</p>
      </div>
    );
  }

  return (
    <div className="relative h-[210px] w-full pt-4 flex flex-col justify-between select-none">
      
      {/* 1. LAYER GRIDS: Garis Panduan Horizontal Belakang */}
      <div className="absolute inset-0 top-7 bottom-8 flex flex-col justify-between pointer-events-none z-0">
        <div className="w-full border-b border-gray-100 dark:border-white/5" />
        <div className="w-full border-b border-gray-100 dark:border-white/5" />
        <div className="w-full border-b border-gray-100 dark:border-white/5" />
        <div className="w-full border-b border-gray-100 dark:border-white/5" />
      </div>

      {/* 2. LAYER UTAMA: Grafik Batang dan Label Nominal */}
      <div className="flex items-end gap-2 h-[170px] relative z-10">
        {dailyData.map((d, i) => (
          <div key={i} className="flex-1 flex gap-1.5 items-end h-full">
            
            {/* KELOMPOK BAR PENGELUARAN (MERAH) */}
            <div className="flex-1 flex flex-col items-center justify-end h-full group">
              {/* Teks nominal tepat di atas bar pengeluaran */}
              <div className="text-[9px] font-bold text-red-500/90 h-4 flex items-end mb-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity whitespace-nowrap">
                {d.expense > 0 ? `${(d.expense / 1000).toFixed(d.expense % 1000 === 0 ? 0 : 1)}k` : ''}
              </div>
              {d.expense > 0 ? (
                <div
                  className="glass-bar w-full rounded-t-lg transition-all duration-500 hover:brightness-105"
                  style={{
                    height: `${Math.max((d.expense / maxValue) * 120, 6)}px`,
                    background: 'linear-gradient(to top, #EF4444, #F87171)',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)'
                  }}
                  title={`Pengeluaran: Rp ${formatRupiah(d.expense)}`}
                />
              ) : (
                <div className="w-full h-1.5 rounded-full bg-red-500/10 dark:bg-red-500/5" />
              )}
            </div>

            {/* KELOMPOK BAR PEMASUKAN (HIJAU) */}
            <div className="flex-1 flex flex-col items-center justify-end h-full group">
              {/* Teks nominal tepat di atas bar pemasukan */}
              <div className="text-[9px] font-bold text-emerald-500/90 h-4 flex items-end mb-1 opacity-0 group-hover:opacity-100 sm:opacity-100 transition-opacity whitespace-nowrap">
                {d.income > 0 ? `${(d.income / 1000).toFixed(d.income % 1000 === 0 ? 0 : 1)}k` : ''}
              </div>
              {d.income > 0 ? (
                <div
                  className="glass-bar w-full rounded-t-lg transition-all duration-500 hover:brightness-105"
                  style={{
                    height: `${Math.max((d.income / maxValue) * 120, 6)}px`,
                    background: 'linear-gradient(to top, #10B981, #34D399)',
                    boxShadow: '0 4px 12px rgba(16, 185, 129, 0.15)'
                  }}
                  title={`Pemasukan: Rp ${formatRupiah(d.income)}`}
                />
              ) : (
                <div className="w-full h-1.5 rounded-full bg-emerald-500/10 dark:bg-emerald-500/5" />
              )}
            </div>

          </div>
        ))}
      </div>

      {/* 3. LAYER BAWAH: Nama-Nama Hari */}
      <div className="flex justify-between items-center gap-2 relative z-10 border-t border-gray-100 dark:border-white/5 pt-1">
        {dailyData.map((d, i) => (
          <div key={i} className="flex-1 text-center">
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-semibold uppercase tracking-wider">
              {d.label}
            </span>
          </div>
        ))}
      </div>

    </div>
  );
}

// --- AUTH SCREEN ---
function AuthScreen({ onAuth, onGoogleLogin }: { onAuth: (email: string, password: string, isLogin: boolean) => Promise<void>; onGoogleLogin: () => Promise<void> }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLogin, setIsLogin] = useState(true);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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

  const handleGoogleLogin = async () => {
    setGoogleLoading(true);
    setError('');
    try {
      await onGoogleLogin();
    } catch {
      setError('Gagal login dengan Google. Coba lagi.');
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="glance-app h-screen overflow-hidden relative flex items-center justify-center">
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
              className="glass-input mb-4"
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

          {/* Divider */}
          <div className="w-full flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400 font-semibold">atau</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {/* Google Login Button */}
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white border-2 border-gray-200 rounded-2xl font-bold text-[14px] text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-all duration-300"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Login dengan Google
              </>
            )}
          </button>

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

/// --- MAIN APP COMPONENT ---
export default function GlanceApp() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  
  // PERBAIKAN 1: Lahirkan dulu state transactions, customCats, dan budgets di paling atas fungsi
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [customCats, setCustomCats] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetItem[]>([]);

  // PERBAIKAN 2: Logika useMemo diletakkan setelah state transactions lahir, sehingga 100% LEGAL & AMAN
  const financialStreak = useMemo(() => {
    if (!transactions || transactions.length === 0) return 0;

    // 1. Ambil semua tanggal unik transaksi (diurutkan dari yang terbaru)
    const dates = transactions
      .map(t => new Date(t.date).toDateString())
      .filter((value, index, self) => self.indexOf(value) === index)
      .map(d => new Date(d))
      .sort((a, b) => b.getTime() - a.getTime());

    if (dates.length === 0) return 0;

    const today = new Date();
    today.setHours(0,0,0,0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    // Jika transaksi terbaru bukan hari ini atau kemarin, streak otomatis putus (0)
    const latestTxDate = dates[0];
    latestTxDate.setHours(0,0,0,0);
    if (latestTxDate.getTime() !== today.getTime() && latestTxDate.getTime() !== yesterday.getTime()) {
      return 0;
    }

    // 2. Hitung berapa hari berurutan ke belakang
    let streak = 1;
    for (let i = 0; i < dates.length - 1; i++) {
      const current = new Date(dates[i]);
      const next = new Date(dates[i + 1]);
      
      current.setDate(current.getDate() - 1);
      current.setHours(0,0,0,0);
      next.setHours(0,0,0,0);

      if (current.getTime() === next.getTime()) {
        streak++;
      } else if (current.getTime() > next.getTime()) {
        break; // Ada hari yang bolong, hitungan stop
      }
    }
    return streak;
  }, [transactions]);

  // LOGIKA AMAN: MEMBUKA LENCANA (BADGES)
  const badges = useMemo(() => {
    const totalSpent = (transactions || [])
      .filter(t => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    const list = [
      { id: '1', name: 'Hemat Pemula', desc: 'Mencatat transaksi pertama', icon: '🌱', unlocked: (transactions || []).length >= 1 },
      { id: '2', name: 'Disiplin 3 Hari', desc: 'Mencapai 3 hari streak mencatat', icon: '🔥', unlocked: financialStreak >= 3 },
      { id: '3', name: 'Raja Budgeting', desc: 'Membuat minimal 3 anggaran belanja', icon: '👑', unlocked: (budgets || []).length >= 3 },
      { id: '4', name: 'Sultan Bijak', desc: 'Total catatan transaksi menyentuh 15 item', icon: '💎', unlocked: (transactions || []).length >= 15 },
    ];

    return list;
  }, [transactions, financialStreak, budgets]);

  // Sisa state pendukung di bawahnya tetap aman berbaris rapi:
  const [isModalOpen, setIsModalOpen] = useState<ModalType>(null);

  const [toast, setToast] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // Saklar untuk memunculkan kembang api
  const [showConfetti, setShowConfetti] = useState(false);

  // Logika otomatis: Tembakkan kembang api saat lencana baru terbuka!
  useEffect(() => {
    const unlockedCount = badges.filter(b => b.unlocked).length;
    if (unlockedCount > 0 && typeof window !== 'undefined') {
      const localKey = `unlocked_badges_count`;
      const prevCount = parseInt(localStorage.getItem(localKey) || '0', 10);
      
      if (unlockedCount > prevCount) {
        setShowConfetti(true); // Nyalakan kembang api!
        localStorage.setItem(localKey, unlockedCount.toString());
        const timer = setTimeout(() => setShowConfetti(false), 5000); // Matikan otomatis setelah 5 detik
        return () => clearTimeout(timer);
      }
    }
  }, [badges]);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [detailTx, setDetailTx] = useState<Transaction | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [budgetStartDate, setBudgetStartDate] = useState('');
  const [budgetEndDate, setBudgetEndDate] = useState('');

  // Form state
  const [formMerchant, setFormMerchant] = useState('');
  const [editTxId, setEditTxId] = useState<string | null>(null);
  const [formAmount, setFormAmount] = useState('');
  const [formCatId, setFormCatId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formCatName, setFormCatName] = useState('');
  const [formCatIcon, setFormCatIcon] = useState('');

  // Budget form
  const [budgetCatId, setBudgetCatId] = useState('');
  const [budgetLimit, setBudgetLimit] = useState('');
  const [budgetEditId, setBudgetEditId] = useState<string | null>(null);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);

  // State untuk mengontrol pop-up informasi akun di sidebar
  const [isProfilePopupOpen, setIsProfilePopupOpen] = useState(false);

  // Fungsi untuk mengeksekusi reset data
   // Fungsi untuk mengeksekusi reset data secara menyeluruh (Cloud + Lokal)
  const handleResetData = async () => {
    if (!user) return;
    
    try {
      // 1. Timpa data di Firebase Firestore menjadi kosong
      await saveData(user.uid, 'transactions', []);
      await saveData(user.uid, 'categories', []);
      await saveData(user.uid, 'budgets', []);

      // 2. Kosongkan state lokal agar layar langsung bersih
      setTransactions([]);
      setCustomCats([]);
      setBudgets([]);

      // 3. Bersihkan juga sisa cache di local storage
      localStorage.clear();

      // 4. Tutup modal & beri notifikasi sukses
      setIsResetModalOpen(false);
      showToast('Semua data berhasil direset! 🧹');
    } catch (error) {
      showToast('Gagal mereset data. Coba lagi.');
    }
  };

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

  // Dashboard time filter state
  const [dashTimeFilter, setDashTimeFilter] = useState<'all' | 'today' | '7days' | 'month' | 'custom'>('all');
  const [dashDateFrom, setDashDateFrom] = useState<string>('');
  const [dashDateTo, setDashDateTo] = useState<string>('');

  const [dashDropdownOpen, setDashDropdownOpen] = useState(false);


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
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
  }, []);
  // --- KEYBOARD EVENT LISTENER (ENTER TO CONFIRM) ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      // 1. Jika Pop-up Keluar sedang terbuka -> ABAIKAN (Keamanan)
      if (logoutConfirm) {
        return; 
      }

      // 2. Jika Modal Konfirmasi Hapus Transaksi terbuka -> Setujui Hapus
      if (deleteConfirm) {
        e.preventDefault();
        handleDelete(deleteConfirm);
        return;
      }

      // 3. Jika Modal Transaksi (Pemasukan/Pengeluaran) terbuka
      if (isModalOpen === 'income' || isModalOpen === 'expense') {
        e.preventDefault();
        addTx(isModalOpen);
        return;
      }

      // 4. Jika Modal Kategori Kustom terbuka -> Simpan Kategori
      if (isModalOpen === 'category') {
        e.preventDefault();
        addCategory();
        return;
      }

      // 5. Jika Modal Detail Transaksi terbuka -> Tutup Detail
      if (detailTx) {
        e.preventDefault();
        setDetailTx(null);
        return;
      }

      // 6. Jika Tab Anggaran aktif dan input sedang diisi -> Simpan Anggaran
      if (activeTab === 'budget' && budgetCatId && budgetLimit) {
        e.preventDefault();
        saveBudget();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    logoutConfirm,
    deleteConfirm,
    isModalOpen,
    detailTx,
    activeTab,
    budgetCatId,
    budgetLimit,
    formMerchant,
    formAmount,
    formCatId,
    formDate,
    formCatName,
    formCatIcon,
    budgetStartDate,
    budgetEndDate,
    transactions,
    customCats,
    budgets,
    user
  ]);


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
  // 1. Menyaring transaksi khusus untuk Dashboard berdasarkan rentang waktu yang dipilih
  const dashFilteredTransactions = useMemo(() => {
    const todayStr = toInputDate(new Date());
    
    return transactions.filter(t => {
      const tDate = normalizeDate(t.date);
      
      if (dashTimeFilter === 'today') {
        return tDate === todayStr;
      }
      
      if (dashTimeFilter === '7days') {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        return tDate >= toInputDate(sevenDaysAgo) && tDate <= todayStr;
      }
      
      if (dashTimeFilter === 'month') {
        const now = new Date();
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        return tDate >= startOfMonth && tDate <= todayStr;
      }
      
      if (dashTimeFilter === 'custom') {
        if (dashDateFrom && tDate < dashDateFrom) return false;
        if (dashDateTo && tDate > dashDateTo) return false;
        return true;
      }
      
      return true; // 'all' - Semua Waktu
    });
  }, [transactions, dashTimeFilter, dashDateFrom, dashDateTo]);

  // 2. Kalkulasi nilai dashboard otomatis menggunakan data yang sudah terfilter
  const totalExp = useMemo(() => dashFilteredTransactions.filter(t => t.type === 'expense').reduce((s, e) => s + e.amount, 0), [dashFilteredTransactions]);
  const totalInc = useMemo(() => dashFilteredTransactions.filter(t => t.type === 'income').reduce((s, e) => s + e.amount, 0), [dashFilteredTransactions]);
  const balance = totalInc - totalExp;

  // Budget spending per category (current month)
  // Budget spending per category (berdasarkan rentang tanggal anggaran)
  const categorySpending = useMemo(() => {
    const spending: Record<string, number> = {};

    transactions.forEach(t => {
      if (t.type !== 'expense') return;
      
      const tDate = normalizeDate(t.date); // Tanggal transaksi (YYYY-MM-DD)
      const budget = budgets.find(b => b.categoryId === t.categoryId);

      if (budget && budget.startDate && budget.endDate) {
        // Jika anggaran memiliki batas tanggal, hitung transaksi di rentang tersebut
        if (tDate >= budget.startDate && tDate <= budget.endDate) {
          spending[t.categoryId] = (spending[t.categoryId] || 0) + t.amount;
        }
      } else {
        // Fallback jika tidak ada tanggal: hitung pengeluaran bulan ini
        const now = new Date();
        const txDate = new Date(t.createdAt);
        if (txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()) {
          spending[t.categoryId] = (spending[t.categoryId] || 0) + t.amount;
        }
      }
    });
    return spending;
  }, [transactions, budgets]);

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

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
  };

  // Add transaction
  // Add atau Edit transaction
  const addTx = async (txType: 'income' | 'expense') => {
    if (!user) return;
    setFormError('');

    // Proses scan nota tetap sama
    if (txType === 'expense' && scanItems.length > 0) {
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
        showToast('Berhasil disimpan! ✨');
        resetForm();
        setIsModalOpen(null);
      } finally {
        setSaving(false);
      }
      return;
    }

    // Validasi form manual
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
      let updatedTx: Transaction[];

      if (editTxId) {
        // MODE EDIT
        updatedTx = transactions.map(t => {
          if (t.id === editTxId) {
            return {
              ...t,
              merchant: formMerchant.trim(),
              amount: Number(formAmount),
              categoryId: formCatId,
              date: dateValue,
              updatedAt: new Date().toISOString(), // Rekam waktu edit
            };
          }
          return t;
        });
      } else {
        // MODE TAMBAH BARU
        const newTx: Transaction = {
          id: 'tx_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9),
          merchant: formMerchant.trim(),
          amount: Number(formAmount),
          type: txType,
          categoryId: formCatId,
          date: dateValue,
          createdAt: new Date().toISOString(),
        };
        updatedTx = [newTx, ...transactions].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      }

      setTransactions(updatedTx);
      await saveData(user.uid, 'transactions', updatedTx);
      showToast(editTxId ? 'Berhasil diperbarui! ✏️' : 'Berhasil disimpan! ✨');
      resetForm();
      setIsModalOpen(null);
    } catch {
      showToast(editTxId ? 'Berhasil diperbarui! ✏️' : 'Berhasil disimpan! ✨');
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
    if (!user || !budgetCatId || !budgetLimit || Number(budgetLimit) <= 0 || !budgetStartDate || !budgetEndDate) {
      showToast('Lengkapi kategori, batas anggaran, dan rentang tanggal.');
      return;
    }
    if (budgetStartDate > budgetEndDate) {
      showToast('Tanggal mulai tidak boleh lebih dari tanggal akhir.');
      return;
    }
    const existing = budgets.filter(b => b.categoryId !== budgetCatId);
    const newBudgets = [...existing, { 
      categoryId: budgetCatId, 
      limit: Number(budgetLimit),
      startDate: budgetStartDate,
      endDate: budgetEndDate 
    }];
    setBudgets(newBudgets);
    saveData(user.uid, 'budgets', newBudgets);
    
    // Reset form
    setBudgetCatId('');
    setBudgetLimit('');
    setBudgetStartDate('');
    setBudgetEndDate('');
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
    setEditTxId(null);
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
    return <AuthScreen onAuth={handleAuth} onGoogleLogin={handleGoogleLogin} />;
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
    <div className="glance-app h-screen overflow-hidden relative flex">
      {/* Background effects */}
      <div className="glance-bg" />
      <div className="glance-orb glance-orb-1" />
      <div className="glance-orb glance-orb-2" />
      <div className="glance-orb glance-orb-3" />

      {/* === SIDEBAR === */}
      {/* === SIDEBAR === */}
      <aside
        className={`h-screen sticky top-0 glass-sidebar flex-shrink-0 flex flex-col relative z-10 hidden lg:flex transition-all duration-300 ease-in-out overflow-hidden ${
          sidebarOpen ? 'w-[260px] p-4' : 'w-[76px] p-4'
        }`}
      >
        {/* Header: Logo + Toggle */}
        <div 
          className="flex items-center h-11 cursor-pointer mb-8 relative flex-shrink-0 group"
          onClick={() => { if (!sidebarOpen) setSidebarOpen(true); }}
          title={!sidebarOpen ? 'Buka sidebar' : undefined}
        >
          {/* Wadah logo pas 44px (w-11) */}
          <div className="w-11 h-11 flex items-center justify-center flex-shrink-0 relative">
            
            {/* 1. Logo Glance (menghilang & mengecil saat di-hover jika sidebar tertutup) */}
            <div className={`transition-all duration-300 flex items-center justify-center absolute inset-0 ${
              !sidebarOpen ? 'group-hover:opacity-0 group-hover:scale-75' : 'opacity-100'
            }`}>
              <GlanceLogo size={38} />
            </div>

            {/* 2. Icon Buka Sidebar (muncul & membesar saat di-hover khusus ketika sidebar tertutup) */}
            {!sidebarOpen && (
              <div className="transition-all duration-300 opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100 absolute inset-0 flex items-center justify-center">
                <PanelLeftOpen className="w-[22px] h-[22px] text-gray-600" />
              </div>
            )}

          </div>

          {/* Teks animasi */}
          <div className={`transition-all duration-300 ease-in-out whitespace-nowrap overflow-hidden flex items-center ${
            sidebarOpen ? 'opacity-100 ml-3 w-auto' : 'opacity-0 ml-0 w-0'
          }`}>
            <h2 className="glance-h2 text-xl text-gray-800">Glance</h2>
          </div>

          {/* Tombol tutup hanya muncul saat terbuka */}
          {sidebarOpen && (
            <button
              onClick={(e) => {
                e.stopPropagation(); // Mencegah memicu onClick milik parent
                setSidebarOpen(false);
              }}
              className="p-1.5 rounded-xl hover:bg-gray-200/50 transition-colors ml-auto flex-shrink-0"
              title="Tutup sidebar"
            >
              <PanelLeftClose className="w-5 h-5 text-gray-500" />
            </button>
          )}
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-2 mb-6 flex-shrink-0">
          <button
            onClick={() => openTxModal('expense')}
            className="glass-btn glass-btn-danger text-sm w-full h-11 flex items-center justify-center !p-0 !gap-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
            title={!sidebarOpen ? 'Pengeluaran' : undefined}
          >
            {/* Ikon berdiri sendiri tanpa bungkus div w-11 */}
            <Minus className="w-[18px] h-[18px] flex-shrink-0" />
            
            {/* Teks dengan margin-left (ml-2) saat terbuka */}
            <div className={`transition-all duration-300 overflow-hidden ${
              sidebarOpen ? 'opacity-100 ml-2 w-auto' : 'opacity-0 w-0 ml-0'
            }`}>
              Pengeluaran
            </div>
          </button>
          
          <button
            onClick={() => openTxModal('income')}
            className="glass-btn glass-btn-success text-sm w-full h-11 flex items-center justify-center !p-0 !gap-0 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
            title={!sidebarOpen ? 'Pemasukan' : undefined}
          >
            <Plus className="w-[18px] h-[18px] flex-shrink-0" />
            <div className={`transition-all duration-300 overflow-hidden ${
              sidebarOpen ? 'opacity-100 ml-2 w-auto' : 'opacity-0 w-0 ml-0'
            }`}>
              Pemasukan
            </div>
          </button>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-200/60 mb-4 flex-shrink-0" />

        {/* Navigation - Scrollable hanya saat terbuka, mencegah scrollbar misterius saat tertutup */}
        <nav className={`flex-1 min-h-0 space-y-1 ${sidebarOpen ? 'overflow-y-auto custom-scroll' : 'overflow-hidden'}`}>
          {navItems.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
              className={`glass-nav flex items-center transition-all duration-300 ease-in-out overflow-hidden cursor-pointer h-11 w-full !p-0 ${
                activeTab === item.id ? 'glass-nav-active' : ''
              }`}
              onClick={() => {
                setActiveTab(item.id);
                if (!sidebarOpen) setSidebarOpen(true);
              }}
              title={!sidebarOpen ? item.label : undefined}
            >
              <div className="w-11 h-11 flex items-center justify-center flex-shrink-0">
                <item.icon className="w-[18px] h-[18px]" />
              </div>
              <div className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${
                sidebarOpen ? 'opacity-100 ml-2' : 'opacity-0 w-0'
              }`}>
                {item.label}
              </div>
            </motion.div>
          ))}
        </nav>

        {/* Divider */}
        <div className="border-t border-gray-200/60 mt-4 mb-4 flex-shrink-0" />

        {/* User info & logout - Bottom */}
        <div className="flex-shrink-0 flex flex-col gap-2 relative">
          
          {/* === POP-UP INFORMASI AKUN MELAYANG (Hanya muncul jika sidebarOpen & pop-up di-klik) === */}
          <AnimatePresence>
            {isProfilePopupOpen && sidebarOpen && (
              <>
                {/* Overlay transparan penutup otomatis saat klik luar */}
                <div 
                  className="fixed inset-0 z-40 cursor-default" 
                  onClick={() => setIsProfilePopupOpen(false)} 
                />
                
                {/* Kotak Informasi Akun */}
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  transition={{ duration: 0.15, ease: "easeOut" }}
                  className="absolute bottom-full left-0 right-0 z-50 mb-2 bg-white dark:bg-[#161925] border border-gray-100 dark:border-white/10 rounded-[24px] p-4 shadow-xl space-y-3 w-full"
                >
                  {/* Header Pop-up mini */}
                  <div className="flex items-center gap-2.5 pb-2 border-b border-gray-100 dark:border-white/5">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {user.email?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-bold text-gray-700 dark:text-gray-200 truncate">
                        {user.email}
                      </p>
                      <p className="text-[9px] text-emerald-500 font-semibold flex items-center gap-0.5">
                        <span className="w-1 h-1 rounded-full bg-emerald-500" /> Terverifikasi
                      </p>
                    </div>
                  </div>

                  {/* Ringkasan Informasi Akun */}
                  <div className="space-y-1.5 text-[10px]">
                    <div className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl">
                      <span className="text-gray-400 font-medium">Total Transaksi</span>
                      <span className="font-bold text-gray-700 dark:text-gray-200">{transactions.length}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 px-2.5 bg-gray-50 dark:bg-gray-800/30 rounded-xl">
                      <span className="text-gray-400 font-medium">Anggaran Aktif</span>
                      <span className="font-bold text-gray-700 dark:text-gray-200">{budgets.length}</span>
                    </div>
                  </div>

                  {/* Tombol Menuju Pengaturan Akun */}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('settings');
                      setIsProfilePopupOpen(false);
                    }}
                    className="w-full py-2 px-3 text-center text-[11px] font-bold text-indigo-500 bg-indigo-500/5 hover:bg-indigo-500 hover:text-white rounded-xl transition-all duration-200"
                  >
                    Kelola Akun Penuh
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* User Card */}
          <div
            className={`flex items-center transition-all duration-300 ease-in-out overflow-hidden cursor-pointer h-11 w-full ${
              sidebarOpen ? 'glass rounded-2xl bg-gray-50/50 dark:bg-gray-800/10' : ''
            }`}
            onClick={() => { 
              if (!sidebarOpen) {
                setSidebarOpen(true); 
              } else {
                setIsProfilePopupOpen(!isProfilePopupOpen); // Membuka pop-up jika sidebar sudah terbuka
              }
            }}
            title={!sidebarOpen ? user.email || '' : undefined}
          >
            <div className="w-11 h-11 flex items-center justify-center flex-shrink-0">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-indigo-400 to-purple-400 flex items-center justify-center text-white text-sm font-bold">
                {user.email?.[0]?.toUpperCase()}
              </div>
            </div>
            <div className={`transition-all duration-300 flex flex-col justify-center whitespace-nowrap overflow-hidden ${
              sidebarOpen ? 'opacity-100 ml-2 w-[140px]' : 'opacity-0 w-0'
            }`}>
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate">{user.email}</p>
            </div>
          </div>

          {/* Logout Button */}
          <button
            onClick={() => setLogoutConfirm(true)}
            className="glass-btn glass-btn-ghost w-full h-11 flex items-center justify-start !p-0 !gap-0 text-red-500 hover:!bg-red-50 transition-all duration-300 ease-in-out overflow-hidden whitespace-nowrap"
            title={!sidebarOpen ? 'Keluar' : undefined}
          >
            {/* Wadah ikon */}
            <div className={`${sidebarOpen ? 'w-10' : 'w-full'} h-11 flex items-center justify-center flex-shrink-0 transition-all duration-300`}>
              <LogOut className="w-[18px] h-[18px]" />
            </div>
            {/* Teks */}
            <div className={`transition-all duration-300 whitespace-nowrap overflow-hidden ${
              sidebarOpen ? 'opacity-100 ml-0' : 'opacity-0 w-0 ml-0'
            }`}>
              Keluar
            </div >
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
              {/* HEADERS DASHBOARD: Layout Fleksibel Sempurna (Responsive) */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  className="mb-6 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6 w-full border-b border-gray-100/10 dark:border-white/5 pb-4"
                >
                  {/* === SECTION: SALAM UTAMA (GREETING) === */}
                  {(() => {
                    const hours = new Date().getHours();
                    let waktuSapaan = "Malam";
                    
                    if (hours >= 4 && hours < 11) waktuSapaan = "Pagii";
                    else if (hours >= 11 && hours < 15) waktuSapaan = "Siang";
                    else if (hours >= 15 && hours < 18) waktuSapaan = "Soree";

                    const emailName = user.email ? user.email.split('@')[0] : "User";
                    const rawFirstWord = emailName.split(/[^a-zA-Z]/)[0]; 
                    const namaPanggilan = rawFirstWord.charAt(0).toUpperCase() + rawFirstWord.slice(1);

                    return (
                      <div className="flex flex-col gap-1 w-full lg:w-auto">
                        <div className="flex items-center gap-2">
                          <h1 className="text-2xl font-black text-gray-800 dark:text-white tracking-tight">
                            {waktuSapaan}, <span className="text-indigo-500">{namaPanggilan}</span>
                          </h1>
                          <motion.span
                            animate={{ rotate: [0, 14, -8, 14, -4, 10, 0, 0] }}
                            transition={{ duration: 2.5, repeat: Infinity, repeatType: "reverse", ease: "easeInOut" }}
                            className="text-2xl inline-block origin-[70%_70%]"
                          >
                            {waktuSapaan === "Malam" ? "🌙" : "👋"}
                          </motion.span>
                        </div>
                        <p className="text-xs text-gray-400 dark:text-gray-500 font-medium whitespace-normal">
                          Yuk, pantau dan rapikan catatan keuanganmu hari ini.
                        </p>
                      </div>
                    );
                  })()}
                    
                  {/* Bagian Kanan: Kontainer Filter Berderet (Rata kiri saat mobile/split, Rata kanan saat fullscreen) */}
                  <div className="flex flex-row flex-wrap items-center justify-start lg:justify-end gap-2 w-full lg:w-auto">
                    
                    {/* Badge Streak */}
                    <div 
                      className="flex items-center gap-1.5 bg-gradient-to-r from-orange-500/10 to-amber-500/10 dark:from-orange-500/20 dark:to-amber-500/20 border border-orange-500/20 text-orange-600 dark:text-orange-400 px-3 py-2 rounded-xl text-xs font-black shadow-sm cursor-default" 
                      title="Streak Pencatatan Keuangan"
                    >
                      <span className="animate-pulse text-sm">⚡</span> 
                      <span>{financialStreak} Hari</span>
                    </div>

                    {/* Pembungkus Tombol Dropdown */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setDashDropdownOpen(!dashDropdownOpen)}
                        className="flex items-center gap-2 bg-white/60 dark:bg-[#161925]/60 backdrop-blur-md border border-gray-200/60 dark:border-white/5 text-xs font-bold py-2 px-3.5 rounded-xl shadow-sm text-gray-700 dark:text-gray-200 hover:bg-white/80 dark:hover:bg-[#161925]/80 transition-all duration-200 whitespace-nowrap select-none"
                      >
                        <span>
                          {dashTimeFilter === 'all' && "📅 Semua"}
                          {dashTimeFilter === 'today' && "☀️ Hari Ini"}
                          {dashTimeFilter === '7days' && "📊 7 Hari"}
                          {dashTimeFilter === 'month' && "🗓️ Bulan Ini"}
                          {dashTimeFilter === 'custom' && "⚙️ Kustom"}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${dashDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                      </button>

                      {/* FLOATING MENU DROPDOWN */}
                      <AnimatePresence>
                        {dashDropdownOpen && (
                          <>
                            <div className="fixed inset-0 z-40" onClick={() => setDashDropdownOpen(false)} />
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -8 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -8 }}
                              transition={{ duration: 0.15, ease: "easeOut" }}
                              className="absolute left-0 lg:right-0 lg:left-auto top-full mt-2 w-48 bg-white/90 dark:bg-[#161925]/95 backdrop-blur-lg border border-gray-100 dark:border-white/10 rounded-2xl shadow-xl p-1 flex flex-col gap-0.5 z-50 overflow-hidden origin-top-left lg:origin-top-right"
                            >
                              {[
                                { id: 'all', label: 'Semua Waktu', icon: '📅' },
                                { id: 'today', label: 'Hari Ini', icon: '☀️' },
                                { id: '7days', label: '7 Hari Terakhir', icon: '📊' },
                                { id: 'month', label: 'Bulan Ini', icon: '🗓️' },
                                { id: 'custom', label: 'Kustom Tanggal', icon: '⚙️' }
                              ].map((opt) => (
                                <button
                                  key={opt.id}
                                  type="button"
                                  onClick={() => {
                                    setDashTimeFilter(opt.id as any);
                                    setDashDropdownOpen(false);
                                  }}
                                  className={`flex items-center gap-2.5 text-left text-xs font-semibold px-3 py-2.5 rounded-xl transition-all duration-150 ${
                                    dashTimeFilter === opt.id
                                      ? 'bg-indigo-500 text-white shadow-md'
                                      : 'text-gray-600 dark:text-gray-200 hover:bg-gray-100/80 dark:hover:bg-white/10 hover:text-gray-900 dark:hover:text-white'
                                  }`}
                                >
                                  <span className="text-sm leading-none shrink-0">{opt.icon}</span>
                                  <span>{opt.label}</span>
                                </button>
                              ))}
                            </motion.div>
                          </>
                        )}
                      </AnimatePresence>
                    </div>

                    {/* Baris 2: Bar Input Kalender Kustom */}
                    {dashTimeFilter === 'custom' && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }} 
                        animate={{ opacity: 1, scale: 1 }} 
                        className="flex flex-row items-center gap-1.5 bg-white/60 dark:bg-[#161925]/60 backdrop-blur-md border border-gray-200/60 dark:border-white/5 rounded-xl p-1 shadow-sm"
                      >
                        <input 
                          type="date" 
                          value={dashDateFrom} 
                          onChange={e => setDashDateFrom(e.target.value)} 
                          className="bg-transparent text-xs font-medium py-1 px-1 outline-none border-none text-gray-700 dark:text-gray-200 [color-scheme:light] dark:[color-scheme:dark] w-[105px]" 
                        />
                        <span className="text-[10px] font-bold text-gray-400">s/d</span>
                        <input 
                          type="date" 
                          value={dashDateTo} 
                          onChange={e => setDashDateTo(e.target.value)} 
                          className="bg-transparent text-xs font-medium py-1 px-1 outline-none border-none text-gray-700 dark:text-gray-200 [color-scheme:light] dark:[color-scheme:dark] w-[105px]" 
                        />
                      </motion.div>
                    )}

                  </div>
                </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-5">
                {/* Hero Balance Card */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 }}
                  className="glass-hero rounded-[28px] p-7 md:col-span-2 lg:col-span-3 flex justify-between items-center min-h-[180px] relative overflow-hidden"
                >
                  {/* Large masked logo background */}
                  <div className="absolute right-5 -bottom-39 opacity-20 pointer-events-none" style={{ width: 310, height: 310 }}>
                    <img src="/logotr.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>

                  <div className="relative z-10">
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
                </motion.div>

                

                {/* === BARIS 1: KARTU PEMASUKAN MODERN === */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.1 }} 
                  className="bg-white/80 dark:bg-[#161925]/60 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-[24px] p-5 shadow-sm flex flex-col h-[340px]"
                >
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950/40 flex items-center justify-center">
                        <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pemasukan</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => openTxModal('income')}
                      className="w-8 h-8 rounded-full bg-emerald-500/10 hover:bg-emerald-500 text-emerald-600 dark:text-emerald-400 hover:text-white flex items-center justify-center transition-all duration-200 shadow-sm group"
                      title="Tambah Pemasukan"
                    >
                      <Plus className="w-[16px] h-[16px] transition-transform duration-200 group-hover:scale-110 group-active:scale-95" />
                    </button>
                  </div>

                  <div className="flex-shrink-0 mb-3">
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 leading-none">
                      +Rp {formatRupiah(totalInc)}
                    </p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1 space-y-2">
                    {dashFilteredTransactions.filter(t => t.type === 'income').length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-60 py-6">
                        <p className="text-[11px] font-semibold text-gray-400">Belum ada pemasukan</p>
                      </div>
                    ) : (
                      dashFilteredTransactions.filter(t => t.type === 'income').map((t) => {
                        const cat = ALL_CATS.find(c => c.id === t.categoryId);
                        return (
                          <div key={t.id} onClick={() => setDetailTx(t)} className="flex items-center justify-between p-2 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 border border-gray-100/50 dark:border-white/5 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-800/40 transition-all duration-150">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm flex-shrink-0">{cat?.icon || '💵'}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{t.merchant}</p>
                                <p className="text-[9px] text-gray-400">{t.date}</p>
                              </div>
                            </div>
                            <span className="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 ml-2 whitespace-nowrap">+{formatRupiah(t.amount)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>

                {/* === BARIS 1: KARTU PENGELUARAN MODERN === */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }} 
                  animate={{ opacity: 1, y: 0 }} 
                  transition={{ delay: 0.15 }} 
                  className="bg-white/80 dark:bg-[#161925]/60 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-[24px] p-5 shadow-sm flex flex-col h-[340px]"
                >
                  <div className="flex items-center justify-between mb-3 flex-shrink-0">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center">
                        <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Pengeluaran</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => openTxModal('expense')}
                      className="w-8 h-8 rounded-full bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-400 hover:text-white flex items-center justify-center transition-all duration-200 shadow-sm group"
                      title="Catat Pengeluaran"
                    >
                      <Minus className="w-[16px] h-[16px] transition-transform duration-200 group-hover:scale-110 group-active:scale-95" />
                    </button>
                  </div>

                  <div className="flex-shrink-0 mb-3">
                    <p className="text-2xl font-black text-red-500 dark:text-red-400 leading-none">
                      -Rp {formatRupiah(totalExp)}
                    </p>
                  </div>

                  <div className="flex-1 min-h-0 overflow-y-auto custom-scroll pr-1 space-y-2">
                    {dashFilteredTransactions.filter(t => t.type === 'expense').length === 0 ? (
                      <div className="h-full flex flex-col items-center justify-center text-center opacity-60 py-6">
                        <p className="text-[11px] font-semibold text-gray-400">Belum ada pengeluaran</p>
                      </div>
                    ) : (
                      dashFilteredTransactions.filter(t => t.type === 'expense').map((t) => {
                        const cat = ALL_CATS.find(c => c.id === t.categoryId);
                        return (
                          <div key={t.id} onClick={() => setDetailTx(t)} className="flex items-center justify-between p-2 rounded-xl bg-gray-50/50 dark:bg-gray-800/20 border border-gray-100/50 dark:border-white/5 cursor-pointer hover:bg-gray-100/60 dark:hover:bg-gray-800/40 transition-all duration-150">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-sm flex-shrink-0">{cat?.icon || '🛍️'}</span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-gray-700 dark:text-gray-200 truncate">{t.merchant}</p>
                                <p className="text-[9px] text-gray-400">{t.date}</p>
                              </div>
                            </div>
                            <span className="text-xs font-extrabold text-red-500 dark:text-red-400 ml-2 whitespace-nowrap">-{formatRupiah(t.amount)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </motion.div>

                {/* === BARIS 1: KARTU DISTRIBUSI === */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white/80 dark:bg-[#161925]/60 backdrop-blur-md border border-white/20 dark:border-white/5 rounded-[24px] p-5 shadow-sm flex flex-col h-[340px]"
                >
                  <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2 flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Distribusi
                  </h3>
                  <div className="flex-1 w-full flex flex-col items-center justify-center pb-4">
                    <DonutChart transactions={dashFilteredTransactions} categories={ALL_CATS} />
                  </div>
                </motion.div>

                {/* === BARIS 2: BAR CHART (Diberi col-span-2 agar melebar luas) === */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.25 }}
                  className="glass rounded-[24px] p-5 md:col-span-2 lg:col-span-2 flex flex-col justify-between min-h-[310px]"
                >
                  <h3 className="glance-h3 text-sm text-gray-500 mb-3 flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-indigo-400" />
                    Tren 7 Hari Terakhir
                  </h3>
                  <div className="flex-1 min-h-0 w-full">
                    <BarChartComponent transactions={transactions} />
                  </div>
                  <div className="flex items-center gap-4 mt-3 justify-center flex-shrink-0">
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

                {/* === BARIS 2: KARTU ANGGARAN BULAN INI (Diberi col-span-1 agar pas di kanan) === */}
                {budgets.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 }}
                    className="glass rounded-[24px] p-5 lg:col-span-1 flex flex-col justify-between min-h-[310px]"
                  >
                    <div>
                      <h3 className="glance-h3 text-sm text-gray-500 mb-3 flex items-center gap-2">
                        <Target className="w-4 h-4 text-indigo-400" />
                        Anggaran
                      </h3>
                      <div className="space-y-3">
                        {budgets.slice(0, 5).map(b => {
                          const cat = ALL_CATS.find(c => c.id === b.categoryId);
                          const spent = categorySpending[b.categoryId] || 0;
                          const pct = b.limit > 0 ? Math.min((spent / b.limit) * 100, 100) : 0;
                          const overBudget = spent > b.limit;
                          return (
                            <div key={b.categoryId}>
                              <div className="flex items-center justify-between mb-1">
                                <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                                  {cat?.icon || '💰'} {cat?.name || 'Lainnya'}
                                </span>
                                <span className={`text-xs font-bold ${overBudget ? 'text-red-500' : 'text-gray-500'}`}>
                                  {formatRupiah(spent)} / {formatRupiah(b.limit)}
                                </span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
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
                      </div>
                    </div>
                    
                    {budgets.length > 5 && (
                      <button
                        type="button"
                        onClick={() => setActiveTab('budget')}
                        className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 flex items-center gap-1 mt-3 self-start"
                      >
                        Lihat Semua <ChevronRight className="w-3 h-3" />
                      </button>
                    )}
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
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <select
                      value={budgetCatId}
                      onChange={e => setBudgetCatId(e.target.value)}
                      className="glass-select !mb-0"
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
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3">
                    <div className="relative">
                      <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 rounded-md shadow-sm">Dari Tanggal</span>
                      <input
                        type="date"
                        value={budgetStartDate}
                        onChange={e => setBudgetStartDate(e.target.value)}
                        className="glass-input !mb-0 pt-3"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute -top-2 left-3 bg-white px-1 text-[10px] font-semibold text-gray-500 rounded-md shadow-sm">Sampai Tanggal</span>
                      <input
                        type="date"
                        value={budgetEndDate}
                        onChange={e => setBudgetEndDate(e.target.value)}
                        className="glass-input !mb-0 pt-3"
                      />
                    </div>
                    <div className="flex gap-2 items-end h-full">
                      <button
                        onClick={saveBudget}
                        className="glass-btn glass-btn-primary text-sm whitespace-nowrap h-[46px]"
                      >
                        {budgetEditId ? 'Perbarui' : 'Simpan'}
                      </button>
                      {budgetEditId && (
                        <button
                          onClick={() => { 
                            setBudgetEditId(null); setBudgetCatId(''); setBudgetLimit(''); 
                            setBudgetStartDate(''); setBudgetEndDate(''); 
                          }}
                          className="glass-btn glass-btn-ghost text-sm h-[46px]"
                        >
                          Batal
                        </button>
                      )}
                    </div>
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
                            
                            {/* BAGIAN TEKS YANG SUDAH DIRAPIKAN (TIDAK DOUBLE) */}
                            <div>
                              <p className="font-bold text-gray-800">{cat?.name || 'Lainnya'}</p>
                              <p className="text-xs text-gray-400">Batas: Rp {formatRupiah(b.limit)}</p>
                              {b.startDate && b.endDate && (
                                <p className="text-[10px] text-indigo-500 font-semibold mt-0.5">
                                  {formatDate(b.startDate)} - {formatDate(b.endDate)}
                                </p>
                              )}
                            </div>
                            
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => {
                                setBudgetEditId(b.categoryId);
                                setBudgetCatId(b.categoryId);
                                setBudgetLimit(String(b.limit));
                                setBudgetStartDate(b.startDate || '');
                                setBudgetEndDate(b.endDate || '');
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
                            <span className="text-xs text-gray-400">Total Terpakai</span>
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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
                
                {/* --- KARTU 1: KATEGORI KUSTOM (YANG SEMPAT HILANG) --- */}
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

    {/* === TUGAS: KARTU LENCANA PENCAPAIAN + CONFETTI (GABUNGAN) === */}
    <div className="bg-white dark:bg-[#161925]/60 backdrop-blur-md border border-gray-100 dark:border-white/5 rounded-[32px] p-6 shadow-sm space-y-4 self-start">
      
      {/* 🎯 KEMBANG API SELEBRASI DITITIPKAN DI SINI */}
      {showConfetti && (
        <Confetti 
          numberOfPieces={180} 
          recycle={false} 
          gravity={0.15}
          style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
        />
      )}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-black text-gray-800 dark:text-white">Lencana Pencapaian</h3>
          <p className="text-[10px] text-gray-400">Selesaikan misi finansial untuk membuka lencana khusus</p>
        </div>
        {/* Streak Badge Melayang dengan Efek Pulse */}
        {/* Streak Badge Melayang dengan Efek Pulse */}
        <div className="inline-flex items-center justify-center gap-1.5 bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 px-3 py-1.5 rounded-full text-[11px] font-black animate-pulse whitespace-nowrap flex-shrink-0">
          <span className="text-sm leading-none flex-shrink-0">⚡</span>
          <span>{financialStreak} Hari Streak</span>
        </div>
      </div>

      {/* Grid Item Lencana (2 Kolom Seimbang) */}
      <div className="grid grid-cols-2 gap-3">
        {badges.map((b) => (
          <div 
            key={b.id} 
            className={`flex items-center gap-3 p-3 border rounded-2xl transition-all duration-300 ${
              b.unlocked 
                ? 'bg-gradient-to-br from-indigo-500/5 to-purple-500/5 border-indigo-500/20 dark:border-indigo-500/30 opacity-100' 
                : 'bg-gray-50/50 dark:bg-gray-900/10 border-gray-100 dark:border-white/5 opacity-40 grayscale'
            }`}
          >
            {/* Wadah Icon Lencana */}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base shadow-inner flex-shrink-0 ${
              b.unlocked ? 'bg-indigo-500/10' : 'bg-gray-100 dark:bg-gray-800'
            }`}>
              {b.icon}
            </div>
            <div className="min-w-0">
              <h4 className="text-[11px] font-black text-gray-800 dark:text-gray-200 truncate">{b.name}</h4>
              <p className="text-[9px] text-gray-400 dark:text-gray-500 leading-tight mt-0.5">{b.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>

                {/* --- KARTU 2: AKUN ANDA (YANG SUDAH ADA POPUP-NYA) --- */}
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

                  

                   {/* === ZONA BERBAHAYA (RESET DATA) === */}
                  <div className="mt-10 border-t border-red-500/20 pt-8">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-red-500/5 dark:bg-red-950/10 border border-red-500/10 rounded-2xl p-5">
                      <div>
                        <h4 className="text-gray-800 dark:text-gray-200 font-bold mb-1">Reset Semua Data</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Tindakan ini akan menghapus seluruh riwayat transaksi, anggaran, dan pengaturan ke kondisi awal. Data tidak dapat dikembalikan.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsResetModalOpen(true)}
                        className="flex-shrink-0 px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-bold rounded-xl shadow-sm shadow-red-500/30 transition-all duration-200 active:scale-95"
                      >
                        Reset ke Awal
                      </button>
                    </div>

                    {/* Tombol dengan fungsi setLogoutConfirm */}
                    {/* DITAMBAHKAN mt-6 DI SINI UNTUK MEMBERI JARAK SPASI */}
                  <button
                    onClick={() => setLogoutConfirm(true)}
                    className="mt-6 glass-btn glass-btn-ghost w-full text-sm text-red-500 hover:!bg-red-50 flex items-center justify-center gap-2 py-3 rounded-2xl"
                  >
                    <LogOut className="w-4 h-4" />
                    Keluar Akun
                  </button>
                 </div>
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
                        {isModalOpen === 'income' 
                          ? (editTxId ? 'Edit Pemasukan' : 'Tambah Pemasukan') 
                          : (editTxId ? 'Edit Pengeluaran' : 'Catat Pengeluaran')}
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
                  <span className="text-sm text-gray-400 font-medium">Dibuat pada</span>
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

                {/* Updated at (Hanya muncul jika pernah diedit) */}
                {detailTx.updatedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400 font-medium">Terakhir diedit</span>
                    <span className="text-xs text-indigo-500 font-semibold">
                      {new Date(detailTx.updatedAt).toLocaleString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </div>

              

              {/* Action buttons */}
              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => {
                    setDeleteConfirm(detailTx.id);
                    setDetailTx(null);
                  }}
                  className="glass-btn glass-btn-ghost flex-1 text-sm text-red-500 hover:!bg-red-50"
                  title="Hapus"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    // Pindah data ke form untuk di-edit
                    setEditTxId(detailTx.id);
                    setFormMerchant(detailTx.merchant);
                    // Gunakan Math.abs agar tanda minus (-) tidak terbawa saat mengedit pengeluaran
                    setFormAmount(String(Math.abs(detailTx.amount))); 
                    setFormCatId(detailTx.categoryId);
                    setFormDate(detailTx.date);
                    setIsModalOpen(detailTx.type);
                    setDetailTx(null); // Tutup detail
                  }}
                  className="glass-btn glass-btn-ghost flex-[2] text-sm text-indigo-500 hover:!bg-indigo-50"
                >
                  <Edit3 className="w-4 h-4" />
                  Edit
                </button>
                <button
                  onClick={() => setDetailTx(null)}
                  className="glass-btn glass-btn-primary flex-[2] text-sm"
                >
                  Tutup
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Logout confirmation modal */}
      <AnimatePresence>
        {logoutConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="glass-modal-bg fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setLogoutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="glass-modal rounded-[24px] p-7 w-full max-w-[340px] text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="glance-h3 text-lg text-gray-800 mb-2">Yakin Ingin Keluar?</h3>
              <p className="text-sm text-gray-400 mb-6">Anda harus memasukkan email dan sandi lagi untuk mengakses data Anda.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setLogoutConfirm(false);
                    signOut(auth);
                  }}
                  className="glass-btn glass-btn-danger flex-1 text-sm"
                >
                  Ya, Keluar
                </button>
                <button
                  onClick={() => setLogoutConfirm(false)}
                  className="glass-btn glass-btn-ghost flex-1 text-sm"
                >
                  Batal
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

      {/* === MODAL KONFIRMASI RESET DATA === */}
      <AnimatePresence>
        {isResetModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
            {/* Latar Belakang Gelap / Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsResetModalOpen(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            
            {/* Kotak Pop-up */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white dark:bg-[#161925] border border-gray-100 dark:border-white/10 rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl flex flex-col items-center text-center"
            >
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5 shadow-inner">
                <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-500" />
              </div>
              
              <h3 className="text-xl font-black text-gray-800 dark:text-white mb-2">
                Yakin Ingin Mereset?
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-8 leading-relaxed">
                Semua data transaksi dan pengaturan akan <b>hilang selamanya</b>. Tindakan ini tidak dapat dibatalkan.
              </p>
              
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setIsResetModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                >
                  Batal
                </button>
                <button
                  onClick={handleResetData}
                  className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/30 transition-colors active:scale-95"
                >
                  Ya, Hapus
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>

  );
}
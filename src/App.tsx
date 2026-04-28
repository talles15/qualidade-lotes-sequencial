import React, { useState, useEffect, useRef } from 'react';
import { Moon, Sun, Upload, LogIn, LogOut, FileSpreadsheet, Loader2, BarChart2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { parseExcelOrCsv, SeedRecord } from './lib/parser';
import { db, auth, handleFirestoreError, OperationType } from './lib/firebase';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged, User } from 'firebase/auth';

interface AppProps {
  theme: 'light' | 'dark';
  toggleTheme: () => void;
}

export default function App({ theme, toggleTheme }: AppProps) {
  const [user, setUser] = useState<User | null>(null);
  const [records, setRecords] = useState<SeedRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCultivar, setSelectedCultivar] = useState<string>('Todas');
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('Todas');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableEmpresas = ['Todas', ...Array.from(new Set(records.map(r => r.empresa || 'Não informada'))).sort()];
  
  const filteredRecords = records.filter(r => selectedEmpresa === 'Todas' || (r.empresa || 'Não informada') === selectedEmpresa);

  // Group records by Cultivar
  const groupedRecords = filteredRecords.reduce((acc, record) => {
    if (!acc[record.cultivar]) acc[record.cultivar] = [];
    acc[record.cultivar].push(record);
    return acc;
  }, {} as Record<string, SeedRecord[]>);

  // Sort each cultivar's records by seqProducao
  Object.keys(groupedRecords).forEach(cultivar => {
    groupedRecords[cultivar].sort((a, b) => a.seqProducao - b.seqProducao);
  });
  
  const availableCultivares = ['Todas', ...Object.keys(groupedRecords).sort()];

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    const docRef = doc(db, 'config', 'database');
    const unsubData = onSnapshot(docRef, (snapshot) => {
      setLoading(false);
      if (snapshot.exists()) {
        const data = snapshot.data();
        if (data.records) {
          try {
            const parsed = JSON.parse(data.records);
            setRecords(parsed);
          } catch (e) {
            console.error("Failed to parse records", e);
            setRecords([]);
          }
        } else {
          setRecords([]);
        }
      } else {
        setRecords([]);
      }
    }, (err) => {
      setLoading(false);
      handleFirestoreError(err, OperationType.GET, 'config/database');
    });

    return () => {
      unsubAuth();
      unsubData();
    };
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') {
        setError('O domínio atual não está autorizado. Configure-o no Firebase console > Authentication > Configurações > Domínios autorizados.');
      } else {
        setError(err.message || 'Erro ao realizar login');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!user) {
      setError('Você precisa estar logado para atualizar os dados.');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const newRecords = parseExcelOrCsv(arrayBuffer);
      
      if (newRecords.length === 0) {
        throw new Error("Nenhum dado válido foi encontrado na planilha.");
      }

      await setDoc(doc(db, 'config', 'database'), {
        records: JSON.stringify(newRecords),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      });
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao processar arquivo.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen text-slate-800 dark:text-slate-200 font-sans selection:bg-indigo-500/30">
      <header className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-[#1E293B] px-4 sm:px-8 py-4 shadow-sm dark:shadow-none">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-500 p-2 rounded-lg hidden sm:block">
              <BarChart2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">Analisador de Qualidade Sementes</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Base de Dados: <span className="text-emerald-600 dark:text-emerald-400 font-mono font-medium">{records.length > 0 ? 'ATIVA' : 'VAZIA'}</span>
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="hidden sm:flex bg-slate-100 dark:bg-slate-800 p-1 rounded-full border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => theme === 'dark' && toggleTheme()}
                className={`px-4 py-1 text-xs rounded-full transition-colors font-semibold ${theme === 'light' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-200'}`}
              >
                Claro
              </button>
              <button
                onClick={() => theme === 'light' && toggleTheme()}
                className={`px-4 py-1 text-xs rounded-full transition-colors font-semibold ${theme === 'dark' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
              >
                Escuro
              </button>
            </div>

            {user && (
              <>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                  className="hidden" 
                  accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                  title="Atualizar Base de Dados"
                >
                  {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span className="hidden sm:inline">{uploading ? 'Processando...' : 'Subir Planilha'}</span>
                </button>
              </>
            )}

            <div className="w-px h-8 bg-slate-200 dark:bg-slate-700 hidden sm:block"></div>

            {user ? (
              <button
                onClick={handleLogout}
                className="p-2 sm:px-3 sm:py-2 flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                title="Sair"
              >
                <LogOut className="w-5 h-5 sm:w-4 sm:h-4" />
                <span className="hidden sm:inline text-sm font-medium">Sair</span>
              </button>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-sm font-medium rounded-lg transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span className="hidden sm:inline">Acesso Admin</span>
              </button>
            )}
            
            <button
               onClick={toggleTheme}
               className="sm:hidden p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            >
               {theme === 'dark' ? <Sun className="w-5 h-5"/> : <Moon className="w-5 h-5"/>}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-200 dark:border-red-900/50 text-sm font-medium">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500 dark:text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-indigo-500" />
            <p className="font-medium">Carregando dados da base...</p>
          </div>
        ) : records.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 text-slate-500 dark:text-slate-400 bg-white dark:bg-[#1E293B] rounded-2xl border border-slate-200 dark:border-slate-700 border-dashed">
            <FileSpreadsheet className="w-12 h-12 mb-4 text-slate-300 dark:text-slate-600" />
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Base de Dados Vazia</h2>
            <p className="text-sm max-w-md text-center mb-6">
              Nenhuma planilha ativa. Faça o login para realizar o upload e visualizar os gráficos.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex flex-col gap-1.5 w-full sm:w-64">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                  Empresa
                </label>
                <div className="relative">
                  <select
                    value={selectedEmpresa}
                    onChange={(e) => setSelectedEmpresa(e.target.value)}
                    className="w-full appearance-none bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow transition-colors"
                  >
                    {availableEmpresas.map(emp => (
                      <option key={emp} value={emp}>{emp}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 w-full sm:w-64">
                <label className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                  Cultivar
                </label>
                <div className="relative">
                  <select
                    value={selectedCultivar}
                    onChange={(e) => setSelectedCultivar(e.target.value)}
                    className="w-full appearance-none bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm font-medium rounded-lg px-4 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-shadow transition-colors"
                  >
                    {availableCultivares.map(cultivar => (
                      <option key={cultivar} value={cultivar}>{cultivar}</option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 dark:text-slate-400">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                  </div>
                </div>
              </div>
            </div>

            {Object.entries(groupedRecords)
              .filter(([cultivar]) => selectedCultivar === 'Todas' || cultivar === selectedCultivar)
              .map(([cultivar, cultivarRecords]: [string, SeedRecord[]]) => {
              const lotCount = cultivarRecords.length;
              const avgVigor = (cultivarRecords.reduce((acc, curr) => acc + curr.vigor, 0) / lotCount).toFixed(1);
              const avgViab = (cultivarRecords.reduce((acc, curr) => acc + curr.viabilidade, 0) / lotCount).toFixed(1);
              const avgAreia = (cultivarRecords.reduce((acc, curr) => acc + curr.areia, 0) / lotCount).toFixed(1);
              
              const validEA72Records = cultivarRecords.filter(r => r.EA72 && r.EA72 > 0);
              const avgEA72 = validEA72Records.length > 0 
                ? (validEA72Records.reduce((acc, curr) => acc + curr.EA72, 0) / validEA72Records.length).toFixed(1)
                : '0.0';

              const totalBags = cultivarRecords.reduce((acc, curr) => acc + (curr.bags || 0), 0);
              
              const CustomXAxisTick = ({ x, y, payload }: any) => {
                const val = payload.value as string;
                const prefix = val.slice(0, -4);
                const suffix = val.slice(-4);
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={0} dy={16} textAnchor="middle" fill={theme === 'dark' ? '#64748b' : '#94a3b8'} className="text-[10px] font-mono">
                      {prefix}
                      <tspan fill={theme === 'dark' ? '#818cf8' : '#6366f1'} fontWeight="bold">{suffix}</tspan>
                    </text>
                  </g>
                );
              };

              return (
                <div key={cultivar} className="bg-white dark:bg-[#1E293B] border border-slate-200 dark:border-slate-700 rounded-2xl p-6 sm:p-8 shadow-sm">
                  <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                        {cultivar.toUpperCase()} <span className="text-slate-400 dark:text-slate-500 font-light ml-2 text-lg sm:inline block mt-1 sm:mt-0">Análise Serial</span>
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Ordenado por sequência de produção (últimos 4 dígitos)
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4 sm:gap-6 w-full sm:w-auto justify-start sm:justify-end mt-4 sm:mt-0">
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4 border-r border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Média Vigor</p>
                        <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{avgVigor}%</p>
                      </div>
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4 border-r border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Média Viab.</p>
                        <p className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400 mt-1">{avgViab}%</p>
                      </div>
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4 border-r border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Média Areia</p>
                        <p className="text-xl sm:text-2xl font-bold text-amber-600 dark:text-amber-500 mt-1">{avgAreia}%</p>
                      </div>
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4 border-r border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Média EA72</p>
                        <p className="text-xl sm:text-2xl font-bold text-fuchsia-600 dark:text-fuchsia-400 mt-1">{avgEA72}%</p>
                      </div>
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4 border-r border-slate-200 dark:border-slate-700">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">BAGS</p>
                        <p className="text-xl sm:text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">{totalBags.toLocaleString()}</p>
                      </div>
                      <div className="flex-1 sm:flex-none text-center px-2 sm:px-4">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider">Total Lotes</p>
                        <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mt-1">{lotCount}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="h-[450px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={cultivarRecords as any[]} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="4 4" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                        <XAxis 
                          dataKey="lote" 
                          axisLine={false}
                          tickLine={false}
                          tick={<CustomXAxisTick />}
                          dy={10}
                        />
                        <YAxis 
                          domain={[50, 100]} 
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: theme === 'dark' ? '#64748b' : '#94a3b8', fontSize: 11, fontWeight: 500 }}
                          dx={-10}
                        />
                        <Tooltip 
                          contentStyle={{ 
                            backgroundColor: theme === 'dark' ? '#0F172A' : '#ffffff',
                            borderColor: theme === 'dark' ? '#334155' : '#e2e8f0',
                            color: theme === 'dark' ? '#f8fafc' : '#0f172a',
                            borderRadius: '12px',
                            boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
                            padding: '12px 16px'
                          }}
                          itemStyle={{ fontSize: '13px', fontWeight: 600, padding: '4px 0' }}
                          labelStyle={{ fontWeight: 'bold', marginBottom: '8px', color: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: '12px' }}
                        />
                        <Legend 
                          wrapperStyle={{ paddingTop: '24px' }}
                          iconType="circle"
                        />
                        <Line 
                          type="monotone" 
                          name="VIGOR" 
                          dataKey="vigor" 
                          stroke="#10B981" 
                          strokeWidth={3}
                          dot={{ r: 4, strokeWidth: 2, fill: theme === 'dark' ? '#1E293B' : '#000000' }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#10B981' }} 
                        />
                        <Line 
                          type="monotone" 
                          name="VIABILIDADE" 
                          dataKey="viabilidade" 
                          stroke="#3b82f6" 
                          strokeWidth={3}
                          dot={{ r: 4, strokeWidth: 2, fill: theme === 'dark' ? '#1E293B' : '#000000' }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#3b82f6' }} 
                        />
                        <Line 
                          type="monotone" 
                          name="AREIA" 
                          dataKey="areia" 
                          stroke="#d97706" 
                          strokeWidth={2}
                          strokeDasharray="6 6"
                          dot={{ r: 4, strokeWidth: 2, fill: theme === 'dark' ? '#1E293B' : '#000000' }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#d97706' }} 
                        />
                        <Line 
                          type="monotone" 
                          name="EA72" 
                          dataKey="EA72" 
                          stroke="#c026d3" 
                          strokeWidth={2}
                          connectNulls={true}
                          dot={{ r: 4, strokeWidth: 2, fill: theme === 'dark' ? '#1E293B' : '#000000' }}
                          activeDot={{ r: 6, strokeWidth: 0, fill: '#c026d3' }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { Check, Plus, Trash2, ChevronLeft, ChevronRight, Trophy, Edit2, X, Save, RotateCcw, Cloud, Flame, Sparkles, LogOut, LogIn, Calendar, List, CalendarRange } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, 
  onSnapshot, arrayUnion, arrayRemove, query, orderBy, writeBatch 
} from 'firebase/firestore';

// ------------------------------------------------------------------
// 🔴 REPLACE THIS CONFIG WITH YOUR OWN FROM FIREBASE CONSOLE
// ------------------------------------------------------------------
const firebaseConfig = {
  apiKey: "AIzaSyCMTJGF6UKhOQBz2dyP2RwhHvaApPU4Uis",
  authDomain: "myhabittracker-f8caa.firebaseapp.com",
  projectId: "myhabittracker-f8caa",
  storageBucket: "myhabittracker-f8caa.firebasestorage.app",
  messagingSenderId: "835976781640",
  appId: "1:835976781640:web:379974265c265e9c585d7d",
  measurementId: "G-QVYNZGRTZF"
};
// ------------------------------------------------------------------

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();
const appId = 'habit-tracker-v1'; 

// --- Chart Components ---
const SimpleLineChart = ({ data, color = "#10b981" }) => {
  if (!data || data.length === 0) return null;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const width = 100;
  const height = 40;
  
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (d.value / maxVal) * height;
    return `${x},${y}`;
  }).join(' ');

  const areaPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <div className="w-full h-32 relative group">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible filter drop-shadow-md">
        <line x1="0" y1="0" x2={width} y2="0" stroke="#f3f4f6" strokeWidth="0.5" />
        <line x1="0" y1={height/2} x2={width} y2={height/2} stroke="#f3f4f6" strokeWidth="0.5" />
        <line x1="0" y1={height} x2={width} y2={height} stroke="#f3f4f6" strokeWidth="0.5" />
        <defs>
          <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.4" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPoints} fill="url(#chartGradient)" />
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
           const x = (i / (data.length - 1)) * width;
           const y = height - (d.value / maxVal) * height;
           return (
             <circle 
                key={i} cx={x} cy={y} r="2" 
                fill="white" stroke={color} strokeWidth="1.5"
                className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
             />
           );
        })}
      </svg>
    </div>
  );
};

const DonutChart = ({ percentage, color = "#10b981" }) => {
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative w-36 h-36 flex items-center justify-center">
      <svg className="transform -rotate-90 w-full h-full filter drop-shadow-sm" viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={radius} stroke="#e5e7eb" strokeWidth="6" fill="transparent" opacity="0.5" />
        <circle 
          cx="20" cy="20" r={radius} stroke={color} strokeWidth="6" fill="transparent" 
          strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
        />
      </svg>
      <div className="absolute flex flex-col items-center">
         <div className="text-xl font-black text-gray-700">{percentage}%</div>
         <div className="text-[8px] uppercase font-bold text-gray-400 tracking-wider">Done</div>
      </div>
    </div>
  );
};

// --- Main Application ---

export default function App() {
  const [user, setUser] = useState(null);
  const [habits, setHabits] = useState([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'day' | 'year'
  
  // CRUD State
  const [editingId, setEditingId] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: '', goal: 31 });
  const [newHabitName, setNewHabitName] = useState('');
  const [newHabitGoal, setNewHabitGoal] = useState(31);

  // --- Auth Logic ---

  useEffect(() => {
    // Listen for auth changes
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      // FIX: If the user is Anonymous (from previous version), sign them out so we can use Google
      if (currentUser && currentUser.isAnonymous) {
        await signOut(auth);
        setUser(null);
      } else {
        setUser(currentUser);
      }
      setLoading(false); 
      if (!currentUser) setHabits([]);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("Login failed: " + error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setUser(null);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  // --- Data Fetching ---

  useEffect(() => {
    if (!user || user.isAnonymous) return;

    const q = query(collection(db, 'artifacts', appId, 'users', user.uid, 'habits'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedHabits = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      fetchedHabits.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      setHabits(fetchedHabits);
    }, (error) => { console.error("Error", error); });

    return () => unsubscribe();
  }, [user]);

  // --- Calendar & Streak Logic ---
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); 
  const day = currentDate.getDate();

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const getDayName = (d) => { const date = new Date(year, month, d); return dayNames[date.getDay()]; };
  const getDateKey = (d) => `${year}-${month}-${d}`;
  
  // Specific date string for Day View
  const getCurrentDateKey = () => `${year}-${month}-${day}`;
  const getFullDateString = () => currentDate.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  // Navigation Logic
  const navigateDate = (direction) => {
    const newDate = new Date(currentDate);
    if (viewMode === 'year') {
      newDate.setFullYear(year + direction);
    } else if (viewMode === 'month') {
      newDate.setDate(1); 
      newDate.setMonth(month + direction);
    } else {
      newDate.setDate(day + direction);
    }
    setCurrentDate(newDate);
  };

  const jumpToToday = () => {
    setCurrentDate(new Date());
  };

  const calculateStreak = (completedDates) => {
    if (!completedDates || completedDates.length === 0) return 0;
    const sortedDates = completedDates.map(d => {
        const [y, m, day] = d.split('-').map(Number);
        return new Date(y, m, day).getTime();
    }).sort((a, b) => b - a);
    let streak = 0;
    let checkDate = new Date();
    checkDate.setHours(0,0,0,0);
    const todayTime = checkDate.getTime();
    const latestCompletion = sortedDates[0];
    if (latestCompletion < todayTime - 86400000) return 0;
    
    let current = sortedDates[0];
    streak = 1;
    for (let i = 1; i < sortedDates.length; i++) {
        const prev = sortedDates[i];
        const diffDays = Math.round((current - prev) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) { streak++; current = prev; } else break;
    }
    return streak;
  };

  // --- Operations ---
  const handleAddHabit = async (e) => {
    e.preventDefault();
    if (!newHabitName.trim() || !user) return;
    try {
      await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'habits'), {
        name: newHabitName, goal: parseInt(newHabitGoal) || daysInMonth, completed: [], createdAt: Date.now()
      });
      setNewHabitName('');
    } catch (err) { console.error(err); }
  };
  const toggleHabit = async (habitId, d, currentCompleted) => {
    if (!user) return;
    const dateKey = getDateKey(d);
    const isCompleted = currentCompleted.includes(dateKey);
    const habitRef = doc(db, 'artifacts', appId, 'users', user.uid, 'habits', habitId);
    try { await updateDoc(habitRef, { completed: isCompleted ? arrayRemove(dateKey) : arrayUnion(dateKey) }); } catch (err) { console.error(err); }
  };
  const toggleHabitDayView = async (habitId, currentCompleted) => {
    if (!user) return;
    const dateKey = getCurrentDateKey();
    const isCompleted = currentCompleted.includes(dateKey);
    const habitRef = doc(db, 'artifacts', appId, 'users', user.uid, 'habits', habitId);
    try { await updateDoc(habitRef, { completed: isCompleted ? arrayRemove(dateKey) : arrayUnion(dateKey) }); } catch (err) { console.error(err); }
  };

  const saveEdit = async (id) => {
    if (!user) return;
    const habitRef = doc(db, 'artifacts', appId, 'users', user.uid, 'habits', id);
    try { await updateDoc(habitRef, { name: editFormData.name, goal: parseInt(editFormData.goal) }); setEditingId(null); } catch (err) { console.error(err); }
  };
  const deleteHabit = async (id) => {
    if (!user) return;
    if (window.confirm("Delete this habit permanently?")) {
      try { await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'habits', id)); } catch (err) { console.error(err); }
    }
  };
  const resetAllData = async () => {
    if (!user) return;
    if (window.confirm("This will wipe all YOUR data. Are you sure?")) {
      const batch = writeBatch(db);
      habits.forEach(habit => batch.delete(doc(db, 'artifacts', appId, 'users', user.uid, 'habits', habit.id)));
      await batch.commit();
    }
  };

  // --- Stats Calculations ---
  const dailyProgressData = useMemo(() => {
    const data = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const dateKey = getDateKey(i);
      const totalCompletedToday = habits.reduce((acc, h) => acc + (h.completed?.includes(dateKey) ? 1 : 0), 0);
      const percentage = habits.length > 0 ? (totalCompletedToday / habits.length) * 100 : 0;
      data.push({ day: i, value: percentage });
    }
    return data;
  }, [habits, daysInMonth, year, month]);

  const weeks = useMemo(() => {
    const weekData = [];
    let currentWeekDays = [];
    let weekIndex = 1;
    for (let i = 1; i <= daysInMonth; i++) {
      currentWeekDays.push(i);
      if (currentWeekDays.length === 7 || i === daysInMonth) {
        weekData.push({ id: weekIndex, days: currentWeekDays });
        currentWeekDays = [];
        weekIndex++;
      }
    }
    return weekData;
  }, [daysInMonth]);

  const totalPotential = habits.length * daysInMonth;
  const totalCompleted = habits.reduce((acc, h) => {
    const count = h.completed?.filter(d => {
       const [y, m] = d.split('-').map(Number);
       return y === year && m === month;
    }).length || 0;
    return acc + count;
  }, 0);
  const overallPercentage = totalPotential > 0 ? ((totalCompleted / totalPotential) * 100).toFixed(1) : 0;

  const topHabits = [...habits].sort((a, b) => {
    const getCount = (h) => h.completed?.filter(d => {
       const [y, m] = d.split('-').map(Number);
       return y === year && m === month;
    }).length || 0;
    return getCount(b) - getCount(a);
  }).slice(0, 5);

  // --- RENDER ---
  
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-pulse text-green-600 font-bold">Connecting...</div></div>;

  if (!user || user.isAnonymous) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="glass-panel max-w-md w-full p-8 rounded-2xl text-center shadow-xl">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <Cloud size={32} className="text-green-600" />
            </div>
          </div>
          <h1 className="text-3xl font-black text-slate-800 mb-2">CloudSync Habits</h1>
          <p className="text-slate-500 mb-8">Track your life, stored securely in the cloud.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-bold py-3 px-6 rounded-xl transition-all shadow-sm hover:shadow-md"
          >
             <LogIn size={20} />
             Sign in with Google
          </button>
          <div className="mt-8 text-xs text-slate-400">Your data is private and tied to your Google account.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-800 font-sans selection:bg-green-100 pb-20">
      
      <div className="max-w-[1800px] mx-auto p-4 md:p-8 space-y-6">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row gap-6 items-stretch">
          
          {/* User & Date Control Card */}
          <div className="flex-1 glass-panel rounded-2xl p-6 flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-green-400 rounded-full blur-[60px] opacity-20 group-hover:opacity-30 transition-opacity pointer-events-none"></div>
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 bg-white/60 p-1.5 rounded-full pr-4 border border-white/50 shadow-sm">
                    {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-10 h-10 rounded-full border-2 border-white shadow-sm" referrerPolicy="no-referrer" />
                    ) : (
                        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center border-2 border-white text-green-700 font-bold">{user.displayName ? user.displayName[0] : 'U'}</div>
                    )}
                    <div className="flex flex-col leading-tight">
                       <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Welcome</span>
                       <span className="text-sm font-bold text-slate-700 truncate max-w-[120px]">{user.displayName}</span>
                    </div>
                </div>
                <button onClick={handleLogout} className="flex items-center gap-2 text-slate-400 hover:text-red-500 transition-colors bg-white/50 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-red-50 z-20 cursor-pointer" title="Sign Out">
                    <LogOut size={14} /> <span className="hidden sm:inline">Logout</span>
                </button>
              </div>
              
              <div className="flex items-baseline justify-between">
                <div>
                   <h1 className="text-3xl font-black text-slate-800 tracking-tight">Habit Tracker</h1>
                   <div className="flex items-center gap-1 text-green-600 mt-1">
                      <Cloud size={14} />
                      <span className="text-xs font-bold uppercase tracking-wider">Cloud Sync Active</span>
                   </div>
                </div>
                
                {/* View Mode Toggle */}
                <div className="flex bg-slate-100 p-1 rounded-lg z-20 relative">
                   <button onClick={() => setViewMode('month')} className={`p-2 rounded-md transition-all ${viewMode === 'month' ? 'bg-white shadow text-green-600' : 'text-slate-400 hover:text-slate-600'}`} title="Month View"><Calendar size={18} /></button>
                   <button onClick={() => setViewMode('day')} className={`p-2 rounded-md transition-all ${viewMode === 'day' ? 'bg-white shadow text-green-600' : 'text-slate-400 hover:text-slate-600'}`} title="Day View"><List size={18} /></button>
                   <button onClick={() => setViewMode('year')} className={`p-2 rounded-md transition-all ${viewMode === 'year' ? 'bg-white shadow text-green-600' : 'text-slate-400 hover:text-slate-600'}`} title="Year View"><CalendarRange size={18} /></button>
                </div>
              </div>
            </div>
            
            {/* Date Navigation */}
            <div className="mt-6 flex flex-col sm:flex-row items-center gap-4 bg-white/50 p-2 rounded-xl border border-white/40 w-full sm:w-fit relative z-10">
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-start">
                  <button onClick={() => navigateDate(-1)} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronLeft size={20}/></button>
                  <div className="text-center min-w-[160px]">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-widest">{viewMode === 'year' ? 'Viewing Year' : year}</div>
                    <div className="text-xl font-bold text-slate-800">
                      {viewMode === 'month' ? monthNames[month] : (viewMode === 'day' ? getFullDateString() : year)}
                    </div>
                  </div>
                  <button onClick={() => navigateDate(1)} className="p-2 hover:bg-white rounded-lg transition-colors"><ChevronRight size={20}/></button>
              </div>
              <button onClick={jumpToToday} className="text-xs font-bold bg-slate-800 text-white px-3 py-1 rounded-lg hover:bg-slate-700 transition-colors">Today</button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="flex-1 glass-panel rounded-2xl p-6 flex items-center gap-6">
            <div className="flex-1">
              <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Daily Trend ({monthNames[month]})</h3>
              <SimpleLineChart data={dailyProgressData} />
            </div>
            <div className="w-px h-24 bg-slate-100 hidden sm:block"></div>
            <div className="flex flex-col items-center">
              <DonutChart percentage={parseFloat(overallPercentage)} />
            </div>
          </div>

          {/* Top Habits Leaderboard */}
          <div className="w-full md:w-80 glass-panel rounded-2xl p-6 flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-slate-800">
              <Trophy size={18} className="text-yellow-500" />
              <h3 className="font-bold text-sm uppercase tracking-wide">Top Performers</h3>
            </div>
            <div className="flex-1 overflow-y-auto space-y-3 no-scrollbar max-h-48">
              {topHabits.map((h, i) => (
                <div key={h.id} className="flex items-center gap-3 text-sm group">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${i===0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{i+1}</div>
                  <span className="flex-1 truncate font-medium text-slate-700">{h.name}</span>
                  <div className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full"><Flame size={10} className="fill-green-500" />{calculateStreak(h.completed)}</div>
                </div>
              ))}
              {topHabits.length === 0 && <div className="text-xs text-slate-400 italic">No data yet</div>}
            </div>
          </div>
        </div>

        {/* MAIN TRACKER CONTENT - SWAPPABLE */}
        {viewMode === 'month' ? (
          <div className="glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-in fade-in duration-500">
            {/* ... Month View Toolbar ... */}
            <div className="p-4 border-b border-slate-100 bg-white/50 flex flex-col sm:flex-row justify-between items-center gap-4">
              <form onSubmit={handleAddHabit} className="flex gap-2 items-center w-full max-w-2xl">
                <div className="relative flex-1">
                  <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input type="text" value={newHabitName} onChange={(e) => setNewHabitName(e.target.value)} placeholder="Create a new habit..." className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-500/20 focus:border-green-500 transition-all shadow-sm" />
                </div>
                <input type="number" value={newHabitGoal} onChange={e=>setNewHabitGoal(e.target.value)} className="w-20 py-2.5 px-2 text-center bg-white border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:border-green-500" placeholder="Goal" title="Monthly Goal" />
                <button disabled={!newHabitName} className="bg-slate-800 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-slate-200 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2"><Sparkles size={16} /> <span className="hidden sm:inline">Add</span></button>
              </form>
              <button onClick={resetAllData} className="text-slate-400 hover:text-red-500 transition-colors p-2" title="Reset All"><RotateCcw size={18}/></button>
            </div>
            {/* ... Month View Grid ... */}
            <div className="overflow-x-auto">
              <div className="min-w-max">
                <div className="flex border-b border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-20">
                  <div className="w-64 p-4 sticky left-0 bg-slate-50/95 backdrop-blur-sm z-30 border-r border-slate-100 shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">Habit</div>
                  <div className="w-20 p-4 text-center border-r border-slate-100">Streak</div>
                  <div className="w-16 p-4 text-center border-r border-slate-100">Goal</div>
                  <div className="flex">{weeks.map(w => (<div key={w.id} className="flex border-r border-slate-100 last:border-none">{w.days.map(d => (<div key={d} className={`w-10 text-center py-2 ${d === day && month === new Date().getMonth() && year === new Date().getFullYear() ? 'bg-green-100' : ''}`}><div className="text-[9px] text-slate-400 mb-0.5">{getDayName(d)[0]}</div><div>{d}</div></div>))}</div>))}</div>
                  <div className="w-32 p-4 text-center sticky right-0 bg-slate-50/95 border-l border-slate-100 z-30">Progress</div>
                </div>
                <div className="divide-y divide-slate-50">
                  {habits.map((habit) => {
                    const completedInMonth = habit.completed?.filter(d => d.startsWith(`${year}-${month}-`)).length || 0;
                    const percent = Math.round((completedInMonth / habit.goal) * 100);
                    const isEditing = editingId === habit.id;
                    const streak = calculateStreak(habit.completed);
                    return (
                      <div key={habit.id} className="flex group hover:bg-slate-50/50 transition-colors">
                        <div className="w-64 p-3 sticky left-0 bg-white group-hover:bg-slate-50/80 transition-colors z-20 border-r border-slate-100 flex items-center justify-between shadow-[4px_0_10px_-4px_rgba(0,0,0,0.05)]">
                           {isEditing ? <input autoFocus type="text" value={editFormData.name} onChange={e=>setEditFormData({...editFormData, name: e.target.value})} className="w-full text-sm p-1 border rounded" /> : <span className="text-sm font-semibold text-slate-700 truncate">{habit.name}</span>}
                           <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                             {isEditing ? <><button onClick={()=>saveEdit(habit.id)} className="text-green-600"><Save size={14}/></button><button onClick={()=>setEditingId(null)} className="text-red-500"><X size={14}/></button></> : <><button onClick={()=>{setEditingId(habit.id); setEditFormData(habit)}} className="text-slate-400 hover:text-blue-500"><Edit2 size={14}/></button><button onClick={()=>deleteHabit(habit.id)} className="text-slate-400 hover:text-red-500"><Trash2 size={14}/></button></>}
                           </div>
                        </div>
                        <div className="w-20 flex items-center justify-center border-r border-slate-100"><div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-md ${streak > 0 ? 'bg-orange-100 text-orange-600' : 'text-slate-300'}`}><Flame size={12} className={streak > 0 ? 'fill-orange-500 animate-pulse' : ''} /> {streak}</div></div>
                        <div className="w-16 flex items-center justify-center text-xs text-slate-500 font-medium border-r border-slate-100 bg-slate-50/30">{isEditing ? <input type="number" value={editFormData.goal} onChange={e=>setEditFormData({...editFormData, goal: e.target.value})} className="w-10 text-center border rounded" /> : habit.goal}</div>
                        <div className="flex items-center">{weeks.map(w => (<div key={w.id} className="flex border-r border-slate-100 h-full last:border-none">{w.days.map(d => {const isChecked = habit.completed?.includes(getDateKey(d));const isWeekend = new Date(year, month, d).getDay() === 0 || new Date(year, month, d).getDay() === 6;return (<div key={d} className={`w-10 h-12 flex items-center justify-center border-r border-slate-50/50 last:border-none relative ${isWeekend ? 'bg-slate-50/30' : ''} ${d === day && month === new Date().getMonth() ? 'bg-yellow-50' : ''}`}><button onClick={() => toggleHabit(habit.id, d, habit.completed)} className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all duration-200 ${isChecked ? 'bg-green-500 border-green-600 text-white shadow-sm shadow-green-200' : 'bg-white border-slate-200 hover:border-green-300'}`}>{isChecked && <Check size={12} strokeWidth={4} />}</button></div>);})}</div>))}</div>
                        <div className="w-32 sticky right-0 bg-white group-hover:bg-slate-50/80 z-20 border-l border-slate-100 p-3 flex flex-col justify-center gap-1 shadow-[-4px_0_10px_-4px_rgba(0,0,0,0.05)]"><div className="flex justify-between text-[10px] font-bold text-slate-500"><span>{Math.min(percent, 100)}%</span><span>{completedInMonth}/{habit.goal}</span></div><div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-green-400 to-green-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${Math.min(percent, 100)}%` }}></div></div></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ) : viewMode === 'day' ? (
          /* --- DAY VIEW --- */
          <div className="glass-panel rounded-2xl shadow-sm border border-slate-200 p-6 animate-in fade-in duration-500">
             <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
               <h2 className="text-2xl font-black text-slate-800">Tasks for {getFullDateString()}</h2>
               <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">{habits.length} Habits Tracked</div>
             </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {habits.map((habit) => {
                   const isChecked = habit.completed?.includes(getCurrentDateKey());
                   const streak = calculateStreak(habit.completed);
                   return (
                     <div key={habit.id} className={`p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between ${isChecked ? 'bg-green-50 border-green-500 shadow-sm' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                        <div className="flex flex-col"><span className={`font-bold text-lg ${isChecked ? 'text-green-800' : 'text-slate-700'}`}>{habit.name}</span><div className="flex items-center gap-2 mt-1"><span className="text-xs font-bold bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full flex items-center gap-1"><Flame size={10} className="fill-orange-500"/> {streak} Day Streak</span></div></div>
                        <button onClick={() => toggleHabitDayView(habit.id, habit.completed)} className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${isChecked ? 'bg-green-500 text-white shadow-lg shadow-green-200 scale-105' : 'bg-slate-100 text-slate-300 hover:bg-slate-200'}`}>{isChecked ? <Check size={28} strokeWidth={4} /> : <div className="w-4 h-4 rounded-full border-2 border-slate-300"></div>}</button>
                     </div>
                   )
                })}
                {habits.length === 0 && <div className="col-span-full text-center py-12 text-slate-400">No habits created yet. Switch to Month view to add some!</div>}
             </div>
          </div>
        ) : (
          /* --- YEAR VIEW --- */
          <div className="glass-panel rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col animate-in fade-in duration-500">
            <div className="p-4 border-b border-slate-100 bg-white/50 flex justify-between items-center">
              <h2 className="font-bold text-slate-700">Yearly Overview - {year}</h2>
              <div className="text-xs text-slate-400">Completion Heatmap</div>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-max">
                {/* Year Header */}
                <div className="flex border-b border-slate-100 bg-slate-50/50 text-xs font-bold text-slate-500 uppercase tracking-wider sticky top-0 z-20">
                  <div className="w-64 p-4 sticky left-0 bg-slate-50/95 backdrop-blur-sm z-30 border-r border-slate-100">Habit</div>
                  {monthNames.map((m, i) => (
                    <div key={m} className="flex-1 min-w-[60px] p-4 text-center border-r border-slate-100">{m.substring(0, 3)}</div>
                  ))}
                </div>
                {/* Year Grid */}
                <div className="divide-y divide-slate-50">
                  {habits.map((habit) => (
                    <div key={habit.id} className="flex hover:bg-slate-50/50">
                      <div className="w-64 p-3 sticky left-0 bg-white z-20 border-r border-slate-100 font-semibold text-sm text-slate-700">{habit.name}</div>
                      {monthNames.map((m, monthIndex) => {
                         const daysInThisMonth = new Date(year, monthIndex + 1, 0).getDate();
                         const completedCount = habit.completed?.filter(d => {
                            const [y, mStr] = d.split('-');
                            return parseInt(y) === year && parseInt(mStr) === monthIndex;
                         }).length || 0;
                         const percent = daysInThisMonth > 0 ? Math.round((completedCount / daysInThisMonth) * 100) : 0;
                         
                         // Heatmap Color Calculation
                         let bgClass = 'bg-slate-50';
                         let textClass = 'text-slate-300';
                         if (percent > 0) { bgClass = 'bg-green-50'; textClass = 'text-green-600'; }
                         if (percent > 25) { bgClass = 'bg-green-100'; textClass = 'text-green-700'; }
                         if (percent > 50) { bgClass = 'bg-green-300'; textClass = 'text-green-800'; }
                         if (percent > 75) { bgClass = 'bg-green-500'; textClass = 'text-white'; }
                         
                         return (
                           <div key={monthIndex} className={`flex-1 min-w-[60px] flex items-center justify-center border-r border-slate-100`}>
                             <div className={`w-10 h-8 rounded-md flex items-center justify-center text-xs font-bold ${bgClass} ${textClass} transition-colors`}>
                               {percent > 0 ? `${percent}%` : '-'}
                             </div>
                           </div>
                         );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="text-center text-xs text-slate-400 font-medium pb-8">
          Crafted with React, Tailwind, and Firebase.
        </div>
      </div>
    </div>
  );
}
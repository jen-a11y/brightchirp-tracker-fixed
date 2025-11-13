
import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';

type EntryRow = {
  id?: string;
  user_id: string;
  user_email: string | null;
  goal_ref: number;
  date: string;
  progress_score: number | null;
  q1: string | null;
  q3: string | null;
  highlights: string | null;
  challenges: string | null;
  experiment: string | null;
};
type GoalRow = { id?: string; user_id: string; title: string; position: number; locked: boolean };

function toISODate(d = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
const goalRefToNumber = (ref: string) => Math.max(1, Math.min(3, Number(ref.split(' ')[1]) || 1));

export default function Home() {
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  const [goals, setGoals] = useState(['','','']);
  const [goalLocked, setGoalLocked] = useState([false,false,false]);
  const [selectedGoal, setSelectedGoal] = useState('Goal 1');
  const [entries, setEntries] = useState<EntryRow[]>([]);

  const [date, setDate] = useState<string>(toISODate());
  const [score, setScore] = useState<number | ''>('');
  const [q1, setQ1] = useState('');
  const [q3, setQ3] = useState('');
  const [hi, setHi] = useState('');
  const [ch, setCh] = useState('');
  const [exp, setExp] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, sess) => setSession(sess));
    return () => sub.subscription.unsubscribe();
  }, []);

  const sendMagic = async () => {
    if (!email) return;
    setSending(true);
    await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    setSending(false);
    alert('Magic link sent! Check your email.');
  };
  const signOut = async () => { await supabase.auth.signOut(); };

  useEffect(() => {
    const load = async () => {
      if (!session?.user) return;
      const user_id = session.user.id;
      const { data: goalsData } = await supabase.from('goals').select('*').eq('user_id', user_id).order('position', { ascending: true });
      if (goalsData && goalsData.length) {
        const titles = ['','','']; const locks = [false,false,false];
        goalsData.forEach((g: any) => { titles[g.position-1] = g.title; locks[g.position-1] = g.locked; });
        setGoals(titles); setGoalLocked(locks);
      }
      const { data: entryData } = await supabase.from('entries').select('*').eq('user_id', user_id).order('date', { ascending: true });
      setEntries(entryData || []);
    };
    load();
  }, [session]);

  const confirmGoal = async (i: number) => {
    if (!session?.user) return;
    const title = goals[i]; if (!title?.trim()) return;
    await supabase.from('goals').upsert({ user_id: session.user.id, title, position: i+1, locked: true });
    const next = [...goalLocked]; next[i] = true; setGoalLocked(next);
  };
  const unlockGoal = async (i: number) => {
    if (!session?.user) return;
    if (!confirm('Edit this goal?')) return;
    await supabase.from('goals').upsert({ user_id: session.user.id, title: goals[i] || '', position: i+1, locked: false });
    const next = [...goalLocked]; next[i] = false; setGoalLocked(next);
  };

  const saveEntry = async () => {
    if (!session?.user) return alert('Please sign in first.');
    if (score === '' || Number(score) < 1 || Number(score) > 10) return alert('Enter a Progress Score 1–10.');
    const row: EntryRow = {
      user_id: session.user.id,
      user_email: session.user.email ?? null,
      goal_ref: goalRefToNumber(selectedGoal),
      date,
      progress_score: Number(score),
      q1, q3,
      highlights: hi || null,
      challenges: ch || null,
      experiment: exp || null
    };
    const { error } = await supabase.from('entries').insert(row);
    if (error) return alert('Error saving entry');
    setEntries(prev => [...prev, row]);
    setDate(toISODate()); setScore(''); setQ1(''); setQ3(''); setHi(''); setCh(''); setExp('');
    alert('Saved!');
  };

  const confirmedGoalOptions = goals.map((g,i)=>({g,i})).filter(({i})=>goalLocked[i]).map(({g,i})=>{
    const preview = g ? ` (${g.slice(0,24)}${g.length>24?'…':''})` : '';
    return { label: `Goal ${i+1}${preview}`, value:`Goal ${i+1}` };
  });
  const chartData = useMemo(() => {
    const ref = goalRefToNumber(selectedGoal);
    return entries.filter(e => e.goal_ref === ref)
      .sort((a,b)=>a.date.localeCompare(b.date))
      .map(e => ({ date: e.date, value: e.progress_score ?? null }));
  }, [entries, selectedGoal]);

  if (!session) return (
    <div className="container">
      <div className="card">
        <div className="header"><h1>BrightChirp Reflection Tracker</h1></div>
        <p className="help">Sign in with your email to begin.</p>
        <label>Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" />
        <button className="btn" onClick={sendMagic} disabled={!email || sending}>{sending?'Sending…':'Send magic link'}</button>
      </div>
    </div>
  );

  return (
    <div className="container">
      <div className="header">
        <h1>Weekly Reflection</h1>
        <button className="btn secondary" onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <div className="header"><h2>Development Goals</h2><span className="badge">Locked goals feed the tracker</span></div>
        {[0,1,2].map(i => (
          <div key={i} className="row">
            <div>
              <label>Goal {i+1}</label>
              <input value={goals[i]} disabled={goalLocked[i]} onChange={e=>{const n=[...goals]; n[i]=e.target.value; setGoals(n);}} placeholder={`Enter development goal ${i+1}`} />
            </div>
            <div>
              {!goalLocked[i] ? <button className="btn" onClick={()=>confirmGoal(i)} disabled={!goals[i]}>Confirm</button>
                               : <button className="btn secondary" onClick={()=>unlockGoal(i)}>Edit</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="row row-3">
          <div>
            <label>Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} />
          </div>
          <div>
            <label>Progress Tracking</label>
            <select className="select" value={selectedGoal} onChange={e=>setSelectedGoal(e.target.value)} disabled={confirmedGoalOptions.length===0}>
              <option value="Goal 1" hidden={confirmedGoalOptions.length>0}>Goal 1</option>
              {confirmedGoalOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <div className="help small">Choose which goal this reflection is about.</div>
          </div>
          <div>
            <label>Progress Score (1–10)</label>
            <input type="number" min={1} max={10} value={score} onChange={e=>setScore(e.target.value===''?'':Number(e.target.value))} placeholder="1–10" />
          </div>
        </div>

        <div className="row">
          <div>
            <label>What progress or momentum did you notice this week?</label>
            <textarea rows={3} value={q1} onChange={e=>setQ1(e.target.value)} />
          </div>
          <div>
            <label>What feedback did you receive indicating how you might be tracking toward your goals?</label>
            <textarea rows={3} value={q3} onChange={e=>setQ3(e.target.value)} />
          </div>
        </div>

        <div className="row row-3">
          <div>
            <label>Highlights from my week were...</label>
            <textarea rows={2} value={hi} onChange={e=>setHi(e.target.value)} />
          </div>
          <div>
            <label>Challenges this week included...</label>
            <textarea rows={2} value={ch} onChange={e=>setCh(e.target.value)} />
          </div>
          <div>
            <label>One small experiment I want to try next week is...</label>
            <textarea rows={2} value={exp} onChange={e=>setExp(e.target.value)} />
          </div>
        </div>

        <div className="hr" />
        <button className="btn" onClick={saveEntry}>Save Reflection</button>
      </div>

      <div className="card">
        <h2>{selectedGoal} Progress Trend</h2>
        <div className="chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis domain={[0,10]} allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="value" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

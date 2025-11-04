
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

type GoalRow = {
  id?: string;
  user_id: string;
  title: string;
  position: number;
  locked: boolean;
};

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

      const { data: goalsData } = await supabase
        .from('goals')
        .select('*')
        .eq('user_id', user_id)
        .order('position', { ascending: true });

      if (goalsData && goalsData.length) {
        const titles = ['','','']; const locks = [false,false,false];
        goalsData.forEach((g: any) => { titles[g.position-1] = g.title; locks[g.position-1] = g.locked; });
        setGoals(titles); setGoalLocked(locks);
      }

      const { data: entryData } = await supabase
        .from('entries')
        .select('*')
        .eq('user_id', user_id)
        .order('date', { ascending: true });

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

  const addEntry = async () => {
    if (!session?.user) return alert('Please sign in first.');
    const user_id = session.user.id;
    const user_email = session.user.email ?? null;
    const goal_ref = goalRefToNumber(selectedGoal);
    const row = {
      user_id, user_email, goal_ref,
      date: toISODate(),
      progress_score: null,
      q1: '', q3: '', highlights: '', challenges: '', experiment: ''
    };
    const { error } = await supabase.from('entries').insert(row);
    if (error) alert('Error saving entry');
  };

  const chartData = useMemo(() => {
    const ref = goalRefToNumber(selectedGoal);
    return entries.filter(e => e.goal_ref === ref)
      .map(e => ({ date: e.date, value: e.progress_score ?? null }));
  }, [entries, selectedGoal]);

  if (!session) return (
    <div style={{maxWidth:520, margin:'60px auto'}} className='card'>
      <h2>BrightChirp Reflection Tracker</h2>
      <p>Sign in with your email to begin.</p>
      <label>Email</label>
      <input type='email' value={email} onChange={e=>setEmail(e.target.value)} />
      <button onClick={sendMagic} disabled={!email || sending}>{sending?'Sending…':'Send magic link'}</button>
    </div>
  );

  return (
    <div style={{maxWidth:800, margin:'20px auto', padding:20}}>
      <div className='card'>
        <h2>Development Goals</h2>
        {[0,1,2].map(i => (
          <div key={i}>
            <label>Goal {i+1}</label>
            <input value={goals[i]} disabled={goalLocked[i]} onChange={e=>{const next=[...goals];next[i]=e.target.value;setGoals(next)}} />
            {!goalLocked[i]
              ? <button onClick={()=>confirmGoal(i)} disabled={!goals[i]}>Confirm</button>
              : <button className='secondary' onClick={()=>unlockGoal(i)}>Edit</button>}
          </div>
        ))}
      </div>
      <div className='card'>
        <h2>Weekly Reflection</h2>
        <label>Progress Score (1–10)</label>
        <input type='number' min={1} max={10} />
        <label>What progress or momentum did you notice this week?</label>
        <textarea rows={2}></textarea>
        <label>What feedback did you receive indicating how you might be tracking toward your goals?</label>
        <textarea rows={2}></textarea>
        <label>Highlights from my week were...</label>
        <textarea rows={2}></textarea>
        <label>Challenges this week included...</label>
        <textarea rows={2}></textarea>
        <label>One small experiment I want to try next week is...</label>
        <textarea rows={2}></textarea>
        <button onClick={addEntry}>Save Reflection</button>
      </div>
      <div className='card'>
        <h2>{selectedGoal} Progress Trend</h2>
        <ResponsiveContainer width='100%' height={200}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray='3 3' />
            <XAxis dataKey='date' /><YAxis domain={[0,10]} />
            <Tooltip /><Line type='monotone' dataKey='value' stroke='#2563eb' />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

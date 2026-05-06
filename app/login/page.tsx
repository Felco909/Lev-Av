'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Truck, Mail, Lock, User, Eye, EyeOff } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignup) {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, fullName }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data?.error ?? 'Ошибка регистрации'); setLoading(false); return; }
        // auto-login after signup
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.ok) { router.replace('/dashboard'); } else { setError('Ошибка входа'); }
      } else {
        const result = await signIn('credentials', { email, password, redirect: false });
        if (result?.ok) { router.replace('/dashboard'); } else { setError('Неверный email или пароль'); }
      }
    } catch {
      setError('Ошибка соединения');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-blue-100 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-4">
            <Truck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900">TMS Система</h1>
          <p className="text-sm text-muted-foreground mt-1">Управление заявками и логистикой</p>
        </div>
        <div className="bg-white rounded-xl shadow-lg p-8">
          <h2 className="text-lg font-semibold mb-6">{isSignup ? 'Регистрация' : 'Вход в систему'}</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isSignup && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="ФИО" value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition" required />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition" required />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input type={showPwd ? 'text' : 'password'} placeholder="Пароль" value={password} onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-10 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition" required />
              <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {error && <p className="text-sm text-red-500 bg-red-50 p-2 rounded">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full py-2.5 bg-primary text-white rounded-lg font-medium text-sm hover:bg-primary/90 disabled:opacity-60 transition">
              {loading ? 'Загрузка...' : isSignup ? 'Зарегистрироваться' : 'Войти'}
            </button>
          </form>
          <p className="text-center text-sm text-muted-foreground mt-4">
            {isSignup ? 'Уже есть аккаунт?' : 'Нет аккаунта?'}{' '}
            <button onClick={() => { setIsSignup(!isSignup); setError(''); }} className="text-primary font-medium hover:underline">
              {isSignup ? 'Войти' : 'Регистрация'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

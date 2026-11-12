import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import type { Recipe, Staff, Ingredient } from './types'
import { OperationsPanel } from './OperationsPanel'

type Tab = 'recipes' | 'schedule' | 'team' | 'settings'
const nav: { id: Tab; title: string; icon: string }[] = [
  { id: 'recipes', title: 'Техкарты', icon: '◈' },
  { id: 'schedule', title: 'График', icon: '▦' },
  { id: 'team', title: 'Команда', icon: '♙' },
  { id: 'settings', title: 'Настройки', icon: '⚙' },
]
type RecipeDraft = { name: string; category: string; ingredients: Ingredient[]; preparation: string; yield: number; vessel: string; cost: number; price: number; note: string }
const blank = (): RecipeDraft => ({ name: '', category: 'Коктейли', ingredients: [{ name: '', amount: '', unit: 'мл' }], preparation: '', yield: 0, vessel: '', cost: 0, price: 0, note: '' })

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [staff, setStaff] = useState<Staff | null>(null)
  const [starting, setStarting] = useState(true)
  const [splashVisible, setSplashVisible] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('Все')
  const [tab, setTab] = useState<Tab>('recipes')
  const [selected, setSelected] = useState<Recipe | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editing, setEditing] = useState<Recipe | null>(null)
  const [draft, setDraft] = useState<RecipeDraft>(blank())
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [profile, setProfile] = useState<{theme:string;color_mode:string}>({theme:'green',color_mode:'dark'})
  const manager = staff?.role === 'manager'
  const loadProfile = useCallback(async (staffId: string) => {
    const { data } = await supabase.from('profiles').select('theme,color_mode').eq('staff_id', staffId).maybeSingle()
    if (data) setProfile({ theme: data.theme || 'green', color_mode: data.color_mode || 'dark' })
    else { const { data: created } = await supabase.from('profiles').upsert({staff_id:staffId}).select('theme,color_mode').single(); if (created) setProfile({theme:created.theme || 'green',color_mode:created.color_mode || 'dark'}) }
  }, [])

  const loadStaff = useCallback(async (userId: string) => {
    const { data, error } = await supabase.from('staff').select('id,name,username,role,active,auth_user_id').eq('auth_user_id', userId).eq('active', true).maybeSingle()
    if (error) throw error
    if (!data) throw new Error('Нет активной записи сотрудника для этой учётной записи.')
    setStaff(data as Staff)
  }, [])
  const loadRecipes = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('recipes').select('*').order('name')
    if (error) setMessage(error.message)
    else setRecipes((data ?? []) as Recipe[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const playOpeningSound = () => {
      const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!AudioContextClass) return
      const context = new AudioContextClass()
      const start = () => {
        const now = context.currentTime
        const master = context.createGain()
        master.gain.setValueAtTime(0.0001, now)
        master.gain.exponentialRampToValueAtTime(0.12, now + 0.035)
        master.gain.exponentialRampToValueAtTime(0.0001, now + 1.15)
        master.connect(context.destination)
        ;[523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
          const oscillator = context.createOscillator()
          const gain = context.createGain()
          const at = now + index * 0.105
          oscillator.type = 'sine'
          oscillator.frequency.setValueAtTime(frequency, at)
          gain.gain.setValueAtTime(0.0001, at)
          gain.gain.exponentialRampToValueAtTime(index === 3 ? 0.55 : 0.32, at + 0.025)
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.72)
          oscillator.connect(gain)
          gain.connect(master)
          oscillator.start(at)
          oscillator.stop(at + 0.76)
        })
        window.setTimeout(() => { void context.close() }, 1500)
      }
      if (context.state === 'running') start()
      else void context.resume().then(start).catch(() => { void context.close() })
    }
    let played = false
    const playOnce = () => {
      if (played) return
      played = true
      playOpeningSound()
      window.removeEventListener('pointerdown', playOnce)
      window.removeEventListener('keydown', playOnce)
    }
    // Browsers may block sound until the first user gesture.
    playOnce()
    window.addEventListener('pointerdown', playOnce, { once: true })
    window.addEventListener('keydown', playOnce, { once: true })
    const splashTimer = window.setTimeout(() => setSplashVisible(false), 5000)
    return () => {
      window.clearTimeout(splashTimer)
      window.removeEventListener('pointerdown', playOnce)
      window.removeEventListener('keydown', playOnce)
    }
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      if (data.session) {
        setSession(data.session)
        try { await loadStaff(data.session.user.id) } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка профиля') }
      }
      if (active) setStarting(false)
    })
    const { data: auth } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (!next) setStaff(null)
    })
    return () => { active = false; auth.subscription.unsubscribe() }
  }, [loadStaff])
  useEffect(() => { if (session && staff) { void loadRecipes(); void loadProfile(staff.id) } }, [session, staff, loadRecipes, loadProfile])

  const categories = useMemo(() => ['Все', ...Array.from(new Set(recipes.map(r => r.category).filter(Boolean))).sort()], [recipes])
  const shown = useMemo(() => recipes.filter(r => (category === 'Все' || r.category === category) && [r.name, r.category, ...(r.ingredients ?? []).map(i => i.name)].join(' ').toLocaleLowerCase('ru').includes(query.toLocaleLowerCase('ru'))), [recipes, category, query])

  async function signIn(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const id = username.trim().toLowerCase()
      if (!id || !password) throw new Error('Введите логин и пароль.')
      const { data, error } = await supabase.auth.signInWithPassword({ email: id.includes('@') ? id : id + '@barapp.invalid', password })
      if (error) throw error
      await loadStaff(data.user.id); setSession(data.session); setPassword('')
    } catch (e) {
      await supabase.auth.signOut(); setSession(null); setStaff(null)
      setError(e instanceof Error ? e.message : 'Не удалось войти.')
    } finally { setBusy(false) }
  }
  async function signOut() { await supabase.auth.signOut(); setSession(null); setStaff(null); setRecipes([]) }

  function createRecipe() { setEditing(null); setDraft(blank()); setSelected(null); setEditorOpen(true) }
  function editRecipe(recipe: Recipe) {
    setEditing(recipe); setDraft({ name: recipe.name, category: recipe.category, ingredients: recipe.ingredients ?? [], preparation: recipe.preparation ?? '', yield: recipe.yield ?? 0, vessel: recipe.vessel ?? '', cost: recipe.cost ?? 0, price: recipe.price ?? 0, note: recipe.note ?? '' }); setSelected(null); setEditorOpen(true)
  }
  function changeIngredient(index: number, key: keyof Ingredient, value: string) {
    setDraft(old => ({ ...old, ingredients: old.ingredients.map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  }
  async function saveRecipe(e: FormEvent) {
    e.preventDefault(); setSaving(true); setMessage('')
    const values = { ...draft, ingredients: draft.ingredients.filter(i => i.name.trim()) }
    try {
      const result = editing
        ? await supabase.from('recipes').update({ ...values, updated_at: new Date().toISOString() }).eq('id', editing.id)
        : await supabase.from('recipes').insert({ ...values, id: crypto.randomUUID() })
      if (result.error) throw result.error
      setEditorOpen(false); await loadRecipes(); setMessage(editing ? 'Техкарта обновлена' : 'Техкарта создана')
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Ошибка сохранения') }
    finally { setSaving(false) }
  }

  if (splashVisible) return <div className="studio-splash"><div className="splash-grain"/><div className="splash-content"><div className="splash-emblem"><img src="/BAR-APP/icon.svg" alt="BAR ASSIST"/></div><div className="studio-name">studio Samuray_021</div><div className="splash-rule"/><div className="splash-brand">BAR ASSIST</div><div className="splash-caption">BAR MANAGEMENT SYSTEM</div></div><div className="splash-bottom">CRAFTED FOR THE BAR</div></div>
  if (starting) return <div className="boot"><img className="brand-image boot-logo" src="/BAR-APP/icon.svg" alt="BAR ASSIST"/><p>Подготовка BAR ASSIST…</p></div>
  if (!session || !staff) return <main className="login-screen"><div className="login-card">
    <div className="brand-lockup"><img className="brand-image" src="/BAR-APP/icon.svg" alt="BAR ASSIST"/><div><strong>BAR ASSIST</strong><small>РАБОЧЕЕ ПРОСТРАНСТВО БАРА</small></div></div>
    <div className="login-copy"><span className="eyebrow">СИСТЕМА УПРАВЛЕНИЯ</span><h1>Работа бара.<br/><em>Без хаоса.</em></h1><p>Техкарты, команда и процессы смены — в одном месте.</p></div>
    <form className="login-form" onSubmit={signIn}><label>Логин<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} placeholder="Введите логин"/></label><label>Пароль<input type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Введите пароль"/></label>{error && <div className="error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy ? 'Входим…' : 'Войти в приложение'}</button></form>
    <div className="login-foot">ДОСТУП ТОЛЬКО ДЛЯ СОТРУДНИКОВ</div>
  </div></main>

  return <div className={'app-shell theme-' + profile.color_mode + ' accent-' + profile.theme}>
    <header className="topbar"><div className="brand-lockup compact"><img className="brand-image" src="/BAR-APP/icon.svg" alt="BAR ASSIST"/><div><strong>BAR ASSIST</strong><small>by studio Samuray_021</small></div></div><div className="user-area"><div className="user-avatar">{staff.name.slice(0,1).toUpperCase()}</div><div className="user-meta"><b>{staff.name}</b><small>{manager ? 'Управляющий' : 'Сотрудник'}</small></div><button className="icon-btn" onClick={signOut} aria-label="Выйти">↗</button></div></header>
    <main className="workspace"><aside className="sidebar"><div className="side-label">РАЗДЕЛЫ</div>{nav.map(n => <button key={n.id} className={'nav-item ' + (tab === n.id ? 'active' : '')} onClick={() => setTab(n.id)}><span>{n.icon}</span>{n.title}{n.id === 'recipes' && <small>{recipes.length}</small>}</button>)}<div className="sidebar-bottom"><span className="status-dot"/> База данных подключена</div></aside>
      <section className="content">{tab === 'recipes' ? <>
        <div className="page-heading"><div><span className="eyebrow">БАЗА БАРА / РЕЦЕПТУРЫ</span><h1>Технологические карты</h1><p>Единый стандарт приготовления и подачи.</p></div>{manager && <button className="primary-btn add-btn" onClick={createRecipe}>＋ Новая техкарта</button>}</div>
        <div className="stats-row"><div className="stat-card"><small>ВСЕГО ПОЗИЦИЙ</small><strong>{recipes.length}</strong></div><div className="stat-card"><small>КАТЕГОРИЙ</small><strong>{categories.length - 1}</strong></div><div className="stat-card"><small>РЕЗУЛЬТАТЫ</small><strong>{shown.length}</strong></div></div>
        <div className="toolbar"><div className="search-box"><span>⌕</span><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию или ингредиенту"/></div><button className="subtle-btn" onClick={() => { setQuery(''); setCategory('Все'); void loadRecipes() }}>↻ Обновить</button></div>
        <div className="category-row">{categories.map(c => <button key={c} className={'category-chip ' + (category === c ? 'chosen' : '')} onClick={() => setCategory(c)}>{c}</button>)}</div>
        {message && <div className="notice">{message}<button onClick={() => setMessage('')}>×</button></div>}
        {loading ? <div className="empty-state">Загружаем техкарты…</div> : shown.length ? <div className="recipe-grid">{shown.map(r => <button className="recipe-card" key={r.id} onClick={() => setSelected(r)}><div className="recipe-card-top"><span className="recipe-category">{r.category}</span><span className="card-arrow">↗</span></div><h3>{r.name}</h3><p>{(r.ingredients ?? []).slice(0,3).map(i => i.name).join(' · ') || 'Состав не указан'}</p><div className="recipe-card-foot"><span>{r.yield ? 'Выход ' + r.yield + ' мл' : 'Технологическая карта'}</span><b>{r.price ? r.price + ' ₽' : 'Подробнее'}</b></div></button>)}</div> : <div className="empty-state"><b>Ничего не найдено</b><span>Измените запрос или категорию.</span></div>}
      </> : <OperationsPanel tab={tab} staff={staff} manager={manager} profile={profile} onProfileChange={setProfile} onMessage={setMessage} />}</section>
    </main>
    <nav className="mobile-nav">{nav.map(n => <button key={n.id} className={'mobile-item ' + (tab === n.id ? 'active' : '')} onClick={() => setTab(n.id)}><span>{n.icon}</span><small>{n.title}</small></button>)}</nav>
    {selected && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null) }}><section className="detail-panel"><button className="close-btn" onClick={() => setSelected(null)}>×</button><span className="eyebrow">{selected.category}</span><h2>{selected.name}</h2><div className="detail-metrics"><div><small>ВЫХОД</small><b>{selected.yield || '—'} {selected.yield ? 'мл' : ''}</b></div><div><small>ПОСУДА</small><b>{selected.vessel || '—'}</b></div><div><small>ЦЕНА</small><b>{selected.price ? selected.price + ' ₽' : '—'}</b></div></div><h3>Ингредиенты</h3><div className="ingredient-list">{(selected.ingredients ?? []).map((i, n) => <div key={n}><span>{i.name}</span><b>{i.amount}{i.unit ? ' ' + i.unit : ''}</b></div>)}</div><h3>Приготовление</h3><p className="preparation">{selected.preparation || 'Способ приготовления не указан.'}</p>{selected.note && <div className="note-box">{selected.note}</div>}{manager && <div className="detail-actions"><button className="subtle-btn" onClick={() => editRecipe(selected)}>Редактировать</button></div>}</section></div>}
    {editorOpen && <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) setEditorOpen(false) }}><form className="editor-panel" onSubmit={saveRecipe}><button type="button" className="close-btn" onClick={() => setEditorOpen(false)}>×</button><span className="eyebrow">УПРАВЛЕНИЕ РЕЦЕПТУРОЙ</span><h2>{editing ? 'Редактировать техкарту' : 'Новая техкарта'}</h2>
      <label>Название<input required value={draft.name} onChange={e => setDraft({...draft,name:e.target.value})}/></label><label>Категория<input required value={draft.category} onChange={e => setDraft({...draft,category:e.target.value})}/></label><div className="editor-label">Ингредиенты</div>
      {draft.ingredients.map((i,n) => <div className="ingredient-edit" key={n}><input placeholder="Ингредиент" value={i.name} onChange={e => changeIngredient(n,'name',e.target.value)}/><input placeholder="Кол-во" value={i.amount} onChange={e => changeIngredient(n,'amount',e.target.value)}/><input placeholder="Ед." value={i.unit} onChange={e => changeIngredient(n,'unit',e.target.value)}/><button type="button" onClick={() => setDraft({...draft,ingredients:draft.ingredients.filter((_,j)=>j!==n)})}>×</button></div>)}
      <button type="button" className="subtle-btn" onClick={() => setDraft({...draft,ingredients:[...draft.ingredients,{name:'',amount:'',unit:'мл'}]})}>＋ Добавить ингредиент</button>
      <label>Приготовление<textarea rows={4} value={draft.preparation} onChange={e => setDraft({...draft,preparation:e.target.value})}/></label><div className="editor-two"><label>Выход, мл<input type="number" value={draft.yield} onChange={e => setDraft({...draft,yield:Number(e.target.value)})}/></label><label>Посуда<input value={draft.vessel} onChange={e => setDraft({...draft,vessel:e.target.value})}/></label><label>Себестоимость<input type="number" step="0.01" value={draft.cost} onChange={e => setDraft({...draft,cost:Number(e.target.value)})}/></label><label>Цена<input type="number" step="0.01" value={draft.price} onChange={e => setDraft({...draft,price:Number(e.target.value)})}/></label></div><label>Примечание<textarea rows={2} value={draft.note} onChange={e => setDraft({...draft,note:e.target.value})}/></label><div className="editor-actions"><button type="button" className="subtle-btn" onClick={() => setEditorOpen(false)}>Отмена</button><button className="primary-btn" disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></div></form></div>}
  </div>
}

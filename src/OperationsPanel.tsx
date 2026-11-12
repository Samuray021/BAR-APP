import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Staff } from './types'
import { supabase } from './lib/supabase'

type Tab = 'schedule' | 'team' | 'settings'
type Profile = { theme: string; color_mode: string }
type Props = { tab: Tab; staff: Staff; manager: boolean; profile: Profile; onProfileChange: (p: Profile) => void; onMessage: (s: string) => void }
type Shift = { id: string; staff_id: string; starts_at: string; ends_at: string; note: string; staff?: {name:string}|null }

const pad=(n:number)=>String(n).padStart(2,'0')
const dateKey=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
const monday=(d:Date)=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-((x.getDay()+6)%7));return x}
const weekEnd=(d:Date)=>{const x=new Date(d);x.setDate(x.getDate()+7);return x}
const monthStart=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),1)
const nextMonth=(d:Date)=>new Date(d.getFullYear(),d.getMonth()+1,1)
const localDateTime=(date:string,time:string)=>{const [y,m,day]=date.split('-').map(Number);const [h,min]=time.split(':').map(Number);return new Date(y,m-1,day,h,min)}
const hoursBetween=(a:string,b:string)=>Math.max(0,(new Date(b).getTime()-new Date(a).getTime())/3600000)
const formatTime=(s:string)=>new Date(s).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})
const formatDate=(s:string)=>new Date(s).toLocaleDateString('ru-RU',{weekday:'short',day:'numeric',month:'short'})
const monthName=(d:Date)=>d.toLocaleDateString('ru-RU',{month:'long',year:'numeric'})

export function OperationsPanel({tab,staff,manager,profile,onProfileChange,onMessage}:Props) {
 const [staffRows,setStaffRows]=useState<Staff[]>([])
 const [shifts,setShifts]=useState<Shift[]>([])
 const [busy,setBusy]=useState(false)
 const [anchor,setAnchor]=useState(()=>new Date())
 const [staffFilter,setStaffFilter]=useState('all')
 const [shiftStaff,setShiftStaff]=useState('')
 const [shiftDate,setShiftDate]=useState(dateKey(new Date()))
 const [startTime,setStartTime]=useState('10:00')
 const [endTime,setEndTime]=useState('22:00')
 const [note,setNote]=useState('')
 const [editingId,setEditingId]=useState<string|null>(null)
 const [employeeName,setEmployeeName]=useState('')
 const [employeeLogin,setEmployeeLogin]=useState('')
 const [employeePassword,setEmployeePassword]=useState('')
 const [employeeRole,setEmployeeRole]=useState<'bartender'|'manager'>('bartender')
 const [localMessage,setLocalMessage]=useState('')
 const [monthHours,setMonthHours]=useState(0)

 const report=(s:string)=>{setLocalMessage(s);onMessage(s)}
 const weekStart=useMemo(()=>monday(anchor),[anchor])
 const weekFinish=useMemo(()=>weekEnd(weekStart),[weekStart])
 const visibleShifts=useMemo(()=>shifts.filter(s=>staffFilter==='all'||s.staff_id===staffFilter),[shifts,staffFilter])
 const loadTeam=async()=>{const {data,error}=await supabase.from('staff').select('id,name,username,role,active,auth_user_id').order('name');if(error)report(error.message);else setStaffRows((data||[]) as Staff[])}
 const loadShifts=async()=>{
  const from=weekStart.toISOString(),to=weekFinish.toISOString()
  let q=supabase.from('schedule_shifts').select('id,staff_id,starts_at,ends_at,note,staff(name)').lt('starts_at',to).gt('ends_at',from).order('starts_at')
  if(!manager)q=q.eq('staff_id',staff.id)
  const {data,error}=await q
  if(error){report(error.message);return}
  setShifts((data||[]) as unknown as Shift[])
 }
 const loadMonthHours=async()=>{
  const from=monthStart(new Date()),to=nextMonth(new Date())
  const {data,error}=await supabase.from('schedule_shifts').select('starts_at,ends_at').eq('staff_id',staff.id).lt('starts_at',to.toISOString()).gt('ends_at',from.toISOString())
  if(error){report(error.message);return}
  const total=(data||[]).reduce((sum,s)=>{
   const a=Math.max(new Date(s.starts_at).getTime(),from.getTime())
   const b=Math.min(new Date(s.ends_at).getTime(),to.getTime())
   return sum+Math.max(0,b-a)/3600000
  },0)
  setMonthHours(total)
 }
 useEffect(()=>{if(tab==='team'&&manager)void loadTeam();if(tab==='schedule')void loadShifts();if(tab==='settings')void loadMonthHours()},[tab,manager,staff.id,weekStart.getTime()])
 useEffect(()=>{if(manager&&staffRows.length&&!shiftStaff)setShiftStaff(staffRows.find(x=>x.active)?.id||'')},[manager,staffRows,shiftStaff])
 const resetForm=()=>{setEditingId(null);setShiftDate(dateKey(new Date()));setStartTime('10:00');setEndTime('22:00');setNote('')}
 const saveShift=async(e:FormEvent)=>{
  e.preventDefault()
  if(!shiftStaff){report('Выберите сотрудника');return}
  const start=localDateTime(shiftDate,startTime)
  let end=localDateTime(shiftDate,endTime)
  if(end<=start)end=new Date(end.getTime()+86400000)
  if((end.getTime()-start.getTime())>24*3600000){report('Смена не может длиться больше 24 часов');return}
  setBusy(true)
  const values={staff_id:shiftStaff,starts_at:start.toISOString(),ends_at:end.toISOString(),note:note.trim(),updated_at:new Date().toISOString()}
  const result=editingId?await supabase.from('schedule_shifts').update(values).eq('id',editingId):await supabase.from('schedule_shifts').insert({...values,created_by:staff.id})
  setBusy(false)
  if(result.error){report(result.error.message);return}
  resetForm();await loadShifts();await loadMonthHours();report(editingId?'Смена обновлена':'Смена добавлена')
 }
 const editShift=(s:Shift)=>{
  const a=new Date(s.starts_at),b=new Date(s.ends_at)
  setEditingId(s.id);setShiftStaff(s.staff_id);setShiftDate(dateKey(a));setStartTime(`${pad(a.getHours())}:${pad(a.getMinutes())}`);setEndTime(`${pad(b.getHours())}:${pad(b.getMinutes())}`);setNote(s.note||'')
  window.scrollTo({top:0,behavior:'smooth'})
 }
 const deleteShift=async(id:string)=>{if(!window.confirm('Удалить эту смену?'))return;const {error}=await supabase.from('schedule_shifts').delete().eq('id',id);if(error)report(error.message);else{await loadShifts();await loadMonthHours();report('Смена удалена')}}
 const createEmployee=async(e:FormEvent)=>{e.preventDefault();setBusy(true);const {data,error}=await supabase.functions.invoke('clever-processor',{body:{action:'create_staff',name:employeeName,username:employeeLogin,password:employeePassword,role:employeeRole}});setBusy(false);if(error||data?.error)report(error?.message||data.error);else{setEmployeeName('');setEmployeeLogin('');setEmployeePassword('');await loadTeam();report('Учётная запись создана')}}
 const toggleEmployee=async(row:Staff)=>{if(row.id===staff.id){report('Нельзя отключить собственную учётную запись');return}setBusy(true);const {data,error}=await supabase.functions.invoke('clever-processor',{body:{action:'update_staff',staff_id:row.id,active:!row.active}});setBusy(false);if(error||data?.error)report(error?.message||data.error);else{await loadTeam();report(row.active?'Доступ сотрудника отключён':'Доступ сотрудника восстановлен')}}
 const updateProfile=async(p:Profile)=>{onProfileChange(p);const {error}=await supabase.from('profiles').upsert({staff_id:staff.id,theme:p.theme,color_mode:p.color_mode,updated_at:new Date().toISOString()});if(error)report(error.message)}
 const shiftTitle=(s:Shift)=>manager?(staffRows.find(x=>x.id===s.staff_id)?.name||s.staff?.name||'Сотрудник'):staff.name
 const title=tab==='schedule'?'График':tab==='team'?'Команда':'Настройки аккаунта'
 return <div className="ops-page">
  <div className="ops-head"><div><span className="eyebrow">BAR APP / WORKSPACE</span><h1>{title}</h1><p>{tab==='schedule'?'Рабочие смены сотрудников':tab==='team'?'Учётные записи и права доступа':'Персональные параметры и статистика'}</p></div></div>
  {localMessage&&<div className="ops-alert">{localMessage}<button className="close-btn" style={{float:'right',position:'static'}} onClick={()=>setLocalMessage('')}>×</button></div>}
  {tab==='schedule'&&<>
   {manager&&<section className="ops-card schedule-editor"><h3>{editingId?'Изменить смену':'Добавить рабочую смену'}</h3><form className="ops-form" onSubmit={saveShift}>
    <div className="schedule-form-grid">
     <label>Сотрудник<select required value={shiftStaff} onChange={e=>setShiftStaff(e.target.value)}><option value="">Выбрать сотрудника</option>{staffRows.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <label>Дата<input type="date" required value={shiftDate} onChange={e=>setShiftDate(e.target.value)}/></label>
     <label>Начало<input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
     <label>Окончание<input type="time" required value={endTime} onChange={e=>setEndTime(e.target.value)}/></label>
    </div>
    <label>Комментарий, необязательно<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Например, вечерняя смена"/></label>
    <div className="ops-row"><button className="primary-btn" disabled={busy||!shiftStaff}>{busy?'Сохраняю…':editingId?'Сохранить изменения':'Добавить смену'}</button>{editingId&&<button type="button" className="subtle-btn" onClick={resetForm}>Отмена</button>}</div>
   </form></section>}
   <div className="schedule-toolbar"><button className="subtle-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()-7))}>← Неделя</button><strong>{formatDate(weekStart.toISOString())} — {new Date(weekFinish.getTime()-86400000).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</strong><button className="subtle-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()+7))}>Следующая →</button><button className="subtle-btn" onClick={()=>setAnchor(new Date())}>Сегодня</button></div>
   {manager&&<div className="schedule-filter"><label>Сотрудник<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="all">Вся команда</option>{staffRows.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>}
   <div className="schedule-week">{Array.from({length:7},(_,i)=>{const day=new Date(weekStart);day.setDate(day.getDate()+i);const key=dateKey(day);const list=visibleShifts.filter(s=>dateKey(new Date(s.starts_at))===key);return <section className="schedule-day" key={key}><div className="schedule-day-head"><b>{day.toLocaleDateString('ru-RU',{weekday:'long'})}</b><span>{day.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span></div>{list.length?list.map(s=><article className="schedule-shift" key={s.id}><div className="schedule-shift-time">{formatTime(s.starts_at)}–{formatTime(s.ends_at)}<small>{hoursBetween(s.starts_at,s.ends_at).toFixed(1)} ч</small></div><div className="schedule-shift-info"><b>{shiftTitle(s)}</b>{s.note&&<small>{s.note}</small>}</div>{manager&&<div className="schedule-actions"><button className="subtle-btn" onClick={()=>editShift(s)}>Изменить</button><button className="danger-btn" onClick={()=>void deleteShift(s.id)}>×</button></div>}</article>):<p className="schedule-empty">Смен нет</p>}</section>})}</div>
  </>}
  {tab==='team'&&<>{manager?<><div className="ops-grid"><section className="ops-card"><h3>Новый сотрудник</h3><form className="ops-form" onSubmit={createEmployee}><label>Имя и фамилия<input required value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label><label>Логин<input required minLength={3} pattern="[a-zA-Z0-9_]{3,30}" value={employeeLogin} onChange={e=>setEmployeeLogin(e.target.value)} placeholder="Например, ivan"/></label><label>Временный пароль<input required minLength={8} type="password" value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)}/></label><label>Роль<select value={employeeRole} onChange={e=>setEmployeeRole(e.target.value as 'bartender'|'manager')}><option value="bartender">Сотрудник</option><option value="manager">Управляющий</option></select></label><button className="primary-btn" disabled={busy}>Создать учётную запись</button></form></section><section className="ops-card"><h3>Управление доступом</h3><p>Отключённые учётные записи не смогут войти в приложение.</p></section></div><section className="ops-card" style={{marginTop:14}}><h3>Сотрудники</h3><div className="ops-list">{staffRows.map(row=><div className="ops-item" key={row.id}><div><b>{row.name}</b><small>@{row.username||'—'} · {row.role==='manager'?'Управляющий':'Сотрудник'} · {row.active?'Активен':'Доступ отключён'}</small></div>{row.id!==staff.id&&<button className={row.active?'danger-btn':'subtle-btn'} disabled={busy} onClick={()=>void toggleEmployee(row)}>{row.active?'Отключить':'Восстановить'}</button>}</div>)}</div></section></>:<div className="ops-card"><h3>Доступ ограничен</h3><p>Управлять учётными записями может только управляющий.</p></div>}</>}
  {tab==='settings'&&<><section className="ops-card hours-card"><span className="ops-muted">{monthName(new Date())}</span><div className="hours-value">{monthHours.toFixed(1)} <small>ч</small></div><b>Часы по графику за месяц</b><p>Сумма длительности назначенных смен, включая смены, переходящие через полночь. Это плановое время по графику, а не отметки фактического прихода и ухода.</p></section><section className="ops-card ops-settings" style={{marginTop:14}}><h3>Оформление приложения</h3><p>Настройки сохраняются в профиле и применяются при следующем входе на любом устройстве.</p><b>Цвет акцента</b><div className="swatches">{[{id:'green',color:'#b5c79a'},{id:'blue',color:'#8fb8e8'},{id:'orange',color:'#e9ad78'},{id:'purple',color:'#c1a2e8'}].map(x=><button key={x.id} aria-label={x.id} className={'swatch '+(profile.theme===x.id?'selected':'')} style={{background:x.color}} onClick={()=>void updateProfile({...profile,theme:x.id})}/>)}</div><b>Тема</b><div className="mode-choice" style={{marginTop:12}}><button className={profile.color_mode==='dark'?'primary-btn':'subtle-btn'} onClick={()=>void updateProfile({...profile,color_mode:'dark'})}>Тёмная</button><button className={profile.color_mode==='light'?'primary-btn':'subtle-btn'} onClick={()=>void updateProfile({...profile,color_mode:'light'})}>Светлая</button></div><p className="ops-muted" style={{marginTop:18}}>Аккаунт: {staff.name} · {staff.role==='manager'?'Управляющий':'Сотрудник'}</p></section></>}
 </div>
}

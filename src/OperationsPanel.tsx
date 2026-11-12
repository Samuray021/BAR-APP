import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import ExcelJS from 'exceljs'
import type { Staff } from './types'
import { supabase } from './lib/supabase'

type Tab = 'schedule' | 'team' | 'settings'
type Profile = { theme: string; color_mode: string }
type Props = { tab: Tab; staff: Staff; manager: boolean; profile: Profile; onProfileChange: (p: Profile) => void; onMessage: (s: string) => void }
type Shift = { id: string; staff_id: string; starts_at: string; ends_at: string; note: string; staff?: {name:string}|null }
type StaffDirectoryEntry = { id: string; name: string }

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
 const [staffDirectory,setStaffDirectory]=useState<StaffDirectoryEntry[]>([])
 const [shifts,setShifts]=useState<Shift[]>([])
 const [busy,setBusy]=useState(false)
 const [anchor,setAnchor]=useState(()=>new Date())
 const [staffFilter,setStaffFilter]=useState('all')
 const [shiftStaff,setShiftStaff]=useState('')
 const [shiftDate,setShiftDate]=useState(dateKey(new Date()))
 const [startTime,setStartTime]=useState('10:00')
 const [durationHours,setDurationHours]=useState('12')
 const [note,setNote]=useState('')
 const [editingId,setEditingId]=useState<string|null>(null)
 const [employeeName,setEmployeeName]=useState('')
 const [employeeLogin,setEmployeeLogin]=useState('')
 const [employeePassword,setEmployeePassword]=useState('')
 const [employeeRole,setEmployeeRole]=useState<'bartender'|'manager'>('bartender')
 const [localMessage,setLocalMessage]=useState('')
 const [monthHours,setMonthHours]=useState(0)
 const [exporting,setExporting]=useState<'schedule'|'recipes'|null>(null)

 const report=(s:string)=>{setLocalMessage(s);onMessage(s)}
 const weekStart=useMemo(()=>monday(anchor),[anchor])
 const weekFinish=useMemo(()=>weekEnd(weekStart),[weekStart])
 const visibleShifts=useMemo(()=>shifts.filter(s=>staffFilter==='all'||s.staff_id===staffFilter),[shifts,staffFilter])
 const loadTeam=async()=>{const {data,error}=await supabase.from('staff').select('id,name,username,role,active,auth_user_id').order('name');if(error)report(error.message);else setStaffRows((data||[]) as Staff[])}
 const loadShifts=async()=>{
  const from=weekStart.toISOString(),to=weekFinish.toISOString()
  const {data,error}=await supabase.from('schedule_shifts').select('id,staff_id,starts_at,ends_at,note').lt('starts_at',to).gt('ends_at',from).order('starts_at')
  if(error){report(error.message);return}
  const {data:directory,error:directoryError}=await supabase.rpc('get_staff_directory')
  if(directoryError){report(directoryError.message);return}
  const people=(directory||[]) as StaffDirectoryEntry[]
  setStaffDirectory(people)
  const names=new Map(people.map(person=>[person.id,person.name]))
  setShifts((data||[]).map(s=>({...s,staff:{name:names.get(s.staff_id)||'Сотрудник'}})) as Shift[])
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
 useEffect(()=>{if((tab==='team'||tab==='schedule')&&manager)void loadTeam();if(tab==='schedule')void loadShifts();if(tab==='settings')void loadMonthHours()},[tab,manager,staff.id,weekStart.getTime()])
 useEffect(()=>{if(manager&&staffRows.length&&!shiftStaff)setShiftStaff(staffRows.find(x=>x.active)?.id||'')},[manager,staffRows,shiftStaff])
 const resetForm=()=>{setEditingId(null);setShiftDate(dateKey(new Date()));setStartTime('10:00');setDurationHours('12');setNote('')}
 const saveShift=async(e:FormEvent)=>{
  e.preventDefault()
  if(!shiftStaff){report('Выберите сотрудника');return}
  const start=localDateTime(shiftDate,startTime)
  const duration=Number(durationHours)
  if(!Number.isFinite(duration)||duration<=0||duration>24){report('Укажите продолжительность смены от 0,01 до 24 часов');return}
  const end=new Date(start.getTime()+duration*3600000)
  setBusy(true)
  const values={staff_id:shiftStaff,starts_at:start.toISOString(),ends_at:end.toISOString(),note:note.trim(),updated_at:new Date().toISOString()}
  const result=editingId?await supabase.from('schedule_shifts').update(values).eq('id',editingId):await supabase.from('schedule_shifts').insert({...values,created_by:staff.id})
  setBusy(false)
  if(result.error){report(result.error.message);return}
  resetForm();await loadShifts();await loadMonthHours();report(editingId?'Смена обновлена':'Смена добавлена')
 }
 const editShift=(s:Shift)=>{
  const a=new Date(s.starts_at)
  setEditingId(s.id);setShiftStaff(s.staff_id);setShiftDate(dateKey(a));setStartTime(`${pad(a.getHours())}:${pad(a.getMinutes())}`);setDurationHours(hoursBetween(s.starts_at,s.ends_at).toString());setNote(s.note||'')
  window.scrollTo({top:0,behavior:'smooth'})
 }
 const deleteShift=async(id:string)=>{if(!window.confirm('Удалить эту смену?'))return;const {error}=await supabase.from('schedule_shifts').delete().eq('id',id);if(error)report(error.message);else{await loadShifts();await loadMonthHours();report('Смена удалена')}}
 const createEmployee=async(e:FormEvent)=>{e.preventDefault();setBusy(true);const {data,error}=await supabase.functions.invoke('clever-processor',{body:{action:'create_staff',name:employeeName,username:employeeLogin,password:employeePassword,role:employeeRole}});setBusy(false);if(error||data?.error)report(error?.message||data.error);else{setEmployeeName('');setEmployeeLogin('');setEmployeePassword('');await loadTeam();report('Учётная запись создана')}}
 const toggleEmployee=async(row:Staff)=>{if(row.id===staff.id){report('Нельзя отключить собственную учётную запись');return}setBusy(true);const {data,error}=await supabase.functions.invoke('clever-processor',{body:{action:'update_staff',staff_id:row.id,active:!row.active}});setBusy(false);if(error||data?.error)report(error?.message||data.error);else{await loadTeam();report(row.active?'Доступ сотрудника отключён':'Доступ сотрудника восстановлен')}}
 const updateProfile=async(p:Profile)=>{onProfileChange(p);const {error}=await supabase.from('profiles').upsert({staff_id:staff.id,theme:p.theme,color_mode:p.color_mode,updated_at:new Date().toISOString()});if(error)report(error.message)}

 const styleWorksheet=(sheet:ExcelJS.Worksheet)=>{
  sheet.views=[{state:'frozen',ySplit:1}]
  sheet.autoFilter={from:{row:1,column:1},to:{row:1,column:sheet.columnCount}}
  const header=sheet.getRow(1)
  header.height=24
  header.eachCell(cell=>{
   cell.font={bold:true,color:{argb:'FFFFFFFF'}}
   cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF344536'}}
   cell.alignment={vertical:'middle',wrapText:true}
   cell.border={bottom:{style:'thin',color:{argb:'FF879C6B'}}}
  })
  sheet.eachRow((row,index)=>{if(index>1)row.alignment={vertical:'top',wrapText:true}})
 }
 const downloadWorkbook=async(workbook:ExcelJS.Workbook,filename:string)=>{
  const buffer=await workbook.xlsx.writeBuffer()
  const blob=new Blob([buffer as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a')
  link.href=url;link.download=filename;document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url)
 }

 const exportSchedule=async()=>{
  if(!manager)return
  setExporting('schedule')
  try{
   const shifts: any[]=[]
   for(let from=0;;from+=1000){
    const {data,error}=await supabase.from('schedule_shifts').select('id,staff_id,starts_at,ends_at,note').order('starts_at').range(from,from+999)
    if(error)throw error
    shifts.push(...(data||[]))
    if(!data||data.length<1000)break
   }
   const {data:employees,error:staffError}=await supabase.from('staff').select('id,name').order('name')
   if(staffError)throw staffError
   const staffList=(employees||[]) as {id:string;name:string}[]
   const monthBuckets=new Map<string,Map<string,number[]>>()
   const ensureMonth=(year:number,month:number)=>{
    const key=year+'-'+pad(month+1)
    if(!monthBuckets.has(key))monthBuckets.set(key,new Map())
    return monthBuckets.get(key)!
   }
   const addShiftToDays=(shift:any)=>{
    const start=new Date(shift.starts_at)
    const finish=new Date(shift.ends_at)
    if(!Number.isFinite(start.getTime())||!Number.isFinite(finish.getTime())||finish<=start)return
    const year=start.getFullYear(),month=start.getMonth(),day=start.getDate()
    const bucket=ensureMonth(year,month)
    if(!bucket.has(shift.staff_id))bucket.set(shift.staff_id,Array(31).fill(0))
    bucket.get(shift.staff_id)![day-1]+=hoursBetween(shift.starts_at,shift.ends_at)
   }
   shifts.forEach(addShiftToDays)
   if(monthBuckets.size===0){
    const now=new Date()
    ensureMonth(now.getFullYear(),now.getMonth())
   }
   const workbook=new ExcelJS.Workbook()
   workbook.creator='BAR APP'
   workbook.created=new Date()
   const monthKeys=[...monthBuckets.keys()].sort()
   monthKeys.forEach(key=>{
    const [yearText,monthText]=key.split('-')
    const year=Number(yearText),month=Number(monthText)-1
    const title=new Date(year,month,1).toLocaleDateString('ru-RU',{month:'long',year:'numeric'})
    const sheet=workbook.addWorksheet(title.charAt(0).toUpperCase()+title.slice(1))
    sheet.columns=[
     {header:'ИМЯ',key:'employee',width:27},
     ...Array.from({length:31},(_,i)=>({header:String(i+1),key:'day'+(i+1),width:6})),
     {header:'ИТОГО ЧАСОВ',key:'total',width:16}
    ]
    const bucket=monthBuckets.get(key)!
    const sortedStaff=[...staffList].sort((a,b)=>a.name.localeCompare(b.name,'ru'))
    sortedStaff.forEach(person=>{
     const daily=bucket.get(person.id)||Array(31).fill(0)
     const row:any={employee:person.name}
     let total=0
     daily.forEach((hours:number,index:number)=>{
      if(hours>0){
       const rounded=Number(hours.toFixed(2))
       row['day'+(index+1)]=rounded
       total+=hours
      }
     })
     row.total=Number(total.toFixed(2))
     sheet.addRow(row)
    })
    sheet.views=[{state:'frozen',xSplit:1,ySplit:1}]
    const header=sheet.getRow(1)
    header.height=30
    header.eachCell(cell=>{
     cell.font={bold:true,color:{argb:'FFFFFFFF'},size:10}
     cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF344536'}}
     cell.alignment={vertical:'middle',horizontal:'center',wrapText:true}
     cell.border={top:{style:'thin',color:{argb:'FF879C6B'}},left:{style:'thin',color:{argb:'FF879C6B'}},bottom:{style:'thin',color:{argb:'FF879C6B'}},right:{style:'thin',color:{argb:'FF879C6B'}}}
    })
    sheet.eachRow((row,index)=>{
     if(index===1)return
     row.height=24
     row.eachCell({includeEmpty:true},(cell,col)=>{
      cell.alignment={vertical:'middle',horizontal:col===1?'left':'center'}
      cell.border={top:{style:'thin',color:{argb:'FFD5DDD3'}},left:{style:'thin',color:{argb:'FFD5DDD3'}},bottom:{style:'thin',color:{argb:'FFD5DDD3'}},right:{style:'thin',color:{argb:'FFD5DDD3'}}}
      if(col>1)cell.numFmt='0.##'
      if(col===33){cell.font={bold:true};cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFE8EEE4'}}}
     })
    })
    sheet.getColumn(1).alignment={vertical:'middle',horizontal:'left'}
    sheet.getColumn(33).numFmt='0.##'
   })
   const filename='BAR-APP-grafik-po-mesyatsam-'+dateKey(new Date())+'.xlsx'
   await downloadWorkbook(workbook,filename)
   report('График выгружен: '+monthKeys.length+' мес., '+staffList.length+' сотрудников')
  }catch(e){report(e instanceof Error?'Не удалось выгрузить график: '+e.message:'Не удалось выгрузить график')}
  finally{setExporting(null)}
 }
 const exportRecipes=async()=>{
  if(!manager)return
  setExporting('recipes')
  try{
   const recipes:any[]=[]
   for(let from=0;;from+=1000){
    const {data,error}=await supabase.from('recipes').select('*').order('name').range(from,from+999)
    if(error)throw error
    recipes.push(...(data||[]))
    if(!data||data.length<1000)break
   }
   const workbook=new ExcelJS.Workbook()
   workbook.creator='BAR APP'
   workbook.created=new Date()
   const cards=workbook.addWorksheet('Техкарты')
   cards.columns=[
    {header:'Название',key:'name',width:30},
    {header:'Категория',key:'category',width:20},
    {header:'Выход, мл',key:'yield',width:13},
    {header:'Посуда',key:'vessel',width:20},
    {header:'Себестоимость',key:'cost',width:16},
    {header:'Цена',key:'price',width:13},
    {header:'Ингредиенты',key:'ingredients',width:55},
    {header:'Приготовление',key:'preparation',width:55},
    {header:'Примечание',key:'note',width:40}
   ]
   const ingredients=workbook.addWorksheet('Состав')
   ingredients.columns=[
    {header:'Техкарта',key:'recipe',width:30},
    {header:'Категория',key:'category',width:20},
    {header:'Ингредиент',key:'ingredient',width:30},
    {header:'Количество',key:'amount',width:16},
    {header:'Единица',key:'unit',width:14}
   ]
   recipes.forEach(r=>{
    const list=Array.isArray(r.ingredients)?r.ingredients:[]
    cards.addRow({
     name:r.name||'',category:r.category||'',yield:r.yield??'',
     vessel:r.vessel||'',cost:r.cost??'',price:r.price??'',
     ingredients:list.map((i:any)=>String(i.name||'')+' — '+String(i.amount??'')+' '+String(i.unit||'')).join('\n'),
     preparation:r.preparation||'',note:r.note||''
    })
    list.forEach((i:any)=>ingredients.addRow({
     recipe:r.name||'',category:r.category||'',ingredient:i.name||'',
     amount:i.amount??'',unit:i.unit||''
    }))
   })
   styleWorksheet(cards)
   styleWorksheet(ingredients)
   await downloadWorkbook(workbook,'BAR-APP-barnaya-karta-'+dateKey(new Date())+'.xlsx')
   report('Барная карта выгружена: '+recipes.length+' техкарт')
  }catch(e){report(e instanceof Error?'Не удалось выгрузить барную карту: '+e.message:'Не удалось выгрузить барную карту')}
  finally{setExporting(null)}
 }
 const shiftTitle=(s:Shift)=>staffDirectory.find(x=>x.id===s.staff_id)?.name||staffRows.find(x=>x.id===s.staff_id)?.name||s.staff?.name||'Сотрудник'
 const title=tab==='schedule'?'График':tab==='team'?'Команда':'Настройки аккаунта'
 return <div className="ops-page">
  <div className="ops-head"><div><span className="eyebrow">BAR APP / WORKSPACE</span><h1>{title}</h1><p>{tab==='schedule'?'Рабочие смены сотрудников':tab==='team'?'Учётные записи и права доступа':'Персональные параметры и статистика'}</p></div></div>
  {localMessage&&<div className="ops-alert">{localMessage}<button className="close-btn" style={{float:'right',position:'static'}} onClick={()=>setLocalMessage('')}>×</button></div>}
  {tab==='schedule'&&<>
   {manager&&<section className="ops-card schedule-editor"><h3>{editingId?'Изменить смену':'Добавить рабочую смену'}</h3><form className="ops-form" onSubmit={saveShift}>
    <div className="schedule-form-grid">
     <label>Сотрудник<select required value={shiftStaff} onChange={e=>setShiftStaff(e.target.value)}><option value="">Выбрать сотрудника</option>{staffRows.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
     <label>Дата<input type="date" required value={shiftDate} onChange={e=>setShiftDate(e.target.value)}/></label>
     <label>Время начала<input type="time" required value={startTime} onChange={e=>setStartTime(e.target.value)}/></label>
     <label>Количество часов<input type="number" required min="0.01" max="24" step="any" value={durationHours} onChange={e=>setDurationHours(e.target.value)}/></label>
    </div>
    <label>Комментарий, необязательно<input value={note} onChange={e=>setNote(e.target.value)} placeholder="Например, вечерняя смена"/></label>
    <div className="ops-row"><button className="primary-btn" disabled={busy||!shiftStaff}>{busy?'Сохраняю…':editingId?'Сохранить изменения':'Добавить смену'}</button>{editingId&&<button type="button" className="subtle-btn" onClick={resetForm}>Отмена</button>}</div>
   </form></section>}
   <div className="schedule-toolbar"><button className="subtle-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()-7))}>← Неделя</button><strong>{formatDate(weekStart.toISOString())} — {new Date(weekFinish.getTime()-86400000).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</strong><button className="subtle-btn" onClick={()=>setAnchor(new Date(anchor.getFullYear(),anchor.getMonth(),anchor.getDate()+7))}>Следующая →</button><button className="subtle-btn" onClick={()=>setAnchor(new Date())}>Сегодня</button></div>
   {manager&&<div className="schedule-filter"><label>Сотрудник<select value={staffFilter} onChange={e=>setStaffFilter(e.target.value)}><option value="all">Вся команда</option>{staffRows.filter(x=>x.active).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label></div>}
   <div className="schedule-week">{Array.from({length:7},(_,i)=>{const day=new Date(weekStart);day.setDate(day.getDate()+i);const key=dateKey(day);const list=visibleShifts.filter(s=>dateKey(new Date(s.starts_at))===key);return <section className="schedule-day" key={key}><div className="schedule-day-head"><b>{day.toLocaleDateString('ru-RU',{weekday:'long'})}</b><span>{day.toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}</span></div>{list.length?list.map(s=><article className="schedule-shift" key={s.id}><div className="schedule-shift-time">{formatTime(s.starts_at)}–{formatTime(s.ends_at)}<small>{hoursBetween(s.starts_at,s.ends_at).toFixed(2)} ч</small></div><div className="schedule-shift-info"><b>{shiftTitle(s)}</b>{s.note&&<small>{s.note}</small>}</div>{manager&&<div className="schedule-actions"><button className="subtle-btn" onClick={()=>editShift(s)}>Изменить</button><button className="danger-btn" onClick={()=>void deleteShift(s.id)}>×</button></div>}</article>):<p className="schedule-empty">Смен нет</p>}</section>})}</div>
  </>}
  {tab==='team'&&<>{manager?<><div className="ops-grid"><section className="ops-card"><h3>Новый сотрудник</h3><form className="ops-form" onSubmit={createEmployee}><label>Имя и фамилия<input required value={employeeName} onChange={e=>setEmployeeName(e.target.value)}/></label><label>Логин<input required minLength={3} pattern="[a-zA-Z0-9_]{3,30}" value={employeeLogin} onChange={e=>setEmployeeLogin(e.target.value)} placeholder="Например, ivan"/></label><label>Временный пароль<input required minLength={8} type="password" value={employeePassword} onChange={e=>setEmployeePassword(e.target.value)}/></label><label>Роль<select value={employeeRole} onChange={e=>setEmployeeRole(e.target.value as 'bartender'|'manager')}><option value="bartender">Сотрудник</option><option value="manager">Управляющий</option></select></label><button className="primary-btn" disabled={busy}>Создать учётную запись</button></form></section><section className="ops-card"><h3>Управление доступом</h3><p>Отключённые учётные записи не смогут войти в приложение.</p></section></div><section className="ops-card" style={{marginTop:14}}><h3>Сотрудники</h3><div className="ops-list">{staffRows.map(row=><div className="ops-item" key={row.id}><div><b>{row.name}</b><small>@{row.username||'—'} · {row.role==='manager'?'Управляющий':'Сотрудник'} · {row.active?'Активен':'Доступ отключён'}</small></div>{row.id!==staff.id&&<button className={row.active?'danger-btn':'subtle-btn'} disabled={busy} onClick={()=>void toggleEmployee(row)}>{row.active?'Отключить':'Восстановить'}</button>}</div>)}</div></section></>:<div className="ops-card"><h3>Доступ ограничен</h3><p>Управлять учётными записями может только управляющий.</p></div>}</>}
  {tab==='settings'&&<><section className="ops-card hours-card"><span className="ops-muted">{monthName(new Date())}</span><div className="hours-value">{monthHours.toFixed(1)} <small>ч</small></div><b>Часы по графику за месяц</b><p>Сумма длительности назначенных смен, включая смены, переходящие через полночь. Это плановое время по графику, а не отметки фактического прихода и ухода.</p></section>{manager&&<section className="ops-card ops-settings export-settings" style={{marginTop:14}}><h3>Экспорт данных</h3><p>Скачайте актуальные данные приложения в формате Excel (.xlsx).</p><div className="export-actions"><button className="primary-btn" disabled={exporting!==null} onClick={()=>void exportSchedule()}>{exporting==='schedule'?'Формируем файл…':'Выгрузить график в Excel'}</button><button className="subtle-btn" disabled={exporting!==null} onClick={()=>void exportRecipes()}>{exporting==='recipes'?'Формируем файл…':'Выгрузить барную карту в Excel'}</button></div></section>}<section className="ops-card ops-settings" style={{marginTop:14}}><h3>Оформление приложения</h3><p>Настройки сохраняются в профиле и применяются при следующем входе на любом устройстве.</p><b>Цвет акцента</b><div className="swatches">{[{id:'green',color:'#b5c79a'},{id:'blue',color:'#8fb8e8'},{id:'orange',color:'#e9ad78'},{id:'purple',color:'#c1a2e8'}].map(x=><button key={x.id} aria-label={x.id} className={'swatch '+(profile.theme===x.id?'selected':'')} style={{background:x.color}} onClick={()=>void updateProfile({...profile,theme:x.id})}/>)}</div><b>Тема</b><div className="mode-choice" style={{marginTop:12}}><button className={profile.color_mode==='dark'?'primary-btn':'subtle-btn'} onClick={()=>void updateProfile({...profile,color_mode:'dark'})}>Тёмная</button><button className={profile.color_mode==='light'?'primary-btn':'subtle-btn'} onClick={()=>void updateProfile({...profile,color_mode:'light'})}>Светлая</button></div><p className="ops-muted" style={{marginTop:18}}>Аккаунт: {staff.name} · {staff.role==='manager'?'Управляющий':'Сотрудник'}</p></section></>}
 </div>
}

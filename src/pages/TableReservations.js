import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import { Navigate } from 'react-router-dom';
import {
  MdArrowBack, MdArrowForward, MdCalendarToday, MdCloudDone, MdFileUpload,
  MdPeople, MdRefresh, MdSearch, MdTableRestaurant, MdZoomIn, MdZoomOut
} from 'react-icons/md';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { Input, Textarea } from '../components/FormFields';
import tableReservationService from '../services/tableReservationService';
import { useApp } from '../context/AppContext';
import { ESTABLISHMENTS } from '../constants/establishments';

const TABLES = [
  { n: 1, x: 49.8, y: 8.2, w: 8.8, h: 9.2 }, { n: 2, x: 63.4, y: 9.9, w: 6.5, h: 5.2 },
  { n: 3, x: 55.5, y: 20.5, w: 8.3, h: 7.5 }, { n: 4, x: 76.2, y: 10.2, w: 8.8, h: 9.4 },
  { n: 5, x: 77, y: 21.7, w: 11.5, h: 5.5 }, { n: 6, x: 77, y: 31.7, w: 11.5, h: 5.5 },
  { n: 7, x: 77, y: 41.4, w: 11.5, h: 5.5 }, { n: 8, x: 77, y: 51.2, w: 11.5, h: 5.5 },
  { n: 9, x: 76.7, y: 60.2, w: 7.5, h: 4.2 }, { n: 10, x: 76.7, y: 66.2, w: 8.8, h: 4.2 },
  { n: 11, x: 21.8, y: 66.3, w: 5.4, h: 4.3 }, { n: 12, x: 21.8, y: 70.7, w: 5.4, h: 4.3 },
  { n: 13, x: 21.8, y: 74.8, w: 5.4, h: 4.3 }, { n: 14, x: 21.8, y: 79.3, w: 5.4, h: 4.3 },
  { n: 15, x: 21.8, y: 83.2, w: 5.4, h: 4.3 }, { n: 16, x: 23.9, y: 89.4, w: 8.5, h: 8.8 },
  { n: 17, x: 54.8, y: 89.4, w: 8.5, h: 8.8 }, { n: 18, x: 59.2, y: 77.2, w: 5.2, h: 4.3 },
  { n: 19, x: 59.2, y: 70.9, w: 5.2, h: 4.3 }, { n: 20, x: 45.4, y: 75.3, w: 8, h: 7.2 },
  { n: 21, x: 36.6, y: 74.5, w: 6.2, h: 6.7 }, { n: 22, x: 65.1, y: 89.5, w: 5.5, h: 4.5 },
  { n: 23, x: 73.3, y: 86.7, w: 7, h: 6 }, { n: 24, x: 72.2, y: 79.5, w: 7, h: 6 },
  { n: 25, x: 70.5, y: 73.4, w: 7, h: 6 }, { n: 26, x: 63.2, y: 74.5, w: 4.2, h: 5.3 },
  { n: 27, x: 61.2, y: 80.7, w: 5.5, h: 4.6 }
];

const Page = styled.div`display:flex;flex-direction:column;gap:20px;max-width:1500px;`;
const Header = styled.div`display:flex;justify-content:space-between;gap:16px;align-items:flex-start;flex-wrap:wrap;`;
const Title = styled.h1`font-size:${({theme})=>theme.fontSizes['3xl']};color:${({theme})=>theme.colors.textPrimary};`;
const Subtitle = styled.p`color:${({theme})=>theme.colors.textSecondary};margin-top:4px;`;
const Toolbar = styled.div`display:flex;align-items:center;gap:8px;flex-wrap:wrap;`;
const DateInput = styled.input`background:${({theme})=>theme.colors.bgCard};color:${({theme})=>theme.colors.textPrimary};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};padding:9px 12px;font:inherit;`;
const Stats = styled.div`display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px;@media(max-width:650px){grid-template-columns:1fr;}`;
const Stat = styled.div`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:16px;display:flex;gap:12px;align-items:center;box-shadow:${({theme})=>theme.shadows.card};svg{font-size:1.65rem;color:${({theme})=>theme.colors.primary};}strong{display:block;font-size:1.5rem;}span{color:${({theme})=>theme.colors.textSecondary};font-size:.875rem;}`;
const Grid = styled.div`display:grid;grid-template-columns:minmax(0,1.55fr) minmax(330px,.8fr);gap:20px;align-items:start;@media(max-width:1050px){grid-template-columns:1fr;}`;
const Card = styled.section`background:${({theme})=>theme.colors.bgCard};border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.lg};padding:16px;box-shadow:${({theme})=>theme.shadows.card};`;
const CardHeader = styled.div`display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap;h2{font-size:${({theme})=>theme.fontSizes.lg};}`;
const MapViewport = styled.div`overflow:auto;max-height:74vh;border-radius:10px;background:#062d55;overscroll-behavior:contain;`;
const MapCanvas = styled.div`position:relative;width:${({$zoom})=>$zoom*100}%;min-width:${({$zoom})=>Math.round(690*$zoom)}px;line-height:0;transition:width .2s ease;`;
const MapImage = styled.img`width:100%;height:auto;user-select:none;`;
const TableHit = styled.button.attrs(({ $table }) => ({ style: { left:`${$table.x-$table.w/2}%`,top:`${$table.y-$table.h/2}%`,width:`${$table.w}%`,height:`${$table.h}%` } }))`
  position:absolute;border:2px solid ${({$reserved,$selected})=>$reserved?'#ef4444':$selected?'#facc15':'#22c55e'};border-radius:10px;background:${({$reserved,$selected})=>$reserved?'rgba(239,68,68,.20)':$selected?'rgba(250,204,21,.35)':'rgba(34,197,94,.12)'};color:white;line-height:1;display:flex;align-items:flex-start;justify-content:flex-end;padding:3px;box-shadow:${({$selected})=>$selected?'0 0 0 3px rgba(250,204,21,.75), inset 0 0 0 1px #fff':'inset 0 0 0 1px rgba(255,255,255,.55)'};transition:.15s;cursor:pointer;
  &:hover,&:focus-visible{z-index:4;outline:3px solid #fff;transform:scale(1.06);}
`;
const TableBadge = styled.span`min-width:22px;height:22px;padding:0 4px;border-radius:999px;background:${({$reserved,$selected})=>$reserved?'#b91c1c':$selected?'#a16207':'#047857'};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 1px 4px #000;`;
const Legend = styled.div`display:flex;gap:16px;flex-wrap:wrap;margin-top:12px;color:${({theme})=>theme.colors.textSecondary};font-size:.85rem;span{display:flex;align-items:center;gap:6px;}i{width:13px;height:13px;border-radius:4px;display:inline-block;}`;
const SelectionBar = styled.div`display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid #eab308;border-radius:${({theme})=>theme.radii.md};background:rgba(250,204,21,.12);color:${({theme})=>theme.colors.textPrimary};strong{color:#a16207;}`;
const SearchBox = styled.div`position:relative;flex:1;min-width:220px;svg{position:absolute;left:11px;top:11px;color:${({theme})=>theme.colors.textMuted};}input{width:100%;padding:9px 12px 9px 36px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};}`;
const ReservationList = styled.div`display:flex;flex-direction:column;gap:8px;max-height:68vh;overflow:auto;`;
const ReservationRow = styled.button`text-align:left;width:100%;padding:12px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};&:hover{border-color:${({theme})=>theme.colors.primary};}.top{display:flex;justify-content:space-between;gap:10px;font-weight:700}.meta{color:${({theme})=>theme.colors.textSecondary};font-size:.86rem;margin-top:5px;}`;
const Empty = styled.div`padding:36px 12px;text-align:center;color:${({theme})=>theme.colors.textMuted};`;
const StatusLine = styled.div`display:flex;align-items:center;gap:8px;color:${({theme,$error})=>$error?theme.colors.danger:theme.colors.textMuted};font-size:.82rem;`;
const FormGrid = styled.form`display:grid;grid-template-columns:1fr 1fr;gap:14px;@media(max-width:520px){grid-template-columns:1fr;}.wide{grid-column:1/-1;}`;
const ImportBox = styled.div`margin-top:16px;padding:14px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};h3{font-size:1rem;margin-bottom:8px}.conflicts{color:${({theme})=>theme.colors.danger};margin-top:8px;font-size:.88rem;max-height:120px;overflow:auto;}`;
const Responsibility = styled.div`grid-column:1/-1;padding:12px 14px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.infoLight};color:${({theme})=>theme.colors.textSecondary};font-size:.9rem;strong{color:${({theme})=>theme.colors.textPrimary};}.updated{display:block;margin-top:3px;font-size:.8rem;color:${({theme})=>theme.colors.textMuted};}`;

const localToday = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const shiftDate = (value, days) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day + days, 12);
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
};
const formatDate = value => new Intl.DateTimeFormat('pt-BR', { dateStyle:'full', timeZone:'UTC' }).format(new Date(`${value}T12:00:00Z`));
const emptyForm = (tableNumber, reservationDate) => ({ tableNumber, reservationDate, reservationTime:'19:00', customerName:'', phone:'', partySize:'', notes:'' });
const toggleTableSelection = (selected, tableNumber) => selected.includes(tableNumber)
  ? selected.filter(number => number !== tableNumber)
  : [...selected, tableNumber].sort((a, b) => a - b);

function normalizeBackup(raw) {
  const source = Array.isArray(raw) ? raw : raw?.reservations || raw?.reservas;
  if (!Array.isArray(source)) throw new Error('O JSON deve conter uma lista em "reservations" ou "reservas".');
  return source.filter(item => !['CANCELLED','CANCELADA','CANCELADO'].includes(String(item.status || '').toUpperCase())).map(item => ({
    tableNumber: Number(item.tableNumber ?? item.mesa),
    reservationDate: item.reservationDate ?? item.date ?? item.data,
    reservationTime: item.reservationTime ?? item.time ?? item.horario ?? item.horário,
    customerName: item.customerName ?? item.name ?? item.nome ?? item.cliente,
    phone: item.phone ?? item.telefone ?? null,
    partySize: Number(item.partySize ?? item.guests ?? item.pessoas ?? item.quantidadePessoas),
    notes: item.notes ?? item.observacao ?? item.observação ?? null
  }));
}

export { TABLES, normalizeBackup, shiftDate, toggleTableSelection };

export default function TableReservations() {
  const { state } = useApp();
  const establishmentId = state.establishment?.id;
  const loggedUser = state.user;
  const isCommercial = establishmentId === ESTABLISHMENTS.COMMERCIAL;
  const [selectedDate, setSelectedDate] = useState(localToday);
  const [data, setData] = useState({ reservations:[], summary:{reservedTables:0,freeTables:27,expectedPeople:0} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedTables, setSelectedTables] = useState([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [form, setForm] = useState(emptyForm(1, localToday()));
  const [saving, setSaving] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const requestId = useRef(0);
  const selectedDateRef = useRef(selectedDate);
  const establishmentRef = useRef(establishmentId);
  const fileInput = useRef(null);

  selectedDateRef.current = selectedDate;

  const changeDate = value => {
    requestId.current += 1;
    selectedDateRef.current = value;
    setMultiSelect(false);
    setSelectedTables([]);
    setSelectedDate(value);
  };

  const load = useCallback(async (showLoading = true) => {
    if (!isCommercial) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    const requestedDate = selectedDate;
    const requestedEstablishment = establishmentId;
    if (showLoading) setLoading(true);
    setError('');
    try {
      const result = await tableReservationService.list(requestedDate);
      if (id !== requestId.current || requestedDate !== selectedDateRef.current || requestedEstablishment !== establishmentRef.current) return;
      setData(result);
      setUpdatedAt(new Date());
    } catch (err) {
      if (id === requestId.current) setError(err.message || 'Não foi possível atualizar as reservas.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [selectedDate, establishmentId, isCommercial]);

  useEffect(() => {
    if (establishmentRef.current !== establishmentId) {
      requestId.current += 1;
      establishmentRef.current = establishmentId;
      setModalOpen(false);
      setEditing(null);
      setMultiSelect(false);
      setSelectedTables([]);
      setCreatingBatch(false);
      setImportPreview(null);
    }
  }, [establishmentId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === 'visible') load(false); };
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); window.removeEventListener('focus', refreshVisible); };
  }, [load]);

  const activeByTable = useMemo(() => new Map(data.reservations.filter(item => item.status === 'CONFIRMED').map(item => [item.tableNumber, item])), [data.reservations]);
  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return data.reservations;
    return data.reservations.filter(item => item.customerName.toLocaleLowerCase('pt-BR').includes(term) || String(item.tableNumber).includes(term));
  }, [data.reservations, search]);

  const openTable = tableNumber => {
    const reservation = activeByTable.get(tableNumber) || null;
    setEditing(reservation);
    setCreatingBatch(false);
    setForm(reservation ? {
      tableNumber: reservation.tableNumber, reservationDate: reservation.reservationDate,
      reservationTime: reservation.reservationTime, customerName: reservation.customerName,
      phone: reservation.phone || '', partySize: String(reservation.partySize), notes: reservation.notes || ''
    } : emptyForm(tableNumber, selectedDate));
    setModalOpen(true);
  };

  const handleTableClick = tableNumber => {
    const reservation = activeByTable.get(tableNumber);
    if (reservation || !multiSelect) return openTable(tableNumber);
    setSelectedTables(current => toggleTableSelection(current, tableNumber));
  };

  const toggleMultiSelect = () => {
    setMultiSelect(current => !current);
    setSelectedTables([]);
  };

  const openBatch = () => {
    if (selectedTables.length < 2) return;
    setEditing(null);
    setCreatingBatch(true);
    setForm(emptyForm(selectedTables[0], selectedDate));
    setModalOpen(true);
  };

  const closeModal = () => { if (!saving) { setModalOpen(false); setEditing(null); setCreatingBatch(false); } };
  const submit = async event => {
    event.preventDefault();
    setSaving(true);
    const payload = { ...form, tableNumber:Number(form.tableNumber), partySize:Number(form.partySize), phone:form.phone || null, notes:form.notes || null };
    try {
      if (creatingBatch) {
        const details = {
          reservationDate:payload.reservationDate, reservationTime:payload.reservationTime,
          customerName:payload.customerName, phone:payload.phone,
          partySize:payload.partySize, notes:payload.notes
        };
        const result = await tableReservationService.createBatch({ ...details, tableNumbers:selectedTables });
        toast.success(`${result.count} mesas reservadas para ${form.customerName}.`);
        setSelectedTables([]);
        setMultiSelect(false);
      } else if (editing) await tableReservationService.update(editing.id, { ...payload, version:editing.version });
      else await tableReservationService.create(payload);
      if (!creatingBatch) toast.success(editing ? 'Reserva atualizada.' : 'Reserva confirmada.');
      setModalOpen(false);
      setEditing(null);
      setCreatingBatch(false);
      await load(false);
    } catch (err) {
      await load(false);
      setError(`A reserva não foi salva: ${err.message}`);
    } finally { setSaving(false); }
  };

  const cancelReservation = async () => {
    if (!editing || !window.confirm(`Cancelar a reserva da mesa ${editing.tableNumber}? O histórico será preservado.`)) return;
    setSaving(true);
    try {
      await tableReservationService.cancel(editing.id, editing.version);
      toast.success('Reserva cancelada.');
      setModalOpen(false); setEditing(null); await load(false);
    } catch (err) { await load(false); setError(`A reserva não foi cancelada: ${err.message}`); }
    finally { setSaving(false); }
  };

  const handleFile = async event => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setImporting(true);
    try {
      const reservations = normalizeBackup(JSON.parse(await file.text()));
      const preview = await tableReservationService.previewImport(reservations);
      setImportPreview(preview);
    } catch (err) { toast.error(err.message || 'Não foi possível ler o backup.'); }
    finally { setImporting(false); }
  };

  const confirmImport = async () => {
    if (!importPreview?.available?.length) return;
    setImporting(true);
    try {
      const result = await tableReservationService.importReservations(importPreview.available);
      toast.success(`${result.imported} reserva(s) importada(s).`);
      setImportPreview(null); await load(false);
    } catch (err) { await load(false); setError(`A importação não foi concluída: ${err.message}`); }
    finally { setImporting(false); }
  };

  if (!establishmentId) return <Page>Carregando estabelecimento…</Page>;
  if (!isCommercial) return <Navigate to="/" replace />;

  return <Page>
    <Header>
      <div><Title>Reservas de mesas</Title><Subtitle>Mapa e agenda compartilhados de {formatDate(selectedDate)}</Subtitle></div>
      <Toolbar>
        <Button variant="secondary" size="sm" onClick={()=>changeDate(shiftDate(selectedDate,-1))} aria-label="Dia anterior"><MdArrowBack/> Anterior</Button>
        <DateInput type="date" value={selectedDate} onChange={event=>changeDate(event.target.value)} aria-label="Data das reservas" />
        <Button variant="secondary" size="sm" onClick={()=>changeDate(shiftDate(selectedDate,1))}>Próximo <MdArrowForward/></Button>
        <Button variant="secondary" size="sm" onClick={()=>changeDate(localToday())}><MdCalendarToday/> Hoje</Button>
        <Button variant="secondary" size="sm" onClick={()=>load()} disabled={loading}><MdRefresh/> Atualizar</Button>
      </Toolbar>
    </Header>

    <Stats>
      <Stat><MdTableRestaurant/><div><strong>{data.summary.reservedTables}</strong><span>mesas reservadas</span></div></Stat>
      <Stat><MdTableRestaurant/><div><strong>{data.summary.freeTables}</strong><span>mesas livres</span></div></Stat>
      <Stat><MdPeople/><div><strong>{data.summary.expectedPeople}</strong><span>pessoas previstas</span></div></Stat>
    </Stats>

    <StatusLine $error={Boolean(error)}>{error ? 'Falha na atualização: ' + error : <><MdCloudDone/>{loading ? 'Atualizando…' : updatedAt ? `Última atualização às ${updatedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}` : 'Aguardando atualização'}</>}</StatusLine>

    <Grid>
      <Card>
        <CardHeader><h2>Mapa de mesas</h2><Toolbar><Button variant={multiSelect?'danger':'secondary'} size="sm" onClick={toggleMultiSelect}>{multiSelect?'Cancelar seleção':'Selecionar várias mesas'}</Button><Button variant="ghost" size="sm" onClick={()=>setZoom(value=>Math.max(.85,value-.15))} aria-label="Diminuir zoom"><MdZoomOut/></Button><span>{Math.round(zoom*100)}%</span><Button variant="ghost" size="sm" onClick={()=>setZoom(value=>Math.min(1.8,value+.15))} aria-label="Aumentar zoom"><MdZoomIn/></Button></Toolbar></CardHeader>
        {multiSelect && <SelectionBar><div><strong>{selectedTables.length} mesa(s) selecionada(s)</strong><div>{selectedTables.length ? `Mesas ${selectedTables.join(', ')}` : 'Clique nas mesas livres que deseja reservar.'}</div></div><Button onClick={openBatch} disabled={selectedTables.length<2}>Reservar {selectedTables.length || ''} mesas</Button></SelectionBar>}
        <MapViewport>
          <MapCanvas $zoom={zoom}>
            <MapImage src="/mapa_mesas.png" alt="Mapa aprovado do salão com 27 mesas" draggable="false" />
            {TABLES.map(table => {
              const reservation = activeByTable.get(table.n);
              const selected = selectedTables.includes(table.n);
              return <TableHit key={table.n} $table={table} $reserved={Boolean(reservation)} $selected={selected} onClick={()=>handleTableClick(table.n)} aria-pressed={multiSelect&&!reservation?selected:undefined} aria-label={`Mesa ${table.n}: ${reservation ? `reservada para ${reservation.customerName}` : selected ? 'selecionada' : 'livre'}`} title={reservation ? `Mesa ${table.n} — ${reservation.customerName}, ${reservation.reservationTime}` : selected ? `Mesa ${table.n} — selecionada` : `Mesa ${table.n} — livre`}><TableBadge $reserved={Boolean(reservation)} $selected={selected}>{reservation ? 'R' : table.n}</TableBadge></TableHit>;
            })}
          </MapCanvas>
        </MapViewport>
        <Legend><span><i style={{background:'#047857'}}/>Livre (número da mesa)</span><span><i style={{background:'#a16207'}}/>Selecionada</span><span><i style={{background:'#b91c1c'}}/>Reservada (R)</span><span>{multiSelect?'Clique para selecionar ou remover mesas livres.':'Toque ou clique na área contornada para abrir.'}</span></Legend>
      </Card>

      <Card>
        <CardHeader><h2>Reservas da data</h2><Button variant="secondary" size="sm" onClick={()=>fileInput.current?.click()} disabled={importing}><MdFileUpload/> Importar JSON</Button><input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleFile}/></CardHeader>
        <SearchBox><MdSearch/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar cliente ou mesa" aria-label="Buscar reservas"/></SearchBox>
        {importPreview && <ImportBox><h3>Prévia da importação</h3><p>{importPreview.available.length} pronta(s) para importar; {importPreview.conflicts.length} conflito(s).</p>{importPreview.conflicts.length>0&&<div className="conflicts">{importPreview.conflicts.map((item,index)=><div key={index}>Mesa {item.reservation.tableNumber}, {item.reservation.reservationDate}: {item.reason}</div>)}</div>}<Toolbar style={{marginTop:10}}><Button size="sm" onClick={confirmImport} disabled={!importPreview.available.length||importing}>Importar sem conflitos</Button><Button variant="ghost" size="sm" onClick={()=>setImportPreview(null)}>Fechar</Button></Toolbar></ImportBox>}
        <ReservationList style={{marginTop:12}}>
          {filtered.map(item=><ReservationRow key={item.id} onClick={()=>openTable(item.tableNumber)}><div className="top"><span>Mesa {item.tableNumber} · {item.customerName}</span><span>{item.reservationTime}</span></div><div className="meta">{item.partySize} pessoa(s){item.phone ? ` · ${item.phone}` : ''}</div><div className="meta">Responsável: {item.createdByUser?.name || 'Usuário não identificado'}</div></ReservationRow>)}
          {!loading && filtered.length===0 && <Empty>Nenhuma reserva encontrada nesta data.</Empty>}
        </ReservationList>
      </Card>
    </Grid>

    <Modal isOpen={modalOpen} onClose={closeModal} title={creatingBatch?`Nova reserva — ${selectedTables.length} mesas`:`${editing ? 'Editar reserva' : 'Nova reserva'} — Mesa ${form.tableNumber}`} maxWidth="640px" footer={<><Button variant="secondary" onClick={closeModal} disabled={saving}>Fechar</Button>{editing&&<Button variant="danger" onClick={cancelReservation} disabled={saving}>Cancelar reserva</Button>}<Button type="submit" form="reservation-form" disabled={saving}>{saving?'Salvando…':editing?'Salvar alterações':creatingBatch?`Confirmar ${selectedTables.length} mesas`:'Confirmar reserva'}</Button></>}>
      <p style={{marginBottom:16}}>{creatingBatch?<><strong>Mesas {selectedTables.join(', ')}</strong> em <strong>{form.reservationDate?.split('-').reverse().join('/')}</strong>. Os dados abaixo serão aplicados a cada mesa.</>:<>Mesa <strong>{form.tableNumber}</strong> em <strong>{form.reservationDate?.split('-').reverse().join('/')}</strong>. Uma mesa aceita uma reserva ativa por data.</>}</p>
      <FormGrid id="reservation-form" onSubmit={submit}>
        <Responsibility>
          Responsável pela reserva: <strong>{editing?.createdByUser?.name || loggedUser?.name || 'Usuário logado'}</strong>
          {editing?.updatedByUser?.name && <span className="updated">Última alteração por {editing.updatedByUser.name}</span>}
        </Responsibility>
        <Input label="Data" type="date" required value={form.reservationDate} onChange={event=>setForm({...form,reservationDate:event.target.value})}/>
        <Input label="Horário" type="time" required value={form.reservationTime} onChange={event=>setForm({...form,reservationTime:event.target.value})}/>
        <div className="wide"><Input label="Cliente ou responsável" required maxLength="160" value={form.customerName} onChange={event=>setForm({...form,customerName:event.target.value})}/></div>
        <Input label="Telefone (opcional)" maxLength="30" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/>
        <Input label={creatingBatch?'Quantidade de pessoas por mesa':'Quantidade de pessoas'} type="number" min="1" step="1" required value={form.partySize} onChange={event=>setForm({...form,partySize:event.target.value})}/>
        <div className="wide"><Textarea label="Observação (opcional)" maxLength="5000" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></div>
      </FormGrid>
    </Modal>
  </Page>;
}

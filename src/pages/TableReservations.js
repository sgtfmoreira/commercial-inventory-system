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
import { Input, InputControl, Textarea } from '../components/FormFields';
import tableReservationService from '../services/tableReservationService';
import tableOccupancyService from '../services/tableOccupancyService';
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

const Page = styled.div`
  width: 100%;
  min-width: 0;
  max-width: 1500px;
  display: flex;
  flex-direction: column;
  gap: 20px;

  @media (max-width: 700px) { gap: 16px; }
`;
const Header = styled.div`
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;

  @media (max-width: 700px) { flex-direction: column; }
`;
const HeaderCopy = styled.div`min-width:0;`;
const Title = styled.h1`
  color: ${({theme})=>theme.colors.textPrimary};
  font-size: clamp(1.65rem, 4vw, ${({theme})=>theme.fontSizes['3xl']});
  line-height: 1.15;
`;
const Subtitle = styled.p`
  margin-top: 4px;
  color: ${({theme})=>theme.colors.textSecondary};
  overflow-wrap: anywhere;
`;
const Toolbar = styled.div`display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;`;
const HeaderToolbar = styled(Toolbar)`
  justify-content: flex-end;

  @media (max-width: 700px) {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }
`;
const DateNavigator = styled.div`
  display: grid;
  grid-template-columns: auto minmax(148px, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-width: 0;

  @media (max-width: 480px) {
    width: 100%;
    grid-template-columns: 44px minmax(0, 1fr) 44px;
    .button-label { display: none; }
    button { width: 44px; min-height: 44px; padding: 0; }
  }
`;
const HeaderActions = styled.div`
  display: flex;
  gap: 8px;

  @media (max-width: 700px) {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    button { width: 100%; min-height: 44px; }
  }
`;
const DateInput = styled(InputControl)`
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid ${({theme})=>theme.colors.border};
  border-radius: ${({theme})=>theme.radii.md};
  background: ${({theme})=>theme.colors.bgCard};
  color: ${({theme})=>theme.colors.textPrimary};
  font: inherit;

  @media (max-width: 480px) { min-height: 44px; }
`;
const Stats = styled.div`
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 900px) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  @media (max-width: 480px) { gap: 8px; }
`;
const Stat = styled.div`
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 1px solid ${({theme})=>theme.colors.border};
  border-radius: ${({theme})=>theme.radii.lg};
  background: ${({theme})=>theme.colors.bgCard};
  box-shadow: ${({theme})=>theme.shadows.card};
  svg { flex:0 0 auto;font-size:1.65rem;color:${({theme})=>theme.colors.primary}; }
  div { min-width:0; }
  strong { display:block;font-size:1.5rem;line-height:1.1; }
  span { display:block;color:${({theme})=>theme.colors.textSecondary};font-size:.875rem;line-height:1.3;overflow-wrap:anywhere; }

  @media (max-width: 480px) {
    align-items: flex-start;
    gap: 8px;
    padding: 12px 10px;
    svg { font-size:1.35rem; }
    strong { font-size:1.25rem; }
    span { font-size:.78rem; }
  }
`;
const Grid = styled.div`
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.55fr) minmax(330px, .8fr);
  gap: 20px;
  align-items: start;

  @media (max-width: 1100px) { grid-template-columns: minmax(0, 1fr); }
  @media (max-width: 700px) { gap: 16px; }
`;
const Card = styled.section`
  min-width: 0;
  padding: 16px;
  border: 1px solid ${({theme})=>theme.colors.border};
  border-radius: ${({theme})=>theme.radii.lg};
  background: ${({theme})=>theme.colors.bgCard};
  box-shadow: ${({theme})=>theme.shadows.card};

  @media (max-width: 480px) { padding: 12px; }
`;
const CardHeader = styled.div`
  min-width: 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
  h2 { min-width:0;font-size:${({theme})=>theme.fontSizes.lg}; }

  @media (max-width: 480px) {
    align-items: stretch;
    h2 { width:100%; }
    > button { width:100%;min-height:44px; }
  }
`;
const MapModeActions = styled.div`
  display: flex;
  flex-wrap: wrap;
  justify-content: end;
  gap: 8px;
  margin-bottom: 12px;

  @media (max-width: 700px) {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 210px), 1fr));
    justify-content: stretch;
    button { width:100%;min-height:44px;white-space:normal;line-height:1.2; }
  }
`;
const ZoomControls = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: ${({theme})=>theme.colors.textSecondary};
  font-size: .85rem;
  button { min-width:40px;min-height:40px;padding:0; }
`;
const MapViewport = styled.div`
  width: 100%;
  max-height: 74vh;
  overflow: auto;
  border-radius: 10px;
  background: #062d55;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;

  @media (max-width: 700px) {
    max-height: none;
    overflow-x: auto;
    overflow-y: hidden;
    border-radius: 8px;
    overscroll-behavior-x: contain;
    scrollbar-gutter: auto;
  }
`;
const MapCanvas = styled.div`
  position: relative;
  width: ${({$zoom})=>$zoom*100}%;
  min-width: ${({$zoom})=>Math.round(690*$zoom)}px;
  line-height: 0;
  transition: width .2s ease, min-width .2s ease;

  @media (max-width: 700px) { min-width:${({$zoom})=>Math.round(580*$zoom)}px; }
`;
const MapImage = styled.img`display:block;width:100%;height:auto;user-select:none;`;
const TableHit = styled(Button).attrs(({ $table }) => ({ style: { left:`${$table.x-$table.w/2}%`,top:`${$table.y-$table.h/2}%`,width:`${$table.w}%`,height:`${$table.h}%` } }))`
  position:absolute;min-width:36px;min-height:36px;border:2px solid ${({$occupied,$reserved,$selected})=>$occupied?'#60a5fa':$reserved?'#ef4444':$selected?'#facc15':'#22c55e'};border-radius:10px;background:${({$occupied,$reserved,$selected})=>$occupied?'rgba(59,130,246,.35)':$reserved?'rgba(239,68,68,.20)':$selected?'rgba(250,204,21,.35)':'rgba(34,197,94,.12)'};color:white;line-height:1;display:flex;align-items:flex-start;justify-content:flex-end;padding:3px;box-shadow:${({$selected})=>$selected?'0 0 0 3px rgba(250,204,21,.75), inset 0 0 0 1px #fff':'inset 0 0 0 1px rgba(255,255,255,.55)'};transition:.15s;cursor:pointer;touch-action:manipulation;
  &:hover,&:focus-visible{z-index:4;outline:3px solid #fff;transform:scale(1.06);}
  @media(max-width:700px){min-width:40px;min-height:40px;border-radius:8px;}
`;
const TableBadge = styled.span`min-width:22px;height:22px;padding:0 4px;border-radius:999px;background:${({$occupied,$reserved,$selected})=>$occupied?'#1d4ed8':$reserved?'#b91c1c':$selected?'#a16207':'#047857'};display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;box-shadow:0 1px 4px #000;`;
const Legend = styled.div`
  display:flex;gap:12px 16px;flex-wrap:wrap;margin-top:12px;color:${({theme})=>theme.colors.textSecondary};font-size:.85rem;
  span{display:flex;align-items:center;gap:6px;min-width:0;}i{width:13px;height:13px;border-radius:4px;display:inline-block;flex:0 0 auto;}
  .instruction{flex-basis:100%;}
  @media(max-width:600px){display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;font-size:.78rem;.instruction{grid-column:1/-1;padding-top:4px;}}
`;
const SelectionBar = styled.div`
  display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:12px 14px;border:1px solid #eab308;border-radius:${({theme})=>theme.radii.md};background:rgba(250,204,21,.12);color:${({theme})=>theme.colors.textPrimary};
  > div{min-width:0;overflow-wrap:anywhere;}strong{color:#a16207;}
  @media(max-width:600px){align-items:stretch;padding:12px;>div{width:100%;}button{width:100%;min-height:44px;}}
`;
const SearchBox = styled.div`position:relative;width:100%;min-width:0;svg{position:absolute;left:11px;top:11px;color:${({theme})=>theme.colors.textMuted};}input{width:100%;min-width:0;padding:9px 12px 9px 36px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};}`;
const ReservationList = styled.div`
  display:flex;flex-direction:column;gap:8px;max-height:68vh;overflow:auto;
  @media(max-width:1100px){max-height:none;overflow:visible;}
`;
const ReservationRow = styled(Button)`
  width:100%;padding:12px;text-align:left;white-space:normal;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};color:${({theme})=>theme.colors.textPrimary};
  > span{display:block;width:100%;min-width:0;}.top{display:flex;justify-content:space-between;gap:10px;font-weight:700;line-height:1.35;}.top span{min-width:0;overflow-wrap:anywhere;}.top span:last-child{flex:0 0 auto;}.meta{color:${({theme})=>theme.colors.textSecondary};font-size:.86rem;line-height:1.4;margin-top:5px;overflow-wrap:anywhere;}&:hover{border-color:${({theme})=>theme.colors.primary};}
  @media(max-width:480px){min-height:44px;padding:12px 10px;.top{flex-direction:column;gap:3px;}.top span:last-child{font-size:.8rem;color:${({theme})=>theme.colors.textSecondary};}}
`;
const Empty = styled.div`padding:36px 12px;text-align:center;color:${({theme})=>theme.colors.textMuted};`;
const StatusLine = styled.div`display:flex;align-items:flex-start;gap:8px;color:${({theme,$error})=>$error?theme.colors.danger:theme.colors.textMuted};font-size:.82rem;line-height:1.4;overflow-wrap:anywhere;svg{flex:0 0 auto;margin-top:1px;}`;
const FormGrid = styled.form`display:grid;grid-template-columns:1fr 1fr;gap:14px;@media(max-width:520px){grid-template-columns:1fr;}.wide{grid-column:1/-1;}`;
const ImportBox = styled.div`margin-top:16px;padding:14px;border:1px solid ${({theme})=>theme.colors.border};border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.bgInput};overflow-wrap:anywhere;h3{font-size:1rem;margin-bottom:8px}.conflicts{color:${({theme})=>theme.colors.danger};margin-top:8px;font-size:.88rem;max-height:120px;overflow:auto;}@media(max-width:480px){padding:12px;}`;
const Responsibility = styled.div`grid-column:1/-1;padding:12px 14px;border-radius:${({theme})=>theme.radii.md};background:${({theme})=>theme.colors.infoLight};color:${({theme})=>theme.colors.textSecondary};font-size:.9rem;strong{color:${({theme})=>theme.colors.textPrimary};}.updated{display:block;margin-top:3px;font-size:.8rem;color:${({theme})=>theme.colors.textMuted};}`;
const OccupancySection = styled.div`margin-top:14px;padding-top:14px;border-top:1px solid ${({theme})=>theme.colors.border};h3{font-size:.95rem;margin-bottom:8px;color:${({theme})=>theme.colors.textPrimary};}`;

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
  const [occupancyData, setOccupancyData] = useState({ occupancies:[], summary:{occupiedTables:0,seatedPeople:0} });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState(null);
  const [search, setSearch] = useState('');
  const [zoom, setZoom] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [joiningNow, setJoiningNow] = useState(false);
  const [selectedTables, setSelectedTables] = useState([]);
  const [creatingBatch, setCreatingBatch] = useState(false);
  const [walkInMode, setWalkInMode] = useState(false);
  const [occupancyModalOpen, setOccupancyModalOpen] = useState(false);
  const [occupancyEditing, setOccupancyEditing] = useState(null);
  const [occupancyForm, setOccupancyForm] = useState({ tableNumber:1, customerName:'', partySize:'', notes:'' });
  const [occupancySaving, setOccupancySaving] = useState(false);
  const [form, setForm] = useState(emptyForm(1, localToday()));
  const [saving, setSaving] = useState(false);
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const requestId = useRef(0);
  const selectedDateRef = useRef(selectedDate);
  const establishmentRef = useRef(establishmentId);
  const fileInput = useRef(null);
  const mapViewportRef = useRef(null);

  selectedDateRef.current = selectedDate;

  const changeDate = value => {
    requestId.current += 1;
    selectedDateRef.current = value;
    setMultiSelect(false);
    setJoiningNow(false);
    setWalkInMode(false);
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
      const [result, currentOccupancies] = await Promise.all([
        tableReservationService.list(requestedDate),
        requestedDate === localToday()
          ? tableOccupancyService.list()
          : Promise.resolve({ occupancies:[], summary:{occupiedTables:0,seatedPeople:0} })
      ]);
      if (id !== requestId.current || requestedDate !== selectedDateRef.current || requestedEstablishment !== establishmentRef.current) return;
      setData(result);
      setOccupancyData(currentOccupancies);
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
      setJoiningNow(false);
      setWalkInMode(false);
      setSelectedTables([]);
      setCreatingBatch(false);
      setOccupancyModalOpen(false);
      setOccupancyEditing(null);
      setImportPreview(null);
    }
  }, [establishmentId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = mapViewportRef.current;
      if (viewport && window.matchMedia('(max-width: 700px)').matches) {
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);
  useEffect(() => {
    const refreshVisible = () => { if (document.visibilityState === 'visible') load(false); };
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('focus', refreshVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', refreshVisible); window.removeEventListener('focus', refreshVisible); };
  }, [load]);

  const activeByTable = useMemo(() => new Map(data.reservations.filter(item => item.status === 'CONFIRMED').map(item => [item.tableNumber, item])), [data.reservations]);
  const occupiedByTable = useMemo(() => new Map(occupancyData.occupancies.map(item => [item.tableNumber, item])), [occupancyData.occupancies]);
  const availableTables = useMemo(() => {
    const unavailable = new Set([...activeByTable.keys(), ...occupiedByTable.keys()]);
    return TABLES.length - unavailable.size;
  }, [activeByTable, occupiedByTable]);
  const filtered = useMemo(() => {
    const uniqueReservations = Array.from(data.reservations.reduce((items, item) => {
      const key = item.reservationGroupId || item.id;
      if (!items.has(key)) items.set(key, item);
      return items;
    }, new Map()).values());
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return uniqueReservations;
    return uniqueReservations.filter(item => item.customerName.toLocaleLowerCase('pt-BR').includes(term)
      || (item.groupTableNumbers || [item.tableNumber]).some(tableNumber => String(tableNumber).includes(term)));
  }, [data.reservations, search]);
  const visibleOccupancies = useMemo(() => Array.from(occupancyData.occupancies.reduce((items, item) => {
    const key = item.occupancyGroupId || item.id;
    if (!items.has(key)) items.set(key, item);
    return items;
  }, new Map()).values()), [occupancyData.occupancies]);

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
    const occupancy = occupiedByTable.get(tableNumber);
    if (occupancy) return openOccupancy(occupancy);
    const reservation = activeByTable.get(tableNumber);
    if (reservation) return openTable(tableNumber);
    if (walkInMode) return openWalkIn(tableNumber);
    if (multiSelect) return setSelectedTables(current => toggleTableSelection(current, tableNumber));
    return openTable(tableNumber);
  };

  const toggleMultiSelect = () => {
    setMultiSelect(current => !current);
    setJoiningNow(false);
    setWalkInMode(false);
    setSelectedTables([]);
  };

  const toggleJoinNow = () => {
    const willJoin = !multiSelect || !joiningNow;
    setMultiSelect(willJoin);
    setJoiningNow(willJoin);
    setWalkInMode(false);
    setSelectedTables([]);
  };

  const toggleWalkInMode = () => {
    setWalkInMode(current => !current);
    setMultiSelect(false);
    setJoiningNow(false);
    setSelectedTables([]);
  };

  const openOccupancy = occupancy => {
    setOccupancyEditing(occupancy || null);
    setOccupancyForm(occupancy ? {
      tableNumber:occupancy.tableNumber, customerName:occupancy.customerName || '',
      partySize:String(occupancy.partySize), notes:occupancy.notes || ''
    } : { tableNumber:1, customerName:'', partySize:'', notes:'' });
    setOccupancyModalOpen(true);
  };

  const openWalkIn = tableNumber => {
    setOccupancyEditing(null);
    setOccupancyForm({ tableNumber, customerName:'', partySize:'', notes:'' });
    setOccupancyModalOpen(true);
  };

  const openBatch = () => {
    if (selectedTables.length < 2) return;
    if (joiningNow) {
      setOccupancyEditing(null);
      setOccupancyForm({ tableNumber:selectedTables[0], customerName:'', partySize:'', notes:'' });
      setOccupancyModalOpen(true);
      return;
    }
    setEditing(null);
    setCreatingBatch(true);
    setForm(emptyForm(selectedTables[0], selectedDate));
    setModalOpen(true);
  };

  const closeModal = () => { if (!saving) { setModalOpen(false); setEditing(null); setCreatingBatch(false); } };
  const closeOccupancyModal = () => { if (!occupancySaving) { setOccupancyModalOpen(false); setOccupancyEditing(null); } };

  const submitOccupancy = async event => {
    event.preventDefault();
    setOccupancySaving(true);
    try {
      const details = {
        customerName:occupancyForm.customerName || null,
        partySize:Number(occupancyForm.partySize),
        notes:occupancyForm.notes || null
      };
      if (joiningNow && selectedTables.length > 1) {
        await tableOccupancyService.createBatch({ ...details, tableNumbers:selectedTables });
        toast.success(`Mesas ${selectedTables.join(', ')} foram juntadas.`);
        setSelectedTables([]);
        setMultiSelect(false);
        setJoiningNow(false);
      } else {
        await tableOccupancyService.create({ ...details, tableNumber:Number(occupancyForm.tableNumber) });
        toast.success(`Mesa ${occupancyForm.tableNumber} marcada como ocupada.`);
      }
      setOccupancyModalOpen(false); setOccupancyEditing(null); setWalkInMode(false);
      await load(false);
    } catch (err) { await load(false); setError(`A ocupação não foi registrada: ${err.message}`); }
    finally { setOccupancySaving(false); }
  };

  const releaseOccupancy = async () => {
    const tables = occupancyEditing?.groupTableNumbers || [occupancyEditing?.tableNumber];
    const label = tables.length > 1 ? `as mesas ${tables.join(' e ')}` : `a mesa ${tables[0]}`;
    if (!occupancyEditing || !window.confirm(`Liberar ${label}? O histórico será preservado.`)) return;
    setOccupancySaving(true);
    try {
      await tableOccupancyService.release(occupancyEditing.id, occupancyEditing.version);
      toast.success(tables.length > 1 ? 'Mesas liberadas.' : `Mesa ${occupancyEditing.tableNumber} liberada.`);
      setOccupancyModalOpen(false); setOccupancyEditing(null); await load(false);
    } catch (err) { await load(false); setError(`A mesa não foi liberada: ${err.message}`); }
    finally { setOccupancySaving(false); }
  };
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
    const tables = editing?.groupTableNumbers || [editing?.tableNumber];
    const tableLabel = tables.length > 1 ? `das mesas ${tables.join(' e ')}` : `da mesa ${tables[0]}`;
    if (!editing || !window.confirm(`Cancelar a reserva ${tableLabel}? O histórico será preservado.`)) return;
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
      <HeaderCopy><Title>Reservas de mesas</Title><Subtitle>Mapa e agenda compartilhados de {formatDate(selectedDate)}</Subtitle></HeaderCopy>
      <HeaderToolbar>
        <DateNavigator>
          <Button variant="secondary" size="sm" onClick={()=>changeDate(shiftDate(selectedDate,-1))} aria-label="Dia anterior"><MdArrowBack/><span className="button-label">Anterior</span></Button>
          <DateInput type="date" value={selectedDate} onChange={event=>changeDate(event.target.value)} aria-label="Data das reservas" />
          <Button variant="secondary" size="sm" onClick={()=>changeDate(shiftDate(selectedDate,1))} aria-label="Próximo dia"><span className="button-label">Próximo</span><MdArrowForward/></Button>
        </DateNavigator>
        <HeaderActions>
          <Button variant="secondary" size="sm" onClick={()=>changeDate(localToday())}><MdCalendarToday/> Hoje</Button>
          <Button variant="secondary" size="sm" onClick={()=>load()} disabled={loading}><MdRefresh/> Atualizar</Button>
        </HeaderActions>
      </HeaderToolbar>
    </Header>

    <Stats>
      <Stat><MdTableRestaurant/><div><strong>{data.summary.reservedTables}</strong><span>mesas reservadas</span></div></Stat>
      <Stat><MdTableRestaurant/><div><strong>{availableTables}</strong><span>mesas livres</span></div></Stat>
      <Stat><MdPeople/><div><strong>{data.summary.expectedPeople}</strong><span>pessoas previstas</span></div></Stat>
      <Stat><MdPeople/><div><strong>{occupancyData.summary.occupiedTables}</strong><span>mesas ocupadas agora ({occupancyData.summary.seatedPeople} pessoas)</span></div></Stat>
    </Stats>

    <StatusLine $error={Boolean(error)}>{error ? 'Falha na atualização: ' + error : <><MdCloudDone/>{loading ? 'Atualizando…' : updatedAt ? `Última atualização às ${updatedAt.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}` : 'Aguardando atualização'}</>}</StatusLine>

    <Grid>
      <Card>
        <CardHeader><h2>Mapa de mesas</h2><ZoomControls><Button variant="ghost" size="sm" iconOnly onClick={()=>setZoom(value=>Math.max(.85,value-.15))} aria-label="Diminuir zoom"><MdZoomOut/></Button><span aria-live="polite">{Math.round(zoom*100)}%</span><Button variant="ghost" size="sm" iconOnly onClick={()=>setZoom(value=>Math.min(1.8,value+.15))} aria-label="Aumentar zoom"><MdZoomIn/></Button></ZoomControls></CardHeader>
        <MapModeActions>{selectedDate===localToday()&&<Button variant={walkInMode?'danger':'secondary'} size="sm" onClick={toggleWalkInMode}>{walkInMode?'Cancelar ocupação':'Registrar chegada sem reserva'}</Button>}{selectedDate===localToday()&&<Button variant={multiSelect&&joiningNow?'danger':'secondary'} size="sm" onClick={toggleJoinNow}>{multiSelect&&joiningNow?'Cancelar união':'Juntar mesas agora'}</Button>}<Button variant={multiSelect&&!joiningNow?'danger':'secondary'} size="sm" onClick={toggleMultiSelect}>{multiSelect&&!joiningNow?'Cancelar seleção':'Reservar várias mesas'}</Button></MapModeActions>
        {walkInMode && <SelectionBar><div><strong>Modo de ocupação sem reserva</strong><div>Clique em uma mesa livre para registrar as pessoas que chegaram agora.</div></div></SelectionBar>}
        {multiSelect && <SelectionBar><div><strong>{selectedTables.length} mesa(s) selecionada(s)</strong><div>{selectedTables.length ? `Mesas ${selectedTables.join(', ')}` : `Clique em quaisquer mesas livres que deseja ${joiningNow?'juntar agora':'reservar'}.`}</div></div><Button onClick={openBatch} disabled={selectedTables.length<2}>{joiningNow?'Juntar':'Reservar'} {selectedTables.length || ''} mesas</Button></SelectionBar>}
        <MapViewport ref={mapViewportRef}>
          <MapCanvas $zoom={zoom}>
            <MapImage src="/mapa_mesas.png" alt="Mapa aprovado do salão com 27 mesas" draggable="false" />
            {TABLES.map(table => {
              const reservation = activeByTable.get(table.n);
              const occupancy = occupiedByTable.get(table.n);
              const selected = selectedTables.includes(table.n);
              const description = occupancy ? `ocupada por ${occupancy.partySize} pessoa(s)` : reservation ? `reservada para ${reservation.customerName}` : selected ? 'selecionada' : 'livre';
              return <TableHit key={table.n} $table={table} $occupied={Boolean(occupancy)} $reserved={Boolean(reservation)} $selected={selected} onClick={()=>handleTableClick(table.n)} aria-pressed={multiSelect&&!reservation&&!occupancy?selected:undefined} aria-label={`Mesa ${table.n}: ${description}`} title={`Mesa ${table.n} — ${description}`}><TableBadge $occupied={Boolean(occupancy)} $reserved={Boolean(reservation)} $selected={selected}>{occupancy?'O':reservation?'R':table.n}</TableBadge></TableHit>;
            })}
          </MapCanvas>
        </MapViewport>
        <Legend><span><i style={{background:'#047857'}}/>Livre (número da mesa)</span><span><i style={{background:'#1d4ed8'}}/>Ocupada agora (O)</span><span><i style={{background:'#a16207'}}/>Selecionada</span><span><i style={{background:'#b91c1c'}}/>Reservada (R)</span><span className="instruction">{walkInMode?'Clique numa mesa livre para registrar a ocupação.':multiSelect?'Clique para selecionar ou remover mesas livres.':'Arraste o mapa e toque na área contornada de uma mesa para abrir.'}</span></Legend>
      </Card>

      <Card>
        <CardHeader><h2>Reservas da data</h2><Button variant="secondary" size="sm" onClick={()=>fileInput.current?.click()} disabled={importing}><MdFileUpload/> Importar JSON</Button><InputControl ref={fileInput} type="file" accept="application/json,.json" hidden onChange={handleFile}/></CardHeader>
        <SearchBox><MdSearch/><InputControl value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar cliente ou mesa" aria-label="Buscar reservas"/></SearchBox>
        {importPreview && <ImportBox><h3>Prévia da importação</h3><p>{importPreview.available.length} pronta(s) para importar; {importPreview.conflicts.length} conflito(s).</p>{importPreview.conflicts.length>0&&<div className="conflicts">{importPreview.conflicts.map((item,index)=><div key={index}>Mesa {item.reservation.tableNumber}, {item.reservation.reservationDate}: {item.reason}</div>)}</div>}<Toolbar style={{marginTop:10}}><Button size="sm" onClick={confirmImport} disabled={!importPreview.available.length||importing}>Importar sem conflitos</Button><Button variant="ghost" size="sm" onClick={()=>setImportPreview(null)}>Fechar</Button></Toolbar></ImportBox>}
        {selectedDate===localToday()&&visibleOccupancies.length>0&&<OccupancySection><h3>Ocupações sem reserva agora</h3>{visibleOccupancies.map(item=>{const tables=item.groupTableNumbers||[item.tableNumber];return <ReservationRow key={item.occupancyGroupId||item.id} onClick={()=>openOccupancy(item)}><div className="top"><span>{tables.length>1?'Mesas':'Mesa'} {tables.join(' e ')} · {item.customerName || 'Cliente não identificado'}</span><span>{tables.length>1?'Juntas':'Ocupada'}</span></div><div className="meta">{item.partySize} pessoa(s) · chegada {new Date(item.seatedAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}</div><div className="meta">Registrada por: {item.createdByUser?.name || 'Usuário não identificado'}</div></ReservationRow>})}</OccupancySection>}
        <ReservationList style={{marginTop:12}}>
          {filtered.map(item=>{const tables=item.groupTableNumbers||[item.tableNumber];return <ReservationRow key={item.reservationGroupId||item.id} onClick={()=>openTable(item.tableNumber)}><div className="top"><span>{tables.length>1?'Mesas':'Mesa'} {tables.join(' e ')} · {item.customerName}</span><span>{item.reservationTime}</span></div><div className="meta">{item.partySize} pessoa(s){tables.length>1?' no total':''}{item.phone ? ` · ${item.phone}` : ''}</div><div className="meta">Responsável: {item.createdByUser?.name || 'Usuário não identificado'}</div></ReservationRow>})}
          {!loading && filtered.length===0 && <Empty>Nenhuma reserva encontrada nesta data.</Empty>}
        </ReservationList>
      </Card>
    </Grid>

    <Modal isOpen={modalOpen} onClose={closeModal} title={creatingBatch?`Nova reserva — ${selectedTables.length} mesas`:`${editing ? 'Editar reserva' : 'Nova reserva'} — ${(editing?.groupTableNumbers?.length||0)>1?'Mesas '+editing.groupTableNumbers.join(' e '):'Mesa '+form.tableNumber}`} maxWidth="640px" footer={<><Button variant="secondary" onClick={closeModal} disabled={saving}>Fechar</Button>{editing&&<Button variant="danger" onClick={cancelReservation} disabled={saving}>Cancelar reserva</Button>}<Button type="submit" form="reservation-form" disabled={saving}>{saving?'Salvando…':editing?'Salvar alterações':creatingBatch?`Confirmar ${selectedTables.length} mesas`:'Confirmar reserva'}</Button></>}>
      <p style={{marginBottom:16}}>{creatingBatch?<><strong>Mesas {selectedTables.join(', ')}</strong> em <strong>{form.reservationDate?.split('-').reverse().join('/')}</strong>. A quantidade informada representa o total de pessoas do grupo.</>:editing?.groupTableNumbers?.length>1?<><strong>Mesas {editing.groupTableNumbers.join(' e ')}</strong> em <strong>{form.reservationDate?.split('-').reverse().join('/')}</strong>. As alterações serão aplicadas à reserva completa.</>:<>Mesa <strong>{form.tableNumber}</strong> em <strong>{form.reservationDate?.split('-').reverse().join('/')}</strong>. Uma mesa aceita uma reserva ativa por data.</>}</p>
      <FormGrid id="reservation-form" onSubmit={submit}>
        <Responsibility>
          Responsável pela reserva: <strong>{editing?.createdByUser?.name || loggedUser?.name || 'Usuário logado'}</strong>
          {editing?.updatedByUser?.name && <span className="updated">Última alteração por {editing.updatedByUser.name}</span>}
        </Responsibility>
        <Input label="Data" type="date" required value={form.reservationDate} onChange={event=>setForm({...form,reservationDate:event.target.value})}/>
        <Input label="Horário" type="time" required value={form.reservationTime} onChange={event=>setForm({...form,reservationTime:event.target.value})}/>
        <div className="wide"><Input label="Cliente ou responsável" required maxLength="160" value={form.customerName} onChange={event=>setForm({...form,customerName:event.target.value})}/></div>
        <Input label="Telefone (opcional)" maxLength="30" value={form.phone} onChange={event=>setForm({...form,phone:event.target.value})}/>
        <Input label={creatingBatch||editing?.groupTableNumbers?.length>1?'Quantidade total de pessoas':'Quantidade de pessoas'} type="number" min="1" step="1" required value={form.partySize} onChange={event=>setForm({...form,partySize:event.target.value})}/>
        <div className="wide"><Textarea label="Observação (opcional)" maxLength="5000" value={form.notes} onChange={event=>setForm({...form,notes:event.target.value})}/></div>
      </FormGrid>
    </Modal>

    <Modal isOpen={occupancyModalOpen} onClose={closeOccupancyModal} title={occupancyEditing?`${(occupancyEditing.groupTableNumbers?.length||0)>1?'Mesas ocupadas':'Mesa ocupada'} — ${(occupancyEditing.groupTableNumbers||[occupancyEditing.tableNumber]).join(' e ')}`:joiningNow?`Juntar mesas — ${selectedTables.join(' e ')}`:`Registrar ocupação — Mesa ${occupancyForm.tableNumber}`} maxWidth="560px" footer={<><Button variant="secondary" onClick={closeOccupancyModal} disabled={occupancySaving}>Fechar</Button>{occupancyEditing?<Button variant="danger" onClick={releaseOccupancy} disabled={occupancySaving}>{occupancySaving?'Liberando…':(occupancyEditing.groupTableNumbers?.length||0)>1?'Liberar mesas':'Liberar mesa'}</Button>:<Button type="submit" form="occupancy-form" disabled={occupancySaving}>{occupancySaving?'Salvando…':joiningNow?'Juntar e ocupar':'Marcar como ocupada'}</Button>}</>}>
      {occupancyEditing?<div><p><strong>{occupancyEditing.partySize} pessoa(s)</strong>{occupancyEditing.customerName?` · ${occupancyEditing.customerName}`:''}</p>{(occupancyEditing.groupTableNumbers?.length||0)>1&&<p style={{marginTop:8}}>Mesas unidas: <strong>{occupancyEditing.groupTableNumbers.join(', ')}</strong></p>}<p style={{marginTop:8,color:'#64748b'}}>Chegada: {new Date(occupancyEditing.seatedAt).toLocaleString('pt-BR')} · registrada por {occupancyEditing.createdByUser?.name || 'usuário não identificado'}.</p>{occupancyEditing.notes&&<p style={{marginTop:12}}>{occupancyEditing.notes}</p>}</div>:<FormGrid id="occupancy-form" onSubmit={submitOccupancy}>{joiningNow&&<div className="wide">As mesas <strong>{selectedTables.join(', ')}</strong> serão ocupadas pelo mesmo grupo.</div>}<div className="wide"><Input label="Cliente ou identificação (opcional)" maxLength="160" value={occupancyForm.customerName} onChange={event=>setOccupancyForm({...occupancyForm,customerName:event.target.value})}/></div><Input label="Quantidade total de pessoas" type="number" min="1" step="1" required value={occupancyForm.partySize} onChange={event=>setOccupancyForm({...occupancyForm,partySize:event.target.value})}/><div className="wide"><Textarea label="Observação (opcional)" maxLength="5000" value={occupancyForm.notes} onChange={event=>setOccupancyForm({...occupancyForm,notes:event.target.value})}/></div></FormGrid>}
    </Modal>
  </Page>;
}

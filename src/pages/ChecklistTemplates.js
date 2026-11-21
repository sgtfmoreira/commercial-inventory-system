import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import styled from 'styled-components';
import toast from 'react-hot-toast';
import {
  MdAdd, MdArrowBack, MdArrowDownward, MdArrowUpward, MdChecklist,
  MdContentCopy, MdDelete, MdPreview, MdPublish, MdSave,
} from 'react-icons/md';
import { useApp } from '../context/AppContext';
import checklistTemplateService from '../services/checklistTemplateService';
import Button from '../components/Button';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import Loading from '../components/Loading';
import Modal from '../components/Modal';
import { CheckboxControl, Input, Select, Textarea } from '../components/FormFields';
import { Page, PageActions, PageHeader, PageHeading, PageSubtitle, PageTitle } from '../components/PageLayout';

const RESPONSE_LABELS = {
  BOOLEAN: 'Sim ou não',
  CHOICE: 'Múltipla escolha',
  NUMBER: 'Número',
  TEXT: 'Texto',
};

const Grid = styled.div`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const TemplateGrid = styled(Grid)`grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));`;
const TemplateCard = styled(Card)`display: grid; gap: ${({ theme }) => theme.spacing.md};`;
const CardTop = styled.div`display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;`;
const Muted = styled.p`margin: 0; color: ${({ theme }) => theme.colors.textSecondary}; font-size: ${({ theme }) => theme.fontSizes.sm};`;
const Status = styled.span`
  width: fit-content; padding: 4px 10px; border-radius: ${({ theme }) => theme.radii.pill};
  color: ${({ theme, $status }) => $status === 'PUBLISHED' ? theme.colors.success : $status === 'RETIRED' ? theme.colors.textMuted : theme.colors.warning};
  background: ${({ theme, $status }) => $status === 'PUBLISHED' ? theme.colors.successLight : $status === 'RETIRED' ? theme.colors.bgHover : theme.colors.warningLight};
  font-size: ${({ theme }) => theme.fontSizes.xs}; font-weight: ${({ theme }) => theme.fontWeights.semibold};
`;
const EditorLayout = styled.div`
  display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: ${({ theme }) => theme.spacing.lg}; align-items: start;
  @media (max-width: 960px) { grid-template-columns: 1fr; }
`;
const Editor = styled(Grid)``;
const MetadataGrid = styled.div`
  display: grid; grid-template-columns: 1.4fr 1fr; gap: ${({ theme }) => theme.spacing.md};
  @media (max-width: 640px) { grid-template-columns: 1fr; }
`;
const SectionCard = styled(Card)`display: grid; gap: ${({ theme }) => theme.spacing.md}; border-left: 4px solid ${({ theme }) => theme.colors.primary};`;
const ItemCard = styled.div`
  display: grid; gap: ${({ theme }) => theme.spacing.sm}; padding: ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border}; border-radius: ${({ theme }) => theme.radii.md};
  background: ${({ theme }) => theme.colors.bgHover};
`;
const Row = styled.div`display: flex; gap: ${({ theme }) => theme.spacing.sm}; align-items: center; flex-wrap: wrap;`;
const Grow = styled.div`flex: 1 1 220px; min-width: 0;`;
const Flags = styled.div`display: flex; gap: 16px; flex-wrap: wrap;`;
const CheckLabel = styled.label`
  display: inline-flex; align-items: center; gap: 8px; color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm}; cursor: pointer;
`;
const VersionRail = styled(Card)`display: grid; gap: ${({ theme }) => theme.spacing.sm}; position: sticky; top: 24px;`;
const VersionButton = styled(Button)`justify-content: space-between; width: 100%;`;
const OptionRow = styled.div`display: grid; grid-template-columns: minmax(0, 1fr) 110px auto; gap: 8px; align-items: end; @media(max-width: 560px){grid-template-columns: 1fr;}`;
const PreviewSection = styled.div`display: grid; gap: 8px; padding: 16px 0; border-bottom: 1px solid ${({ theme }) => theme.colors.border};`;
const EmptyEditor = styled(Card)`text-align: center; display: grid; gap: 16px; justify-items: center;`;
const ReadOnlyVersion = styled(Card)`display: grid; gap: ${({ theme }) => theme.spacing.md};`;

const createKey = prefix => {
  const value = window.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  return `${prefix}_${value.replaceAll('-', '')}`.slice(0, 70);
};

const defaultItem = () => ({
  stableKey: createKey('item'), title: '', instructions: '', responseType: 'BOOLEAN',
  required: true, allowNotApplicable: false, critical: false, evidenceRequired: false,
  maxPoints: 1, answerConfigJson: null, scoringConfigJson: { expected: true },
});
const defaultSection = () => ({ stableKey: createKey('section'), title: '', description: '', items: [] });

const normalizeItemType = (item, responseType) => {
  if (responseType === 'BOOLEAN') return { ...item, responseType, answerConfigJson: null, scoringConfigJson: { expected: true } };
  if (responseType === 'CHOICE') {
    const first = createKey('option'); const second = createKey('option');
    return {
      ...item, responseType,
      answerConfigJson: { options: [{ value: first, label: 'Conforme' }, { value: second, label: 'Não conforme' }] },
      scoringConfigJson: { pointsByValue: { [first]: Number(item.maxPoints) || 1, [second]: 0 } },
    };
  }
  if (responseType === 'NUMBER') return { ...item, responseType, answerConfigJson: {}, scoringConfigJson: { operator: 'GTE', value: 0 } };
  return { ...item, responseType, answerConfigJson: { maxLength: 1000 }, scoringConfigJson: { mode: 'COMPLETION' } };
};

const sorted = values => [...(values || [])].sort((a, b) => a.position - b.position);
const toForm = (template, draft) => ({
  name: template.name,
  category: template.category || '',
  description: template.description || '',
  approvalRequired: draft.approvalRequired,
  passingScore: Number(draft.passingScore),
  sections: sorted(draft.sections).map(section => ({
    stableKey: section.stableKey, title: section.title, description: section.description || '',
    items: sorted(section.items).map(item => ({ ...item, maxPoints: Number(item.maxPoints), instructions: item.instructions || '' })),
  })),
});

const payloadFrom = (form, draft) => ({
  expectedUpdatedAt: draft.updatedAt,
  name: form.name,
  category: form.category || null,
  description: form.description || null,
  approvalRequired: form.approvalRequired,
  passingScore: Number(form.passingScore),
  sections: form.sections.map((section, sectionIndex) => ({
    stableKey: section.stableKey,
    title: section.title,
    description: section.description || null,
    position: sectionIndex + 1,
    items: section.items.map((item, itemIndex) => ({
      stableKey: item.stableKey,
      title: item.title,
      instructions: item.instructions || null,
      position: itemIndex + 1,
      responseType: item.responseType,
      required: item.required,
      allowNotApplicable: item.allowNotApplicable,
      critical: item.critical,
      evidenceRequired: item.evidenceRequired,
      maxPoints: Number(item.maxPoints),
      answerConfigJson: item.answerConfigJson ?? null,
      scoringConfigJson: item.scoringConfigJson ?? null,
    })),
  })),
});

const latestStatus = template => template.versions?.[0]?.status || 'DRAFT';
const statusLabel = status => ({ DRAFT: 'Rascunho', PUBLISHED: 'Publicada', RETIRED: 'Retirada' }[status] || status);

export default function ChecklistTemplates() {
  const { templateId } = useParams();
  const navigate = useNavigate();
  const { state, hasCapability } = useApp();
  const [templates, setTemplates] = useState([]);
  const [template, setTemplate] = useState(null);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ name: '', category: '', description: '', passingScore: 80, approvalRequired: true });

  const canManage = hasCapability('checklists.templates.manage');
  const draft = template?.versions?.find(version => version.status === 'DRAFT') || null;
  const selectedVersion = template?.versions?.find(version => version.id === selectedVersionId)
    || draft || template?.versions?.[0] || null;
  const editingDraft = Boolean(draft && selectedVersion?.id === draft.id && form);

  const loadList = useCallback(async () => {
    const data = await checklistTemplateService.list();
    setTemplates(data);
  }, []);

  const loadTemplate = useCallback(async id => {
    const data = await checklistTemplateService.get(id);
    setTemplate(data);
    const nextDraft = data.versions.find(version => version.status === 'DRAFT');
    setSelectedVersionId(current => data.versions.some(version => version.id === current) ? current : (nextDraft?.id || data.versions[0]?.id));
    setForm(nextDraft ? toForm(data, nextDraft) : null);
    return data;
  }, []);

  useEffect(() => {
    if (!state.capabilitiesLoaded) return;
    if (!canManage) { setLoading(false); return; }
    setLoading(true);
    (templateId ? loadTemplate(templateId) : loadList())
      .catch(error => toast.error(error.message))
      .finally(() => setLoading(false));
  }, [state.capabilitiesLoaded, canManage, templateId, loadList, loadTemplate]);

  const updateSection = (sectionIndex, patch) => setForm(current => ({
    ...current,
    sections: current.sections.map((section, index) => index === sectionIndex ? { ...section, ...patch } : section),
  }));
  const updateItem = (sectionIndex, itemIndex, patch) => setForm(current => ({
    ...current,
    sections: current.sections.map((section, index) => index !== sectionIndex ? section : {
      ...section,
      items: section.items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, ...patch } : item),
    }),
  }));
  const move = (values, index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= values.length) return values;
    const result = [...values];
    [result[index], result[target]] = [result[target], result[index]];
    return result;
  };

  const createTemplate = async event => {
    event.preventDefault(); setSaving(true);
    try {
      const created = await checklistTemplateService.create({
        ...newTemplate, passingScore: Number(newTemplate.passingScore),
        category: newTemplate.category || null, description: newTemplate.description || null,
      });
      toast.success('Modelo criado como rascunho.');
      setCreateOpen(false);
      navigate(`/checklists/templates/${created.id}`);
    } catch (error) { toast.error(error.message); } finally { setSaving(false); }
  };

  const save = async () => {
    if (!draft || !form) return null;
    setSaving(true);
    try {
      const updated = await checklistTemplateService.saveDraft(template.id, payloadFrom(form, draft));
      setTemplate(updated);
      const updatedDraft = updated.versions.find(version => version.status === 'DRAFT');
      setSelectedVersionId(updatedDraft.id);
      setForm(toForm(updated, updatedDraft));
      toast.success('Rascunho salvo.');
      return updated;
    } catch (error) { toast.error(error.message); return null; } finally { setSaving(false); }
  };

  const publish = async () => {
    const saved = await save();
    const savedDraft = saved?.versions?.find(version => version.status === 'DRAFT');
    if (!savedDraft) return;
    setSaving(true);
    try {
      const updated = await checklistTemplateService.publish(template.id, savedDraft.updatedAt);
      setTemplate(updated); setForm(null); setSelectedVersionId(updated.versions[0]?.id);
      toast.success('Versão publicada e protegida contra alterações.');
    } catch (error) { toast.error(error.message); } finally { setSaving(false); }
  };

  const clone = async versionId => {
    setSaving(true);
    try {
      const updated = await checklistTemplateService.cloneVersion(template.id, versionId);
      const nextDraft = updated.versions.find(version => version.status === 'DRAFT');
      setTemplate(updated); setSelectedVersionId(nextDraft.id); setForm(toForm(updated, nextDraft));
      toast.success(`Versão ${nextDraft.version} criada como rascunho.`);
    } catch (error) { toast.error(error.message); } finally { setSaving(false); }
  };

  const retire = async version => {
    if (!window.confirm(`Retirar a versão ${version.version} de circulação?`)) return;
    setSaving(true);
    try {
      const updated = await checklistTemplateService.retire(template.id, version.id, version.updatedAt);
      setTemplate(updated); setSelectedVersionId(updated.versions.find(item => item.id === version.id)?.id);
      toast.success('Versão retirada. O histórico foi preservado.');
    } catch (error) { toast.error(error.message); } finally { setSaving(false); }
  };

  const addChoice = (sectionIndex, itemIndex, item) => {
    const value = createKey('option');
    updateItem(sectionIndex, itemIndex, {
      answerConfigJson: { options: [...(item.answerConfigJson?.options || []), { value, label: `Opção ${(item.answerConfigJson?.options?.length || 0) + 1}` }] },
      scoringConfigJson: { pointsByValue: { ...(item.scoringConfigJson?.pointsByValue || {}), [value]: 0 } },
    });
  };

  if (loading || !state.capabilitiesLoaded) return <Loading />;
  if (!canManage) return <Page><EmptyState title="Acesso restrito" subtitle="Seu perfil não possui permissão para gerenciar modelos de checklists." /></Page>;

  if (!templateId) return (
    <Page>
      <PageHeader>
        <PageHeading><PageTitle>Modelos de checklists</PageTitle><PageSubtitle>Padronize rotinas e publique versões seguras para sua organização.</PageSubtitle></PageHeading>
        <PageActions><Button onClick={() => setCreateOpen(true)}><MdAdd /> Novo modelo</Button></PageActions>
      </PageHeader>
      {templates.length === 0 ? <EmptyState title="Nenhum modelo criado" subtitle="Crie o primeiro modelo para organizar sua rotina operacional." action={<Button onClick={() => setCreateOpen(true)}><MdAdd /> Criar modelo</Button>} /> : (
        <TemplateGrid>{templates.map(item => <TemplateCard key={item.id} $interactive onClick={() => navigate(`/checklists/templates/${item.id}`)}>
          <CardTop><div><h3>{item.name}</h3><Muted>{item.category || 'Sem categoria'}</Muted></div><Status $status={latestStatus(item)}>{statusLabel(latestStatus(item))}</Status></CardTop>
          <Muted>{item.description || 'Sem descrição.'}</Muted>
          <Muted>{item.versions.length} {item.versions.length === 1 ? 'versão' : 'versões'}</Muted>
          <Button variant="outlined">Abrir modelo</Button>
        </TemplateCard>)}</TemplateGrid>
      )}
      <Modal isOpen={createOpen} onClose={() => setCreateOpen(false)} title="Novo modelo de checklist" footer={<><Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button type="submit" form="create-checklist" loading={saving}>Criar rascunho</Button></>}>
        <form id="create-checklist" onSubmit={createTemplate}><Grid>
          <Input label="Nome do modelo" required value={newTemplate.name} onChange={event => setNewTemplate(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Abertura da cozinha" />
          <Input label="Categoria" value={newTemplate.category} onChange={event => setNewTemplate(current => ({ ...current, category: event.target.value }))} placeholder="Ex.: Operação diária" />
          <Textarea label="Descrição" value={newTemplate.description} onChange={event => setNewTemplate(current => ({ ...current, description: event.target.value }))} />
          <Input label="Nota mínima (%)" type="number" min="0" max="100" value={newTemplate.passingScore} onChange={event => setNewTemplate(current => ({ ...current, passingScore: event.target.value }))} />
        </Grid></form>
      </Modal>
    </Page>
  );

  if (!template) return <Page><EmptyState title="Modelo não encontrado" /></Page>;

  return (
    <Page>
      <PageHeader>
        <PageHeading><Button variant="ghost" onClick={() => navigate('/checklists/templates')}><MdArrowBack /> Voltar</Button><PageTitle>{template.name}</PageTitle><PageSubtitle>Crie perguntas claras, revise a prévia e publique quando estiver pronto.</PageSubtitle></PageHeading>
        {editingDraft && <PageActions><Button variant="outlined" onClick={() => setPreviewOpen(true)}><MdPreview /> Prévia</Button><Button variant="outlined" onClick={save} loading={saving}><MdSave /> Salvar</Button><Button onClick={publish} loading={saving}><MdPublish /> Publicar</Button></PageActions>}
      </PageHeader>
      <EditorLayout>
        <Editor>
          {editingDraft ? <>
            <Card><MetadataGrid>
              <Input label="Nome" required value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} />
              <Input label="Categoria" value={form.category} onChange={event => setForm(current => ({ ...current, category: event.target.value }))} />
              <Textarea label="Descrição" value={form.description} onChange={event => setForm(current => ({ ...current, description: event.target.value }))} />
              <Input label="Nota mínima (%)" type="number" min="0" max="100" value={form.passingScore} onChange={event => setForm(current => ({ ...current, passingScore: event.target.value }))} />
            </MetadataGrid></Card>
            {form.sections.map((section, sectionIndex) => <SectionCard key={section.stableKey}>
              <Row><Grow><Input label={`Seção ${sectionIndex + 1}`} required value={section.title} onChange={event => updateSection(sectionIndex, { title: event.target.value })} placeholder="Ex.: Higiene e segurança" /></Grow>
                <Button iconOnly variant="ghost" aria-label="Mover seção para cima" disabled={sectionIndex === 0} onClick={() => setForm(current => ({ ...current, sections: move(current.sections, sectionIndex, -1) }))}><MdArrowUpward /></Button>
                <Button iconOnly variant="ghost" aria-label="Mover seção para baixo" disabled={sectionIndex === form.sections.length - 1} onClick={() => setForm(current => ({ ...current, sections: move(current.sections, sectionIndex, 1) }))}><MdArrowDownward /></Button>
                <Button iconOnly variant="danger" aria-label="Remover seção" onClick={() => setForm(current => ({ ...current, sections: current.sections.filter((_, index) => index !== sectionIndex) }))}><MdDelete /></Button>
              </Row>
              <Textarea label="Orientação da seção" value={section.description} onChange={event => updateSection(sectionIndex, { description: event.target.value })} />
              {section.items.map((item, itemIndex) => <ItemCard key={item.stableKey}>
                <Row><Grow><Input label={`Pergunta ${itemIndex + 1}`} required value={item.title} onChange={event => updateItem(sectionIndex, itemIndex, { title: event.target.value })} placeholder="O ambiente está limpo?" /></Grow>
                  <Button iconOnly variant="ghost" aria-label="Mover pergunta para cima" disabled={itemIndex === 0} onClick={() => updateSection(sectionIndex, { items: move(section.items, itemIndex, -1) })}><MdArrowUpward /></Button>
                  <Button iconOnly variant="ghost" aria-label="Mover pergunta para baixo" disabled={itemIndex === section.items.length - 1} onClick={() => updateSection(sectionIndex, { items: move(section.items, itemIndex, 1) })}><MdArrowDownward /></Button>
                  <Button iconOnly variant="danger" aria-label="Remover pergunta" onClick={() => updateSection(sectionIndex, { items: section.items.filter((_, index) => index !== itemIndex) })}><MdDelete /></Button>
                </Row>
                <MetadataGrid><Select label="Tipo de resposta" value={item.responseType} onChange={value => updateItem(sectionIndex, itemIndex, normalizeItemType(item, value))} options={Object.entries(RESPONSE_LABELS).map(([value, label]) => ({ value, label }))} />
                  <Input label="Peso / pontos" type="number" min="0.01" step="0.01" value={item.maxPoints} onChange={event => updateItem(sectionIndex, itemIndex, { maxPoints: event.target.value })} />
                </MetadataGrid>
                <Textarea label="Instruções para quem vai responder" value={item.instructions} onChange={event => updateItem(sectionIndex, itemIndex, { instructions: event.target.value })} />
                <Flags>
                  {[['required', 'Obrigatória'], ['critical', 'Item crítico'], ['evidenceRequired', 'Exigir fotografia'], ['allowNotApplicable', 'Permitir não se aplica']].map(([field, label]) => <CheckLabel key={field}><CheckboxControl checked={Boolean(item[field])} onChange={event => updateItem(sectionIndex, itemIndex, { [field]: event.target.checked })} /> {label}</CheckLabel>)}
                </Flags>
                {item.responseType === 'BOOLEAN' && <Select label="Resposta considerada conforme" value={String(item.scoringConfigJson?.expected ?? true)} onChange={value => updateItem(sectionIndex, itemIndex, { scoringConfigJson: { expected: value === 'true' } })} options={[{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]} />}
                {item.responseType === 'CHOICE' && <Grid><strong>Opções de resposta</strong>{(item.answerConfigJson?.options || []).map((option, optionIndex) => <OptionRow key={option.value}>
                  <Input label={`Opção ${optionIndex + 1}`} value={option.label} onChange={event => updateItem(sectionIndex, itemIndex, { answerConfigJson: { options: item.answerConfigJson.options.map(current => current.value === option.value ? { ...current, label: event.target.value } : current) } })} />
                  <Input label="Pontos" type="number" min="0" step="0.01" value={item.scoringConfigJson?.pointsByValue?.[option.value] ?? 0} onChange={event => updateItem(sectionIndex, itemIndex, { scoringConfigJson: { pointsByValue: { ...item.scoringConfigJson.pointsByValue, [option.value]: Number(event.target.value) } } })} />
                  <Button iconOnly variant="danger" aria-label="Remover opção" onClick={() => { const points = { ...item.scoringConfigJson.pointsByValue }; delete points[option.value]; updateItem(sectionIndex, itemIndex, { answerConfigJson: { options: item.answerConfigJson.options.filter(current => current.value !== option.value) }, scoringConfigJson: { pointsByValue: points } }); }}><MdDelete /></Button>
                </OptionRow>)}<Button variant="outlined" onClick={() => addChoice(sectionIndex, itemIndex, item)}><MdAdd /> Adicionar opção</Button></Grid>}
                {item.responseType === 'NUMBER' && <MetadataGrid><Select label="Regra para pontuar" value={item.scoringConfigJson?.operator || 'GTE'} onChange={operator => updateItem(sectionIndex, itemIndex, { scoringConfigJson: operator === 'BETWEEN' ? { operator, min: 0, max: 100 } : { operator, value: 0 } })} options={[{ value: 'GTE', label: 'Maior ou igual a' }, { value: 'LTE', label: 'Menor ou igual a' }, { value: 'BETWEEN', label: 'Entre dois valores' }]} />
                  {item.scoringConfigJson?.operator === 'BETWEEN' ? <Row><Input label="Mínimo" type="number" value={item.scoringConfigJson.min} onChange={event => updateItem(sectionIndex, itemIndex, { scoringConfigJson: { ...item.scoringConfigJson, min: Number(event.target.value) } })} /><Input label="Máximo" type="number" value={item.scoringConfigJson.max} onChange={event => updateItem(sectionIndex, itemIndex, { scoringConfigJson: { ...item.scoringConfigJson, max: Number(event.target.value) } })} /></Row> : <Input label="Valor de referência" type="number" value={item.scoringConfigJson?.value ?? 0} onChange={event => updateItem(sectionIndex, itemIndex, { scoringConfigJson: { ...item.scoringConfigJson, value: Number(event.target.value) } })} />}
                </MetadataGrid>}
              </ItemCard>)}
              <Button variant="outlined" onClick={() => updateSection(sectionIndex, { items: [...section.items, defaultItem()] })}><MdAdd /> Adicionar pergunta</Button>
            </SectionCard>)}
            <Button variant="outlined" onClick={() => setForm(current => ({ ...current, sections: [...current.sections, defaultSection()] }))}><MdAdd /> Adicionar seção</Button>
          </> : selectedVersion ? <ReadOnlyVersion>
            <CardTop><div><h2>Versão {selectedVersion.version}</h2><Muted>{template.description || 'Sem descrição.'}</Muted></div><Status $status={selectedVersion.status}>{statusLabel(selectedVersion.status)}</Status></CardTop>
            <Muted>Conteúdo protegido e disponível somente para consulta.</Muted>
            {sorted(selectedVersion.sections).map((section, sectionIndex) => <PreviewSection key={section.id || section.stableKey}>
              <h3>{sectionIndex + 1}. {section.title}</h3>
              {section.description && <Muted>{section.description}</Muted>}
              {sorted(section.items).map((item, itemIndex) => <div key={item.id || item.stableKey}><strong>{itemIndex + 1}. {item.title}</strong><Muted>{RESPONSE_LABELS[item.responseType]} · {Number(item.maxPoints)} ponto(s){item.required ? ' · obrigatória' : ''}{item.critical ? ' · crítica' : ''}{item.evidenceRequired ? ' · foto obrigatória' : ''}</Muted></div>)}
            </PreviewSection>)}
            {['PUBLISHED', 'RETIRED'].includes(selectedVersion.status) && <Button onClick={() => clone(selectedVersion.id)} disabled={Boolean(draft)}><MdContentCopy /> Criar nova versão</Button>}
          </ReadOnlyVersion> : <EmptyEditor><MdChecklist size={48} /><h3>Nenhuma versão disponível</h3></EmptyEditor>}
        </Editor>
        <VersionRail><h3>Histórico de versões</h3>{template.versions.map(version => <Grid key={version.id}><VersionButton variant={selectedVersion?.id === version.id ? 'primary' : 'ghost'} onClick={() => setSelectedVersionId(version.id)}>Versão {version.version}<Status $status={version.status}>{statusLabel(version.status)}</Status></VersionButton>{version.status === 'PUBLISHED' && <Button size="sm" variant="ghost" onClick={() => retire(version)}>Retirar de circulação</Button>}</Grid>)}</VersionRail>
      </EditorLayout>
      <Modal isOpen={previewOpen} onClose={() => setPreviewOpen(false)} title="Prévia do checklist" footer={<Button onClick={() => setPreviewOpen(false)}>Fechar prévia</Button>}>
        <Grid><h2>{form?.name}</h2><Muted>{form?.description}</Muted>{form?.sections.map((section, sectionIndex) => <PreviewSection key={section.stableKey}><h3>{sectionIndex + 1}. {section.title || 'Seção sem título'}</h3>{section.items.map((item, itemIndex) => <div key={item.stableKey}><strong>{itemIndex + 1}. {item.title || 'Pergunta sem título'}</strong><Muted>{RESPONSE_LABELS[item.responseType]} · {item.maxPoints} ponto(s){item.required ? ' · obrigatória' : ''}{item.critical ? ' · crítica' : ''}{item.evidenceRequired ? ' · foto obrigatória' : ''}</Muted></div>)}</PreviewSection>)}</Grid>
      </Modal>
    </Page>
  );
}

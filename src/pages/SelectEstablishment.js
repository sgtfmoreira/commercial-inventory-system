import Button from '../components/Button';
import { InputControl } from '../components/FormFields';
import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { MdAdd, MdStore } from "react-icons/md";
import api from "../services/api";

const Wrapper = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: ${({ theme }) => theme.spacing.md};
  background: ${({ theme }) => theme.colors.bg};
`;

const Card = styled.div`
  background: ${({ theme }) => theme.colors.bgCard};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.xl};
  box-shadow: ${({ theme }) => theme.shadows.raised};
  padding: ${({ theme }) => theme.spacing.xl};
  width: 100%;
  max-width: 480px;
`;

const Title = styled.h2`
  text-align: center;
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textPrimary};
`;

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Item = styled.div`
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ theme }) => theme.spacing.md};
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.md};
  transition: all 0.2s;
  &:hover { border-color: ${({ theme }) => theme.colors.primary}; }

  > button { flex-shrink: 0; }

  @media (max-width: 480px) {
    align-items: stretch;
    flex-direction: column;
    > button { width: 100%; }
  }
`;

const Name = styled.div`
  min-width: 0;
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textPrimary};
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-wrap: anywhere;
`;

const CreateSection = styled.div`
  margin-top: 24px;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  padding-top: 20px;
`;

const GhostButton = (props) => <Button fullWidth variant="outlined" {...props} />;

const InputGroup = styled.div`
  display: flex;
  gap: 8px;
  margin-top: 8px;
`;

const Input = styled(InputControl)`
  flex: 1;
  padding: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.md};
  outline: none;
  &:focus { border-color: ${({ theme }) => theme.colors.primary}; }
`;

export default function SelectEstablishment() {
    const navigate = useNavigate();
    const { state, switchEstablishment, reloadContext } = useApp();
    
    const establishments = state.establishments?.length 
        ? state.establishments 
        : (() => {
            try { return JSON.parse(localStorage.getItem("establishments") || "[]"); } 
            catch { return []; }
        })();

    const [loadingId, setLoadingId] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [newName, setNewName] = useState("");
    const [creating, setCreating] = useState(false);

    async function handleSelect(establishmentId) {
        try {
            setLoadingId(establishmentId);
            await switchEstablishment(establishmentId);
            navigate("/");
        } catch (err) {
            console.error(err);
            alert(err.message || "Erro ao trocar estabelecimento");
        } finally {
            setLoadingId(null);
        }
    }

    async function handleCreate() {
        if (!newName.trim()) return;
        setCreating(true);
        try {
            await api.post("/establishments", { name: newName });
            setNewName("");
            setShowCreate(false);
            await reloadContext(); // Atualiza a lista de acessos
        } catch (err) {
            alert(err.response?.data?.message || "Erro ao criar unidade");
        } finally {
            setCreating(false);
        }
    }

    return (
        <Wrapper>
            <Card>
                <Title>Suas Unidades</Title>
                <List>
                    {establishments.map((est) => (
                        <Item key={est.id}>
                            <Name><MdStore size={20} color="var(--color-text-secondary)" /> {est.name}</Name>
                            <Button
                                size="sm"
                                onClick={() => handleSelect(est.id)}
                                loading={loadingId === est.id}
                                loadingLabel="Entrando"
                            >
                                Entrar
                            </Button>
                        </Item>
                    ))}
                </List>

                {/* Área de Criação para Admins */}
                <CreateSection>
                    {!showCreate ? (
                        <GhostButton onClick={() => setShowCreate(true)}>
                            <MdAdd size={20} /> Criar Nova Unidade
                        </GhostButton>
                    ) : (
                        <div>
                            <Input 
                                placeholder="Nome da nova unidade" 
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                autoFocus
                            />
                            <InputGroup>
                                <Button onClick={handleCreate} loading={creating} loadingLabel="Criando" style={{ flex: 1 }}>
                                    Confirmar
                                </Button>
                                <Button
                                    onClick={() => setShowCreate(false)} 
                                    variant="outlined"
                                >
                                    Cancelar
                                </Button>
                            </InputGroup>
                        </div>
                    )}
                </CreateSection>
            </Card>
        </Wrapper>
    );
}

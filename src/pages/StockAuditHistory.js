import DataTable from '../components/Table';
import React, { useEffect, useState } from "react";
import styled from "styled-components";
import api from "../services/api";
import Card from "../components/Card";
import Button from "../components/Button";
import { useNavigate } from "react-router-dom";

const Header = styled.div`
  margin-bottom: 20px;
`;

const Table = styled(DataTable)`
  width: 100%;
  border-collapse: collapse;
`;

const Th = styled.th`
  text-align: left;
  padding: 12px;
  border-bottom: 1px solid #ddd;
`;

const Td = styled.td`
  padding: 12px;
  border-bottom: 1px solid #eee;
`;

export default function StockAuditHistory() {

    const navigate = useNavigate();
    const [audits, setAudits] = useState([]);

    async function loadAudits() {

        try {

            const audits = await api.get("/stock-audits/history");

            setAudits(audits);

        } catch (error) {

            console.error("Erro ao carregar histórico:", error);

        }

    }

    useEffect(() => {
        loadAudits();
    }, []);

    return (
        <>
            <Header>
                <h1>Histórico de Auditorias</h1>
            </Header>

            <Card padding="0">

                <Table>

                    <thead>
                        <tr>
                            <Th>Data</Th>
                            <Th>Status</Th>
                            <Th>Impacto</Th>
                            <Th>Ações</Th>
                        </tr>
                    </thead>

                    <tbody>

                        {audits.map(audit => (

                            <tr key={audit.id}>

                                <Td>
                                    {new Date(audit.createdAt).toLocaleDateString("pt-BR")}
                                </Td>

                                <Td>
                                    {audit.status}
                                </Td>
                                <Td
                                    style={{
                                        fontWeight: "bold",
                                        color: audit.financialImpact >= 0 ? "#16a34a" : "var(--color-danger)"
                                    }}
                                >
                                    {audit.financialImpact.toLocaleString("pt-BR", {
                                        style: "currency",
                                        currency: "BRL"
                                    })}
                                </Td>
                                <Td>



                                    <Button
                                        variant="secondary"
                                        onClick={() =>
                                            navigate(`/stock-audits/${audit.id}`)
                                        }
                                    >
                                        Ver
                                    </Button>

                                </Td>

                            </tr>

                        ))}

                    </tbody>

                </Table>

            </Card>
        </>
    );

}
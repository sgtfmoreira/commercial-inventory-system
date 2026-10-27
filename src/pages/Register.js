import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import { Input } from "../components/FormFields";

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
  width: min(100%, 420px);
`;

const Title = styled.h2`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  font-size: ${({ theme }) => theme.fontSizes["2xl"]};
  text-align: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const LoginLink = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
`;

const Footer = styled.p`
  margin-top: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

export default function Register() {

    const navigate = useNavigate();
    const { switchEstablishment } = useApp();

    const [nome, setNome] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleRegister(e) {
        e.preventDefault();

        try {

            setLoading(true);

            await api.post("/auth/register", {
                name: nome,
                email,
                password
            });

            const loginResult = await api.post("/auth/login", {
                email,
                password
            });

            // O interceptor já deu unwrap para loginResult ser o conteúdo de 'data'
            const { token, establishments } = loginResult;

            localStorage.setItem("token", token);

            if (establishments && establishments.length > 0) {
              await switchEstablishment(establishments[0].id);
            }

            navigate("/");

        } catch (err) {
            alert(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <Wrapper>

            <Card>

                <Title>Criar Conta</Title>

                <Form onSubmit={handleRegister}>

                    <Input
                        label="Nome"
                        placeholder="Nome"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                        required
                    />

                    <Input
                        label="E-mail"
                        placeholder="Email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />

                    <Input
                        label="Senha"
                        placeholder="Senha"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />

                    <Button type="submit" fullWidth loading={loading} loadingLabel="Criando conta">
                        Criar Conta
                    </Button>

                </Form>

                <Footer>
                    Já tem conta?{" "}
                    <LoginLink onClick={() => navigate("/login")}>
                        Fazer login
                    </LoginLink>
                </Footer>

            </Card>

        </Wrapper>
    );
}

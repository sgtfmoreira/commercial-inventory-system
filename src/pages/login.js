import React, { useState } from "react";
import styled from "styled-components";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useApp } from "../context/AppContext";
import Button from "../components/Button";
import { Input } from "../components/FormFields";

const logo = `${process.env.PUBLIC_URL}/BASTIDOR_LOGO02.jpg`;

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
const Logo = styled.img`
  width: min(280px, 100%);
  height: auto;
  margin: 0 auto ${({ theme }) => theme.spacing.lg};
  display: block;
`;
const Title = styled.h2`
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-size: ${({ theme }) => theme.fontSizes["2xl"]};
  text-align: center;
`;

const Subtitle = styled.p`
  margin-bottom: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: ${({ theme }) => theme.fontSizes.sm};
  text-align: center;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const RegisterLink = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  cursor: pointer;
`;

const Footer = styled.p`
  margin-top: ${({ theme }) => theme.spacing.lg};
  text-align: center;
  font-size: ${({ theme }) => theme.fontSizes.sm};
`;

export default function Login() {

  const navigate = useNavigate();
  const { switchEstablishment } = useApp();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {

    e.preventDefault();

    try {

      setLoading(true);

      const response = await api.post("/auth/login", {
        email,
        password
      });

      const { token, establishments } = response;

      localStorage.setItem("token", token);

      if (establishments.length === 1) {
        await switchEstablishment(establishments[0].id);
        navigate("/");
      } else {

        localStorage.setItem(
          "establishments",
          JSON.stringify(establishments)
        );

        navigate("/select-establishment");

      }

    } catch (err) {

      alert(err.message);

    } finally {

      setLoading(false);

    }

  }


  return (

    <Wrapper>

      <Card>

        <Logo src={logo} alt="Bastidor OS" />

        <Title>Entrar</Title>
        <Subtitle>Acesse o ambiente operacional do Bastidor OS</Subtitle>

        <Form onSubmit={handleLogin}>

          <Input
            label="E-mail"
            placeholder="voce@empresa.com.br"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />

          <Input
            label="Senha"
            placeholder="Digite sua senha"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <Button type="submit" fullWidth loading={loading} loadingLabel="Entrando">
            Entrar
          </Button>

        </Form>

        <Footer>
          Não tem conta?{" "}
          <RegisterLink onClick={() => navigate("/register")}>
            Criar conta
          </RegisterLink>
        </Footer>

      </Card>

    </Wrapper>

  );

}

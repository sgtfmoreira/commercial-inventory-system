import React from 'react';
import styled from 'styled-components';

const logo = `${process.env.PUBLIC_URL}/BASTIDOR_LOGO02.jpg`;

const Logo = styled.img`
  display: block;
  width: 240px;
  max-width: 100%;
  height: auto;
  object-fit: contain;
  margin-bottom: 12px;
`;

export default function SupplierPortalLogo() {
  return <Logo src={logo} alt="Bastidor OS" />;
}

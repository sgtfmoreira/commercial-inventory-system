import React, { useId } from 'react';
import styled, { css } from 'styled-components';

const Field = styled.label`
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
`;

const LabelText = styled.span`
  font-size: ${({ theme }) => theme.fontSizes.sm};
  font-weight: ${({ theme }) => theme.fontWeights.semibold};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Required = styled.span`color: ${({ theme }) => theme.colors.danger}; margin-left: 3px;`;

const controlStyles = css`
  width: 100%;
  min-height: ${({ theme, $size }) => $size === 'sm' ? theme.sizes.controlSm : $size === 'lg' ? theme.sizes.controlLg : theme.sizes.controlMd};
  color: ${({ theme }) => theme.colors.textPrimary};
  background: ${({ theme }) => theme.colors.bgInput};
  border: 1px solid ${({ theme, $invalid }) => $invalid ? theme.colors.danger : theme.colors.borderStrong};
  border-radius: ${({ theme }) => theme.radii.md};
  padding: ${({ $size }) => $size === 'sm' ? '6px 10px' : $size === 'lg' ? '12px 14px' : '9px 12px'};
  font-size: ${({ theme }) => theme.fontSizes.md};
  outline: none;
  transition: border-color ${({ theme }) => theme.transitions.fast}, box-shadow ${({ theme }) => theme.transitions.fast}, background ${({ theme }) => theme.transitions.fast};
  &::placeholder { color: ${({ theme }) => theme.colors.textMuted}; opacity: 1; }
  &:hover:not(:disabled):not(:read-only) { border-color: ${({ theme }) => theme.colors.primarySoft}; }
  &:focus { border-color: ${({ theme, $invalid }) => $invalid ? theme.colors.danger : theme.colors.borderFocus}; box-shadow: ${({ theme }) => theme.shadows.glow}; }
  &:read-only { color: ${({ theme }) => theme.colors.textSecondary}; background: ${({ theme }) => theme.colors.bgHover}; }
`;

export const InputControl = styled.input`
  ${controlStyles}
  &[type="number"] { -moz-appearance: textfield; }
  &[type="number"]::-webkit-inner-spin-button, &[type="number"]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
`;
export const SelectControl = styled.select`${controlStyles} cursor: pointer; option { background: ${({ theme }) => theme.colors.bgCard}; }`;
export const TextareaControl = styled.textarea`${controlStyles} resize: vertical; min-height: 96px;`;
export const CheckboxControl = styled.input.attrs({ type: 'checkbox' })`
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  margin: 0;
  accent-color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;

  &:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
`;
const HelpText = styled.span`font-size: ${({ theme }) => theme.fontSizes.xs}; color: ${({ theme, $error }) => $error ? theme.colors.danger : theme.colors.textMuted};`;

const FieldShell = ({ id, label, required, error, helperText, children }) => (
  <Field htmlFor={id}>
    {label && <LabelText>{label}{required && <Required aria-hidden="true">*</Required>}</LabelText>}
    {children}
    {(error || helperText) && <HelpText id={`${id}-help`} $error={Boolean(error)} role={error ? 'alert' : undefined}>{error || helperText}</HelpText>}
  </Field>
);

export const Input = ({ label, error, helperText, onWheel, onKeyDown, size = 'md', id: suppliedId, required, ...props }) => {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  const handleWheel = (event) => { if (props.type === 'number') event.currentTarget.blur(); onWheel?.(event); };
  const handleKeyDown = (event) => { if (props.type === 'number' && ['ArrowUp', 'ArrowDown'].includes(event.key)) event.preventDefault(); onKeyDown?.(event); };
  return <FieldShell id={id} label={label} required={required} error={error} helperText={helperText}><InputControl id={id} $size={size} $invalid={Boolean(error)} required={required} aria-invalid={Boolean(error)} aria-describedby={(error || helperText) ? `${id}-help` : undefined} {...props} onWheel={handleWheel} onKeyDown={handleKeyDown} /></FieldShell>;
};

export const Select = ({ label, error, helperText, children, options, onChange, size = 'md', id: suppliedId, required, ...props }) => {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return <FieldShell id={id} label={label} required={required} error={error} helperText={helperText}><SelectControl id={id} $size={size} $invalid={Boolean(error)} required={required} aria-invalid={Boolean(error)} aria-describedby={(error || helperText) ? `${id}-help` : undefined} {...props} onChange={(event) => onChange?.(event.target.value)}>{options ? options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>) : children}</SelectControl></FieldShell>;
};

export const Textarea = ({ label, error, helperText, size = 'md', id: suppliedId, required, ...props }) => {
  const generatedId = useId();
  const id = suppliedId || generatedId;
  return <FieldShell id={id} label={label} required={required} error={error} helperText={helperText}><TextareaControl id={id} $size={size} $invalid={Boolean(error)} required={required} aria-invalid={Boolean(error)} aria-describedby={(error || helperText) ? `${id}-help` : undefined} {...props} /></FieldShell>;
};

export const CurrencyInput = ({ value, onChange, ...props }) => {
  const handleChange = (event) => { const digits = event.target.value.replace(/\D/g, ''); onChange?.(digits ? (parseInt(digits, 10) / 100).toFixed(2) : ''); };
  const formattedValue = value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value)) : '';
  return <Input {...props} type="text" inputMode="numeric" value={formattedValue} onChange={handleChange} />;
};

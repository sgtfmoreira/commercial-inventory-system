import React from 'react';
import ReactSelect from 'react-select';
import { useTheme } from 'styled-components';

export default function Select({ label, value, onChange, options = [], placeholder = 'Selecione...', error, helperText, required, ...props }) {
  const theme = useTheme();
  const selectedOption = options.find((option) => option.value === value) || null;
  const help = error || helperText;
  const styles = {
    container: (base) => ({ ...base, width: '100%' }),
    control: (base, state) => ({ ...base, minHeight: theme.sizes.controlMd, borderRadius: theme.radii.md, borderColor: error ? theme.colors.danger : state.isFocused ? theme.colors.borderFocus : theme.colors.borderStrong, background: theme.colors.bgInput, color: theme.colors.textPrimary, boxShadow: state.isFocused ? theme.shadows.glow : theme.shadows.xs, fontSize: theme.fontSizes.md, cursor: props.isDisabled ? 'not-allowed' : 'pointer', transition: theme.transitions.fast, '&:hover': { borderColor: error ? theme.colors.danger : theme.colors.primarySoft } }),
    valueContainer: (base) => ({ ...base, padding: '2px 12px' }),
    singleValue: (base) => ({ ...base, color: theme.colors.textPrimary }),
    input: (base) => ({ ...base, color: theme.colors.textPrimary }),
    placeholder: (base) => ({ ...base, color: theme.colors.textMuted }),
    indicatorSeparator: () => ({ display: 'none' }),
    dropdownIndicator: (base) => ({ ...base, color: theme.colors.textMuted, padding: 8, '&:hover': { color: theme.colors.primary } }),
    menu: (base) => ({ ...base, zIndex: theme.zIndices.dropdown, padding: 4, overflow: 'hidden', border: `1px solid ${theme.colors.border}`, borderRadius: theme.radii.md, background: theme.colors.surfaceElevated, boxShadow: theme.shadows.raised }),
    option: (base, state) => ({ ...base, borderRadius: theme.radii.sm, color: state.isSelected ? theme.colors.textInverse : theme.colors.textPrimary, background: state.isSelected ? theme.colors.primary : state.isFocused ? theme.colors.primarySurface : 'transparent', cursor: 'pointer', fontSize: theme.fontSizes.md, '&:active': { background: theme.colors.primaryLight } }),
    noOptionsMessage: (base) => ({ ...base, color: theme.colors.textMuted }),
  };
  return <label style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
    {label && <span style={{ fontSize: theme.fontSizes.sm, fontWeight: theme.fontWeights.semibold, color: theme.colors.textSecondary }}>{label}{required && <span style={{ color: theme.colors.danger }}> *</span>}</span>}
    <ReactSelect value={selectedOption} onChange={(selected) => onChange?.(selected?.value)} options={options} placeholder={placeholder} styles={styles} aria-invalid={Boolean(error)} {...props} />
    {help && <span role={error ? 'alert' : undefined} style={{ fontSize: theme.fontSizes.xs, color: error ? theme.colors.danger : theme.colors.textMuted }}>{help}</span>}
  </label>;
}

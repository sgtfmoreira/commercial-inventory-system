import { darkTheme, lightTheme } from './theme';

describe.each([
  ['light', lightTheme],
  ['dark', darkTheme],
])('the %s theme layer order', (_name, selectedTheme) => {
  test('keeps the loading overlay above modals and below toasts', () => {
    expect(selectedTheme.zIndices.loading).toBeGreaterThan(selectedTheme.zIndices.modal);
    expect(selectedTheme.zIndices.loading).toBeLessThan(selectedTheme.zIndices.toast);
  });
});

/* eslint-disable testing-library/no-unnecessary-act */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'styled-components';
import { LoadingProvider, useLoading } from './LoadingContext';
import { lightTheme } from '../styles/theme';

window.IS_REACT_ACT_ENVIRONMENT = true;

describe('LoadingProvider', () => {
  let container;
  let root;
  let loading;

  const Consumer = () => {
    loading = useLoading();
    return <span data-testid="loading-state">{String(loading.isLoading)}</span>;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root.render(
        <ThemeProvider theme={lightTheme}>
          <LoadingProvider><Consumer /></LoadingProvider>
        </ThemeProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test('permanece ativo enquanto existir alguma requisição pendente', () => {
    act(() => {
      loading.showLoading();
      loading.showLoading();
    });
    expect(container).toHaveTextContent('true');

    act(() => loading.hideLoading());
    expect(container).toHaveTextContent('true');

    act(() => loading.hideLoading());
    expect(container).toHaveTextContent('false');
  });

  test('não permite que o contador fique negativo', () => {
    act(() => loading.hideLoading());
    expect(container).toHaveTextContent('false');
  });
});

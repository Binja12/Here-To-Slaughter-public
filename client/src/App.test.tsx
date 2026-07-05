import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders connecting state before the socket connects', () => {
  render(<App />);
  expect(screen.getByText(/connecting to server/i)).toBeInTheDocument();
});

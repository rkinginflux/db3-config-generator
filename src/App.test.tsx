import { fireEvent, render, screen } from '@testing-library/react';
import App from './App';

it('defaults to the upgraded engine and updates output when legacy Parquet is selected', () => {
  const { container } = render(<App />);
  const engine = screen.getByLabelText('Storage engine');
  expect(engine).toHaveValue('pacha-tree');
  expect(container.querySelector('pre')?.textContent).not.toContain('--checkpoint-interval');
  fireEvent.change(engine, { target: { value: 'parquet' } });
  expect(container.querySelector('pre')?.textContent).toContain('--checkpoint-interval=1h');
  fireEvent.change(engine, { target: { value: 'pacha-tree' } });
  expect(container.querySelector('pre')?.textContent).not.toContain('--checkpoint-interval');
});

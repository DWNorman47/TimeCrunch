/**
 * Smoke tests for ReimbursementRow — the sub-component that crashed in
 * production with "expenses crashed" because it leaked `locale` from its
 * parent's scope. These tests render it in isolation to catch the same
 * class of bug going forward.
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReimbursementRow } from '../ReimbursementsAdmin';

// useAuth is called transitively through useT → we stub it with a synthetic
// user so the hook resolves cleanly
vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, language: 'English' } }),
}));

function mileageItem(overrides = {}) {
  return {
    id: 'row-1',
    full_name: 'Alex Rivera',
    username: 'arivera',
    amount: '33.50',
    category: 'Mileage',
    project_name: 'Main St Build',
    expense_date: '2026-04-12',
    miles: '50',
    mileage_rate: '0.67',
    description: null,
    status: 'pending',
    admin_notes: null,
    updated_at: '2026-04-12T00:00:00.000Z',
    qbo_purchase_id: null,
    ...overrides,
  };
}

describe('<ReimbursementRow />', () => {
  test('renders a mileage row without crashing', () => {
    // This is the exact scenario that used to throw ReferenceError: locale is
    // not defined — the bug that broke the whole Expenses tab.
    render(<ReimbursementRow item={mileageItem()} onUpdate={() => {}} />);
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
    expect(screen.getByText('$33.50')).toBeInTheDocument();
  });

  test('renders a cash row with a description', () => {
    render(
      <ReimbursementRow
        item={mileageItem({ category: 'Fuel', miles: null, description: 'Shell gas station' })}
        onUpdate={() => {}}
      />
    );
    expect(screen.getByText('$33.50')).toBeInTheDocument();
  });

  test('shows QB synced badge when qbo_purchase_id is set', () => {
    render(
      <ReimbursementRow
        item={mileageItem({ qbo_purchase_id: 'QBO-1234' })}
        onUpdate={() => {}}
      />
    );
    expect(screen.getByText(/QB/)).toBeInTheDocument();
  });

  test('accepts a locale prop (the original scope-leak fix)', () => {
    // Rendering with an explicit locale should succeed — this is the prop the
    // parent now passes through after the scope-leak fix.
    render(
      <ReimbursementRow item={mileageItem()} onUpdate={() => {}} locale="es-MX" />
    );
    expect(screen.getByText('Alex Rivera')).toBeInTheDocument();
  });
});

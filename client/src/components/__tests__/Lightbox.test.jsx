/**
 * Smoke tests for the FieldDayLog Lightbox — would have caught the `t` scope
 * leak that threw ReferenceError the moment the lightbox opened (it was
 * defined at module scope but referenced `t` from the parent component's
 * body, which only existed inside FieldDayLog itself).
 */

import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Lightbox } from '../FieldDayLog';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, language: 'English' } }),
}));

const photos = [
  { url: 'https://example.com/a.jpg', media_type: 'image', caption: 'First' },
  { url: 'https://example.com/b.jpg', media_type: 'image', caption: 'Second' },
];

describe('<Lightbox />', () => {
  test('renders with a photo and navigation without crashing', () => {
    render(<Lightbox photos={photos} startIndex={0} onClose={() => {}} />);
    // Nav buttons have aria-labels pulled from t — if t were undefined, the
    // render itself would throw.
    expect(screen.getByLabelText(/prev/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/next/i)).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  test('renders a video media type without crashing', () => {
    const vids = [{ url: 'https://example.com/clip.mp4', media_type: 'video', caption: null }];
    render(<Lightbox photos={vids} startIndex={0} onClose={() => {}} />);
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });
});

import { ImageResponse } from 'next/og';

export const alt = 'EventScanner - Eventi a Schio e Alto Vicentino';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '64px 72px',
        background: '#f1eee7', color: '#1d1d1b', fontFamily: 'sans-serif',
        borderTop: '18px solid #d65a38',
      }}>
        <div style={{ display: 'flex', fontSize: 44, fontWeight: 700 }}>EventScanner</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 700 }}>Schio e Alto Vicentino</div>
          <div style={{ display: 'flex', fontSize: 36 }}>Concerti, mostre, teatro, sagre e cultura</div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: '#a33f24' }}>Eventi e programmi del territorio</div>
      </div>
    ),
    size,
  );
}
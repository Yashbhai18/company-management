import { DialogProvider } from '../components/ui/DialogProvider';
import './globals.css';
import 'leaflet/dist/leaflet.css';

export const metadata = {
  title: 'Attendance Tracker',
  description: 'Attendance Tracking Application',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <DialogProvider>
          {children}
        </DialogProvider>
      </body>
    </html>
  );
}

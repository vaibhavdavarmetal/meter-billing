export const metadata = {
  title: "Meter Readings",
  description: "Submit your monthly electricity meter reading",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body style={{ margin: 0, background: "#faf7f0", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#1f2421" }}>
        {children}
      </body>
    </html>
  );
}

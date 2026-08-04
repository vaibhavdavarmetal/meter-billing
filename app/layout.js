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
      <body style={{ margin: 0, background: "#f6f2ea", fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: "#232826" }}>
        {children}
      </body>
    </html>
  );
}

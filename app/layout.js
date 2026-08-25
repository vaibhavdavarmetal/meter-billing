export const metadata = {
  title: "Meter Readings",
  description: "Submit your monthly electricity meter reading",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap"
        />
      </head>
      <body
        style={{
          margin: 0,
          background: "#0a0a0a",
          fontFamily:
            "'Geist', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
          WebkitFontSmoothing: "antialiased",
          color: "#ededed",
        }}
      >
        {children}
      </body>
    </html>
  );
}

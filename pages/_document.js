// pages/_document.js
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="en">
      <Head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <meta name="theme-color" content="#000000" />
      </Head>
      <body>
        <Main />           {/* This renders your app */}
        <NextScript />     {/* This injects necessary Next.js scripts */}
      </body>
    </Html>
  );
}

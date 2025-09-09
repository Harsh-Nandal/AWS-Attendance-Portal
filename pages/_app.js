// pages/_app.js
import Head from "next/head";
import "../styles/globals.css";
import "slick-carousel/slick/slick.css";
import "slick-carousel/slick/slick-theme.css";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        {/* Tailwind CSS via CDN */}
        <script src="https://cdn.tailwindcss.com"></script>

        {/* Optional: Tailwind custom config */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              tailwind.config = {
                theme: {
                  extend: {
                    colors: {
                      brand: '#1a73e8'
                    }
                  }
                }
              }
            `,
          }}
        />
      </Head>
      <Component {...pageProps} />
    </>
  );
}

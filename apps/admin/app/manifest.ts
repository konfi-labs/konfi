import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Konfi",
    background_color: process.env.COMPANY_MAIN_COLOR,
    display: "standalone",
    theme_color: process.env.COMPANY_MAIN_COLOR,
    orientation: "portrait",
    icons: [
      {
        src: "favicon.ico",
        sizes: "any",
        type: "image/icon-x",
      },
      {
        src: "icon1.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "icon2.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "icon3.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "icon4.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "apple-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
    start_url: "/",
  };
}

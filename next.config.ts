import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/proveedores/*/abonos/*/recibo": [
      "./public/pdf-fonts/LiberationSans-Regular.ttf",
      "./public/pdf-fonts/LiberationSans-Bold.ttf",
      "./public/branding/conectamos-logo.png",
    ],
    "/api/caja/cierre-dia": [
      "./public/pdf-fonts/Geist-Regular.ttf",
      "./node_modules/pdfkit/js/data/**/*",
    ],
  },
};

export default nextConfig;
